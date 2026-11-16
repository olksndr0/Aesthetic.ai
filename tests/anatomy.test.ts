import { describe, expect, it } from 'vitest'

import { DicomError, loadSeries } from '@/lib/anatomy/dicom'
import { PointGrid } from '@/lib/anatomy/grid'
import { extractSurface, type Volume } from '@/lib/anatomy/isosurface'
import { checkSides, measureValue, parseLandmarkTable, type Landmark } from '@/lib/anatomy/landmarks'
import { IDENTITY, LPS_TO_CANONICAL, applyPoint, det3, distance, invert, multiply, orientationMatrix, rigid, type Vec3 } from '@/lib/anatomy/math'
import { MeshError, bounds, clusterVertices, computeNormals, decodeMesh, ellipsoidMesh, encodeMesh, keepLargeComponents, transformMesh } from '@/lib/anatomy/mesh'
import { planSchema, type Plan } from '@/lib/anatomy/plan'
import { fitRigid } from '@/lib/anatomy/registration'
import { displacedLandmarks, prepareSimulation, simulate } from '@/lib/anatomy/simulate'
import { RESULT_VIEWS, VIEW_DEFINITIONS, viewDefinition } from '@/lib/anatomy/views'

import { headDensity, writeDicomSlice, writePhantomSeries } from './helpers/dicom-phantom'

const sources = (files: Array<{ name: string; bytes: Uint8Array }>) => files.map(file => ({ name: file.name, read: async () => file.bytes }))

function sphereVolume(radius: number, voxel: number, half: number): Volume {
  const n = Math.round((2 * half) / voxel) + 1
  const data = new Int16Array(n * n * n)
  for (let k = 0; k < n; k += 1) {
    for (let j = 0; j < n; j += 1) {
      for (let i = 0; i < n; i += 1) {
        const r = Math.hypot(-half + i * voxel, -half + j * voxel, -half + k * voxel)
        // A smooth ramp across the boundary, as a scanner's partial volume gives.
        data[i + n * (j + n * k)] = Math.round(Math.max(-1000, Math.min(1000, (radius - r) * 500)))
      }
    }
  }
  return { data, dims: [n, n, n], indexToWorld: [voxel, 0, 0, -half, 0, voxel, 0, -half, 0, 0, voxel, -half, 0, 0, 0, 1] }
}

function radii(positions: Float32Array, centre: Vec3 = [0, 0, 0]): { min: number; max: number } {
  let min = Infinity
  let max = 0
  for (let i = 0; i < positions.length; i += 3) {
    const r = distance([positions[i]!, positions[i + 1]!, positions[i + 2]!], centre)
    min = Math.min(min, r)
    max = Math.max(max, r)
  }
  return { min, max }
}

describe('frame and transforms', () => {
  it('maps DICOM patient axes to left, superior, anterior without mirroring', () => {
    expect(applyPoint(LPS_TO_CANONICAL, [1, 0, 0])).toEqual([1, 0, 0]) // left stays +X
    expect(applyPoint(LPS_TO_CANONICAL, [0, -1, 0])).toEqual([0, 0, 1]) // anterior becomes +Z
    expect(applyPoint(LPS_TO_CANONICAL, [0, 0, 1])).toEqual([0, 1, 0]) // superior becomes +Y
    expect(det3(LPS_TO_CANONICAL)).toBeCloseTo(1)
  })

  it('builds a file orientation that converts units and only mirrors when told to', () => {
    // A Z-up file in metres whose face looks along -Y.
    const m = orientationMatrix({ anterior: '-y', superior: '+z', mirrored: false }, 'm')
    expect(det3(m)).toBeCloseTo(1e9)
    expect(applyPoint(m, [0, -0.1, 0])).toEqual([0, 0, 100])
    expect(applyPoint(m, [0, 0, 0.1])).toEqual([0, 100, 0])
    expect(applyPoint(m, [0.1, 0, 0])[0]).toBeCloseTo(100) // +x of that file is the patient's left
    expect(det3(orientationMatrix({ anterior: '-y', superior: '+z', mirrored: true }, 'mm'))).toBeCloseTo(-1)
    expect(() => orientationMatrix({ anterior: '+y', superior: '-y', mirrored: false }, 'mm')).toThrow()
  })

  it('inverts a rigid transform', () => {
    const m = rigid([3, -2, 7], [20, -35, 50], [10, 0, 5])
    const back = multiply(invert(m), m)
    back.forEach((value, index) => expect(value).toBeCloseTo(IDENTITY[index]!, 9))
  })
})

