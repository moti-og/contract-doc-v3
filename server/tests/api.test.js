const https = require('https');
const http = require('http');

let BASE = 'https://localhost:4001';

async function detectBase() {
  // Try HTTPS health; if it fails, fall back to HTTP
  try {
    const r = await fetchJson('/api/v1/health', 'https');
    if (r && r.status === 200) { BASE = 'https://localhost:4001'; return; }
  } catch {}
  BASE = 'http://localhost:4001';
}

function fetchJson(path, scheme) {
  const url = `${scheme ? scheme : BASE.startsWith('https') ? 'https' : 'http'}://localhost:4001${path}`;
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method: 'GET', rejectUnauthorized: false }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function postJson(path, body) {
  const url = `${BASE}${path}`;
  const mod = url.startsWith('https') ? https : http;
  const payload = Buffer.from(JSON.stringify(body || {}));
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method: 'POST', rejectUnauthorized: false, headers: { 'Content-Type': 'application/json', 'Content-Length': payload.length } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: data ? JSON.parse(data) : {} }); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function fetchMatrixFor(userId) {
  const r = await fetchJson(`/api/v1/state-matrix?platform=web&userId=${encodeURIComponent(userId || 'tester')}`);
  if (r.status !== 200) throw new Error('matrix');
  return r.json?.config?.checkoutStatus || r.json.checkoutStatus || r.json.config.checkoutStatus;
}

async function ensureNotCheckedOut() {
  const status = await fetchMatrixFor('ensure');
  if (status.isCheckedOut && status.checkedOutUserId) {
    await postJson('/api/v1/checkin', { userId: status.checkedOutUserId });
  }
}

async function ensureUnfinalized() {
  try { await postJson('/api/v1/unfinalize', { userId: 'ensure' }); } catch {}
}

async function ensureFinalized() {
  try { await postJson('/api/v1/finalize', { userId: 'ensure' }); } catch {}
}

describe('API', () => {
  beforeAll(async () => {
    await detectBase();
  });
  test('health', async () => {
    const r = await fetchJson('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.json.ok).toBe(true);
  });

  test('state-matrix', async () => {
    const r = await fetchJson('/api/v1/state-matrix?platform=web&userId=tester');
    expect(r.status).toBe(200);
    expect(r.json.config).toBeTruthy();
  });

  test('checkout/checkin', async () => {
    await ensureNotCheckedOut();
    const u = 'jest-user';
    const c1 = await postJson('/api/v1/checkout', { userId: u });
    expect(c1.status).toBe(200);
    expect(c1.json.checkedOutBy).toBe(u);
    const c2 = await postJson('/api/v1/checkin', { userId: u });
    expect(c2.status).toBe(200);
  });

  test('finalize/unfinalize', async () => {
    await ensureNotCheckedOut();
    const u = 'jest-user';
    const f1 = await postJson('/api/v1/finalize', { userId: u });
    expect(f1.status).toBe(200);
    const f2 = await postJson('/api/v1/unfinalize', { userId: u });
    expect(f2.status).toBe(200);
  });

  test('checkin without checkout returns 409', async () => {
    await ensureNotCheckedOut();
    const r = await postJson('/api/v1/checkin', { userId: 'nobody' });
    expect(r.status).toBe(409);
  });

  test('checkout by A then checkin by B returns 409', async () => {
    await ensureNotCheckedOut();
    const a = 'jest-a', b = 'jest-b';
    const c = await postJson('/api/v1/checkout', { userId: a });
    expect(c.status).toBe(200);
    const r = await postJson('/api/v1/checkin', { userId: b });
    expect(r.status).toBe(409);
    await postJson('/api/v1/checkin', { userId: a }); // cleanup
  });

  test('cannot finalize when checked out by another user', async () => {
    await ensureUnfinalized();
    await ensureNotCheckedOut();
    const a = 'jest-a', b = 'jest-b';
    await postJson('/api/v1/checkout', { userId: a });
    const r = await postJson('/api/v1/finalize', { userId: b });
    expect(r.status).toBe(409);
    await postJson('/api/v1/checkin', { userId: a }); // cleanup
  });

  test('cannot unfinalize when checked out by another user', async () => {
    await ensureFinalized();
    await ensureNotCheckedOut();
    const a = 'jest-a', b = 'jest-b';
    await postJson('/api/v1/checkout', { userId: a });
    const r = await postJson('/api/v1/unfinalize', { userId: b });
    expect(r.status).toBe(409);
    await postJson('/api/v1/checkin', { userId: a }); // cleanup
    await ensureUnfinalized();
  });
});


