// Turns a raw error + request into the fields stored on an incident.
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
      return { function: m[1] || null, file: toRepoPath(m[2]), line: Number(m[3]), column: Number(m[4]) };
    })
    .filter(Boolean);
}

// The first frame in this repo outside node_modules, e.g. { file: 'server/src/services/pricing.js', line: 15 }
function findTopFrame(stack) {
  return parseStack(stack).find((f) => f.file && !f.file.includes('node_modules')) || null;
}

// Reads the x-autofix-actions header (a JSON array). Never throws: a bad header means no actions.
function parseActions(header) {
  if (!header) return [];
  try {
    const parsed = JSON.parse(String(header));
    return Array.isArray(parsed) ? parsed.slice(-config.maxActions) : [];
  } catch (e) {
    return [];
  }
}

module.exports = { parseStack, findTopFrame, parseActions };
