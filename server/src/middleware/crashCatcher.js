// Global error middleware. Register it LAST: app.use(crashCatcher)
//
// For a 5xx it:
//   1. builds the crash payload (stack, top frame in server/src/, the user's last 15 actions, request)
//   2. saves it to MongoDB as status "open", or bumps `occurrences` on a still-active duplicate
//      → AutomatedFix's patcher sees the insert through its change stream and starts fixing
//   3. answers the user with 500 { error, incidentId }
//   4. fires the optional webhook (only if WEBHOOK_URL is set)
//
// With capture off it only logs and answers 500 { error, incidentId: null }.

const config = require('../capture/config');
const { connect } = require('../capture/db');
const { findTopFrame, decodeActions, cleanRequest } = require('../capture/parse');
const { recordIncident } = require('../capture/incidents');
const { deliverWebhook } = require('../capture/webhook');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildCrash(err, req, source) {
  const error = {
    name: err.name || 'Error',
    message: String(err.message || err),
    stack: String(err.stack || ''),
  };
  return {
    source,
    error,
    topFrame: findTopFrame(error.stack),
    request: req ? cleanRequest(req) : null,
    // >>> USER'S LAST 15 ACTIONS: sent by recorder.js in the X-User-Actions header,
    //     decoded and cleaned in capture/parse.js, saved as incident.actions.
    actions: req ? decodeActions(req.get('x-user-actions')) : [],
  };
}

// Saves the crash and kicks off the webhook. Never rejects.
function capture(crash) {
  return recordIncident(crash)
    .then((result) => {
      const { incidentId, occurrences } = result.incident;
      if (!result.isNew) {
        console.log(`[capture] ${incidentId} happened again (x${occurrences}), webhook skipped`);
      } else {
        console.log(`[capture] ${incidentId} saved as open with ${crash.actions.length} user actions`);
        if (crash.request) {
          deliverWebhook(result.incident).catch((e) => console.error(`[capture] ${incidentId}: webhook error:`, e.message));
        }
      }
      return result;
    })
    .catch((err) => {
      console.error('[capture] could not save incident:', err.message);
      return null;
    });
}

async function crashCatcher(err, req, res, next) {
  const status = err.status || err.statusCode || 500;

  // 4xx errors (bad JSON, etc.) are the client's problem, not incidents.
  if (status < 500) {
    if (res.headersSent) return next(err);
    return res.status(status).json({ error: err.message, incidentId: null });
  }

  console.error(`\n[500] ${req.method} ${req.originalUrl}\n${err.stack || err}`);
  let incidentId = null;

  try {
    if (config.captureEnabled) {
      const saving = capture(buildCrash(err, req, 'request'));
      // Wait briefly for the ID so the toast can show it; the save keeps going if this times out.
      const result = await Promise.race([saving, sleep(config.respondTimeoutMs).then(() => null)]);
      incidentId = result ? result.incident.incidentId : null;
    }
  } catch (e) {
    console.error('[capture] crash catcher failed:', e.message);
  }

  if (res.headersSent) return;
  res.status(500).json({ error: err.message || 'Internal Server Error', incidentId });
}

function installProcessHandlers() {
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    console.error('\n[unhandledRejection]', err.stack);
    if (config.captureEnabled) capture(buildCrash(err, null, 'unhandledRejection'));
  });
}

function logCaptureStatus() {
  if (!config.captureEnabled) {
    console.log(`[capture] off (${config.captureOffReason}); crashes are only logged`);
    return;
  }
  console.log(
    `[capture] on -> ${config.dbName}.${config.incidentsCollection}` +
      (config.webhookUrl ? `, webhook ${config.webhookUrl}` : '')
  );
  connect()
    .then(() => console.log('[capture] MongoDB connected'))
    .catch((e) => console.warn('[capture] MongoDB not reachable yet:', e.message));
}

module.exports = { crashCatcher, installProcessHandlers, logCaptureStatus, buildCrash, capture };