describe('mesh storage', () => {
  it('round-trips a mesh and refuses damaged files', () => {
    const mesh = ellipsoidMesh([40, 20, 30])
    const decoded = decodeMesh(encodeMesh(mesh))
    expect(decoded.positions).toEqual(mesh.positions)
    expect(decoded.indices).toEqual(mesh.indices)
    expect(bounds(decoded.positions).size.map(Math.round)).toEqual([40, 20, 30])

    const bytes = encodeMesh(mesh)
    expect(() => decodeMesh(bytes.slice(0, bytes.length - 4))).toThrow(MeshError)
    const badIndex = encodeMesh({ positions: mesh.positions, indices: new Uint32Array([0, 1, 99_999]) })
    expect(() => decodeMesh(badIndex)).toThrow(/vertices that do not exist/)
    const nan = encodeMesh({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, Number.NaN, 0]), indices: new Uint32Array([0, 1, 2]) })
    expect(() => decodeMesh(nan)).toThrow(/invalid coordinates/)
  })

  it('welds duplicate vertices and keeps outward normals through a mirror', () => {
    // Two triangles sharing an edge, stored STL-style with repeated vertices.
    const soup = { positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2, 3, 4, 5]) }
    expect(clusterVertices(soup, 1e-4).positions.length / 3).toBe(4)

    const mirrored = transformMesh(ellipsoidMesh([10, 10, 10]), [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    const normals = computeNormals(mirrored)
    for (let i = 0; i < normals.length; i += 3) {
      const outward = normals[i]! * mirrored.positions[i]! + normals[i + 1]! * mirrored.positions[i + 1]! + normals[i + 2]! * mirrored.positions[i + 2]!
      expect(outward).toBeGreaterThan(0)
    }
  })
})

describe('surface extraction', () => {
  it('reconstructs a sphere at its true radius with outward-facing triangles', () => {
    const mesh = extractSurface(sphereVolume(40, 1, 50), 0)
    const { min, max } = radii(mesh.positions)
    expect(min).toBeGreaterThan(39.4)
    expect(max).toBeLessThan(40.6)

    const normals = computeNormals(mesh)
    for (let i = 0; i < normals.length; i += 3) {
      const radial = (normals[i]! * mesh.positions[i]! + normals[i + 1]! * mesh.positions[i + 1]! + normals[i + 2]! * mesh.positions[i + 2]!) / 40
      expect(radial).toBeGreaterThan(0.9)
    }
    // Closed surface: every edge is shared by exactly two triangles.
    const edges = new Map<number, number>()
    const count = mesh.positions.length / 3
    for (let i = 0; i < mesh.indices.length; i += 3) {
      for (let e = 0; e < 3; e += 1) {
        const a = mesh.indices[i + e]!
        const b = mesh.indices[i + ((e + 1) % 3)]!
        const key = Math.min(a, b) * count + Math.max(a, b)
        edges.set(key, (edges.get(key) ?? 0) + 1)
      }
    }
    expect([...edges.values()].every(uses => uses === 2)).toBe(true)
  })

  it('drops small loose pieces', () => {
    const big = ellipsoidMesh([40, 40, 40], 24)
    const small = ellipsoidMesh([4, 4, 4], 8)
    const offset = big.positions.length / 3
    const merged = {
      positions: new Float32Array([...big.positions, ...Array.from(small.positions, (value, index) => value + (index % 3 === 0 ? 100 : 0))]),
      indices: new Uint32Array([...big.indices, ...Array.from(small.indices, index => index + offset)]),
    }
    expect(keepLargeComponents(merged, 1).positions.length).toBe(big.positions.length)
  })
})

