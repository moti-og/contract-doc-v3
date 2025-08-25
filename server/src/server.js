/* Server: HTTPS-ready Express app serving unified origin for web, add-in, API, and static assets */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const compression = require('compression');
const multer = require('multer');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Configuration
const APP_PORT = Number(process.env.PORT || 4001);
const SUPERDOC_BASE_URL = process.env.SUPERDOC_BASE_URL || 'http://localhost:4002';
const ADDIN_DEV_ORIGIN = process.env.ADDIN_DEV_ORIGIN || 'https://localhost:4000';
const SSE_RETRY_MS = (() => {
  const v = Number(process.env.SSE_RETRY_MS || 3000);
  return Number.isFinite(v) && v > 0 ? v : 3000;
})();

// Paths
const rootDir = path.resolve(__dirname, '..', '..');
const publicDir = path.join(rootDir, 'server', 'public');
const sharedUiDir = path.join(rootDir, 'shared-ui');
const webDir = path.join(rootDir, 'web');
const dataAppDir = path.join(rootDir, 'data', 'app');
const dataUsersDir = path.join(dataAppDir, 'users');
const dataWorkingDir = path.join(rootDir, 'data', 'working');
const canonicalDocumentsDir = path.join(dataAppDir, 'documents');
const canonicalExhibitsDir = path.join(dataAppDir, 'exhibits');
const workingDocumentsDir = path.join(dataWorkingDir, 'documents');
const workingExhibitsDir = path.join(dataWorkingDir, 'exhibits');

// Ensure working directories exist
for (const dir of [dataWorkingDir, workingDocumentsDir, workingExhibitsDir]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// In-memory state (prototype)
const DOCUMENT_ID = process.env.DOCUMENT_ID || 'default';
const serverState = {
  isFinal: false,
  checkedOutBy: null,
  lastUpdated: new Date().toISOString(),
  revision: 1,
};

// Load persisted state if available
const stateFilePath = path.join(dataAppDir, 'state.json');
try {
  if (fs.existsSync(stateFilePath)) {
    const saved = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
    if (typeof saved.isFinal === 'boolean') serverState.isFinal = saved.isFinal;
    if (saved.checkedOutBy === null || typeof saved.checkedOutBy === 'string') serverState.checkedOutBy = saved.checkedOutBy;
    if (typeof saved.lastUpdated === 'string') serverState.lastUpdated = saved.lastUpdated;
    if (typeof saved.revision === 'number') serverState.revision = saved.revision;
  }
} catch {}

function persistState() {
  try {
    fs.writeFileSync(stateFilePath, JSON.stringify({ isFinal: serverState.isFinal, checkedOutBy: serverState.checkedOutBy, lastUpdated: serverState.lastUpdated, revision: serverState.revision }, null, 2));
  } catch {}
}

function bumpRevision() {
  serverState.revision = (Number(serverState.revision) || 0) + 1;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
}

// Helpers: users/roles
function loadUsers() {
  try {
    const up = path.join(dataUsersDir, 'users.json');
    if (!fs.existsSync(up)) return [];
    const users = JSON.parse(fs.readFileSync(up, 'utf8'));
    return Array.isArray(users) ? users : [];
  } catch { return []; }
}
function loadRoleMap() {
  try {
    const rp = path.join(dataUsersDir, 'roles.json');
    if (!fs.existsSync(rp)) return {};
    return JSON.parse(fs.readFileSync(rp, 'utf8')) || {};
  } catch { return {}; }
}
function getUserRole(userId) {
  const users = loadUsers();
  for (const u of users) {
    if (typeof u === 'string') {
      if (u === userId) return 'editor';
    } else if (u && (u.id === userId || u.label === userId)) {
      return u.role || 'editor';
    }
  }
  return 'editor';
}

function buildBanner({ isFinal, isCheckedOut, isOwner, checkedOutBy }) {
  if (isFinal) {
    return { state: 'final', title: 'Finalized', message: 'This document is finalized.' };
  }
  if (isCheckedOut) {
    if (isOwner) return { state: 'checked_out_self', title: 'Checked out by you', message: 'You can edit. Remember to check in.' };
    return { state: 'checked_out_other', title: 'Checked out', message: `Checked out by ${checkedOutBy}` };
  }
  return { state: 'available', title: 'Available to check out', message: 'Redline it up baby!' };
}

// SSE clients
const sseClients = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify({ documentId: DOCUMENT_ID, revision: serverState.revision, ...event, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(payload);
      res.flush?.();
    } catch { /* ignore */ }
  }
}

