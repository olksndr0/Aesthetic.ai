# Aesthetic AI

AI simulation of aesthetic surgery on the user's own photos: every simulation takes a front view and a side profile and returns a before/after for both. Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS, Prisma + PostgreSQL, Stripe subscriptions, an image-to-image AI provider (OpenAI or Replicate), private image storage, React Three Fiber, GSAP and Framer Motion.

> Simulations are illustrative only. The product is not a medical device and its copy says so on every result.

## 1. Run it locally

Requirements: Node.js 22+, and either Docker or nothing else (an embedded PostgreSQL is included for development).

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env

# Database: pick one
npm run db:up                 # PostgreSQL in Docker (port 5433)
npm run db:embedded           # or: PostgreSQL without Docker; leave this terminal open

npm run db:push               # create the tables
npm run db:seed               # plans, FAQ and the admin account
npm run dev                   # http://localhost:3000
```

The seed creates the admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`. **Change that password before seeding a production database.** The admin panel is at `/admin` and answers 404 to everyone else.

Without any external key the site runs fully except for three things, each of which says so on screen instead of pretending:

| Feature | Needs | Without it |
| --- | --- | --- |
| AI generation | `OPENAI_API_KEY` or `REPLICATE_API_TOKEN` | The simulator refuses to generate, uses no credit, stores no photo and shows what to set |
| Payments | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Checkout answers "not configured"; nothing is charged or activated |
| Email | `RESEND_API_KEY` | In development the email (e.g. the password-reset link) is printed in the server console |

## 2. AI provider

Set one key in `.env` and restart. `AI_PROVIDER` is optional; it is detected from the key.

- **OpenAI** (`OPENAI_API_KEY`): `POST /v1/images/edits` with `gpt-image-1` and `input_fidelity=high`, which keeps the face of the input photo. Your OpenAI organisation may need to be verified for image models.
- **Gemini** (`GEMINI_API_KEY`, model in `GEMINI_IMAGE_MODEL`): Google's image models ("Nano Banana") through `generateContent`. Used automatically when it is the only key set, or with `AI_PROVIDER="gemini"`. The same key powers the photographic render of the 3D planning module (section 6).
- **Replicate** (`REPLICATE_API_TOKEN`): `black-forest-labs/flux-kontext-pro`, an instruction-driven edit model. Change `REPLICATE_MODEL` to use another Kontext variant.

Every simulation needs two photos, the front view and the side profile, and makes one edit per view with the same procedure, focus and intensity (two provider calls, one credit). Nothing is stored or charged unless both succeed. The two edits are independent: what keeps them consistent is the shared instruction, so compare the two views when you evaluate a provider. Nothing checks that a photo really is a front or a profile shot.

The instruction sent to the model is built in `src/lib/procedures.ts` (`buildPrompt`): it names only the anatomical change of the chosen procedure and tells the model to keep identity, lighting, background, framing and clothing. Tune the wording per procedure there.

Both integrations are written against the providers' public HTTP APIs and are covered by type checks and the error paths, but **they have not been run against a live key in this repository**: do one real generation with each provider you enable before launch, and check the result for identity preservation.

Before going live, sign a data-processing agreement with the provider and confirm in its settings that API inputs are not used for training.

## 3. Stripe (test mode first)

1. Create a Stripe account and copy the **test** secret key into `STRIPE_SECRET_KEY`.
2. Install the Stripe CLI, run `stripe login`, then `npm run stripe:listen`. Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the app.
3. Log in, open `/pricing`, buy Pro with card `4242 4242 4242 4242`, any future date and CVC.
4. After the redirect, the dashboard shows Pro and 10 credits **only once the `invoice.paid` webhook has arrived**. The return URL alone activates nothing.

In production, add a webhook endpoint `https://your-domain/api/stripe/webhook` in the Stripe dashboard with the events `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`, and enable the Customer Portal (Settings → Billing → Customer portal) so "Manage subscription" works.

No products need to be created in Stripe: prices and credits live in the `Plan` table and are edited at `/admin/plans`. New checkouts use the current values; existing subscriptions keep the price they were sold at.

## 4. Storage and privacy

- Images are never public. `STORAGE_DRIVER=local` writes under `./storage` (outside `/public`); `s3` works with AWS S3, Cloudflare R2 or MinIO using a **private** bucket. The only way to read an image is `/api/simulations/[id]/image`, which checks the session and the owner.
- Uploads are validated by file signature, size (12 MB) and dimensions (shorter side ≥ 512 px), then re-encoded with EXIF removed.
- Three consents are required before every upload (own photo or permission, adult and clothed, processing by the AI provider) and the consent time is stored with the simulation.
- `IMAGE_RETENTION_DAYS` sets automatic deletion. Schedule a daily call:
  `curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/cleanup`
- Users can delete a single simulation or the whole account (which cancels the subscription first) from the dashboard.
- Photos are not used for training anywhere in this codebase.

**Before launch, have a lawyer review** `src/app/privacy`, `src/app/terms` and `src/app/cookies`, and replace the company details in `src/lib/site.ts` (legal name, contact addresses). Face photos are sensitive data under GDPR; a DPIA is advisable.

## 5. Project map