describe('DICOM series', () => {
  const series = writePhantomSeries({ voxel: 2, half: 110, density: headDensity })

  it('loads a CT series at true scale and orientation, whatever the file order', async () => {
    const shuffled = [...series].reverse()
    const { volume, info } = await loadSeries(sources(shuffled), { targetVoxelMm: 2 })
    expect(info.sliceCount).toBe(111)
    expect(info.acquiredVoxel).toEqual([2, 2, 2])
    expect(info.hounsfield).toBe(true)

    const skin = keepLargeComponents(extractSurface(volume, -300), 1)
    const box = bounds(skin.positions)
    // Phantom skin: 140 mm wide, 190 mm tall; nose tip 104 mm in front of the centre.
    expect(box.size[0]).toBeGreaterThan(138)
    expect(box.size[0]).toBeLessThan(142)
    expect(box.size[1]).toBeGreaterThan(188)
    expect(box.size[1]).toBeLessThan(192)
    expect(box.max[2]).toBeGreaterThan(102) // anterior is +Z
    expect(box.max[2]).toBeLessThan(106)
    expect(box.min[2]).toBeGreaterThan(-87)

    // The cheek marker was placed on the patient's LEFT: the surface must bulge at +X, not -X.
    const grid = new PointGrid(skin.positions, 4)
    const left = grid.nearest(64, -20, 52).distance
    const right = grid.nearest(-64, -20, 52).distance
    expect(left).toBeLessThan(2.5)
    expect(right).toBeGreaterThan(6)

    const bone = extractSurface(volume, 300)
    expect(bounds(bone.positions).size[0]).toBeGreaterThan(121)
    expect(bounds(bone.positions).size[0]).toBeLessThan(127)
  })

  it('reduces resolution without moving the anatomy', async () => {
    const { volume, info } = await loadSeries(sources(series), { targetVoxelMm: 4 })
    expect(info.reduction).toEqual([2, 2, 2])
    expect(info.workingVoxel).toEqual([4, 4, 4])
    const box = bounds(keepLargeComponents(extractSurface(volume, -300), 1).positions)
    expect(Math.abs(box.centre[0])).toBeLessThan(2.5)
    expect(box.size[1]).toBeGreaterThan(184)
    expect(box.size[1]).toBeLessThan(194)
  })

  it('refuses what is not a regular uncompressed volume', async () => {
    const code = async (files: typeof series) => {
      try {
        await loadSeries(sources(files), { targetVoxelMm: 2 })
        return 'loaded'
      } catch (error) {
        return error instanceof DicomError ? error.code : 'other'
      }
    }
    expect(await code(series.slice(0, 1))).toBe('not_a_volume')
    expect(await code([...series.slice(0, 40), ...series.slice(41)])).toBe('irregular_spacing')
    expect(await code([{ name: 'notes.txt', bytes: new TextEncoder().encode('hello'.repeat(100)) }])).toBe('no_dicom')

    const compressed = writeDicomSlice({
      rows: 4, cols: 4, pixelSpacing: [1, 1], position: [0, 0, 0], orientation: [1, 0, 0, 0, 1, 0], pixels: new Int16Array(16), transferSyntax: '1.2.840.10008.1.2.4.70',
    })
    expect(await code([{ name: 'jpeg.dcm', bytes: compressed }])).toBe('compressed')
  })
})

describe('registration', () => {
  it('recovers a known rigid motion from point pairs and reports the residual', () => {
    const truth = rigid([12, -4, 30], [15, -40, 25], [0, 0, 0])
    const source: Vec3[] = [[0, 0, 0], [50, 0, 0], [0, 60, 0], [0, 0, 70], [30, 30, 30]]
    const exact = fitRigid(source, source.map(point => applyPoint(truth, point)))
    expect(exact.rms).toBeLessThan(1e-6)
    exact.matrix.forEach((value, index) => expect(value).toBeCloseTo(truth[index]!, 6))
    expect(det3(exact.matrix)).toBeCloseTo(1, 6)

    const noisy = fitRigid(source, source.map((point, index) => applyPoint(truth, [point[0] + (index === 0 ? 2 : 0), point[1], point[2]])))
    expect(noisy.rms).toBeGreaterThan(0.3)
    expect(Math.max(...noisy.residuals)).toBeLessThan(2)
    expect(() => fitRigid(source.slice(0, 2), source.slice(0, 2))).toThrow()
  })
})

