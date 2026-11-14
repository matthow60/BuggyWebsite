#!/usr/bin/env node
// Backup incident for the demo (bug 1: promo on an empty cart, with a 15-step story that the
// AutomatedFix patcher can replay: every step uses a data-testid selector).
//
//   npm --prefix server run seed-incident                       insert into MongoDB as "open"
//   npm --prefix server run seed-incident -- --out seed.json    write JSON only (no database; for offline use)
//
// Inserting an "open" incident starts the patcher if it is running (change stream).
// The stack trace is real: the script calls the buggy pricing code and records what it throws.

const fs = require('fs');
const path = require('path');
const config = require('../src/capture/config');
const { buildCrash } = require('../src/middleware/crashCatcher');
const { buildIncident } = require('../src/capture/incidents');

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outFile = outIndex >= 0 ? args[outIndex + 1] : null;

function realError() {
  const { applyPromo } = require('../src/services/pricing');
  try {
    applyPromo([], 'MAVS20');
  } catch (err) {
    return err;
  }
  throw new Error('pricing.js no longer crashes on an empty cart; reset main before seeding.');
}

function demoActions() {
  const steps = JSON.parse(fs.readFileSync(path.join(__dirname, 'demo-actions.json'), 'utf8'));
  let t = Date.now() - steps.length * 6000;
  return steps.map((s) => ({ ...s, t: (t += 4000 + Math.round(Math.random() * 4000)) }));
}

// Minimal stand-in for an Express request, so the seed goes through the same cleaning code.
function fakeRequest(actions) {
  const headers = {
    'content-type': 'application/json',
    'user-agent': 'Mozilla/5.0 (seed-incident)',
    'x-session-id': 's-demo0042',
    'x-user-actions': Buffer.from(JSON.stringify(actions)).toString('base64'),
  };
  return {
    method: 'POST',
    originalUrl: '/api/cart/promo',
    query: {},
    body: { code: 'MAVS20' },
    get: (name) => headers[name.toLowerCase()],
  };
}

(async () => {
  const crash = buildCrash(realError(), fakeRequest(demoActions()), 'seed');

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(buildIncident(crash, 'incident-0042'), null, 2));
    console.log(`Wrote ${outFile}`);
    return;
  }

  if (!config.mongoUri) throw new Error('MONGODB_URI is not set (server/.env). Use --out file.json for an offline copy.');

  const { recordIncident } = require('../src/capture/incidents');
  const { close } = require('../src/capture/db');
  try {
    const { isNew, incident } = await recordIncident(crash);
    console.log(
      isNew
        ? `Seeded ${incident.incidentId} (${incident.actions.length} actions)`
        : `${incident.incidentId} is still active (status ${incident.status}); nothing new inserted`
    );
  } finally {
    await close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
