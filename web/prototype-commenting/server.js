const http = require('http');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const publicDir = path.join(__dirname, 'public');

function send(res, status, body, type = 'text/html') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let p = url.pathname;
    if (p === '/') p = '/index.html';
    const filePath = path.join(publicDir, p);
    if (!filePath.startsWith(publicDir)) return send(res, 403, 'Forbidden');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const type = ext === '.css' ? 'text/css'
        : ext === '.js' ? 'application/javascript'
        : ext === '.json' ? 'application/json'
        : 'text/html';
      return send(res, 200, fs.readFileSync(filePath), type);
    }
    return send(res, 404, 'Not found');
  } catch (e) {
    return send(res, 500, 'Server error');
  }
});

server.listen(PORT, () => {
  console.log(`Prototype commenting site listening on http://localhost:${PORT}`);
});