// Express app
const app = express();
app.use(compression());
// JSON body limit must accommodate DOCX base64 payloads for save-progress
app.use(express.json({ limit: '50mb' }));

// CORS for Yeoman add-in dev server
const allowedOrigins = new Set([
  ADDIN_DEV_ORIGIN,
]);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Static assets
// Serve vendor bundles (SuperDoc) under /vendor
app.use('/vendor', express.static(path.join(publicDir, 'vendor'), { fallthrough: true }));
// Serve shared UI under /ui
app.use('/ui', express.static(sharedUiDir, { fallthrough: true }));
// Keep legacy /static/vendor path for any hard-coded references (optional, can be removed later)
app.use('/static/vendor', express.static(path.join(publicDir, 'vendor'), { fallthrough: true }));
// Serve web static assets (helper scripts) under /web
app.use('/web', express.static(webDir, { fallthrough: true }));

// Prevent caches on JSON APIs to avoid stale state
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});

// WebSocket reverse proxy for collaboration under same HTTPS origin
const COLLAB_TARGET = process.env.COLLAB_TARGET || 'http://localhost:4002';
const collabProxy = createProxyMiddleware({
  target: COLLAB_TARGET,
  changeOrigin: true,
  ws: true,
  secure: false,
  logLevel: 'warn',
});
app.use('/collab', collabProxy);

// Quiet favicon 404s
app.get('/favicon.ico', (_req, res) => res.status(204).end());

// Debug and view pages
app.get('/debug', (req, res) => {
  res.sendFile(path.join(webDir, 'debug.html'));
});
app.get(['/view', '/'], (req, res) => {
  res.sendFile(path.join(webDir, 'view.html'));
});

// Files: default document resolution (working copy preferred)
function resolveDefaultDocPath() {
  const working = path.join(workingDocumentsDir, 'default.docx');
  if (fs.existsSync(working)) return working;
  return path.join(canonicalDocumentsDir, 'default.docx');
}

// Files: exhibits listing (canonical only for now)
function listExhibits() {
  const names = new Set();
  const items = [];
  // Prefer working copies first
  if (fs.existsSync(workingExhibitsDir)) {
    for (const f of fs.readdirSync(workingExhibitsDir)) {
      const p = path.join(workingExhibitsDir, f);
      if (fs.statSync(p).isDirectory()) continue;
      names.add(f);
      items.push({ name: f, url: `/exhibits/${encodeURIComponent(f)}` });
    }
  }
  if (fs.existsSync(canonicalExhibitsDir)) {
    for (const f of fs.readdirSync(canonicalExhibitsDir)) {
      if (names.has(f)) continue; // working overrides
      const p = path.join(canonicalExhibitsDir, f);
      if (fs.statSync(p).isDirectory()) continue;
      items.push({ name: f, url: `/exhibits/${encodeURIComponent(f)}` });
    }
  }
  return items;
}

// Serve default document bytes
app.get('/documents/default.docx', (req, res) => {
  const p = resolveDefaultDocPath();
  if (!fs.existsSync(p)) return res.status(404).send('default.docx not found');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="default.docx"');
  res.sendFile(p);
});

// Explicit canonical/working document endpoints
app.get('/documents/canonical/default.docx', (req, res) => {
  const p = path.join(canonicalDocumentsDir, 'default.docx');
  if (!fs.existsSync(p)) return res.status(404).send('canonical default.docx not found');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="default.docx"');
  res.sendFile(p);
});