describe('simulation', () => {
  // Concentric phantom: bone sphere of radius 40 mm under skin of radius 50 mm.
  const skull = extractSurface(sphereVolume(40, 1, 56), 0)
  const face = extractSurface(sphereVolume(50, 1, 56), 0)
  const context = prepareSimulation(skull, face)
  const plan = (operations: unknown[]): Plan => planSchema.parse({ operations })
  const displacementAt = (field: Float32Array, target: Vec3) => {
    const hit = context.faceGrid.nearest(...target)
    return Math.hypot(field[hit.index * 3]!, field[hit.index * 3 + 1]!, field[hit.index * 3 + 2]!)
  }

  it('lets an implant raise the skin above it, attenuated and blended, and nowhere else', () => {
    // 30 x 20 x 12 mm ellipsoid centred on the anterior bone surface: it stands about 6 mm proud.
    const implant = plan([
      { id: 'a', kind: 'implant', label: 'Chin implant', region: 'chin', geometry: { type: 'ellipsoid', sizeMm: [30, 20, 12] }, positionMm: [0, 0, 40], rotationDeg: [0, 0, 0], softTissue: { ratio: 0.8, spreadMm: 4 } },
    ])
    const result = simulate(context, implant, new Map([['a', ellipsoidMesh([30, 20, 12], 32)]]))
    const stats = result.operations[0]!
    expect(stats.warnings).toEqual([])
    expect(stats.maxHardMm).toBeGreaterThan(5)
    expect(stats.maxHardMm).toBeLessThan(7.5)
    // The skin moves less than the hard tissue: the ratio and the blending both reduce it.
    expect(result.maxSkinMm).toBeLessThan(0.8 * stats.maxHardMm)
    expect(result.maxSkinMm).toBeGreaterThan(2)
    expect(displacementAt(result.faceDisplacement, [0, 0, 50])).toBeGreaterThan(0.8 * result.maxSkinMm)
    expect(displacementAt(result.faceDisplacement, [0, 0, -50])).toBe(0)
    expect(displacementAt(result.faceDisplacement, [50, 0, 0])).toBe(0)
    // Bone itself is untouched by an implant.
    expect(result.skullAfter).toEqual(skull.positions)

    // A wider spread lowers the peak and reaches farther.
    const wide = simulate(
      context,
      plan([{ ...implant.operations[0]!, softTissue: { ratio: 0.8, spreadMm: 12 } }]),
      new Map([['a', ellipsoidMesh([30, 20, 12], 32)]]),
    )
    expect(wide.maxSkinMm).toBeLessThan(result.maxSkinMm)
    const edge: Vec3 = [28, 0, 41.4]
    expect(displacementAt(wide.faceDisplacement, edge)).toBeGreaterThan(displacementAt(result.faceDisplacement, edge))
  })

  it('keeps an asymmetric plan asymmetric', () => {
    const result = simulate(
      context,
      plan([{ id: 'a', kind: 'implant', label: 'Left angle', region: 'jaw angle', geometry: { type: 'ellipsoid', sizeMm: [12, 20, 20] }, positionMm: [38, -10, 8], rotationDeg: [0, 0, 0], softTissue: { ratio: 1, spreadMm: 4 } }]),
      new Map([['a', ellipsoidMesh([12, 20, 20], 32)]]),
    )
    expect(displacementAt(result.faceDisplacement, [48, -12, 10])).toBeGreaterThan(1)
    expect(displacementAt(result.faceDisplacement, [-48, -12, 10])).toBe(0) // the patient's right is unchanged
  })

  it('moves a bone segment exactly and the skin only partly', () => {
    const osteotomy = plan([
      {
        id: 'g', kind: 'osteotomy', label: 'Genioplasty', region: 'chin',
        plane: { point: [0, -25, 0], normal: [0, -1, 0] }, limit: { centre: [0, -40, 20], radiusMm: 35 },
        translationMm: [0, 0, 6], rotationDeg: [0, 0, 0], softTissue: { ratio: 0.7, spreadMm: 5 },
      },
    ])
    const result = simulate(context, osteotomy, new Map())
    const stats = result.operations[0]!
    expect(stats.boneVertices).toBeGreaterThan(100)
    expect(stats.maxHardMm).toBeCloseTo(6, 4)
    // Every moved bone vertex moved by exactly the planned translation; the rest did not move.
    let moved = 0
    for (let v = 0; v < skull.positions.length / 3; v += 1) {
      const dz = result.skullAfter[v * 3 + 2]! - skull.positions[v * 3 + 2]!
      if (dz !== 0) {
        expect(dz).toBeCloseTo(6, 4)
        moved += 1
      }
    }
    expect(moved).toBe(stats.boneVertices)
    expect(result.maxSkinMm).toBeLessThanOrEqual(0.7 * 6 + 1e-3)
    expect(result.maxSkinMm).toBeGreaterThan(2)
    expect(displacementAt(result.faceDisplacement, [0, 50, 0])).toBe(0) // skin over the unmoved top

    const landmarks: Landmark[] = [
      { id: 'pog', code: 'Pog', name: 'Pogonion', layer: 'skull', side: null, position: [0, -38, 12], provenance: 'acquired', source: 'test', unit: 'mm' },
      { id: 'n', code: 'N', name: 'Nasion', layer: 'skull', side: null, position: [0, 30, 26], provenance: 'acquired', source: 'test', unit: 'mm' },
    ]
    const after = displacedLandmarks(context, result, landmarks)
    expect(after.get('pog')!.movedMm).toBeCloseTo(6, 3)
    expect(after.get('n')!.movedMm).toBe(0)
  })

  it('warns instead of inventing a result when the plan selects nothing', () => {
    const empty = simulate(
      context,
      plan([{ id: 'x', kind: 'osteotomy', label: 'Nothing', region: 'chin', plane: { point: [0, -500, 0], normal: [0, -1, 0] }, limit: null, translationMm: [0, 0, 5], rotationDeg: [0, 0, 0], softTissue: { ratio: 1, spreadMm: 5 } }]),
      new Map(),
    )
    expect(empty.maxSkinMm).toBe(0)
    expect(empty.operations[0]!.warnings[0]).toMatch(/select no bone/)

    const far = simulate(
      context,
      plan([{ id: 'f', kind: 'implant', label: 'Far', region: 'chin', geometry: { type: 'ellipsoid', sizeMm: [10, 10, 10] }, positionMm: [0, 0, 400], rotationDeg: [0, 0, 0], softTissue: { ratio: 1, spreadMm: 5 } }]),
      new Map([['f', ellipsoidMesh([10, 10, 10])]]),
    )
    expect(far.maxSkinMm).toBe(0)
    expect(far.operations[0]!.warnings[0]).toMatch(/more than 60 mm/)

    // An implant hanging in the air near the bone is reported, not silently applied.
    const floating = simulate(
      context,
      plan([{ id: 'f', kind: 'implant', label: 'Floating', region: 'chin', geometry: { type: 'ellipsoid', sizeMm: [10, 10, 10] }, positionMm: [0, 0, 20], rotationDeg: [0, 0, 0], softTissue: { ratio: 1, spreadMm: 5 } }]),
      new Map([['f', ellipsoidMesh([10, 10, 10])]]),
    )
    expect(floating.operations[0]!.warnings[0]).toMatch(/does not touch the bone/)
  })

  it('requires the operator to enter the soft-tissue values', () => {
    const missing = planSchema.safeParse({
      operations: [{ id: 'a', kind: 'implant', label: 'Chin', region: 'chin', geometry: { type: 'ellipsoid', sizeMm: [30, 20, 12] }, positionMm: [0, 0, 40], rotationDeg: [0, 0, 0] }],
    })
    expect(missing.success).toBe(false)
  })
})

