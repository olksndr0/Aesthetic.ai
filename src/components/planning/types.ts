import type { Landmark, Measure } from '@/lib/anatomy/landmarks'
import type { Mat4 } from '@/lib/anatomy/math'
import type { Plan } from '@/lib/anatomy/plan'
import type { MeshKind, MeshMeta, RenderView } from '@/lib/anatomy/schema'

export type Measured = { vertices: number; triangles: number; sizeMm: number[]; centreMm: number[]; scale: number; mirrored: boolean }

export type MeshAsset = {
  id: string
  kind: MeshKind
  provenance: 'acquired' | 'estimated'
  label: string
  transform: Mat4
  meta: MeshMeta & { measured?: Measured }
}

export type PhotoAsset = {
  id: string
  view: string
  meta: { width: number; height: number; sharpness: number; brightness: number; flags: string[]; hash: string }
}

export type OutlineReport = {
  status: 'pass' | 'fail' | 'not_assessable'
  meanDeviationMm: number | null
  toleranceMm: number
  note: string
  photoAssetId: string
  references: string[]
}

export type ResultStats = {
  maxSkinMm: number
  operations: Array<{ id: string; kind: 'implant' | 'osteotomy'; maxHardMm: number; maxSkinMm: number; boneVertices: number; warnings: string[] }>
  landmarks: Array<{ id: string; code: string; movedMm: number }>
  measures: Array<{ id: string; label: string; kind: 'distance' | 'angle'; before: number | null; after: number | null }>
  skullAssetId: string
  faceAssetId: string
  usesEstimatedGeometry: boolean
}

export type ResultRecord = {
  id: string
  createdAt: string
  plan: Plan
  stats: ResultStats
  views: Array<RenderView & { photo?: OutlineReport }>
  photoStatus: 'none' | 'processing' | 'completed' | 'failed'
  photoError: string | null
  provider: string | null
  /** Asset id by label, e.g. "front:after". */
  files: Record<string, string>
}

export type CaseRecord = {
  id: string
  title: string
  providerConsent: boolean
  landmarks: Landmark[]
  measures: Measure[]
  plan: Plan | null
}

export type Viewer = { credits: number; retentionDays: number; photoConfigured: boolean; toleranceMm: number }
