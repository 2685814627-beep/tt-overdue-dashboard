const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "8888";
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "latest.json");
const MAX_BODY_BYTES = 25 * 1024 * 1024;

fs.mkdirSync(DATA_DIR, {recursive: true});

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestedPath));

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=3600"
    });
    res.end(content);
  });
}

async function handlePublish(req, res) {
  try {
    const rawBody = await readBody(req);
    const payload = JSON.parse(rawBody || "{}");

    if (payload.password !== ADMIN_PASSWORD) {
      sendJson(res, 401, {error: "Senha incorreta / 密码不正确"});
      return;
    }

    if (!Array.isArray(payload.rows)) {
      sendJson(res, 400, {error: "rows must be an array"});
      return;
    }

    const rows = payload.rows.filter((row) => row && row.awb);
    const saved = {
      fileName: String(payload.fileName || "uploaded.xlsx"),
      publishedAt: new Date().toISOString(),
      rows
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(saved, null, 2));
    sendJson(res, 200, {
      ok: true,
      rows: rows.length,
      publishedAt: saved.publishedAt
    });
  } catch (error) {
    sendJson(res, 400, {error: error.message});
  }
}

async function handleAuth(req, res) {
  try {
    const rawBody = await readBody(req);
    const payload = JSON.parse(rawBody || "{}");

    if (payload.password !== ADMIN_PASSWORD) {
      sendJson(res, 401, {error: "Senha incorreta / 密码不正确"});
      return;
    }

    sendJson(res, 200, {ok: true});
  } catch (error) {
    sendJson(res, 400, {error: error.message});
  }
}

function handleData(_req, res) {
  if (!fs.existsSync(DATA_FILE)) {
    sendJson(res, 200, {fileName: null, publishedAt: null, rows: []});
    return;
  }

  try {
    const payload = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    sendJson(res, 200, payload);
  } catch (error) {
    sendJson(res, 500, {error: error.message, rows: []});
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url.startsWith("/api/data")) {
    handleData(req, res);
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/api/publish")) {
    handlePublish(req, res);
    return;
  }

  if (req.method === "POST" && req.url.startsWith("/api/auth")) {
    handleAuth(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`TT dashboard is running on http://localhost:${PORT}`);
});
