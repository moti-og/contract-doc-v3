const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const port = process.env.PORT || 10000;
const distPath = path.join(__dirname, "dist");
const mainServerUrl = process.env.MAIN_SERVER_URL || "https://contract-doc-server.onrender.com";

const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".woff": "application/font-woff",
  ".ttf": "application/font-ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".otf": "application/font-otf",
  ".wasm": "application/wasm",
};

// Proxy function to forward API calls to main server
function proxyRequest(req, res, targetUrl) {
  const url = new URL(targetUrl);
  const options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname + url.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: url.hostname,
    },
  };

  const proxyReq = (url.protocol === "https:" ? https : http).request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (err) => {
    console.error("Proxy error:", err);
    res.writeHead(500);
    res.end("Proxy Error");
  });

  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  // Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }

  // Proxy API calls to main server
  if (
    req.url.startsWith("/api/") ||
    req.url.startsWith("/documents/") ||
    req.url.startsWith("/static/") ||
    req.url.startsWith("/collab/") ||
    req.url.startsWith("/ui/") ||
    req.url.startsWith("/vendor/") ||
    req.url.startsWith("/web/") ||
    req.url.startsWith("/compiled/")
  ) {
    proxyRequest(req, res, mainServerUrl + req.url);
    return;
  }

  // Serve static files
  let filePath = path.join(distPath, req.url === "/" ? "taskpane.html" : req.url);

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeType = mimeTypes[extname] || "application/octet-stream";

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/html" });
        res.end("404 Not Found", "utf-8");
      } else {
        res.writeHead(500);
        res.end("Server Error: " + error.code + " ..\n");
      }
    } else {
      res.writeHead(200, { "Content-Type": mimeType });
      res.end(content, "utf-8");
    }
  });
});

server.listen(port, () => {
  console.log(`Add-in server running on port ${port}`);
  console.log(`Proxying API calls to: ${mainServerUrl}`);
});
