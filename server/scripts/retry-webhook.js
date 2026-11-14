#!/usr/bin/env node
// Re-sends the webhook for an incident whose delivery failed.
//   npm --prefix server run retry-webhook <incidentId>

const { findIncident } = require('../src/capture/incidents');
const { deliverWebhook } = require('../src/capture/webhook');
const { close } = require('../src/capture/db');

(async () => {
  const id = process.argv[2];
  if (!id) throw new Error('Usage: npm --prefix server run retry-webhook <incidentId>');
  try {
    const incident = await findIncident(id);
    if (!incident) throw new Error(`No incident ${id}`);
    const ok = await deliverWebhook(incident);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
