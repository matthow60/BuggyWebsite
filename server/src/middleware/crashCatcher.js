// Global error middleware. Register it LAST: app.use(crashCatcher)
//
// For a 5xx it:
//   1. answers the user with 500 right away (user-facing behavior is unchanged)
//   2. then, fire-and-forget, inserts ONE incident (status "open") into hackuta.incidents
//      → the AutoFix engine picks it up, replays the actions, patches, opens a PR
//
// Reporting is off unless CRASH_REPORT_MONGODB_URI is set, and always off when AUTOFIX_REPLAY
// is set. When it is off the catcher only logs. It never throws and never delays the response.

const config = require('../capture/config');
const { connect } = require('../capture/db');
const { buildIncident, insertIncident } = require('../capture/incidents');
const { deliverWebhook } = require('../capture/webhook');

function reportCrash(err, req) {
  if (!config.captureEnabled) return;
  try {
    const incident = buildIncident(err, req);
    insertIncident(incident)
      .then(() => {
        console.log(`[crash-report] ${incident.incidentId} saved as open with ${incident.actions.length} actions`);
        deliverWebhook(incident).catch((e) => console.error('[crash-report] webhook error:', e.message));
      })
      .catch((e) => console.error('[crash-report] could not save incident:', e.message));
  } catch (e) {
    console.error('[crash-report] could not build incident:', e.message);
  }
}

function crashCatcher(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  // 4xx errors (bad JSON, etc.) are the client's problem, not incidents.
  if (status < 500) {
    if (res.headersSent) return next(err);
    return res.status(status).json({ error: err.message });
  }

  console.error(`\n[500] ${req.method} ${req.originalUrl}\n${err.stack || err}`);

  if (res.headersSent) {
    next(err);
  } else {
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }

  reportCrash(err, req); // after responding; never awaited
}

function installProcessHandlers() {
  // Log only: incidents need a failing request to replay, so they come from crashCatcher.
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('\n[unhandledRejection]', err.stack);
  });
}

function logCaptureStatus() {
  if (!config.captureEnabled) {
    console.log(`[crash-report] off (${config.captureOffReason}); crashes are only logged`);
    return;
  }
  console.log(`[crash-report] on -> ${config.dbName}.${config.incidentsCollection}`);
  connect()
    .then(() => console.log('[crash-report] MongoDB connected'))
    .catch((e) => console.warn('[crash-report] MongoDB not reachable yet:', e.message));
}

module.exports = { crashCatcher, installProcessHandlers, logCaptureStatus, reportCrash };
