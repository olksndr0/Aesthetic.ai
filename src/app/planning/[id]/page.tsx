import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import type { CaseRecord, MeshAsset, PhotoAsset, ResultRecord } from '@/components/planning/types'
import { PlanningWorkspace } from '@/components/planning/workspace'
import { planSchema } from '@/lib/anatomy/plan'
import { landmarksSchema, mat4Schema, measuresSchema } from '@/lib/anatomy/schema'
import { requireUser } from '@/lib/auth'
import { getContent } from '@/lib/content'
import { db } from '@/lib/db'
import { env } from '@/lib/env'
import { geminiConfigured } from '@/lib/gemini'

export const metadata: Metadata = { title: '3D Planning case', robots: { index: false } }

export default async function PlanningCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requireUser(`/planning/${id}`)

  // Owner is part of the query: someone else's id is a 404.
  const found = await db.planningCase.findFirst({
    where: { id, userId: user.id },
    include: { assets: { orderBy: { createdAt: 'asc' } }, results: { orderBy: { createdAt: 'desc' }, include: { files: { select: { id: true, label: true } } } } },
  })
  if (!found) notFound()
  const content = await getContent()

  const plan = planSchema.safeParse(found.plan)
  const record: CaseRecord = {
    id: found.id,
    title: found.title,
    providerConsent: found.providerConsentAt !== null,
    landmarks: landmarksSchema.catch([]).parse(found.landmarks) as CaseRecord['landmarks'],
    measures: measuresSchema.catch([]).parse(found.measures),
    plan: plan.success ? plan.data : null,
  }
  const meshes = found.assets
    .filter(asset => asset.kind === 'skull' || asset.kind === 'face' || asset.kind === 'implant')
    .map(asset => ({ id: asset.id, kind: asset.kind, provenance: asset.provenance, label: asset.label, transform: mat4Schema.parse(asset.transform), meta: asset.meta }) as MeshAsset)
  const photos = found.assets.filter(asset => asset.kind === 'photo').map(asset => ({ id: asset.id, view: asset.label, meta: asset.meta }) as PhotoAsset)
  const results = found.results.map(
    result =>
      ({
        id: result.id,
        createdAt: result.createdAt.toISOString(),
        plan: result.plan,
        stats: result.stats,
        views: result.views,
        // A run interrupted by a restart is shown as failed, never as still running.
        photoStatus: result.photoStatus === 'processing' ? 'failed' : result.photoStatus,
        photoError: result.photoError,
        provider: result.provider,
        files: Object.fromEntries(result.files.map(file => [file.label, file.id])),
      }) as ResultRecord,
  )

  return (
    <div className="wrap py-10 sm:py-12">
      <Link href="/planning" className="link text-sm text-fog">
        All cases
      </Link>
      <h1 className="h3 mt-4 !text-3xl">{found.title}</h1>
      <p className="mt-3 inline-block rounded-xl border border-white/30 px-4 py-2 text-sm font-medium">{content['planning.disclaimer']}</p>
      <div className="mt-8">
        <PlanningWorkspace
          record={record}
          initialMeshes={meshes}
          initialPhotos={photos}
          initialResults={results}
          account={{ credits: user.credits, retentionDays: env.retentionDays, photoConfigured: geminiConfigured(), toleranceMm: env.planning.toleranceMm }}
          disclaimer={content['planning.disclaimer']}
        />
      </div>
    </div>
  )
}
