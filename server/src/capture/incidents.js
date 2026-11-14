// Saves crashes to MongoDB, one document per distinct bug, in the schema AutomatedFix reads
// (patcher/README.md "What the target app must do" and lib/incident.js):
//
//   {
//     _id: 'incident-0042', incidentId: 'incident-0042', status: 'open', createdAt, route,
//     error:   { message, name, stack, file, line },   // patcher parses `stack` to find the file
//     actions: [{ t, type, target, value, url, label }],  // the user's last 15 actions
//     request: { method, path, query, body, headers },   // the request that returned 500
//     fingerprint, occurrences, lastSeenAt, updatedAt, source, topFrame, repo, app
//   }
//
// Statuses (set by the patcher after we insert "open"):
//   open → reproducing → patching → verifying → fixed   (or failed / not_reproducible)
// While an incident with the same fingerprint is still active, new crashes only bump
// `occurrences`, so five clicks on "Apply" still produce one incident and one PR.

const config = require('./config');
const { collections } = require('./db');
const { fingerprint } = require('./parse');

const ACTIVE_STATUSES = ['open', 'reproducing', 'patching', 'verifying'];

// Crashes with the same fingerprint are handled one at a time, so two quick
// clicks can't both decide "no open incident yet" and insert twice.
const locks = new Map();
function withLock(key, fn) {
  const previous = locks.get(key) || Promise.resolve();
  const run = previous.catch(() => {}).then(fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key);
  });
  return run;
}

async function nextIncidentId(counters) {
  const doc = await counters.findOneAndUpdate(
    { _id: 'incident' },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return 'incident-' + String(doc.seq).padStart(4, '0');
}

// crash: { source, error: { name, message, stack }, topFrame, request, actions }
// returns { isNew, incident }
async function recordIncident(crash) {
  const fp = fingerprint(crash.error, crash.topFrame);

  return withLock(fp, async () => {
    const { incidents, counters } = await collections();
    const now = new Date();

    const existing = await incidents.findOneAndUpdate(
      { fingerprint: fp, status: { $in: ACTIVE_STATUSES } },
      { $inc: { occurrences: 1 }, $set: { lastSeenAt: now } },
      { sort: { createdAt: -1 }, returnDocument: 'after' }
    );
    if (existing) return { isNew: false, incident: existing };

    const incident = buildIncident(crash, await nextIncidentId(counters), now);
    await incidents.insertOne(incident);
    return { isNew: true, incident };
  });
}

function buildIncident(crash, incidentId, now = new Date()) {
  const top = crash.topFrame;
  return {
    _id: incidentId, // readable id for the dashboard; lib/mongodb.js idFilter() accepts strings
    incidentId,
    status: 'open',
    createdAt: now,
    route: crash.request ? `${crash.request.method} ${crash.request.path}` : crash.source,
    error: {
      message: `${crash.error.name}: ${crash.error.message}`,
      name: crash.error.name,
      stack: crash.error.stack,
      file: top ? top.file : null, // patcher's fallback if it can't resolve the stack
      line: top ? top.line : null,
    },
    actions: crash.actions, // the user's last 15 actions, oldest first
    request: crash.request,
    fingerprint: fingerprint(crash.error, top),
    occurrences: 1,
    lastSeenAt: now,
    updatedAt: now,
    source: crash.source,
    topFrame: top,
    repo: config.repo,
    app: config.app,
  };
}

async function updateWebhookStatus(incidentId, webhook) {
  const { incidents } = await collections();
  await incidents.updateOne({ incidentId }, { $set: { webhook } });
}

async function findIncident(incidentId) {
  const { incidents } = await collections();
  return incidents.findOne({ incidentId });
}

module.exports = { ACTIVE_STATUSES, recordIncident, buildIncident, updateWebhookStatus, findIncident };
