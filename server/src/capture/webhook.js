// OPTIONAL. AutomatedFix's patcher does not need this: it watches the incidents collection
// with a MongoDB change stream and starts on every insert with status "open". This only
// runs when WEBHOOK_URL is set, for anyone who wants a push notification as well.
//
// POST $WEBHOOK_URL
//   headers: content-type: application/json, x-webhook-secret: $WEBHOOK_SECRET (if set)
//   body:    { event: "incident.created", incidentId, incident: { ...full document } }
//
// Tries once, then retries up to 3 times with 1s / 2s / 4s backoff. If every attempt
// fails, the incident stays "open" and can be re-sent with `npm run retry-webhook incident-0042`.

const config = require('./config');
const { updateWebhookStatus } = require('./incidents');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toPayload(incident) {
  const { _id, webhook, ...rest } = incident;
  return { event: 'incident.created', incidentId: incident.incidentId, incident: rest };
}

async function deliverWebhook(incident) {
  const { incidentId } = incident;

  if (!config.webhookUrl) return false; // normal: the patcher uses the change stream

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
        console.log(`[capture] ${incidentId}: webhook delivered (attempt ${attempt})`);
        await updateWebhookStatus(incidentId, { status: 'delivered', attempts: attempt, deliveredAt: new Date() });
        return true;
      }
      lastError = `HTTP ${res.status}`;
    } catch (err) {
      lastError = err.message;
    }
    console.warn(`[capture] ${incidentId}: webhook attempt ${attempt}/${totalAttempts} failed: ${lastError}`);
  }

  console.error(`[capture] ${incidentId}: webhook gave up. Retry by hand (inside server/): npm run retry-webhook ${incidentId}`);
  await updateWebhookStatus(incidentId, { status: 'failed', attempts: totalAttempts, lastError });
  return false;
}

module.exports = { deliverWebhook, toPayload };
