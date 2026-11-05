#!/usr/bin/env node
/**
 * End-to-end test runner:  npm run test:e2e            (all suites)
 *                          npm run test:e2e -- edge auth  (some suites)
 *
 * Creates a throwaway test company ("E2E Test Co") with two test technicians,
 * seeds data for each suite, runs the Electron tests against the real Supabase +
 * PowerSync (Development) instance, and ALWAYS deletes the test company and
 * users afterwards. It never touches any other company's data.
 *
 * Needs in .env: SUPABASE_URL, SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF
 * (the access token is an admin credential: keep it on developer machines only).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

const ROOT = resolve(import.meta.dirname, '..')
const ORG = 'eeeeeeee-0000-0000-0000-00000000e2e0'
const SUITES = ['sync', 'concurrent', 'edge', 'auth', 'admin'] // order matters (admin removes tech2)

// ---- config -----------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()])
)
for (const k of ['SUPABASE_URL', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF']) {
  if (!env[k]) { console.error(`Missing ${k} in .env — needed to create the test company.`); process.exit(2) }
}
const API = `https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}`
const mgmt = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }

async function sql(query) {
  const r = await fetch(`${API}/database/query`, { method: 'POST', headers: mgmt, body: JSON.stringify({ query }) })
  const body = await r.json()
  if (!r.ok || body?.message) throw new Error(`SQL failed: ${body?.message ?? r.status}`)
  return body
}
let secret
async function authAdmin(method, path, body) {
  secret ??= (await (await fetch(`${API}/api-keys?reveal=true`, { headers: mgmt })).json()).find((k) => k.type === 'secret').api_key
  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/${path}`, { method, headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) })
  if (!r.ok) throw new Error(`auth admin ${method} ${path}: ${r.status} ${await r.text()}`)
  return r.json()
}

// ---- test company -------------------------------------------------------------
const PW = randomBytes(12).toString('hex')
const userIds = {}
const localToday = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) }

async function cleanup() {
  await sql(`delete from public.organizations where id = '${ORG}';
             delete from auth.users where email like 'e2e-tech%@example.com';`)
}
async function setup() {
  await cleanup()
  for (const n of [1, 2]) {
    const u = await authAdmin('POST', 'users', { email: `e2e-tech${n}@example.com`, password: PW, email_confirm: true, user_metadata: { full_name: `Test Tech ${n}` } })
    userIds[n] = u.id
  }
  await sql(`insert into public.organizations(id, name) values ('${ORG}', 'E2E Test Co');
    with del as (delete from public.org_members where email like 'e2e-tech%@example.com' returning user_id, email, full_name)
    insert into public.org_members(org_id, user_id, email, full_name, role)
    select '${ORG}', user_id, email, full_name, case when email = 'e2e-tech1@example.com' then 'admin' else 'technician' end from del;`)
}
async function prepare({ tech2Role = 'technician', seed = '' } = {}) {
  await sql(`delete from public.customers where org_id = '${ORG}';
    delete from public.reference_standards where org_id = '${ORG}';
    with d as (delete from public.org_members where email = 'e2e-tech2@example.com' returning user_id, email, full_name)
    insert into public.org_members(org_id, user_id, email, full_name, role) select '${ORG}', user_id, email, full_name, '${tech2Role}' from d;
    ${seed}`)
  await authAdmin('PUT', `users/${userIds[2]}`, { password: PW })
}

const T = (n) => `'${n}'`
const SEED_CONCURRENT = `
  insert into customers(id, org_id, name) values ('c0000000-0000-0000-0000-0000000000e2','${ORG}','Concurrency Co');
  insert into visits(id, org_id, customer_id) values ('dddddddd-0000-0000-0000-0000000000e2','${ORG}','c0000000-0000-0000-0000-0000000000e2');
  insert into equipment(id, org_id, customer_id, equipment_type, model, serial_number, capacity, units) values ('e0000000-0000-0000-0000-0000000000e2','${ORG}','c0000000-0000-0000-0000-0000000000e2','load_cell','LC','LC-C',10,'kN');
  insert into calibrations(id, org_id, customer_id, equipment_id, visit_id, config, certificate_number, status) values ('ca000000-0000-0000-0000-0000000000e2','${ORG}','c0000000-0000-0000-0000-0000000000e2','e0000000-0000-0000-0000-0000000000e2','dddddddd-0000-0000-0000-0000000000e2','{"modes":["tension"]}','CAL-E2E','draft');
  insert into calibration_points(id, org_id, calibration_id, section, seq, nominal, run1) values ('b0000000-0000-0000-0000-0000000000e2','${ORG}','ca000000-0000-0000-0000-0000000000e2','tension',1,'10','10.0');`
const SEED_EDGE = () => {
  const today = T(localToday())
  return `
  insert into customers(id, org_id, name, contact_name, phone, email, city) values
    ('c0000000-0000-0000-0000-0000000000e3','${ORG}','Edge Co','Pat Lee','555-0199','pat@edge.test','Springfield'),
    ('c0000000-0000-0000-0000-0000000000e4','${ORG}','Delete Me Co',null,null,null,null);
  insert into visits(id, org_id, customer_id, visit_date, location) values
    ('dddddddd-0000-0000-0000-0000000000e3','${ORG}','c0000000-0000-0000-0000-0000000000e3',${today},'Test Lab'),
    ('dddddddd-0000-0000-0000-0000000000e5','${ORG}','c0000000-0000-0000-0000-0000000000e3',${today},'Test Lab'),
    ('dddddddd-0000-0000-0000-0000000000e4','${ORG}','c0000000-0000-0000-0000-0000000000e4',${today},'Test Lab');
  insert into equipment(id, org_id, customer_id, equipment_type, model, serial_number, indicator_model, indicator_serial, calibration_interval_days) values
    ('e0000000-0000-0000-0000-0000000000e5','${ORG}','c0000000-0000-0000-0000-0000000000e3','crosshead','Edge Frame','F-1','Ind','I-1',365);
  insert into equipment(id, org_id, customer_id, equipment_type, model, serial_number, capacity, units, test_frame_id, calibration_interval_days) values
    ('e0000000-0000-0000-0000-0000000000e3','${ORG}','c0000000-0000-0000-0000-0000000000e3','load_cell','EDGE-LC','LC-E3',50,'kN','e0000000-0000-0000-0000-0000000000e5',365),
    ('e0000000-0000-0000-0000-0000000000e4','${ORG}','c0000000-0000-0000-0000-0000000000e4','load_cell','Delete Me Gauge','DM-1',5,'kN',null,365);
  insert into reference_standards(id, org_id, name, serial_number, certificate_number, due_at) values
    ('f0000000-0000-0000-0000-0000000000e3','${ORG}','Edge Calibrator','S-1','C-1','2027-06-30');
  insert into calibrations(id, org_id, customer_id, equipment_id, visit_id, config, certificate_number, status, performed_at, standards_used) values
    ('ca000000-0000-0000-0000-0000000000e3','${ORG}','c0000000-0000-0000-0000-0000000000e3','e0000000-0000-0000-0000-0000000000e3','dddddddd-0000-0000-0000-0000000000e3','{"modes":["tension"]}','CAL-EDGE-MAIN','draft',${today},'["f0000000-0000-0000-0000-0000000000e3"]'),
    ('ca000000-0000-0000-0000-0000000000e4','${ORG}','c0000000-0000-0000-0000-0000000000e3','e0000000-0000-0000-0000-0000000000e3','dddddddd-0000-0000-0000-0000000000e3','{"modes":["tension"]}','CAL-EDGE-EMPTY','draft',${today},'[]'),
    ('ca000000-0000-0000-0000-0000000000e6','${ORG}','c0000000-0000-0000-0000-0000000000e4','e0000000-0000-0000-0000-0000000000e4','dddddddd-0000-0000-0000-0000000000e4','{"modes":["tension"]}','CAL-EDGE-DEL','draft',${today},'[]');
  insert into calibration_points(org_id, calibration_id, section, seq, nominal, run1, run2) values
    ('${ORG}','ca000000-0000-0000-0000-0000000000e3','tension',1,'10','10.05','9.98'),
    ('${ORG}','ca000000-0000-0000-0000-0000000000e3','tension',2,'20','20.1','20.04'),
    ('${ORG}','ca000000-0000-0000-0000-0000000000e4','tension',1,'5','5.01',null),
    ('${ORG}','ca000000-0000-0000-0000-0000000000e6','tension',1,'5','5','5');`
}

const PREP = {
  sync: () => prepare(),
  concurrent: () => prepare({ seed: SEED_CONCURRENT }),
  edge: () => prepare({ seed: SEED_EDGE() }),
  auth: () => prepare({ tech2Role: 'pending' }),
  admin: () => prepare()
}

// ---- run ------------------------------------------------------------------------
function runSuite(name, shots) {
  const file = join(ROOT, 'tests', 'e2e', `${name}.cjs`)
  const tmp = mkdtempSync(join(tmpdir(), `e2e-${name}-`))
  const childEnv = { ...process.env, E2E_PASSWORD: PW, TMPROOT: tmp, SHOTS: shots }
  const needsXvfb = process.platform === 'linux' && !process.env.DISPLAY
  const [cmd, args] = needsXvfb ? ['xvfb-run', ['-a', '-s', '-screen 0 1440x900x24', process.execPath, file]] : [process.execPath, [file]]
  console.log(`\n━━━ ${name.toUpperCase()} ━━━`)
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: childEnv, timeout: 10 * 60 * 1000 })
  rmSync(tmp, { recursive: true, force: true })
  return r.status === 0
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const selected = wanted.length ? SUITES.filter((s) => wanted.includes(s)) : SUITES
if (!process.argv.includes('--no-build')) {
  console.log('Building the app…')
  const b = spawnSync('npx', ['electron-vite', 'build'], { cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32' })
  if (b.status !== 0) process.exit(b.status ?? 1)
}
const shots = join(ROOT, 'test-results'); mkdirSync(shots, { recursive: true })
const results = {}
try {
  console.log('Creating test company and users…')
  await setup()
  for (const s of selected) {
    await PREP[s]()
    results[s] = runSuite(s, shots)
  }
} finally {
  console.log('\nCleaning up test company and users…')
  await cleanup().catch((e) => console.error('CLEANUP FAILED — remove "E2E Test Co" and e2e-tech*@example.com users manually:', e.message))
}
console.log('\n━━━ SUMMARY ━━━')
for (const s of selected) console.log(`${results[s] ? '✅' : '❌'} ${s}`)
process.exit(selected.every((s) => results[s]) ? 0 : 1)