app.get('/documents/working/default.docx', (req, res) => {
  const p = path.join(workingDocumentsDir, 'default.docx');
  if (!fs.existsSync(p)) return res.status(404).send('working default.docx not found');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline; filename="default.docx"');
  res.sendFile(p);
});

// Serve canonical exhibits
app.get('/exhibits/:name', (req, res) => {
  const w = path.join(workingExhibitsDir, req.params.name);
  const c = path.join(canonicalExhibitsDir, req.params.name);
  const p = fs.existsSync(w) ? w : c;
  if (!fs.existsSync(p)) return res.status(404).send('exhibit not found');
  res.setHeader('Content-Disposition', `inline; filename="${req.params.name}"`);
  res.sendFile(p);
});

// Uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (req.path.includes('/exhibits')) return cb(null, workingExhibitsDir);
    return cb(null, workingDocumentsDir);
  },
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage });

// API v1
app.get('/api/v1/health', (req, res) => {
  res.json({ ok: true, superdoc: SUPERDOC_BASE_URL });
});

app.get('/api/v1/users', (req, res) => {
  try {
    const up = path.join(dataUsersDir, 'users.json');
    const rp = path.join(dataUsersDir, 'roles.json');
    const users = fs.existsSync(up) ? JSON.parse(fs.readFileSync(up, 'utf8')) : [];
    const roles = fs.existsSync(rp) ? JSON.parse(fs.readFileSync(rp, 'utf8')) : {};
    const norm = (Array.isArray(users) ? users : []).map(u => {
      if (typeof u === 'string') return { id: u, label: u, role: 'editor' };
      return { id: u.id || u.label || 'user', label: u.label || u.id, role: u.role || 'editor' };
    });
    return res.json({ items: norm, roles });
  } catch (e) {
    return res.json({ items: [ { id: 'user1', label: 'user1', role: 'editor' } ], roles: { editor: {} } });
  }
});

app.get('/api/v1/current-document', (req, res) => {
  const p = resolveDefaultDocPath();
  const exists = fs.existsSync(p);
  res.json({
    id: DOCUMENT_ID,
    filename: 'default.docx',
    filePath: exists ? p : null,
    lastUpdated: serverState.lastUpdated,
    revision: serverState.revision,
  });
});

app.get('/api/v1/state-matrix', (req, res) => {
  const { platform = 'web', userId = 'user1' } = req.query;
  // Derive role from users.json
  const derivedRole = getUserRole(userId);
  const roleMap = loadRoleMap();
  const isCheckedOut = !!serverState.checkedOutBy;
  const isOwner = serverState.checkedOutBy === userId;
  const canWrite = !isCheckedOut || isOwner;
  const rolePerm = roleMap[derivedRole] || {};
  const banner = buildBanner({ isFinal: serverState.isFinal, isCheckedOut, isOwner, checkedOutBy: serverState.checkedOutBy });
  const config = {
    documentId: DOCUMENT_ID,
    buttons: {
      replaceDefaultBtn: true,
      compileBtn: true,
      approvalsBtn: true,
      finalizeBtn: !!rolePerm.finalize && !serverState.isFinal && canWrite,
      unfinalizeBtn: !!rolePerm.unfinalize && serverState.isFinal && canWrite,
      checkoutBtn: !!rolePerm.checkout && !isCheckedOut && !serverState.isFinal,
      checkinBtn: !!rolePerm.checkin && isOwner && !serverState.isFinal,
      cancelBtn: !!rolePerm.checkin && isOwner && !serverState.isFinal,
      saveProgressBtn: !!rolePerm.checkin && isOwner && !serverState.isFinal,
      overrideBtn: !!rolePerm.override && isCheckedOut && !isOwner && !serverState.isFinal,
      sendVendorBtn: !!rolePerm.sendVendor && !serverState.isFinal,
    },
    finalize: {
      isFinal: serverState.isFinal,
      banner: serverState.isFinal
        ? { title: 'Finalized', message: 'This document is finalized. Non-owners are read-only.' }
        : { title: 'Draft', message: 'This document is in draft.' }
    },
    banner,
    // Ordered banners for rendering in sequence on the client
    banners: (() => {
      const list = [banner];
      if (String(derivedRole).toLowerCase() === 'viewer') {
        list.push({ state: 'view_only', title: 'View Only', message: 'You can look but do not touch!' });
      }
      return list;
    })(),
    checkoutStatus: { isCheckedOut, checkedOutUserId: serverState.checkedOutBy },
    viewerMessage: isCheckedOut
      ? { type: isOwner ? 'info' : 'warning', text: isOwner ? `Checked out by you` : `Checked out by ${serverState.checkedOutBy}` }
      : { type: 'success', text: 'Available for editing' },
  };
  res.json({ config, revision: serverState.revision });
});