describe('landmarks and views', () => {
  const point = (code: string, side: 'R' | 'L' | null, position: Vec3): Landmark => ({ id: code, code, name: code, layer: 'face', side, position, provenance: 'acquired', source: 'test', unit: 'mm' })

  it('detects a mirrored model from bilateral landmarks', () => {
    const correct = [point('Ex-R', 'R', [-45, 30, 60]), point('Ex-L', 'L', [45, 30, 60]), point('Prn', null, [0, 0, 100])]
    expect(checkSides(correct)).toEqual([])
    const mirrored = correct.map(item => ({ ...item, position: [-item.position[0], item.position[1], item.position[2]] as Vec3 }))
    expect(checkSides(mirrored).length).toBeGreaterThan(0)
  })

  it('measures from coordinates and converts imported units', () => {
    const positions = new Map<string, Vec3>([['a', [0, 0, 0]], ['b', [30, 40, 0]], ['c', [30, 0, 0]]])
    expect(measureValue({ id: 'm', kind: 'distance', label: '', landmarks: ['a', 'b'] }, positions)).toBe(50)
    expect(measureValue({ id: 'm', kind: 'angle', label: '', landmarks: ['a', 'c', 'b'] }, positions)).toBe(90)
    expect(measureValue({ id: 'm', kind: 'distance', label: '', landmarks: ['a', 'zz'] }, positions)).toBeNull()

    const csv = parseLandmarkTable('code,x,y,z\nN,0,1.5,9\npog;0;-7,2;8\nbad,1,x,3', 'cm')
    expect(csv.points.map(item => [item.code, item.position])).toEqual([['N', [0, 15, 90]], ['Pog', [0, -72, 80]]])
    expect(csv.errors.length).toBe(1)
    const json = parseLandmarkTable('[{"code":"Me","x":1,"y":2,"z":3}]', 'mm')
    expect(json.points[0]).toMatchObject({ code: 'Me', name: 'Menton', position: [1, 2, 3] })
  })

  it('defines every requested view, with profiles on the correct anatomical side', () => {
    expect(VIEW_DEFINITIONS).toHaveLength(14)
    expect(new Set(VIEW_DEFINITIONS.map(view => view.id)).size).toBe(14)
    expect(RESULT_VIEWS.every(id => viewDefinition(id))).toBe(true)
    expect(viewDefinition('profile-left')!.direction[0]).toBeCloseTo(1) // camera on the patient's left
    expect(viewDefinition('profile-right')!.direction[0]).toBeCloseTo(-1)
    expect(viewDefinition('front')!.direction[2]).toBeCloseTo(1)
    expect(viewDefinition('inferior')!.direction[1]).toBeCloseTo(-1)
  })
})
