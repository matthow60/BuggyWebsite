// Settings for crash reporting. Everything comes from environment variables
// (a local .env is loaded if it exists: server/.env or the repo-root .env; both are git-ignored).
//
// Crash reporting is ON only when CRASH_REPORT_MONGODB_URI is set and AUTOFIX_REPLAY is not.
//
// Why not MONGODB_URI: the AutoFix engine starts a copy of this app to replay a crash and
// passes its own MONGODB_URI to it. If we reported with that variable, every replay crash
// would create a new incident and the engine would loop forever.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(SERVER_DIR, '..');

for (const envFile of [path.join(SERVER_DIR, '.env'), path.join(REPO_ROOT, '.env')]) {
  if (fs.existsSync(envFile)) {
    // Never overrides variables that are already set (e.g. ones the engine passes in).
    require('dotenv').config({ path: envFile, quiet: true });
  }
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

const mongoUri = (process.env.CRASH_REPORT_MONGODB_URI || '').trim() || null;
const isReplay = Boolean(process.env.AUTOFIX_REPLAY);

function captureState() {
  if (isReplay) return { on: false, why: 'AUTOFIX_REPLAY is set (engine replay)' };
  if (!mongoUri) return { on: false, why: 'CRASH_REPORT_MONGODB_URI is not set' };
  return { on: true, why: null };
}
const capture = captureState();

const config = {
  serverDir: SERVER_DIR,
  repoRoot: REPO_ROOT,

  mongoUri,
  dbName: 'hackuta',
  incidentsCollection: 'incidents',
  captureEnabled: capture.on,
  captureOffReason: capture.why,

  // Optional push notification after an incident is saved. The engine does NOT need it.
  webhookUrl: process.env.WEBHOOK_URL || null,
  webhookSecret: process.env.WEBHOOK_SECRET || null,
  webhookRetries: 3, // retries after the first attempt
  webhookTimeoutMs: 5000,

  maxActions: 15,

  repo: {
    url: stripCredentials(process.env.REPO_URL || git('config --get remote.origin.url')),
    commit: process.env.GIT_COMMIT || git('rev-parse HEAD'),
    branch: process.env.GIT_BRANCH || git('rev-parse --abbrev-ref HEAD'),
  },
};

module.exports = config;