// Theme endpoint: returns style tokens for clients (banner colors, etc.)
app.get('/api/v1/theme', (req, res) => {
  try {
    const themePath = path.join(dataAppDir, 'theme.json');
    if (fs.existsSync(themePath)) {
      const j = JSON.parse(fs.readFileSync(themePath, 'utf8'));
      return res.json(j);
    }
  } catch {}
  return res.json({
    banner: {
      final: { bg: 'linear-gradient(180deg,#b91c1c,#ef4444)', fg: '#ffffff', pillBg: '#7f1d1d', pillFg: '#ffffff' },
      checked_out_self: { bg: 'linear-gradient(180deg,#2563eb,#60a5fa)', fg: '#ffffff', pillBg: '#1e3a8a', pillFg: '#ffffff' },
      checked_out_other: { bg: 'linear-gradient(180deg,#b45309,#f59e0b)', fg: '#111827', pillBg: '#92400e', pillFg: '#ffffff' },
      available: { bg: 'linear-gradient(180deg,#16a34a,#4ade80)', fg: '#ffffff', pillBg: '#166534', pillFg: '#ffffff' }
    }
  });
});

app.get('/api/v1/approvals/state', (req, res) => {
  res.json({ documentId: 'default', approvers: [] });
});

app.post('/api/v1/finalize', (req, res) => {
  const userId = req.body?.userId || 'user1';
  // Finalize allowed even if someone else has checkout? For safety, require not held by another user.
  if (serverState.checkedOutBy && serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Checked out by ${serverState.checkedOutBy}` });
  }
  serverState.isFinal = true;
  // Clear any existing checkout
  serverState.checkedOutBy = null;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'finalize', value: true, userId });
  res.json({ ok: true });
});

app.post('/api/v1/unfinalize', (req, res) => {
  const userId = req.body?.userId || 'user1';
  if (serverState.checkedOutBy && serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Checked out by ${serverState.checkedOutBy}` });
  }
  serverState.isFinal = false;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'finalize', value: false, userId });
  res.json({ ok: true });
});

