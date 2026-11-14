// Builds and saves crash incidents in the exact format the AutoFix engine and dashboard read.
// Database `hackuta`, collection `incidents`, one document per crash:
//
//   {
//     incidentId: 'incident-1794690435150-k3x9',
//     status: 'open',                  // the engine only picks up "open"
//     createdAt: Date,
//     route: 'POST /cart/promo',
//     error:   { message, stack, file, line },   // file/line = top in-repo, non-node_modules frame
//     actions: [{ t, type, target, value, url }], // the user's last 15 actions, oldest first
//     request: { method, path, body, headers: { 'content-type' } }
//   }

const { collections } = require('./db');
const { findTopFrame, parseActions } = require('./parse');

function newIncidentId() {
  return `incident-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// err: the thrown error. req: the Express request (or anything with method/path/originalUrl/body/get()).
function buildIncident(err, req) {
  const stack = String(err && err.stack);
  const top = findTopFrame(stack);
  const routePath = req.route && req.route.path != null ? req.route.path : req.path;
  return {
    incidentId: newIncidentId(),
    status: 'open',
    createdAt: new Date(),
    route: `${req.method} ${routePath}`,
    error: {
      message: String(err && err.message),
      stack,
      file: top ? top.file : null,
      line: top ? top.line : null,
    },
    actions: parseActions(req.get('x-autofix-actions')),
    request: {
      method: req.method,
      path: req.originalUrl, // includes the query string
      body: req.body ?? null,
      headers: { 'content-type': req.get('content-type') }, // only safe headers
    },
  };
}

async function insertIncident(incident) {
  const { incidents } = await collections();
  await incidents.insertOne(incident);
  return incident;
}

async function findIncident(incidentId) {
  const { incidents } = await collections();
  return incidents.findOne({ incidentId });
}

module.exports = { buildIncident, insertIncident, findIncident, newIncidentId };
