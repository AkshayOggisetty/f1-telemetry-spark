// Checks that every internal link points at a defined route and every
// data / image / audio file the pages reference exists in public/.
// Usage: npm run check
import fs from 'fs'
import path from 'path'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..')
const pub = path.join(root, 'public')
const src = path.join(root, 'src')
let errors = 0
const fail = (msg) => {
  errors++
  console.log('  ✗', msg)
}

const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]))
const code = files(src).filter((f) => /\.(jsx?|mjs)$/.test(f))
const text = Object.fromEntries(code.map((f) => [f, fs.readFileSync(f, 'utf8')]))

// 1. Routes
const app = text[path.join(src, 'App.jsx')]
const routes = new Set([...app.matchAll(/path: '([^']+)'/g)].map((m) => m[1]))
console.log(`Routes (${routes.size}):`, [...routes].join(' '))
let links = 0
for (const [f, t] of Object.entries(text)) {
  for (const m of t.matchAll(/\bto[=:]\s*["'{`]+(\/[^"'`}\s]*)/g)) {
    links++
    if (!routes.has(m[1]) && m[1] !== '/home') fail(`${path.relative(root, f)} links to unknown route ${m[1]}`)
  }
}
console.log(`Internal links checked: ${links}`)

// 2. Static data files requested by pages
const meta = JSON.parse(fs.readFileSync(path.join(pub, 'data', 'meta.json')))
const required = ['meta.json', 'analytics.json', 'model.json']
for (const s of meta.sessions) for (const f of ['laps', 'replay', 'fastest', 'events', 'results']) required.push(`sessions/${s.slug}/${f}.json`)
for (const f of required) if (!fs.existsSync(path.join(pub, 'data', f))) fail(`missing data file data/${f}`)
for (const [f, t] of Object.entries(text)) {
  for (const m of t.matchAll(/(?:useData|load)\(\s*'([^']+\.json)'/g)) if (!fs.existsSync(path.join(pub, 'data', m[1]))) fail(`${path.relative(root, f)} loads missing data/${m[1]}`)
  for (const m of t.matchAll(/sessionFile\([^,]+,\s*'(\w+)'\)/g)) if (!['laps', 'replay', 'fastest', 'events', 'results'].includes(m[1])) fail(`${path.relative(root, f)} loads unknown session file ${m[1]}`)
}
console.log(`Data files checked: ${required.length}`)

// 3. Images and audio referenced from the data
let assets = 0
const check = (p, where) => {
  assets++
  if (!p || !fs.existsSync(path.join(pub, p))) fail(`${where} references missing ${p}`)
}
for (const d of meta.drivers) check(d.photo, `driver ${d.code}`)
for (const t of meta.teams) check(t.car, `team ${t.name}`)
for (const s of meta.sessions) {
  const ev = JSON.parse(fs.readFileSync(path.join(pub, 'data', 'sessions', s.slug, 'events.json')))
  for (const r of ev.radio) check(r.src, `${s.slug} radio`)
}
check('favicon.svg', 'index.html')
console.log(`Assets checked: ${assets}`)

// 4. External links (listed for review)
const ext = new Set()
for (const t of Object.values(text)) for (const m of t.matchAll(/href="(https?:[^"]+)"/g)) ext.add(m[1])
console.log('External links:', [...ext].join(' '))

console.log(errors ? `\n${errors} problem(s) found` : '\nAll links and assets OK')
process.exit(errors ? 1 : 0)
