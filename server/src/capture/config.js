// Settings for crash capture. Everything comes from environment variables
// (server/.env is loaded if it exists; it is git-ignored, so a fresh clone has none).
//
// Capture is ON only when CAPTURE_ENABLED=1 and MONGODB_URI are both set, and it is
// forced OFF inside the AutomatedFix patcher's sandbox. The patcher starts this app
// with its own environment (including its MONGODB_URI), and its change stream starts a
// new run for every inserted incident, so capturing there would loop forever.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..');

const envFile = path.join(SERVER_DIR, '.env');
if (fs.existsSync(envFile)) {
  require('dotenv').config({ path: envFile, quiet: true });
}

function git(args) {
  try {
    return execSync(`git ${args}`, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || null;
  } catch (e) {
    return null;
  }
}

function stripCredentials(url) {
  return url ? url.replace(/\/\/[^@/]+@/, '//') : null;
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value || '').trim());
}

const mongoUri = process.env.MONGODB_URI || null;

// Variables the patcher always has (see AutomatedFix/.env.example) and this app never needs.
const PATCHER_MARKERS = ['TARGET_REPO', 'TARGET_OWNER', 'TARGET_START_CMD', 'LLM_MODE'];
const inPatcherSandbox = PATCHER_MARKERS.some((name) => process.env[name]);

function captureState() {
  if (inPatcherSandbox) return { on: false, why: 'running inside the AutomatedFix patcher sandbox' };
  if (isTruthy(process.env.CAPTURE_DISABLED)) return { on: false, why: 'CAPTURE_DISABLED is set' };
  if (!isTruthy(process.env.CAPTURE_ENABLED)) return { on: false, why: 'CAPTURE_ENABLED=1 is not set' };
  if (!mongoUri) return { on: false, why: 'MONGODB_URI is not set' };
  return { on: true, why: null };
}
const capture = captureState();

const config = {
  serverDir: SERVER_DIR,
  repoRoot: REPO_ROOT,
  // Stack frames are reported relative to the repo root; the first one under this prefix is the top frame.
  sourcePrefix: 'server/src/',

  mongoUri,
  dbName: process.env.MONGODB_DB || 'hackuta',
  incidentsCollection: process.env.MONGODB_COLLECTION || 'incidents',
  captureEnabled: capture.on,
  captureOffReason: capture.why,

  // Optional. AutomatedFix does NOT need it: its patcher picks up new incidents from a
  // MongoDB change stream. Leave WEBHOOK_URL empty unless a teammate asks for it.
  webhookUrl: process.env.WEBHOOK_URL || null,
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  webhookRetries: 3, // retries after the first attempt
  webhookTimeoutMs: 5000,

  // How long the user's 500 response waits for the incident ID before giving up on it.
  respondTimeoutMs: 2500,

  maxActions: 15,

  app: { name: 'mavs-merch-store', node: process.version },
  repo: {
    url: stripCredentials(process.env.REPO_URL || git('config --get remote.origin.url')),
    commit: process.env.GIT_COMMIT || git('rev-parse HEAD'),
    branch: process.env.GIT_BRANCH || git('rev-parse --abbrev-ref HEAD'),
  },
};

module.exports = config;
