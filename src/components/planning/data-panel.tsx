'use client'

import { useRef, useState } from 'react'

import { DicomError, loadSeries, type SeriesInfo } from '@/lib/anatomy/dicom'
import { extractSurface, type Volume } from '@/lib/anatomy/isosurface'
import { AXES, IDENTITY, UNITS, UNIT_TO_MM, orientationMatrix, type Axis, type Mat4, type Unit } from '@/lib/anatomy/math'
import { bounds, encodeMesh, keepLargeComponents, transformPositions, type Mesh } from '@/lib/anatomy/mesh'
import type { MeshKind, MeshMeta } from '@/lib/anatomy/schema'
import { VIEW_DEFINITIONS } from '@/lib/anatomy/views'
import { ACCEPTED_TYPES } from '@/lib/upload-rules'

import { assetUrl, messageOf, sendForm, sendJson } from './api'
import { Check, Notice, Num, Section, Select, StatusBadge, Text } from './atoms'
import { parseMeshFile, reduceForUse, sha256, type ParsedMeshFile } from './import'
import type { Measured, MeshAsset, PhotoAsset } from './types'

type Props = {
  caseId: string
  meshes: MeshAsset[]
  photos: PhotoAsset[]
  onMeshAdded: (asset: MeshAsset, raw: Mesh) => void
  onMeshDeleted: (id: string) => void
  onPhotosChanged: (photos: PhotoAsset[]) => void
}

const KIND_LABEL: Record<MeshKind, string> = { skull: 'Skull (bone)', face: 'Facial surface (skin)', implant: 'Implant' }
const AXIS_OPTIONS = AXES.map(axis => ({ value: axis, label: `${axis[0] === '+' ? '+' : '−'}${axis[1]!.toUpperCase()}` }))
const now = () => new Date().toISOString()

async function uploadMesh(caseId: string, kind: MeshKind, provenance: 'acquired' | 'estimated', label: string, mesh: Mesh, transform: Mat4, meta: MeshMeta): Promise<MeshAsset> {
  const form = new FormData()
  form.set('kind', kind)
  form.set('provenance', provenance)
  form.set('label', label)
  form.set('meta', JSON.stringify(meta))
  form.set('transform', JSON.stringify(transform))
  form.set('file', new Blob([encodeMesh(mesh)]), 'model.amsh')
  const saved = await sendForm<{ id: string; measured: Measured }>(`/api/planning/cases/${caseId}/assets`, form)
  return { id: saved.id, kind, provenance, label, transform, meta: { ...meta, measured: saved.measured } }
}

export function DataPanel({ caseId, meshes, photos, onMeshAdded, onMeshDeleted, onPhotosChanged }: Props) {
  const hasSkull = meshes.some(mesh => mesh.kind === 'skull')
  const hasFace = meshes.some(mesh => mesh.kind === 'face')

  return (
    <div className="space-y-8">
      <Notice>
        A <strong className="text-white">skull</strong> is bone geometry from a CT or CBCT volume. A <strong className="text-white">facial surface</strong> is the skin only, from the same volume or from a surface scan.
        Photographs, a list of measurements or a single 2D radiograph are not a 3D reconstruction of bone and are never treated as one here.
      </Notice>

      <DicomImport caseId={caseId} disabled={hasSkull && hasFace} hasSkull={hasSkull} hasFace={hasFace} onMeshAdded={onMeshAdded} />
      <ModelImport caseId={caseId} hasSkull={hasSkull} hasFace={hasFace} onMeshAdded={onMeshAdded} />

      <Section title="Stored geometry" hint="Coordinates are kept as in the source file. The alignment to the anatomical frame (millimetres; left, superior, anterior) is stored beside each model with every step that produced it.">
        {meshes.length === 0 && <p className="text-sm text-ash">No 3D geometry yet.</p>}
        {meshes.map(mesh => (
          <ModelCard key={mesh.id} mesh={mesh} onDeleted={() => onMeshDeleted(mesh.id)} />
        ))}
      </Section>

      <PhotoCoverage caseId={caseId} photos={photos} has3d={hasFace || hasSkull} onPhotosChanged={onPhotosChanged} />
    </div>
  )
}

