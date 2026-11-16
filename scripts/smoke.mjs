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

// Uploads
const photo = await sharp({ create: { width: 900, height: 1100, channels: 3, background: { r: 180, g: 150, b: 130 } } }).jpeg().toBuffer()
const tiny = await sharp({ create: { width: 200, height: 200, channels: 3, background: '#888' } }).jpeg().toBuffer()

function simulationForm(file, name, extra = {}) {
  const form = new FormData()
  form.set('photo', new Blob([file], { type: 'image/jpeg' }), name)
  const fields = { procedure: 'rhinoplasty', focus: 'tip', intensity: '50', consentSelf: 'true', consentAdult: 'true', consentProcessing: 'true', ...extra }
  for (const [key, value] of Object.entries(fields)) if (value !== null) form.set(key, value)
  return form
}
async function simulate(form, headers = asUser) {
  const response = await fetch(base + '/api/simulations', { method: 'POST', body: form, headers })
  return { status: response.status, json: await response.json().catch(() => null) }
}

check('upload without consent is refused', (await simulate(simulationForm(photo, 'a.jpg', { consentProcessing: null }))).status === 400)
check('a file that is not an image is refused', (await simulate(simulationForm(Buffer.from('<html>not an image</html>'.repeat(40)), 'a.jpg'))).json?.error?.code === 'invalid_image')
check('a photo that is too small is refused', (await simulate(simulationForm(tiny, 'a.jpg'))).json?.error?.code === 'invalid_image')
check('a Pro procedure is refused on Starter', (await simulate(simulationForm(photo, 'a.jpg', { procedure: 'facelift', focus: 'lower' }))).json?.error?.code === 'plan_required')
check('a cross-site request is refused', (await simulate(simulationForm(photo, 'a.jpg'), { cookie: userCookie ?? '', origin: 'https://evil.example' })).status === 403)

const generated = await simulate(simulationForm(photo, 'a.jpg'))
if (generated.status === 503) {
  check('without an AI key the simulator says so and generates nothing', generated.json?.error?.code === 'not_configured')
  const after = await (await fetch(base + '/dashboard', { headers: asUser })).text()
  check('no credit was used', /Simulations left<\/p><p[^>]*>1</.test(after))
} else {
  check('simulation generated with the configured provider', generated.status === 200 && Boolean(generated.json?.id), JSON.stringify(generated.json))
  if (generated.json?.id) {
    const image = await fetch(`${base}/api/simulations/${generated.json.id}/image?type=result`, { headers: asUser })
    check('owner can open the result', image.status === 200 && image.headers.get('content-type') === 'image/jpeg')
    const other = await submitForm('/login', { email: adminEmail, password: adminPassword })
    const foreign = await fetch(`${base}/api/simulations/${generated.json.id}/image?type=result`, { headers: { cookie: cookieFrom(other) ?? '' } })
    check('another account cannot open the result', foreign.status === 404)
  }
}

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
