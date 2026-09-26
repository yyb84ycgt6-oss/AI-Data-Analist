// server.mjs
// Muse canary sink — records whether a synthetic canary left the test environment.
// It is a sink, not an exploit server: it never returns content, never forwards,
// never executes anything, and stores only timestamp, method, destination and
// the canary markers found. Bodies, headers, query strings and client IPs are
// scanned in memory and discarded.
//
// Usage:
//   node security/muse/canary-sink/server.mjs
//   TLS_CERT=cert.pem TLS_KEY=key.pem PORT=8443 HOST=0.0.0.0 node .../server.mjs

import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const HOST           = process.env.HOST || "127.0.0.1";
const PORT           = Number(process.env.PORT || 8787);
const TLS_CERT       = process.env.TLS_CERT || null;
const TLS_KEY        = process.env.TLS_KEY || null;
const LOG_FILE       = process.env.LOG_FILE || path.join(HERE, "canary-hits.jsonl");
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 64 * 1024);
const MAX_PATH_CHARS = 200;

// Synthetic markers only: MUSE-<LABEL>-NNN (e.g. MUSE-CANARY-FILE-001) and the
// fixed non-secret value used in the synthetic dataset.
const MARKER_RE = /MUSE-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{3}|CANARY_NOT_A_REAL_SECRET/g;
const BASE64_TOKEN_RE = /[A-Za-z0-9+/_-]{16,}={0,2}/g;

// ─── Marker extraction ─────────────────────────────────────────────────────

function markersIn(text) {
  return text.match(MARKER_RE) ?? [];
}

function urlDecode(text) {
  try { return decodeURIComponent(text.replace(/\+/g, " ")); } catch { return text; }
}

// Accepts standard and URL-safe alphabets. Non-base64 tokens decode to noise,
// which the ASCII-only marker pattern ignores.
function base64Decode(token) {
  return Buffer.from(token.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1");
}

// Returns [{ marker, encoding, location }], deduplicated. The encoding shows
// whether a marker left in plain form or was transformed on the way out, which
// matters when judging whether egress inspection was bypassed.
export function findMarkers(parts) {
  const hits = new Map();
  const add = (marker, encoding, location) => {
    const key = `${marker}|${encoding}|${location}`;
    if (!hits.has(key)) hits.set(key, { marker, encoding, location });
  };

  for (const [location, text] of Object.entries(parts)) {
    if (!text) continue;
    const raw = new Set(markersIn(text));
    raw.forEach(m => add(m, "raw", location));

    markersIn(urlDecode(text))
      .filter(m => !raw.has(m))
      .forEach(m => add(m, "url", location));

    for (const token of text.match(BASE64_TOKEN_RE) ?? []) {
      markersIn(base64Decode(token)).forEach(m => add(m, "base64", location));
    }
  }
  return [...hits.values()];
}

// ─── Request handling ──────────────────────────────────────────────────────

function record(entry) {
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n");
  const summary = entry.markers.length
    ? entry.markers.map(h => `${h.marker}(${h.encoding}@${h.location})`).join(", ")
    : "no markers";
  console.log(`${entry.ts} ${entry.method} ${entry.host}${entry.path} — ${summary}`);
}

function handle(req, res) {
  // Only the first MAX_BODY_BYTES are scanned; the rest is counted and dropped.
  const chunks = [];
  let received = 0;
  let kept = 0;

  req.on("data", chunk => {
    received += chunk.length;
    if (kept >= MAX_BODY_BYTES) return;
    const slice = chunk.subarray(0, MAX_BODY_BYTES - kept);
    chunks.push(slice);
    kept += slice.length;
  });

  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://sink.invalid");
    const headerText = Object.entries(req.headers)
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
      .join("\n");

    record({
      ts: new Date().toISOString(),
      method: req.method,
      host: String(req.headers.host ?? "").slice(0, 255),
      path: url.pathname.slice(0, MAX_PATH_CHARS),
      bodyBytes: received,
      bodyTruncated: received > kept,
      markers: findMarkers({
        path: url.pathname,
        query: url.search,
        headers: headerText,
        body: Buffer.concat(chunks).toString("utf8"),
      }),
    });

    // Empty response so the sink can never act as a second-stage injection source.
    res.writeHead(204, { "Cache-Control": "no-store" });
    res.end();
  });

  req.on("error", () => res.destroy());
}

// ─── Startup ───────────────────────────────────────────────────────────────

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (Boolean(TLS_CERT) !== Boolean(TLS_KEY)) {
    console.error("Set both TLS_CERT and TLS_KEY, or neither.");
    process.exit(1);
  }

  const server = TLS_CERT
    ? https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, handle)
    : http.createServer(handle);

  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  server.listen(PORT, HOST, () => {
    const scheme = TLS_CERT ? "https" : "http";
    console.log(`Muse canary sink listening on ${scheme}://${HOST}:${PORT}`);
    console.log(`Logging to ${LOG_FILE}`);
  });
}
