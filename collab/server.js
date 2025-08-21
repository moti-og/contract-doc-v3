// Minimal Hocuspocus server on 4100 (CommonJS)
const { Server } = require('@hocuspocus/server');

const port = Number(process.env.SUPERDOC_PORT || 4002);

const server = Server.configure({
  port,
  // In-memory only for prototype
  name: 'superdoc-collab',
  address: '0.0.0.0',
});

server.listen();
console.log(`[collab] Hocuspocus running on :${port}`);


