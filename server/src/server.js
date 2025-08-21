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

// Paths
const rootDir = path.resolve(__dirname, '..', '..');
const publicDir = path.join(rootDir, 'server', 'public');
const dataAppDir = path.join(rootDir, 'data', 'app');
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
const serverState = {
  isFinal: false,
  checkedOutBy: null,
  lastUpdated: new Date().toISOString(),
};

// SSE clients
const sseClients = new Set();
function broadcast(event) {
  const payload = `data: ${JSON.stringify({ ...event, ts: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try { res.write(payload); } catch { /* ignore */ }
  }
}

// Express app
const app = express();
app.use(compression());
app.use(express.json({ limit: '10mb' }));

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
app.use('/static', express.static(publicDir, { fallthrough: true }));

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
  res.sendFile(path.join(publicDir, 'debug.html'));
});
app.get(['/view', '/'], (req, res) => {
  res.sendFile(path.join(publicDir, 'view.html'));
});

// Files: default document resolution (working copy preferred)
function resolveDefaultDocPath() {
  const working = path.join(workingDocumentsDir, 'default.docx');
  if (fs.existsSync(working)) return working;
  return path.join(canonicalDocumentsDir, 'default.docx');
}

// Files: exhibits listing (canonical only for now)
function listExhibits() {
  if (!fs.existsSync(canonicalExhibitsDir)) return [];
  return fs.readdirSync(canonicalExhibitsDir)
    .filter(f => !fs.statSync(path.join(canonicalExhibitsDir, f)).isDirectory())
    .map(name => ({ name, url: `/exhibits/${encodeURIComponent(name)}` }));
}

// Serve default document bytes
app.get('/documents/default.docx', (req, res) => {
  const p = resolveDefaultDocPath();
  if (!fs.existsSync(p)) return res.status(404).send('default.docx not found');
  res.setHeader('Content-Disposition', 'inline; filename="default.docx"');
  res.sendFile(p);
});

// Serve canonical exhibits
app.get('/exhibits/:name', (req, res) => {
  const p = path.join(canonicalExhibitsDir, req.params.name);
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

app.get('/api/v1/current-document', (req, res) => {
  const p = resolveDefaultDocPath();
  const exists = fs.existsSync(p);
  res.json({
    id: 'default',
    filename: 'default.docx',
    filePath: exists ? p : null,
    lastUpdated: serverState.lastUpdated,
  });
});

app.get('/api/v1/state-matrix', (req, res) => {
  const { userRole = 'editor', platform = 'web', userId = 'user1' } = req.query;
  const isCheckedOut = !!serverState.checkedOutBy;
  const isOwner = serverState.checkedOutBy === userId;
  const canWrite = !isCheckedOut || isOwner;
  const config = {
    buttons: {
      replaceDefaultBtn: true,
      compileBtn: true,
      approvalsBtn: true,
      finalizeBtn: userRole === 'editor' && !serverState.isFinal && canWrite,
      unfinalizeBtn: userRole === 'editor' && serverState.isFinal && canWrite,
      checkoutBtn: !isCheckedOut,
      checkinBtn: isOwner,
    },
    finalize: { isFinal: serverState.isFinal },
    checkoutStatus: { isCheckedOut, checkedOutUserId: serverState.checkedOutBy },
    viewerMessage: isCheckedOut
      ? { type: isOwner ? 'info' : 'warning', text: isOwner ? `Checked out by you` : `Checked out by ${serverState.checkedOutBy}` }
      : { type: 'success', text: 'Available for editing' },
  };
  res.json({ config });
});

app.get('/api/v1/approvals/state', (req, res) => {
  res.json({ documentId: 'default', approvers: [] });
});

app.post('/api/v1/finalize', (req, res) => {
  serverState.isFinal = true;
  serverState.lastUpdated = new Date().toISOString();
  broadcast({ type: 'finalize', value: true });
  res.json({ ok: true });
});

app.post('/api/v1/unfinalize', (req, res) => {
  serverState.isFinal = false;
  serverState.lastUpdated = new Date().toISOString();
  broadcast({ type: 'finalize', value: false });
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
  broadcast({ type: 'documentRevert' });
  res.json({ ok: true });
});

// Checkout/Checkin endpoints
app.post('/api/v1/checkout', (req, res) => {
  const userId = req.body?.userId || 'user1';
  if (serverState.checkedOutBy && serverState.checkedOutBy !== userId) {
    return res.status(409).json({ error: `Already checked out by ${serverState.checkedOutBy}` });
  }
  serverState.checkedOutBy = userId;
  serverState.lastUpdated = new Date().toISOString();
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
  broadcast({ type: 'checkin', userId });
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

// SSE events
app.get('/api/v1/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sseClients.add(res);
  res.write('retry: 3000\n\n');
  req.on('close', () => sseClients.delete(res));
});

// HTTPS preferred; fallback to HTTP if certs missing
function tryCreateHttpsServer() {
  try {
    // Prefer PFX if available (works without openssl)
    const pfxPath = process.env.SSL_PFX_PATH || path.join(rootDir, 'server', 'config', 'dev-cert.pfx');
    const pfxPass = process.env.SSL_PFX_PASS || 'password';
    if (fs.existsSync(pfxPath)) {
      const opts = { pfx: fs.readFileSync(pfxPath), passphrase: pfxPass };
      return https.createServer(opts, app);
    }
    // Fallback to PEM key/cert
    const keyPath = process.env.SSL_KEY_PATH || path.join(rootDir, 'server', 'config', 'dev-key.pem');
    const certPath = process.env.SSL_CERT_PATH || path.join(rootDir, 'server', 'config', 'dev-cert.pem');
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      const opts = { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
      return https.createServer(opts, app);
    }
  } catch { /* ignore */ }
  return null;
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
    console.warn(`Dev cert not found. HTTP server running on http://localhost:${APP_PORT}`);
    console.warn('Set SSL_KEY_PATH and SSL_CERT_PATH or place dev certs under server/config to enable HTTPS.');
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


