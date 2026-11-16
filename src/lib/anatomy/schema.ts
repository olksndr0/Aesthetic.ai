import { z } from 'zod'

import { UNITS } from './math'
import { VIEW_IDS } from './views'

const finite = z.number().finite()
export const vec3Schema = z.tuple([finite, finite, finite])
export const mat4Schema = z.array(finite).length(16)

export const landmarkSchema = z.object({
  id: z.string().min(1).max(40),
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(1).max(80),
  layer: z.enum(['skull', 'face']),
  side: z.enum(['R', 'L']).nullable(),
  position: vec3Schema,
  provenance: z.enum(['acquired', 'estimated']),
  source: z.string().trim().min(1, 'State where the coordinate comes from.').max(200),
  unit: z.enum(UNITS as [string, ...string[]]),
})

export const measureSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(['distance', 'angle']),
  label: z.string().trim().max(80),
  landmarks: z.array(z.string().min(1).max(40)).min(2).max(3),
})

export const landmarksSchema = z.array(landmarkSchema).max(200)
export const measuresSchema = z.array(measureSchema).max(100)

export const MESH_KINDS = ['skull', 'face', 'implant'] as const
export type MeshKind = (typeof MESH_KINDS)[number]
export const PROVENANCES = ['acquired', 'estimated'] as const

/** One recorded step of how a file was brought into the canonical frame. */
export const transformStepSchema = z.object({
  kind: z.enum(['import', 'dicom', 'pairs', 'surface', 'manual']),
  note: z.string().max(300),
  /** Residual of the step in mm, when it has one. */
  rmsMm: finite.nullable(),
  at: z.string().max(40),
})

export const meshMetaSchema = z.object({
  /** Original file name and format, for the record. */
  fileName: z.string().max(200),
  format: z.enum(['stl', 'obj', 'glb', 'gltf', 'dicom', 'ellipsoid']),
  /** SHA-256 of the original file, or of the series description for DICOM. */
  sourceHash: z.string().max(80),
  unit: z.enum(UNITS as [string, ...string[]]),
  /** How the geometry was obtained, in words. */
  origin: z.string().max(400),
  /** Resolution the surface was reduced to, in mm, when it was. */
  resampledMm: finite.nullable(),
  steps: z.array(transformStepSchema).max(40),
  /** Acquisition facts of a CT/CBCT series (voxel size, slice count, modality...). */
  dicom: z.record(z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))])).optional(),
})
export type MeshMeta = z.infer<typeof meshMetaSchema>
export type TransformStep = z.infer<typeof transformStepSchema>

export const viewIdSchema = z.enum(VIEW_IDS as [string, ...string[]])

export const renderViewSchema = z.object({
  view: viewIdSchema,
  width: z.number().int().min(256).max(2048),
  height: z.number().int().min(256).max(2048),
  /** Size of one pixel at the head's centre plane, in mm. */
  mmPerPixel: finite.positive(),
  /** Bounding box, in pixels, of the skin the simulation moved; null when nothing moved in this view. */
  roi: z.object({ x: finite, y: finite, width: finite.positive(), height: finite.positive() }).nullable(),
})
export type RenderView = z.infer<typeof renderViewSchema>
