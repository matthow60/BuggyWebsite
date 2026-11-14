// OPTIONAL. The AutoFix engine does not need this: it reads open incidents from MongoDB.
// Only runs when WEBHOOK_URL is set, for anyone who wants a push notification as well.
//
// POST $WEBHOOK_URL
//   headers: content-type: application/json, x-webhook-secret: $WEBHOOK_SECRET (if set)
//   body:    { event: "incident.created", incidentId, incident: { ...full document } }
//
// Tries once, then retries up to 3 times with 1s / 2s / 4s backoff.

const config = require('./config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toPayload(incident) {
  const { _id, ...rest } = incident;
  return { event: 'incident.created', incidentId: incident.incidentId, incident: rest };
}

async function deliverWebhook(incident) {
  if (!config.webhookUrl) return false;

  const { incidentId } = incident;
  const body = JSON.stringify(toPayload(incident));
  const headers = { 'content-type': 'application/json' };
  if (config.webhookSecret) headers['x-webhook-secret'] = config.webhookSecret;

  const totalAttempts = config.webhookRetries + 1;
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    if (attempt > 1) await sleep(1000 * 2 ** (attempt - 2)); // 1s, 2s, 4s
    try {
      const res = await fetch(config.webhookUrl, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(config.webhookTimeoutMs),
      });
      if (res.ok) {
        console.log(`[crash-report] ${incidentId}: webhook delivered (attempt ${attempt})`);
        return true;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    console.warn(`[crash-report] ${incidentId}: webhook attempt ${attempt}/${totalAttempts} failed: ${lastError}`);
  }

  console.error(`[crash-report] ${incidentId}: webhook gave up. Retry (inside server/): npm run retry-webhook ${incidentId}`);
  return false;
}

module.exports = { deliverWebhook, toPayload };
