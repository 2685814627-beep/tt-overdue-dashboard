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
const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "dashboard_snapshots";

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

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function supabaseHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "apikey": SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extra
  };
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function getSla(backlog) {
  const value = Number(backlog) || 0;
  if (value >= 10) return "SLA+10";
  if (value === 9) return "SLA+9";
  if (value === 8) return "SLA+8";
  return "Fora SLA";
}

function summarizeRows(rows) {
  return rows.reduce((summary, row) => {
    const sla = row.sla || getSla(row.backlog);
    if (sla === "SLA+8") summary.sla8 += 1;
    if (sla === "SLA+9") summary.sla9 += 1;
    if (sla === "SLA+10") summary.sla10 += 1;
    summary.total += 1;
    summary.valorTotal += Number(row.value) || 0;
    return summary;
  }, {
    total: 0,
    sla8: 0,
    sla9: 0,
    sla10: 0,
    valorTotal: 0
  });
}

function buildSnapshot({reportDate, fileName, rows}) {
  const safeDate = String(reportDate || todayIsoDate()).slice(0, 10);
  return {
    id: safeDate,
    reportDate: safeDate,
    fileName: String(fileName || "uploaded.xlsx"),
    publishedAt: new Date().toISOString(),
    rows,
    summary: summarizeRows(rows)
  };
}

function buildDataResponse(snapshots) {
  const sortedDesc = [...snapshots].sort((a, b) => {
    return String(b.reportDate || "").localeCompare(String(a.reportDate || ""))
      || String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  });
  const latest = sortedDesc[0] || null;
  const history = [...snapshots]
    .map((snapshot) => ({
      reportDate: snapshot.reportDate,
      publishedAt: snapshot.publishedAt,
      fileName: snapshot.fileName,
      ...summarizeRows(snapshot.rows || []),
      ...(snapshot.summary || {})
    }))
    .sort((a, b) => String(a.reportDate || "").localeCompare(String(b.reportDate || "")));

  return {
    fileName: latest?.fileName || null,
    publishedAt: latest?.publishedAt || null,
    reportDate: latest?.reportDate || null,
    rows: latest?.rows || [],
    history
  };
}

async function saveToSupabase(snapshot) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`, {
    method: "POST",
    headers: supabaseHeaders({
      "Prefer": "resolution=merge-duplicates"
    }),
    body: JSON.stringify({
      id: snapshot.id,
      report_date: snapshot.reportDate,
      file_name: snapshot.fileName,
      published_at: snapshot.publishedAt,
      payload: snapshot,
      summary: snapshot.summary
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase save failed: ${text || response.status}`);
  }
}

async function readFromSupabase() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?select=id,report_date,file_name,published_at,payload,summary&order=report_date.desc&limit=120`,
    {
      method: "GET",
      headers: supabaseHeaders()
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase read failed: ${text || response.status}`);
  }

  const rows = await response.json();
  const snapshots = rows.map((row) => ({
    ...(row.payload || {}),
    id: row.id,
    reportDate: row.report_date || row.payload?.reportDate,
    fileName: row.file_name || row.payload?.fileName,
    publishedAt: row.published_at || row.payload?.publishedAt,
    summary: row.summary || row.payload?.summary
  }));
  return buildDataResponse(snapshots);
}

function saveToFile(snapshot) {
  const current = readSnapshotsFromFile();
  const next = [
    snapshot,
    ...current.filter((item) => item.id !== snapshot.id)
  ].sort((a, b) => String(b.reportDate || "").localeCompare(String(a.reportDate || "")));
  fs.writeFileSync(DATA_FILE, JSON.stringify({snapshots: next}, null, 2));
}

function readSnapshotsFromFile() {
  if (!fs.existsSync(DATA_FILE)) {
    return [];
  }

  const payload = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  if (Array.isArray(payload.snapshots)) return payload.snapshots;
  if (Array.isArray(payload.rows)) {
    return [buildSnapshot({
      reportDate: payload.reportDate || todayIsoDate(),
      fileName: payload.fileName,
      rows: payload.rows
    })];
  }
  return [];
}

function readFromFile() {
  return buildDataResponse(readSnapshotsFromFile());
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
    const saved = buildSnapshot({
      reportDate: payload.reportDate,
      fileName: payload.fileName,
      rows
    });

    if (hasSupabaseConfig()) {
      await saveToSupabase(saved);
    } else {
      saveToFile(saved);
    }

    sendJson(res, 200, {
      ok: true,
      rows: rows.length,
      publishedAt: saved.publishedAt,
      reportDate: saved.reportDate,
      storage: hasSupabaseConfig() ? "supabase" : "file"
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

async function handleData(_req, res) {
  try {
    const payload = hasSupabaseConfig()
      ? await readFromSupabase()
      : readFromFile();
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
