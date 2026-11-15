// Push notification simulation: real src/lib/push.ts + real web-push encryption,
// with a mock Supabase REST API and a mock browser push service (HTTPS).
// Run: NODE_TLS_REJECT_UNAUTHORIZED=0 npx tsx --conditions=react-server tests/push.sim.mts
import https from 'node:https';
import http from 'node:http';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as webpushLib from 'web-push';

execSync('openssl req -x509 -newkey rsa:2048 -nodes -keyout /tmp/push-k.pem -out /tmp/push-c.pem -days 1 -subj /CN=localhost 2>/dev/null');

// --- mock browser push service ---
const delivered: { path: string; auth: string; bytes: number }[] = [];
const pushSrv = https.createServer({ key: fs.readFileSync('/tmp/push-k.pem'), cert: fs.readFileSync('/tmp/push-c.pem') }, (req, res) => {
  const b: Buffer[] = [];
  req.on('data', (d) => b.push(d));
  req.on('end', () => {
    if (req.url?.includes('gone')) { res.writeHead(410); return res.end(); }
    delivered.push({ path: req.url!, auth: String(req.headers.authorization), bytes: Buffer.concat(b).length });
    res.writeHead(201); res.end();
  });
}).listen(4556);

// --- devices (each has real ECDH keys, like a browser) ---
const device = (name: string) => {
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  return { endpoint: `https://localhost:4556/push/${name}`, p256dh: e.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
};
const rows = [
  { id: 's1', ...device('superadmin-laptop'), profile: { role: 'superadmin', is_active: true }, profile_id: 'SA' },
  { id: 's2', ...device('superadmin-phone'), profile: { role: 'superadmin', is_active: true }, profile_id: 'SA' },
  { id: 's3', ...device('admin-laptop'), profile: { role: 'admin', is_active: true }, profile_id: 'AD' },
  { id: 's4', ...device('employee-asha'), profile: { role: 'employee', is_active: true }, profile_id: 'ASHA' },
  { id: 's5', ...device('gone-superadmin-old'), profile: { role: 'superadmin', is_active: true }, profile_id: 'SA' },
];
const deleted: string[] = [];
const queries: string[] = [];

// --- mock Supabase REST (PostgREST) ---
const rest = http.createServer((req, res) => {
  const u = new URL(req.url!, 'http://x');
  queries.push(`${req.method} ${u.pathname}?${decodeURIComponent(u.search.slice(1))}`);
  if (req.method === 'DELETE') { deleted.push(u.searchParams.get('id')!.replace('eq.', '')); res.writeHead(204); return res.end(); }
  let out = rows;
  const role = u.searchParams.get('profile.role'); // e.g. in.(superadmin)
  if (role) { const allowed = role.replace(/^in\.\(|\)$/g, '').split(','); out = out.filter((r) => allowed.includes(r.profile.role)); }
  if (u.searchParams.get('profile.is_active') === 'eq.true') out = out.filter((r) => r.profile.is_active);
  const pid = u.searchParams.get('profile_id'); if (pid) out = out.filter((r) => r.profile_id === pid.replace('eq.', ''));
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(out));
}).listen(4557);

const keys = webpushLib.generateVAPIDKeys();
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:4557';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service';
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = keys.publicKey;
process.env.VAPID_PRIVATE_KEY = keys.privateKey;

const { pushToRoles, pushToProfile } = await import('../src/lib/push.ts');
let n = 0; const ok = (m: string) => console.log(`  ✓ ${++n}. ${m}`);

const r1 = await pushToRoles(['superadmin'], { title: 'Action needed: Asha requested extra days', body: 'CL · 18 Nov · 2 days', url: '/requests' });
assert.ok(r1);
assert.equal(r1!.devices, 3); assert.equal(r1!.sent, 2); assert.equal(r1!.expired, 1);
assert.deepEqual(delivered.map((d) => d.path).sort(), ['/push/superadmin-laptop', '/push/superadmin-phone']);
assert.ok(delivered.every((d) => d.auth.startsWith('vapid t=') && d.bytes > 100));
ok('extra-day request → both Superadmin devices notified (VAPID-signed, encrypted); admin & employee not notified');
assert.deepEqual(deleted, ['s5']);
ok('expired subscription (410) is removed automatically');
assert.ok(queries.some((q) => q.includes('profile.role=in.(superadmin)') && q.includes('profile.is_active=eq.true')));
ok('recipient query filters by role and active status');

delivered.length = 0;
const r2 = await pushToProfile('ASHA', { title: 'Your request was approved', body: 'CL · 18 Nov', url: '/leave' });
assert.equal(r2!.sent, 1); assert.equal(delivered[0].path, '/push/employee-asha');
ok('decision → only the employee’s device notified');

delivered.length = 0;
const r3 = await pushToProfile('NOBODY', { title: 'x', body: 'y' });
assert.equal(r3!.devices, 0); assert.equal(delivered.length, 0);
ok('user without devices → nothing sent, reported as 0 devices (shown in “Send test”)');

delete process.env.VAPID_PRIVATE_KEY;
pushSrv.close(); rest.close();
console.log(`\nAll ${n} push checks passed.`);