```
prisma/schema.prisma        data model            prisma/seed.ts   plans, FAQ, admin
src/lib/procedures.ts       the 12 procedures and the prompt builder
src/lib/ai.ts               OpenAI and Replicate image-to-image clients
src/lib/storage.ts          private storage (local / S3)
src/lib/auth.ts             sessions (hashed tokens, HTTP-only cookie), bcrypt
src/lib/rate-limit.ts       in-memory limiter (swap for Redis with several instances)
src/app/api/simulations     upload → validate → charge credit → generate → store
src/lib/anatomy             3D planning core: frame, meshes, DICOM, surfaces, registration, simulation
src/components/planning     3D planning workspace and viewer
src/app/api/planning        cases, private anatomical files, results, photographic render
src/app/api/stripe          checkout, customer portal, webhook
src/app/actions             server actions: auth, account, contact, admin
src/app/admin               protected admin panel
src/components/three        procedural 3D head (no model file)
```

## 6. 3D planning (`/planning`)

A second module, for signed-in users: a measured 3D model of the skull and face is the geometric base, the operator defines an implant or a bone movement, the model is changed once, and every view of the result is rendered from that one state.

**Data in**

| Input | How it is handled |
| --- | --- |
| CT / CBCT series (DICOM) | Read **in the browser** (`src/lib/anatomy/dicom.ts`); the volume is never uploaded. Bone and skin surfaces are extracted at adjustable thresholds and stored. Scale and left/right come from the DICOM headers. Uncompressed, one file per slice; compressed transfer syntaxes and multi-frame objects are refused with an explanation. |
| STL / OBJ / GLB | Skull, facial surface or implant. A mesh has no unit and no anatomical axes: the operator states them and whether the geometry is acquired or estimated. The server re-measures the model and refuses an implausible size. |
| Landmarks | Picked on the model or imported (CSV/JSON) with unit, frame and origin. Bilateral landmarks give a left/right check that catches a mirrored model. |
| Photographs | One per view, 14 views. Used for likeness in the photographic render only; never treated as 3D data. Flagged when blurred, badly exposed, duplicated or inconsistent. |

Everything is stored in one anatomical frame: millimetres, +X patient left, +Y superior, +Z anterior. Each model keeps its own file coordinates plus a 4x4 transform and the history of the steps that produced it (import, point-pair registration with its residual, manual corrections). A registration may rotate and move a model, never rescale or mirror it.

**The engine** (`src/lib/anatomy/simulate.ts`) supports two procedures, each with its own hard-tissue step: an implant on bone (uploaded shape or an ellipsoid envelope) and the repositioning of a bone segment cut by a plane. Rhinoplasty and soft-tissue procedures are listed as not supported. The skin does not copy the bone: it takes the change of the bone beneath it, blended over a distance and scaled by a ratio. **Both values are entered by the operator; there is no default.** This is a geometric illustration, not a biomechanical or clinically validated prediction, and the interface says so on every result.

**Photographic render (optional)**: set `GEMINI_API_KEY`. For each view the server sends Gemini the render of the simulated model, the photograph of that view, the front photograph and the text of the operations; nothing else leaves the server. It needs a separate consent and one credit. Each generated image is then compared with the outline of the 3D render inside the changed region (`src/lib/outline-check.ts`); beyond `GEOMETRY_TOLERANCE_MM` it is flagged and the geometric render stays the reference. The Gemini call has been exercised against a local stand-in only: **run it once with a real key and judge both likeness and the outline check before relying on it.** Check `GEMINI_IMAGE_MODEL` against Google's current model list.

**Not included** (each needs a specialist component): a validated soft-tissue model (finite-element or trained on pre/post-operative scans); reconstruction of a skull from photographs or a single radiograph; automatic landmark detection, on the model or in generated photos; registration of photographs to the 3D model (camera pose); re-meshing of bone along an osteotomy; DICOM decompression; rhinoplasty and soft-tissue procedures.

## 7. Checks

```bash
npm run typecheck     # TypeScript strict
npm test              # unit tests (prompt builder, plans, limiter; DICOM, surfaces, registration, simulation, outline check)
npm run build         # production build
node scripts/smoke.mjs   # end-to-end against a running server and a DEV database
```

`scripts/smoke.mjs` registers a throwaway user and exercises pages, links, auth, upload validation, plan gating, cross-site refusal, admin protection, checkout, the 3D planning API (ownership, scale and alignment checks) and account deletion. The rate limiter is in memory, so restart the server between repeated runs.

## 8. Deploy

Any Node host works (Vercel, Railway, Render, Fly, a VPS).

1. Create a managed PostgreSQL database and set `DATABASE_URL`.
2. Set every variable from `.env.example`, with `APP_URL` as the public HTTPS URL and `STORAGE_DRIVER=s3` (serverless hosts have no persistent disk).
3. Build with `npm run build`, start with `npm start`.
4. Run `npx prisma db push` (or create migrations with `npx prisma migrate dev` locally and run `npm run db:migrate` in production), then `npm run db:seed` once.
5. Add the Stripe webhook endpoint and the daily cleanup call.
6. Generation is a single request that can take up to a few minutes: on Vercel the route sets `maxDuration = 300`, which needs a plan that allows it.
7. With more than one server instance, move the rate limiter and the generation queue to Redis.

## 9. Known limits

- The AI and Stripe paths need real keys to be exercised end to end (sections 2 and 3).
- "Priority generation" (Premium) orders the in-process queue; it has an effect only when more generations are waiting than `AI_MAX_CONCURRENCY`.
- The 3D head is generated procedurally and is deliberately abstract. To use a sculpted model, load a GLB in `src/components/three/face-scene.tsx`.
