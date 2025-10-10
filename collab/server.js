// Minimal Hocuspocus server (CommonJS)
const { Server } = require('@hocuspocus/server');

const port = Number(process.env.PORT || process.env.SUPERDOC_PORT || 4002);
const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === 'true';

const server = Server.configure({
  port,
  // In-memory only for prototype
  name: 'superdoc-collab',
  address: '0.0.0.0',
});

server.listen();
if (isRender) {
  console.log(`🚀 [collab] Hocuspocus running on port ${port} (Render deployment)`);
} else {
  console.log(`[collab] Hocuspocus running on :${port}`);
}