app.post('/api/v1/document/upload', upload.single('file'), (req, res) => {
  // Normalize to default.docx working copy when name differs
  const uploaded = req.file?.path;
  if (!uploaded) return res.status(400).json({ error: 'No file' });
  const dest = path.join(workingDocumentsDir, 'default.docx');
  try {
    fs.copyFileSync(uploaded, dest);
    serverState.lastUpdated = new Date().toISOString();
    persistState();
    broadcast({ type: 'documentUpload', name: 'default.docx' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

app.post('/api/v1/document/revert', (req, res) => {
  const working = path.join(workingDocumentsDir, 'default.docx');
  if (fs.existsSync(working)) fs.rmSync(working);
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'documentRevert' });
  res.json({ ok: true });
});

// Save progress: write working copy bytes without releasing checkout
app.post('/api/v1/save-progress', (req, res) => {
  try {
    const userId = req.body?.userId || 'user1';
    const base64 = req.body?.base64 || '';
    if (serverState.isFinal) return res.status(409).json({ error: 'Finalized' });
    if (!serverState.checkedOutBy) return res.status(409).json({ error: 'Not checked out' });
    if (serverState.checkedOutBy !== userId) return res.status(409).json({ error: `Checked out by ${serverState.checkedOutBy}` });
    let bytes;
    try { bytes = Buffer.from(String(base64), 'base64'); } catch { return res.status(400).json({ error: 'invalid_base64' }); }
    if (!bytes || bytes.length < 4) return res.status(400).json({ error: 'invalid_payload' });
    // Minimal DOCX check (ZIP magic): must start with 'PK' and be a reasonable size (>1KB)
    if (!(bytes[0] === 0x50 && bytes[1] === 0x4b)) return res.status(400).json({ error: 'invalid_docx_magic' });
    if (bytes.length < 1024) return res.status(400).json({ error: 'invalid_docx_small', size: bytes.length });
    const dest = path.join(workingDocumentsDir, 'default.docx');
    try { fs.writeFileSync(dest, bytes); } catch { return res.status(500).json({ error: 'write_failed' }); }
    bumpRevision();
    broadcast({ type: 'saveProgress', userId, size: bytes.length });
    return res.json({ ok: true, revision: serverState.revision });
  } catch (e) {
    return res.status(500).json({ error: 'save_progress_failed' });
  }
});

// Snapshot: copy working/canonical default to a timestamped backup
app.post('/api/v1/document/snapshot', (req, res) => {
  const src = resolveDefaultDocPath();
  if (!fs.existsSync(src)) return res.status(404).json({ error: 'default.docx not found' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const snapDir = path.join(dataWorkingDir, 'snapshots');
  if (!fs.existsSync(snapDir)) fs.mkdirSync(snapDir, { recursive: true });
  const dest = path.join(snapDir, `default-${ts}.docx`);
  try {
    fs.copyFileSync(src, dest);
    broadcast({ type: 'snapshot', name: path.basename(dest) });
    res.json({ ok: true, path: dest });
  } catch (e) {
    res.status(500).json({ error: 'Snapshot failed' });
  }
});

// Factory reset: wipe working overlays and reset server state
app.post('/api/v1/factory-reset', (req, res) => {
  try {
    // Remove working document overlay
    const wDoc = path.join(workingDocumentsDir, 'default.docx');
    if (fs.existsSync(wDoc)) fs.rmSync(wDoc);
    // Remove exhibits overlays
    if (fs.existsSync(workingExhibitsDir)) {
      for (const f of fs.readdirSync(workingExhibitsDir)) {
        const p = path.join(workingExhibitsDir, f);
        try { if (fs.statSync(p).isFile()) fs.rmSync(p); } catch {}
      }
    }
    // Remove snapshots entirely
    const snapDir = path.join(dataWorkingDir, 'snapshots');
    if (fs.existsSync(snapDir)) {
      try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch {}
    }
    // Reset state and bump revision so clients resync deterministically
    serverState.isFinal = false;
    serverState.checkedOutBy = null;
    bumpRevision();
    broadcast({ type: 'factoryReset' });
    // Also emit documentRevert to trigger existing client handlers
    broadcast({ type: 'documentRevert' });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Factory reset failed' });
  }
});

// Checkout/Checkin endpoints
app.post('/api/v1/checkout', (req, res) => {
  const userId = req.body?.userId || 'user1';
  if (serverState.isFinal) {
    return res.status(409).json({ error: 'Finalized' });
  }
  if (serverState.checkedOutBy && serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Already checked out by ${serverState.checkedOutBy}` });
  }
  serverState.checkedOutBy = userId;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'checkout', userId });
  res.json({ ok: true, checkedOutBy: userId });
});

app.post('/api/v1/checkin', (req, res) => {
  const userId = req.body?.userId || 'user1';
  if (!serverState.checkedOutBy) {
    return res.status(409).json({ error: 'Not checked out' });
  }
  if (serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Checked out by ${serverState.checkedOutBy}` });
  }
  serverState.checkedOutBy = null;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'checkin', userId });
  res.json({ ok: true });
});

// Cancel checkout: release lock without any additional actions
app.post('/api/v1/checkout/cancel', (req, res) => {
  const userId = req.body?.userId || 'user1';
  if (!serverState.checkedOutBy) {
    return res.status(409).json({ error: 'Not checked out' });
  }
  if (serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Checked out by ${serverState.checkedOutBy}` });
  }
  serverState.checkedOutBy = null;
  serverState.lastUpdated = new Date().toISOString();
  persistState();
  broadcast({ type: 'checkoutCancel', userId });
  res.json({ ok: true });
});

// Override checkout (admin/editor capability): forcefully take ownership
app.post('/api/v1/checkout/override', (req, res) => {
  const userId = req.body?.userId || 'user1';
  const derivedRole = getUserRole(userId);
  const roleMap = loadRoleMap();
  const canOverride = !!(roleMap[derivedRole] && roleMap[derivedRole].override);
  if (serverState.isFinal) return res.status(409).json({ error: 'Finalized' });
  if (!canOverride) return res.status(403).json({ error: 'Forbidden' });
  // Override: clear any existing checkout, reverting to Available to check out
  if (serverState.checkedOutBy) {
    serverState.checkedOutBy = null;
    serverState.lastUpdated = new Date().toISOString();
    persistState();
    broadcast({ type: 'overrideCheckout', userId });
    return res.json({ ok: true, checkedOutBy: null });
  }
  // Nothing to clear; already available
  return res.json({ ok: true, checkedOutBy: null });
});

// Client-originated events (prototype): accept and rebroadcast for parity
app.post('/api/v1/events/client', (req, res) => {
  const { type = 'clientEvent', payload = {}, userId = 'user1', platform = 'web' } = req.body || {};
  const role = getUserRole(userId);
  broadcast({ type, payload, userId, role, platform });
  res.json({ ok: true });
});

app.get('/api/v1/exhibits', (req, res) => {
  res.json({ items: listExhibits() });
});

app.post('/api/v1/exhibits/upload', upload.single('file'), (req, res) => {
  const uploaded = req.file?.path;
  if (!uploaded) return res.status(400).json({ error: 'No file' });
  broadcast({ type: 'exhibitUpload', name: path.basename(uploaded) });
  res.json({ ok: true });
});

// Send to Vendor (prototype): no-op with SSE echo
app.post('/api/v1/send-vendor', (req, res) => {
  const { from = 'user', message = '', vendorName = "Moti's Builders", userId = 'user1' } = req.body || {};
  const payload = { from, message: String(message).slice(0, 200), vendorName };
  broadcast({ type: 'sendVendor', payload, userId });
  res.json({ ok: true });
});

// UI schema for Send to Vendor modal
app.get('/api/v1/ui/modal/send-vendor', (req, res) => {
  try {
    const themePath = path.join(dataAppDir, 'theme.json');
    let theme = {};
    try { if (fs.existsSync(themePath)) theme = JSON.parse(fs.readFileSync(themePath, 'utf8')) || {}; } catch {}
    const modalTheme = theme?.modal || {};
    const users = loadUsers();
    const userId = req.query?.userId || 'user1';
    const current = users.find(u => (u?.id || u?.label) === userId) || {};
    const defaultFrom = current?.label || current?.id || 'OpenGov Staff';
    const schema = {
      id: 'sendVendor',
      title: 'Send to Vendor',
      style: { width: 720 },
      theme: {
        background: modalTheme.background || '#ffffff',
        headerBg: modalTheme.headerBg || '#ffffff',
        headerFg: modalTheme.headerFg || '#111827',
        border: modalTheme.border || '#e5e7eb',
        primary: modalTheme.primary || '#111827',
        muted: modalTheme.muted || '#6b7280'
      },
      description: 'Notify the vendor that the document is ready for them to review.',
      fields: [
        { name: 'from', label: 'From', type: 'text', required: true, value: defaultFrom },
        { name: 'vendorName', label: 'Vendor Name', type: 'text', required: true, value: "Moti's Builders" },
        { name: 'message', label: 'Message', type: 'textarea', required: true, maxLength: 200, placeholder: 'Message (max 200 chars)' }
      ],
      actions: [
        { id: 'cancel', label: 'Cancel', variant: 'secondary' },
        { id: 'save', label: 'Send', variant: 'primary' }
      ]
    };
    res.json({ schema });
  } catch (e) {
    res.status(500).json({ error: 'modal schema failed' });
  }
});

// SSE events
app.get('/api/v1/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sseClients.add(res);
  res.write(`retry: ${SSE_RETRY_MS}\n\n`);
  res.flush?.();
  // Send an initial hello event so clients see activity immediately after connect
  try {
    const initial = {
      documentId: DOCUMENT_ID,
      revision: serverState.revision,
      type: 'hello',
      state: { isFinal: serverState.isFinal, checkedOutBy: serverState.checkedOutBy },
      ts: Date.now(),
    };
    res.write(`data: ${JSON.stringify(initial)}\n\n`);
    res.flush?.();
  } catch {}
  // Keep-alive comments to prevent proxy timeouts
  const keepalive = setInterval(() => {
    try { res.write(`: keepalive ${Date.now()}\n\n`); res.flush?.(); } catch {}
  }, 15000);
  req.on('close', () => { sseClients.delete(res); clearInterval(keepalive); });
});

// HTTPS preferred; try Office dev certs, then PFX, else fail (unless ALLOW_HTTP=true)
function tryCreateHttpsServer() {
  try {
    // 1) Office dev certs (shared with add-in 4000)
    try {
      // Lazy require to keep runtime optional
      const devCerts = require('office-addin-dev-certs');
      const httpsOptions = devCerts && devCerts.getHttpsServerOptions ? devCerts.getHttpsServerOptions() : null;
      if (httpsOptions && httpsOptions.key && httpsOptions.cert) {
        return https.createServer({ key: httpsOptions.key, cert: httpsOptions.cert, ca: httpsOptions.ca }, app);
      }
    } catch { /* ignore; may not be installed */ }
    // 2) PFX if available
    const pfxPath = process.env.SSL_PFX_PATH || path.join(rootDir, 'server', 'config', 'dev-cert.pfx');
    const pfxPass = process.env.SSL_PFX_PASS || 'password';
    if (fs.existsSync(pfxPath)) {
      const opts = { pfx: fs.readFileSync(pfxPath), passphrase: pfxPass };
      return https.createServer(opts, app);
    }
    // 3) PEM fallback
    const keyPath = process.env.SSL_KEY_PATH || path.join(rootDir, 'server', 'config', 'dev-key.pem');
    const certPath = process.env.SSL_CERT_PATH || path.join(rootDir, 'server', 'config', 'dev-cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const opts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
      return https.createServer(opts, app);
    }
  } catch { /* ignore */ }
  if (String(process.env.ALLOW_HTTP || '').toLowerCase() === 'true') return null;
  throw new Error('No HTTPS certificate available. Install Office dev certs or provide server/config/dev-cert.pfx. Set ALLOW_HTTP=true to use HTTP for dev only.');
}

const httpsServer = tryCreateHttpsServer();
let serverInstance;
if (httpsServer) {
  serverInstance = httpsServer;
  httpsServer.listen(APP_PORT, () => {
    console.log(`HTTPS server running on https://localhost:${APP_PORT}`);
    console.log(`SuperDoc backend: ${SUPERDOC_BASE_URL}`);
  });
} else {
  serverInstance = http.createServer(app);
  serverInstance.listen(APP_PORT, () => {
    console.warn(`ALLOW_HTTP=true enabled. HTTP server running on http://localhost:${APP_PORT}`);
    console.warn('Install Office dev certs (preferred) or place dev-cert.pfx under server/config to enable HTTPS.');
  });
}

// Attach WS upgrade for collab proxy
try {
  serverInstance.on('upgrade', (req, socket, head) => {
    if (req.url && req.url.startsWith('/collab')) {
      collabProxy.upgrade(req, socket, head);
    }
  });
} catch {}


