# Aesthetic AI

AI simulation of aesthetic surgery on the user's own photo. Next.js 15 (App Router), React 19, TypeScript strict, Tailwind CSS, Prisma + PostgreSQL, Stripe subscriptions, an image-to-image AI provider (OpenAI or Replicate), private image storage, React Three Fiber, GSAP and Framer Motion.

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
- **Replicate** (`REPLICATE_API_TOKEN`): `black-forest-labs/flux-kontext-pro`, an instruction-driven edit model. Change `REPLICATE_MODEL` to use another Kontext variant.

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
src/app/api/stripe          checkout, customer portal, webhook
src/app/actions             server actions: auth, account, contact, admin
src/app/admin               protected admin panel
src/components/three        procedural 3D head (no model file)
```

## 6. Checks

```bash
npm run typecheck     # TypeScript strict
npm test              # unit tests (prompt builder, plans, validation, limiter, queue)
npm run build         # production build
node scripts/smoke.mjs   # end-to-end against a running server and a DEV database
```

`scripts/smoke.mjs` registers a throwaway user and exercises pages, links, auth, upload validation, plan gating, cross-site refusal, admin protection, checkout and account deletion. The rate limiter is in memory, so restart the server between repeated runs.

## 7. Deploy

Any Node host works (Vercel, Railway, Render, Fly, a VPS).

1. Create a managed PostgreSQL database and set `DATABASE_URL`.
2. Set every variable from `.env.example`, with `APP_URL` as the public HTTPS URL and `STORAGE_DRIVER=s3` (serverless hosts have no persistent disk).
3. Build with `npm run build`, start with `npm start`.
4. Run `npx prisma db push` (or create migrations with `npx prisma migrate dev` locally and run `npm run db:migrate` in production), then `npm run db:seed` once.
5. Add the Stripe webhook endpoint and the daily cleanup call.
6. Generation is a single request that can take up to a few minutes: on Vercel the route sets `maxDuration = 300`, which needs a plan that allows it.
7. With more than one server instance, move the rate limiter and the generation queue to Redis.

## 8. Known limits

- The AI and Stripe paths need real keys to be exercised end to end (sections 2 and 3).
- "Priority generation" (Premium) orders the in-process queue; it has an effect only when more generations are waiting than `AI_MAX_CONCURRENCY`.
- The 3D head is generated procedurally and is deliberately abstract. To use a sculpted model, load a GLB in `src/components/three/face-scene.tsx`.
