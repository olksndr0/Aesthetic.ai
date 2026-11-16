// End-to-end smoke test against a running server (default http://localhost:3000).
// Usage: node scripts/smoke.mjs [baseUrl]
// It registers a throwaway user, exercises the protected routes and deletes nothing
// but that user's own session. Run it against a development database only.
import sharp from 'sharp'

const base = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '')
const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@aesthetic-ai.example'
const adminPassword = process.env.ADMIN_PASSWORD ?? 'change-me-please-12'
let failures = 0

function check(name, ok, detail = '') {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
}

function cookieFrom(response) {
  const raw = response.headers.getSetCookie?.() ?? []
  const session = raw.find(line => line.startsWith('aai_session='))
  return session ? session.split(';')[0] : null
}

// Submits a server-action form the way a browser without JavaScript does.
async function submitForm(path, fields, cookie, pick = () => true) {
  const page = await fetch(base + path, { headers: cookie ? { cookie } : {} })
  const html = await page.text()
  const form = new FormData()
  const markup = html.split('<form').slice(1).map(part => part.split('</form>')[0]).find(pick) ?? ''
  for (const match of markup.matchAll(/<input type="hidden" name="(\$ACTION[^"]*)"(?: value="([^"]*)")?/g)) {
    form.set(match[1], (match[2] ?? '').replace(/&quot;/g, '"').replace(/&amp;/g, '&'))
  }
  for (const [key, value] of Object.entries(fields)) form.set(key, value)
  return fetch(base + path, { method: 'POST', body: form, redirect: 'manual', headers: { origin: base, ...(cookie ? { cookie } : {}) } })
}

const publicPages = ['/', '/simulator', '/procedures', '/pricing', '/about', '/faq', '/login', '/register', '/forgot-password', '/privacy', '/terms', '/cookies', '/contact', '/sitemap.xml', '/robots.txt', '/opengraph-image']
for (const path of publicPages) {
  const response = await fetch(base + path)
  check(`GET ${path}`, response.status === 200, String(response.status))
}