function ModelCard({ mesh, onDeleted }: { mesh: MeshAsset; onDeleted: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const measured = mesh.meta.measured
  async function remove() {
    try {
      await sendJson('DELETE', `/api/planning/assets/${mesh.id}`)
      onDeleted()
    } catch (problem) {
      setError(messageOf(problem))
    }
  }
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium">{mesh.label}</p>
          <p className="mt-1 text-xs text-ash">{KIND_LABEL[mesh.kind]}</p>
        </div>
        <StatusBadge status={mesh.provenance} />
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fog">{mesh.meta.origin}</p>
      {measured && (
        <p className="mt-2 font-mono text-xs text-ash">
          {measured.sizeMm[0]} × {measured.sizeMm[1]} × {measured.sizeMm[2]} mm (L–R × S–I × A–P) · {measured.vertices.toLocaleString('en-GB')} vertices
          {mesh.meta.resampledMm ? ` · reduced to ${mesh.meta.resampledMm} mm` : ''}
          {measured.mirrored ? ' · imported as mirrored' : ''}
        </p>
      )}
      <ol className="mt-3 space-y-1 text-xs text-ash">
        {mesh.meta.steps.map((step, index) => (
          <li key={index}>
            {index + 1}. {step.note}
            {step.rmsMm !== null ? ` Residual ${step.rmsMm.toFixed(2)} mm.` : ''}
          </li>
        ))}
      </ol>
      <button type="button" onClick={remove} className="btn-ghost btn-sm mt-4 min-h-[44px]">
        Delete this model
      </button>
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    </div>
  )
}

type DicomState =
  | { step: 'idle' }
  | { step: 'reading'; done: number; total: number; phase: 'headers' | 'pixels' }
  | { step: 'ready'; info: SeriesInfo; hash: string; fileCount: number }
  | { step: 'saving' }

