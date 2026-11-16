import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'

import type { Orientation, Unit } from '@/lib/anatomy/math'
import { bounds, clusterVertices, type Mesh } from '@/lib/anatomy/mesh'

export type MeshFormat = 'stl' | 'obj' | 'glb' | 'gltf'

export type ParsedMeshFile = {
  mesh: Mesh
  format: MeshFormat
  hash: string
  /** Starting point for the import dialog; the operator confirms or corrects it. */
  suggested: { unit: Unit; orientation: Orientation; reason: string }
}

export async function sha256(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/** Flattens every mesh of a loaded scene into one indexed mesh, in the file's own coordinates. */
function flatten(root: THREE.Object3D): Mesh {
  root.updateMatrixWorld(true)
  const positions: number[] = []
  const indices: number[] = []
  const point = new THREE.Vector3()
  root.traverse(node => {
    const object = node as THREE.Mesh
    if (!object.isMesh) return
    const attribute = object.geometry.getAttribute('position')
    if (!attribute) return
    const offset = positions.length / 3
    for (let i = 0; i < attribute.count; i += 1) {
      point.fromBufferAttribute(attribute, i).applyMatrix4(object.matrixWorld)
      positions.push(point.x, point.y, point.z)
    }
    const index = object.geometry.getIndex()
    const count = index ? index.count : attribute.count
    for (let i = 0; i + 2 < count; i += 3) {
      indices.push(offset + (index ? index.getX(i) : i), offset + (index ? index.getX(i + 1) : i + 1), offset + (index ? index.getX(i + 2) : i + 2))
    }
  })
  return { positions: new Float32Array(positions), indices: new Uint32Array(indices) }
}

/** Reads an STL, OBJ or GLB/glTF file. Nothing is assumed about its unit or axes beyond a suggestion. */
export async function parseMeshFile(file: File): Promise<ParsedMeshFile> {
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  if (!['stl', 'obj', 'glb', 'gltf'].includes(extension)) throw new Error('Choose an STL, OBJ or GLB file.')
  const data = await file.arrayBuffer()
  let mesh: Mesh
  try {
    if (extension === 'stl') {
      mesh = flatten(new THREE.Mesh(new STLLoader().parse(data)))
    } else if (extension === 'obj') {
      mesh = flatten(new OBJLoader().parse(new TextDecoder().decode(data)))
    } else {
      const gltf = await new Promise<{ scene: THREE.Object3D }>((resolve, reject) => new GLTFLoader().parse(data, '', resolve, reject))
      mesh = flatten(gltf.scene)
    }
  } catch {
    throw new Error(`"${file.name}" could not be read as ${extension.toUpperCase()}.`)
  }
  if (mesh.indices.length < 3) throw new Error(`"${file.name}" contains no triangles.`)

  // Weld duplicate vertices (STL stores every triangle separately).
  const span = Math.max(...bounds(mesh.positions).size)
  mesh = clusterVertices(mesh, span * 1e-6)

  const gltf = extension === 'glb' || extension === 'gltf'
  return {
    mesh,
    format: extension as MeshFormat,
    hash: await sha256(data),
    suggested: gltf
      ? { unit: 'm', orientation: { anterior: '+z', superior: '+y', mirrored: false }, reason: 'glTF files are specified in metres, Y up, facing +Z.' }
      : {
          unit: 'mm',
          orientation: { anterior: '-y', superior: '+z', mirrored: false },
          reason: 'Models segmented from CT are usually in millimetres in patient coordinates (X to the left, Y to the back, Z up).',
        },
  }
}

const MAX_VERTICES = 350_000

/** Reduces a heavy mesh to a resolution the browser handles; returns the resolution in mm, or null when untouched. */
export function reduceForUse(mesh: Mesh, unitToMm: number): { mesh: Mesh; resampledMm: number | null } {
  if (mesh.positions.length / 3 <= MAX_VERTICES) return { mesh, resampledMm: null }
  let cellMm = 0.6
  let reduced = mesh
  do {
    cellMm *= 1.25
    reduced = clusterVertices(mesh, cellMm / unitToMm)
  } while (reduced.positions.length / 3 > MAX_VERTICES)
  return { mesh: reduced, resampledMm: Math.round(cellMm * 100) / 100 }
}