// Every internal link on the public pages must resolve.
const links = new Set()
for (const path of ['/', '/procedures', '/pricing', '/about', '/faq', '/contact']) {
  const html = await (await fetch(base + path)).text()
  for (const match of html.matchAll(/href="(\/[^"#]*)"/g)) {
    if (!match[1].startsWith('/_next')) links.add(match[1].replace(/&amp;/g, '&'))
  }
}
let broken = []
for (const link of links) {
  const response = await fetch(base + link, { redirect: 'manual' })
  if (response.status >= 400) broken.push(`${link} ${response.status}`)
}
check(`internal links resolve (${links.size} checked)`, broken.length === 0, broken.join(', '))

// Signed-out visitors
check('dashboard redirects to login', (await fetch(base + '/dashboard', { redirect: 'manual' })).status === 307)
check('admin is 404 when signed out', (await fetch(base + '/admin')).status === 404)
check('image API is 401 when signed out', (await fetch(base + '/api/simulations/x/image')).status === 401)
check('simulation API is 401 when signed out', (await fetch(base + '/api/simulations', { method: 'POST', body: new FormData() })).status === 401)
check('checkout API is 401 when signed out', (await fetch(base + '/api/stripe/checkout', { method: 'POST', body: '{}' })).status === 401)
check('webhook refuses an unsigned call', [400, 503].includes((await fetch(base + '/api/stripe/webhook', { method: 'POST', body: '{}' })).status))
check('cleanup refuses a call without the secret', [401, 503].includes((await fetch(base + '/api/cron/cleanup')).status))

// Registration
const email = `smoke-${Date.now()}@test.example`
const password = 'smoke-test-pass-1'
const weak = await submitForm('/register', { name: 'Smoke', email, password: 'short', terms: 'on', adult: 'on' })
check('weak password is rejected', weak.status === 200 && cookieFrom(weak) === null)
const noConsent = await submitForm('/register', { name: 'Smoke', email, password })
check('registration needs the age and terms boxes', noConsent.status === 200 && cookieFrom(noConsent) === null)
const registered = await submitForm('/register', { name: 'Smoke', email, password, terms: 'on', adult: 'on' })
const userCookie = cookieFrom(registered)
check('registration signs the user in', registered.status === 303 && userCookie !== null, String(registered.status))

const asUser = { cookie: userCookie ?? '', origin: base }
const dashboard = await fetch(base + '/dashboard', { headers: asUser })
const dashboardHtml = await dashboard.text()
check('dashboard opens for the user', dashboard.status === 200 && dashboardHtml.includes('Starter'))
check('admin is 404 for a normal user', (await fetch(base + '/admin', { headers: asUser })).status === 404)
check('admin users page is 404 for a normal user', (await fetch(base + '/admin/users', { headers: asUser })).status === 404)

// Wrong password, then a correct login
const badLogin = await submitForm('/login', { email, password: 'wrong-password-1' })
check('wrong password does not sign in', cookieFrom(badLogin) === null)
const goodLogin = await submitForm('/login', { email, password })
check('login works', goodLogin.status === 303 && cookieFrom(goodLogin) !== null)

// Photographs used below
const photo = await sharp({ create: { width: 900, height: 1100, channels: 3, background: { r: 180, g: 150, b: 130 } } }).jpeg().toBuffer()
const side = await sharp({ create: { width: 900, height: 1100, channels: 3, background: { r: 150, g: 130, b: 120 } } }).jpeg().toBuffer()
const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#888' } }).jpeg().toBuffer()

// Profiles: the clinical record and the photographs every simulation uses
const profileJson = (path, method, body, headers = asUser) =>
  fetch(base + path, { method, headers: { ...headers, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }).then(async response => ({ status: response.status, json: await response.json().catch(() => null) }))
check('profiles page sends signed-out visitors to login', (await fetch(base + '/profiles', { redirect: 'manual' })).status === 307)
check('profile API is 401 when signed out', (await fetch(base + '/api/profiles', { method: 'POST', body: '{}' })).status === 401)
check('a profile needs explicit consent', (await profileJson('/api/profiles', 'POST', { label: 'Smoke' })).status === 400)
const createdProfile = await profileJson('/api/profiles', 'POST', { label: 'Smoke profile', consent: true })
check('a profile is created with consent', createdProfile.status === 200 && Boolean(createdProfile.json?.id), JSON.stringify(createdProfile.json))
const profileId = createdProfile.json?.id
check('an out-of-range value is refused', (await profileJson(`/api/profiles/${profileId}`, 'PATCH', { data: { heightCm: 17 } })).status === 400)
check('an unknown field is refused', (await profileJson(`/api/profiles/${profileId}`, 'PATCH', { data: { shoeSize: 42 } })).status === 400)
check('a valid record is saved', (await profileJson(`/api/profiles/${profileId}`, 'PATCH', { data: { heightCm: 170, weightKg: 65, angleClass: 'Class I', anticoagulants: false } })).status === 200)

async function addPhoto(view, file) {
  const form = new FormData()
  form.set('view', view)
  form.set('file', new Blob([file], { type: 'image/jpeg' }), `${view}.jpg`)
  const response = await fetch(`${base}/api/profiles/${profileId}/photos`, { method: 'POST', body: form, headers: asUser })
  return { status: response.status, json: await response.json().catch(() => null) }
}
check('a file that is not an image is refused', (await addPhoto('front', Buffer.from('<html>not an image</html>'.repeat(40)))).json?.error?.code === 'invalid_image')
check('a photo that is too small is refused', (await addPhoto('front', tiny)).json?.error?.code === 'invalid_image')
check('an unknown view is refused', (await addPhoto('selfie', photo)).status === 400)
const frontAdded = await addPhoto('front', photo)
check('the front photograph is stored', frontAdded.status === 200 && frontAdded.json?.photos?.length === 1, JSON.stringify(frontAdded.json))
const frontPhotoId = frontAdded.json?.photos?.[0]?.id

function simulationForm(extra = {}) {
  const form = new FormData()
  const fields = { profileId, procedure: 'rhinoplasty', focus: 'tip', intensity: '50', consentSelf: 'true', consentAdult: 'true', consentProcessing: 'true', ...extra }
  for (const [key, value] of Object.entries(fields)) if (value !== null) form.set(key, value)
  return form
}
async function simulate(form, headers = asUser) {
  const response = await fetch(base + '/api/simulations', { method: 'POST', body: form, headers })
  return { status: response.status, json: await response.json().catch(() => null) }
}

check('a simulation without consent is refused', (await simulate(simulationForm({ consentProcessing: null }))).status === 400)
check('a simulation without a profile is refused', (await simulate(simulationForm({ profileId: null }))).json?.error?.code === 'no_profile')
check('a simulation needs the side profile in the profile', (await simulate(simulationForm())).json?.error?.view === 'profile')
check('the side photograph is stored', (await addPhoto('profile-left', side)).json?.photos?.length === 2)
check('a Pro procedure is refused on Starter', (await simulate(simulationForm({ procedure: 'facelift', focus: 'lower' }))).json?.error?.code === 'plan_required')
check('a cross-site request is refused', (await simulate(simulationForm(), { cookie: userCookie ?? '', origin: 'https://evil.example' })).status === 403)
if (frontPhotoId) {
  check('the owner can open a profile photograph', (await fetch(`${base}/api/profiles/photos/${frontPhotoId}`, { headers: asUser })).status === 200)
  check('a profile photograph is 401 when signed out', (await fetch(`${base}/api/profiles/photos/${frontPhotoId}`)).status === 401)
  const outsider = await submitForm('/login', { email: adminEmail, password: adminPassword })
  const asOutsider = { cookie: cookieFrom(outsider) ?? '', origin: base }
  check('another account cannot open the photograph', (await fetch(`${base}/api/profiles/photos/${frontPhotoId}`, { headers: asOutsider })).status === 404)
  check('another account cannot open the profile', (await fetch(`${base}/profiles/${profileId}`, { headers: asOutsider })).status === 404)
  check('another account cannot use the profile in a simulation', (await simulate(simulationForm(), asOutsider)).json?.error?.code === 'no_profile')
}
for (let extra = 0; extra < 4; extra += 1) await profileJson('/api/profiles', 'POST', { label: `Extra ${extra}`, consent: true })
check('a sixth profile is refused', (await profileJson('/api/profiles', 'POST', { label: 'One too many', consent: true })).status === 409)

const generated = await simulate(simulationForm())
if (generated.status === 503) {
  check('without an AI key the simulator says so and generates nothing', generated.json?.error?.code === 'not_configured')
  const after = await (await fetch(base + '/dashboard', { headers: asUser })).text()
  check('no credit was used', /Simulations left<\/p><p[^>]*>1</.test(after))
} else {
  check('simulation generated with the configured provider', generated.status === 200 && Boolean(generated.json?.id), JSON.stringify(generated.json))
  if (generated.json?.id) {
    const image = await fetch(`${base}/api/simulations/${generated.json.id}/image?type=result`, { headers: asUser })
    check('owner can open the result', image.status === 200 && image.headers.get('content-type') === 'image/jpeg')
    const profileImage = await fetch(`${base}/api/simulations/${generated.json.id}/image?type=result&view=profile`, { headers: asUser })
    check('owner can open the profile result', profileImage.status === 200 && profileImage.headers.get('content-type') === 'image/jpeg')
    const other = await submitForm('/login', { email: adminEmail, password: adminPassword })
    const foreign = await fetch(`${base}/api/simulations/${generated.json.id}/image?type=result`, { headers: { cookie: cookieFrom(other) ?? '' } })
    check('another account cannot open the result', foreign.status === 404)
  }
}

// 3D planning: access control and geometry checks
check('planning page sends signed-out visitors to login', (await fetch(base + '/planning', { redirect: 'manual' })).status === 307)
check('planning API is 401 when signed out', (await fetch(base + '/api/planning/cases', { method: 'POST', body: '{}' })).status === 401)
const planningJson = (path, method, body, headers = asUser) =>
  fetch(base + path, { method, headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then(async response => ({ status: response.status, json: await response.json().catch(() => null) }))
check('a case needs explicit consent', (await planningJson('/api/planning/cases', 'POST', { title: 'Smoke case' })).status === 400)
const createdCase = await planningJson('/api/planning/cases', 'POST', { title: 'Smoke case', consent: true })
check('a case is created with consent', createdCase.status === 200 && Boolean(createdCase.json?.id), JSON.stringify(createdCase.json))
const caseId = createdCase.json?.id

// A 100 mm tetrahedron in the storage format ("AMSH", version, counts, positions, indices).
function meshFile(size) {
  const bytes = new Uint8Array(16 + 4 * 12 + 4 * 12)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 0x48534d41, true)
  view.setUint32(4, 1, true)
  view.setUint32(8, 4, true)
  view.setUint32(12, 4, true)
  ;[0, 0, 0, size, 0, 0, 0, size, 0, 0, 0, size].forEach((value, index) => view.setFloat32(16 + index * 4, value, true))
  ;[0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3].forEach((value, index) => view.setUint32(64 + index * 4, value, true))
  return bytes
}
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function meshForm(bytes, transform = identity) {
  const form = new FormData()
  form.set('kind', 'skull')
  form.set('provenance', 'acquired')
  form.set('label', 'Smoke skull')
  form.set('transform', JSON.stringify(transform))
  form.set('meta', JSON.stringify({ fileName: 'smoke.stl', format: 'stl', sourceHash: 'smoke', unit: 'mm', origin: 'smoke test', resampledMm: null, steps: [{ kind: 'import', note: 'smoke', rmsMm: null, at: new Date().toISOString() }] }))
  form.set('file', new Blob([bytes]), 'model.amsh')
  return form
}
const uploadMesh = form => fetch(`${base}/api/planning/cases/${caseId}/assets`, { method: 'POST', body: form, headers: asUser }).then(async response => ({ status: response.status, json: await response.json().catch(() => null) }))
check('a model in the wrong unit is refused on scale', (await uploadMesh(meshForm(meshFile(0.1)))).json?.error?.code === 'implausible_scale')
check('a damaged model file is refused', (await uploadMesh(meshForm(meshFile(100).slice(0, 60)))).json?.error?.code === 'invalid_mesh')
const storedMesh = await uploadMesh(meshForm(meshFile(100)))
check('a plausible model is stored and measured by the server', storedMesh.status === 200 && storedMesh.json?.measured?.sizeMm?.[0] === 100, JSON.stringify(storedMesh.json))
check('a second skull is refused', (await uploadMesh(meshForm(meshFile(100)))).status === 409)
if (storedMesh.json?.id) {
  const assetPath = `/api/planning/assets/${storedMesh.json.id}`
  check('the owner can download the model', (await fetch(base + assetPath, { headers: asUser })).status === 200)
  check('the model is 401 when signed out', (await fetch(base + assetPath)).status === 401)
  const step = { kind: 'manual', note: 'smoke', rmsMm: null, at: new Date().toISOString() }
  check('an alignment may not rescale a model', (await planningJson(assetPath, 'PATCH', { transform: identity.map((value, index) => (index % 5 === 0 && index < 15 ? value * 2 : value)), step })).json?.error?.code === 'invalid_transform')
  check('an alignment may not mirror a model', (await planningJson(assetPath, 'PATCH', { transform: [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], step })).json?.error?.code === 'invalid_transform')
  check('a rigid alignment is accepted', (await planningJson(assetPath, 'PATCH', { transform: [1, 0, 0, 5, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], step })).status === 200)
  const stranger = await submitForm('/login', { email: adminEmail, password: adminPassword })
  const asStranger = { cookie: cookieFrom(stranger) ?? '', origin: base }
  check('another account cannot download the model', (await fetch(base + assetPath, { headers: asStranger })).status === 404)
  check('another account cannot open the case', (await fetch(`${base}/planning/${caseId}`, { headers: asStranger })).status === 404)
  check('another account cannot delete the case', (await planningJson(`/api/planning/cases/${caseId}`, 'DELETE', undefined, asStranger)).status === 404)
}
check('a plan without soft-tissue values is refused', (await planningJson(`/api/planning/cases/${caseId}`, 'PATCH', { plan: { operations: [{ id: 'a', kind: 'implant', label: 'x', region: 'chin', geometry: { type: 'ellipsoid', sizeMm: [10, 10, 10] }, positionMm: [0, 0, 0], rotationDeg: [0, 0, 0] }] } })).status === 400)
check('a cross-site planning request is refused', (await planningJson('/api/planning/cases', 'POST', { title: 'x', consent: true }, { cookie: userCookie ?? '', origin: 'https://evil.example' })).status === 403)
check('deleting the case removes it', (await planningJson(`/api/planning/cases/${caseId}`, 'DELETE')).status === 200 && (await fetch(`${base}/planning/${caseId}`, { headers: asUser })).status === 404)

// Payments
const checkout = await fetch(base + '/api/stripe/checkout', { method: 'POST', headers: { ...asUser, 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'pro', interval: 'MONTHLY' }) })
const checkoutJson = await checkout.json().catch(() => null)
if (checkout.status === 503) {
  check('without Stripe keys checkout says so and charges nothing', checkoutJson?.error?.code === 'not_configured')
} else {
  check('checkout returns a Stripe URL', checkout.status === 200 && String(checkoutJson?.url).startsWith('https://checkout.stripe.com'), JSON.stringify(checkoutJson))
}
const freeCheckout = await fetch(base + '/api/stripe/checkout', { method: 'POST', headers: { ...asUser, 'content-type': 'application/json' }, body: JSON.stringify({ plan: 'starter', interval: 'MONTHLY' }) })
check('the free plan cannot be "bought"', freeCheckout.status === 400)

// Contact form
const contact = await submitForm('/contact', { name: 'Smoke', email, subject: 'Smoke test', message: 'A message from the smoke test.' })
check('contact form is accepted', contact.status === 200 && (await contact.text()).includes('Message received'))

// Admin
const adminLogin = await submitForm('/login', { email: adminEmail, password: adminPassword })
const adminCookie = cookieFrom(adminLogin)
check('admin can log in', adminCookie !== null)
for (const path of ['/admin', '/admin/users', '/admin/plans', '/admin/simulations', '/admin/faq', '/admin/content', '/admin/messages']) {
  const response = await fetch(base + path, { headers: { cookie: adminCookie ?? '' } })
  check(`admin GET ${path}`, response.status === 200, String(response.status))
}

// Account deletion removes the throwaway user
const deleted = await submitForm('/dashboard', { password }, userCookie, form => form.includes('Delete my account'))
check('account deletion signs out and removes the user', deleted.status === 303, String(deleted.status))
const gone = await submitForm('/login', { email, password })
check('the deleted account can no longer log in', cookieFrom(gone) === null)

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