function DicomImport({ caseId, disabled, hasSkull, hasFace, onMeshAdded }: { caseId: string; disabled: boolean; hasSkull: boolean; hasFace: boolean; onMeshAdded: Props['onMeshAdded'] }) {
  const volume = useRef<Volume | null>(null)
  const [state, setState] = useState<DicomState>({ step: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const [voxel, setVoxel] = useState('1')
  const [boneLevel, setBoneLevel] = useState<number | null>(300)
  const [skinLevel, setSkinLevel] = useState<number | null>(-300)
  const [surfaces, setSurfaces] = useState<{ skull: Mesh; face: Mesh; boneLevel: number; skinLevel: number } | null>(null)

  async function read(list: FileList | null) {
    if (!list || list.length === 0) return
    setError(null)
    setSurfaces(null)
    const files = [...list]
    try {
      const loaded = await loadSeries(
        files.map(file => ({ name: file.name, read: async () => new Uint8Array(await file.arrayBuffer()) })),
        { targetVoxelMm: Number(voxel), onProgress: (done, total, phase) => setState({ step: 'reading', done, total, phase }) },
      )
      volume.current = loaded.volume
      const fingerprint = new TextEncoder().encode(files.map(file => `${file.name}:${file.size}`).sort().join('|'))
      setState({ step: 'ready', info: loaded.info, hash: await sha256(fingerprint.buffer as ArrayBuffer), fileCount: files.length })
    } catch (problem) {
      volume.current = null
      setState({ step: 'idle' })
      setError(problem instanceof DicomError ? problem.message : 'The files could not be read as a DICOM series.')
    }
  }

  function extract() {
    if (!volume.current || boneLevel === null || skinLevel === null) return
    setError(null)
    try {
      // Skin: the single outer surface. Bone: every piece of meaningful size (skull, mandible), without specks.
      const face = keepLargeComponents(extractSurface(volume.current, skinLevel), 1)
      const skull = keepLargeComponents(extractSurface(volume.current, boneLevel), 0.01)
      if (face.indices.length === 0 || skull.indices.length === 0) throw new Error('empty')
      setSurfaces({ skull, face, boneLevel, skinLevel })
    } catch {
      setError('No surface was found at these levels. Adjust the thresholds and extract again.')
    }
  }

  async function save() {
    if (state.step !== 'ready' || !surfaces) return
    const { info, hash, fileCount } = state
    setState({ step: 'saving' })
    setError(null)
    const base = (level: number, what: string): MeshMeta => ({
      fileName: `${fileCount} DICOM files`,
      format: 'dicom',
      sourceHash: hash,
      unit: 'mm',
      origin: `${what} extracted from a ${info.modality} volume (${info.manufacturer || 'unknown scanner'}) at ${level} ${info.hounsfield ? 'HU' : 'grey value'}; ${info.sliceCount} slices, voxel ${info.acquiredVoxel.map(value => value.toFixed(2)).join(' × ')} mm, surfaces computed at ${info.workingVoxel.map(value => value.toFixed(2)).join(' × ')} mm.`,
      resampledMm: Math.max(...info.workingVoxel),
      steps: [{ kind: 'dicom', note: 'Placed from the DICOM position, orientation and spacing of the series; skull and skin share one acquisition.', rmsMm: null, at: now() }],
      dicom: {
        modality: info.modality,
        manufacturer: info.manufacturer,
        sliceCount: info.sliceCount,
        acquiredVoxel: info.acquiredVoxel,
        workingVoxel: info.workingVoxel,
        hounsfield: info.hounsfield,
        gantryTiltDeg: info.gantryTiltDeg,
        level,
      },
    })
    try {
      if (!hasSkull) onMeshAdded(await uploadMesh(caseId, 'skull', 'acquired', 'Skull from CT', surfaces.skull, IDENTITY, base(surfaces.boneLevel, 'Bone surface')), surfaces.skull)
      if (!hasFace) onMeshAdded(await uploadMesh(caseId, 'face', 'acquired', 'Skin from CT', surfaces.face, IDENTITY, base(surfaces.skinLevel, 'Skin surface')), surfaces.face)
      volume.current = null
      setSurfaces(null)
      setState({ step: 'idle' })
    } catch (problem) {
      setState({ step: 'ready', info, hash, fileCount })
      setError(messageOf(problem))
    }
  }

  const size = (mesh: Mesh) => bounds(mesh.positions).size.map(value => value.toFixed(0)).join(' × ')

  return (
    <Section
      title="CT / CBCT volume (DICOM)"
      hint="Select every file of one series. The volume is read in this browser and stays on this device: only the bone and skin surfaces extracted from it are uploaded. Scale and left/right come from the DICOM headers."
    >
      {disabled ? (
        <p className="text-sm text-ash">This case already has a skull and a facial surface. Delete them to import another volume.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Working resolution"
              value={voxel}
              onChange={setVoxel}
              options={[
                { value: '0.6', label: '0.6 mm (heavy)' },
                { value: '0.8', label: '0.8 mm' },
                { value: '1', label: '1.0 mm' },
                { value: '1.5', label: '1.5 mm (light)' },
              ]}
            />
            <label className="block">
              <span className="mb-1.5 block text-xs text-ash">DICOM files of the series</span>
              <input
                type="file"
                multiple
                disabled={state.step === 'reading' || state.step === 'saving'}
                onChange={event => void read(event.target.files)}
                className="block w-full text-sm text-fog file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-white/15 file:bg-white/[0.03] file:px-4 file:text-sm file:text-white"
              />
            </label>
          </div>

          {state.step === 'reading' && (
            <p role="status" className="text-sm text-fog">
              {state.phase === 'headers' ? 'Reading slice geometry' : 'Building the volume'}: {state.done} of {state.total}
            </p>
          )}

          {state.step === 'ready' && (
            <div className="space-y-4 rounded-xl border border-line p-4">
              <p className="font-mono text-xs leading-relaxed text-ash">
                {state.info.modality} · {state.info.sliceCount} slices · {state.info.acquiredDims.join(' × ')} voxels of {state.info.acquiredVoxel.map(value => value.toFixed(2)).join(' × ')} mm · working at{' '}
                {state.info.workingVoxel.map(value => value.toFixed(2)).join(' × ')} mm
                {state.info.ignoredFiles > 0 ? ` · ${state.info.ignoredFiles} non-image files ignored` : ''}
              </p>
              {state.info.warnings.map(warning => (
                <Notice key={warning} tone="warning">
                  {warning}
                </Notice>
              ))}
              {!state.info.hounsfield && (
                <Notice tone="warning">This series does not declare calibrated Hounsfield units (usual for CBCT). The default thresholds may not separate bone and skin: adjust them and check the surfaces.</Notice>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Num label="Bone threshold" value={boneLevel} onChange={setBoneLevel} step={25} unit={state.info.hounsfield ? 'HU' : 'grey'} />
                <Num label="Skin threshold" value={skinLevel} onChange={setSkinLevel} step={25} unit={state.info.hounsfield ? 'HU' : 'grey'} />
              </div>
              <button type="button" onClick={extract} disabled={boneLevel === null || skinLevel === null} className="btn-ghost btn-sm min-h-[44px]">
                Extract skull and skin surfaces
              </button>
              {surfaces && (
                <>
                  <p className="font-mono text-xs leading-relaxed text-ash">
                    Skull: {size(surfaces.skull)} mm, {(surfaces.skull.positions.length / 3).toLocaleString('en-GB')} vertices
                    <br />
                    Skin: {size(surfaces.face)} mm, {(surfaces.face.positions.length / 3).toLocaleString('en-GB')} vertices (L–R × S–I × A–P)
                  </p>
                  <button type="button" onClick={save} className="btn-primary btn-sm min-h-[44px]">
                    Save to the case
                  </button>
                </>
              )}
            </div>
          )}
          {state.step === 'saving' && <p role="status" className="text-sm text-fog">Uploading the surfaces…</p>}
        </>
      )}
      {error && <Notice tone="warning">{error}</Notice>}
    </Section>
  )
}

function ModelImport({ caseId, hasSkull, hasFace, onMeshAdded }: { caseId: string; hasSkull: boolean; hasFace: boolean; onMeshAdded: Props['onMeshAdded'] }) {
  const input = useRef<HTMLInputElement>(null)
  const [parsed, setParsed] = useState<(ParsedMeshFile & { fileName: string }) | null>(null)
  const [kind, setKind] = useState<MeshKind>('skull')
  const [provenance, setProvenance] = useState<'acquired' | 'estimated'>('acquired')
  const [unit, setUnit] = useState<Unit>('mm')
  const [anterior, setAnterior] = useState<Axis>('-y')
  const [superior, setSuperior] = useState<Axis>('+z')
  const [mirrored, setMirrored] = useState(false)
  const [label, setLabel] = useState('')
  const [origin, setOrigin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(file: File | undefined) {
    if (!file) return
    setError(null)
    setBusy(true)
    try {
      const result = await parseMeshFile(file)
      setParsed({ ...result, fileName: file.name })
      setUnit(result.suggested.unit)
      setAnterior(result.suggested.orientation.anterior)
      setSuperior(result.suggested.orientation.superior)
      setMirrored(false)
      setLabel(file.name.replace(/\.[^.]+$/, '').slice(0, 80))
      setKind(hasSkull ? (hasFace ? 'implant' : 'face') : 'skull')
    } catch (problem) {
      setParsed(null)
      setError(messageOf(problem))
    }
    setBusy(false)
  }

  let transform: Mat4 | null = null
  let extent: number[] | null = null
  let axesError: string | null = null
  if (parsed) {
    try {
      transform = orientationMatrix({ anterior, superior, mirrored }, unit)
      extent = bounds(transformPositions(parsed.mesh.positions, transform)).size
    } catch {
      axesError = 'Anterior and superior must be two different axes of the file.'
    }
  }
  const longest = extent ? Math.max(...extent) : 0
  const range: [number, number] = kind === 'implant' ? [1, 250] : kind === 'skull' ? [80, 450] : [60, 450]
  const plausible = extent !== null && longest >= range[0] && longest <= range[1]
  const taken = (kind === 'skull' && hasSkull) || (kind === 'face' && hasFace)

  async function save() {
    if (!parsed || !transform) return
    setBusy(true)
    setError(null)
    try {
      const reduced = reduceForUse(parsed.mesh, UNIT_TO_MM[unit])
      const meta: MeshMeta = {
        fileName: parsed.fileName.slice(0, 200),
        format: parsed.format,
        sourceHash: parsed.hash,
        unit,
        origin: origin.trim(),
        resampledMm: reduced.resampledMm,
        steps: [
          {
            kind: 'import',
            note: `Imported from ${parsed.format.toUpperCase()} in ${unit}; file axis ${anterior} taken as anterior, ${superior} as superior${mirrored ? ', declared mirrored and flipped' : ''}. Orientation confirmed by the operator.`,
            rmsMm: null,
            at: now(),
          },
        ],
      }
      onMeshAdded(await uploadMesh(caseId, kind, provenance, label.trim(), reduced.mesh, transform, meta), reduced.mesh)
      setParsed(null)
      setOrigin('')
      if (input.current) input.current.value = ''
    } catch (problem) {
      setError(messageOf(problem))
    }
    setBusy(false)
  }

  return (
    <Section title="3D model file (STL, OBJ, GLB)" hint="For a skull or facial surface segmented elsewhere, a surface scan, or an implant shape. A mesh file carries no unit and no anatomical axes: you state them, and the size is checked before anything is stored.">
      <input
        ref={input}
        type="file"
        accept=".stl,.obj,.glb,.gltf"
        disabled={busy}
        onChange={event => void choose(event.target.files?.[0])}
        className="block w-full text-sm text-fog file:mr-3 file:min-h-[44px] file:rounded-full file:border file:border-white/15 file:bg-white/[0.03] file:px-4 file:text-sm file:text-white"
      />
      {parsed && (
        <div className="space-y-4 rounded-xl border border-line p-4">
          <p className="text-xs leading-relaxed text-ash">
            {(parsed.mesh.positions.length / 3).toLocaleString('en-GB')} vertices. Suggested: {parsed.suggested.reason} Check it against what you know about the file.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Select label="This model is" value={kind} onChange={setKind} options={(Object.keys(KIND_LABEL) as MeshKind[]).map(value => ({ value, label: KIND_LABEL[value] }))} />
            <Select
              label="Geometry is"
              value={provenance}
              onChange={setProvenance}
              options={[
                { value: 'acquired', label: 'Acquired (scanned or measured)' },
                { value: 'estimated', label: 'Estimated (reconstructed or inferred)' },
              ]}
            />
            <Select label="Unit of the file" value={unit} onChange={setUnit} options={UNITS.map(value => ({ value, label: value }))} />
            <Select label="Axis pointing to the front of the face" value={anterior} onChange={setAnterior} options={AXIS_OPTIONS} />
            <Select label="Axis pointing to the top of the head" value={superior} onChange={setSuperior} options={AXIS_OPTIONS} />
            <Text label="Name" value={label} onChange={setLabel} />
          </div>
          <Check checked={mirrored} onChange={setMirrored}>
            The file is a mirror image (left and right are swapped in it). Tick only if you know this; it flips the model.
          </Check>
          <Text label="How was this geometry obtained?" value={origin} onChange={setOrigin} placeholder="e.g. segmented from CBCT of 12 March in 3D Slicer; structured-light face scan" />

          {axesError && <Notice tone="warning">{axesError}</Notice>}
          {extent && (
            <p className="font-mono text-xs leading-relaxed text-ash">
              With these settings the model measures {extent[0]!.toPrecision(3)} mm left–right, {extent[1]!.toPrecision(3)} mm top–bottom, {extent[2]!.toPrecision(3)} mm front–back.
            </p>
          )}
          {extent && !plausible && (
            <Notice tone="warning">
              That is outside the {range[0]} to {range[1]} mm expected for {kind === 'implant' ? 'an implant' : 'a head'}. The unit is probably wrong; the model will be refused until the size is plausible.
            </Notice>
          )}
          {kind !== 'implant' && provenance === 'estimated' && (
            <Notice>An estimated model is labelled as such everywhere, and every result computed from it says so. It is not equivalent to scanned anatomy.</Notice>
          )}
          {taken && <Notice tone="warning">This case already has a {kind === 'skull' ? 'skull' : 'facial surface'}. Delete it first.</Notice>}

          <button type="button" onClick={save} disabled={busy || !transform || !plausible || taken || label.trim() === '' || origin.trim().length < 3} className="btn-primary btn-sm min-h-[44px]">
            {busy ? 'Saving…' : 'Save to the case'}
          </button>
          {origin.trim().length < 3 && <p className="text-xs text-ash">State how the geometry was obtained to continue.</p>}
        </div>
      )}
      {error && <Notice tone="warning">{error}</Notice>}
    </Section>
  )
}

const FLAG_TEXT: Record<string, string> = { blurry: 'Looks out of focus', dark: 'Too dark', overexposed: 'Overexposed' }

function PhotoCoverage({ caseId, photos, has3d, onPhotosChanged }: { caseId: string; photos: PhotoAsset[]; has3d: boolean; onPhotosChanged: Props['onPhotosChanged'] }) {
  const [busyView, setBusyView] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function upload(view: string, file: File | undefined) {
    if (!file) return
    setBusyView(view)
    setError(null)
    try {
      const form = new FormData()
      form.set('kind', 'photo')
      form.set('view', view)
      form.set('file', file)
      await sendForm(`/api/planning/cases/${caseId}/assets`, form)
      // Read the stored facts back (dimensions, sharpness) instead of trusting the browser.
      const fresh = await fetch(`/api/planning/cases/${caseId}/photos`).then(response => response.json() as Promise<{ photos: PhotoAsset[] }>)
      onPhotosChanged(fresh.photos)
    } catch (problem) {
      setError(messageOf(problem))
    }
    setBusyView(null)
  }

  async function remove(photo: PhotoAsset) {
    try {
      await sendJson('DELETE', `/api/planning/assets/${photo.id}`)
      onPhotosChanged(photos.filter(item => item.id !== photo.id))
    } catch (problem) {
      setError(messageOf(problem))
    }
  }

  // Inconsistencies across the set: the same picture twice, or one far brighter or darker than the rest.
  const sorted = photos.map(photo => photo.meta.brightness).sort((a, b) => a - b)
  const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)]! : 0
  const issues = (photo: PhotoAsset): string[] => {
    const list = photo.meta.flags.map(flag => FLAG_TEXT[flag] ?? flag)
    const twin = photos.find(other => other.id !== photo.id && other.meta.hash === photo.meta.hash)
    if (twin) list.push(`Same picture as "${VIEW_DEFINITIONS.find(view => view.id === twin.view)?.label ?? twin.view}"`)
    if (photos.length >= 3 && Math.abs(photo.meta.brightness - median) > 60) list.push('Lighting differs from the other photos')
    return list
  }
  const essential = ['front', 'profile-left', 'profile-right']
  const missing = essential.filter(view => !photos.some(photo => photo.view === view))

  return (
    <Section
      title="Photographs (appearance)"
      hint={
        has3d
          ? 'The anatomical views of the skull and face are drawn from the 3D model: no separate picture or radiograph is needed for each angle. Photographs supply what a scan does not hold: skin, hair and likeness. The front and both profiles are used for the photographic render; the others are optional.'
          : 'External photographs of each view. They document appearance; they are not a 3D reconstruction.'
      }
    >
      {missing.length > 0 && (
        <Notice>Missing for a photographic render: {missing.map(view => VIEW_DEFINITIONS.find(item => item.id === view)!.label.toLowerCase()).join(', ')}.</Notice>
      )}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {VIEW_DEFINITIONS.map(view => {
          const photo = photos.find(item => item.view === view.id)
          const problems = photo ? issues(photo) : []
          return (
            <li key={view.id} className="rounded-xl border border-line p-3">
              <p className="text-sm font-medium">{view.label}</p>
              {photo ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={assetUrl(photo.id)} alt={`${view.label} photograph`} className="mt-2 aspect-[4/5] w-full rounded-lg object-cover" />
                  {problems.map(problem => (
                    <p key={problem} role="alert" className="mt-2 text-xs text-white">
                      ⚠ {problem}
                    </p>
                  ))}
                  <button type="button" onClick={() => void remove(photo)} className="mt-2 min-h-[44px] text-xs text-fog underline underline-offset-4">
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs leading-relaxed text-ash">{view.photoGuide}</p>
                  <label className="mt-2 inline-flex min-h-[44px] cursor-pointer items-center text-xs text-white underline underline-offset-4">
                    {busyView === view.id ? 'Uploading…' : essential.includes(view.id) ? 'Add photo' : 'Add photo (optional)'}
                    <input type="file" accept={ACCEPTED_TYPES.join(',')} className="sr-only" disabled={busyView !== null} onChange={event => void upload(view.id, event.target.files?.[0])} />
                  </label>
                </>
              )}
            </li>
          )
        })}
      </ul>
      {error && <Notice tone="warning">{error}</Notice>}
    </Section>
  )
}
