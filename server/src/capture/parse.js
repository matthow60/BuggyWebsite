// Turns a raw error + request into the clean fields stored on an incident.
const crypto = require('crypto');
const path = require('path');
const { fileURLToPath } = require('url');
const config = require('./config');

// "    at fnName (C:\path\file.js:14:53)"  or  "    at C:\path\file.js:77:18"
const FRAME_RE = /^\s*at (?:(.*?) \()?(.+?):(\d+):(\d+)\)?\s*$/;

function toRepoPath(file) {
  if (file.startsWith('file://')) {
    try {
      file = fileURLToPath(file);
    } catch (e) {
      return null;
    }
  }
  if (!path.isAbsolute(file)) return null;
  const rel = path.relative(config.repoRoot, file).split(path.sep).join('/');
  return rel.startsWith('..') ? null : rel;
}

function parseStack(stack) {
  return String(stack || '')
    .split('\n')
    .slice(1)
    .map((line) => {
      const m = line.match(FRAME_RE);
      if (!m) return null;
      return {
        function: m[1] || null,
        file: toRepoPath(m[2]),
        line: Number(m[3]),
        column: Number(m[4]),
      };
    })
    .filter(Boolean);
}

// The first frame inside server/src/, with a repo-relative path, e.g.
// { file: 'server/src/services/pricing.js', line: 14, column: 53, function: 'subtotal' }
function findTopFrame(stack) {
  return (
    parseStack(stack).find(
      (f) => f.file && f.file.startsWith(config.sourcePrefix) && !f.file.includes('node_modules')
    ) || null
  );
}

function fingerprint(error, topFrame) {
  const parts = [error.name, error.message, topFrame ? `${topFrame.file}:${topFrame.line}` : 'unknown'];
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

// =====================================================================================
//  USER'S LAST 15 ACTIONS: server side (decode + clean before saving to MongoDB)
//  The browser half is server/public/sdk/recorder.js.
//
//  Stored shape (shared with AutomatedFix: patcher/src/replay.js and lib/incident.js):
//    { t, type, target, value, url, label }
//      t       epoch milliseconds
//      type    'navigate' | 'click' | 'input'
//      target  CSS selector the patcher clicks/fills on replay, e.g. [data-testid="promo-apply"]
//              (null for navigate)
//      value   what was typed (inputs only; passwords, cards and emails are "•••")
//      url     path + query of the page it happened on, e.g. /cart
//      label   human-readable text for the dashboard, e.g. "Apply promo code"
// =====================================================================================
const ACTION_TYPES = ['navigate', 'click', 'input'];

function clip(value, max) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

function cleanAction(a) {
  if (!a || typeof a !== 'object' || !ACTION_TYPES.includes(a.type)) return null;
  const t = Number(a.t);
  return {
    t: Number.isFinite(t) && t > 0 ? t : Date.now(),
    type: a.type,
    // Never shortened: a cut-off selector can't be replayed.
    target: a.type === 'navigate' ? null : clip(a.target, 1000),
    value: a.type === 'input' ? (a.value == null ? '' : String(a.value).slice(0, 200)) : null,
    url: clip(a.url, 300),
    label: clip(a.label, 80),
  };
}

// Reads the X-User-Actions header (base64 JSON). Never throws: a bad header means no actions.
function decodeActions(header) {
  if (!header) return [];
  try {
    const parsed = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(cleanAction).filter(Boolean).slice(-config.maxActions);
  } catch (e) {
    return [];
  }
}
// ============================ end: user's last 15 actions ============================

// ---------- Request snapshot (enough for the patcher to replay it) ----------
const KEEP_HEADERS = ['content-type', 'user-agent', 'referer', 'x-session-id'];
const SECRET_KEY_RE = /pass|card|cvv|cvc|token|secret|auth|ssn/i;

function maskSecrets(value, depth = 0) {
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => maskSecrets(v, depth + 1));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? '•••' : maskSecrets(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 500) return value.slice(0, 500);
  return value;
}

function cleanRequest(req) {
  const headers = {};
  for (const name of KEEP_HEADERS) {
    const v = req.get(name);
    if (v) headers[name] = v;
  }
  return {
    method: req.method,
    path: req.originalUrl.split('?')[0],
    query: { ...req.query },
    body: req.body === undefined ? null : maskSecrets(req.body),
    headers,
    sessionId: req.get('x-session-id') || null,
  };
}

module.exports = { parseStack, findTopFrame, fingerprint, decodeActions, cleanRequest };
