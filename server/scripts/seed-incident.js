#!/usr/bin/env node
// Backup incident for the demo (bug 1: promo on an empty cart, with a 15-step story that the
// AutoFix engine can replay: every step uses a data-testid selector).
//
//   npm --prefix server run seed-incident                        insert into MongoDB as "open"
//   npm --prefix server run seed-incident -- --out seed.json     write JSON only (no database)
//   npm --prefix server run seed-incident -- --base http://localhost:3000   page URL origin for the actions
//
// The stack trace is real: the script calls the buggy pricing code and records what it throws.

const fs = require('fs');
const path = require('path');
const config = require('../src/capture/config');
const { buildIncident } = require('../src/capture/incidents');

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback;
};
const outFile = option('--out', null);
const base = option('--base', `http://localhost:${process.env.PORT || 3000}`);

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
  return steps.map((s) => ({
    t: (t += 4000 + Math.round(Math.random() * 4000)),
    type: s.type,
    target: s.target,
    value: s.value,
    url: new URL(s.url, base).href,
  }));
}

// Minimal stand-in for an Express request, so the seed goes through the same code as a real crash.
function fakeRequest(actions) {
  const headers = {
    'content-type': 'application/json',
    'x-autofix-actions': JSON.stringify(actions),
  };
  return {
    method: 'POST',
    path: '/cart/promo',
    route: { path: '/cart/promo' },
    originalUrl: '/api/cart/promo',
    body: { code: 'MAVS20' },
    get: (name) => headers[name.toLowerCase()],
  };
}

(async () => {
  const incident = buildIncident(realError(), fakeRequest(demoActions()));

  if (outFile) {
    fs.writeFileSync(outFile, JSON.stringify(incident, null, 2));
    console.log(`Wrote ${outFile}`);
    return;
  }

  if (!config.mongoUri) throw new Error('CRASH_REPORT_MONGODB_URI is not set (.env). Use --out file.json for an offline copy.');

  const { insertIncident } = require('../src/capture/incidents');
  const { close } = require('../src/capture/db');
  try {
    await insertIncident(incident);
    console.log(`Seeded ${incident.incidentId} (${incident.actions.length} actions)`);
  } finally {
    await close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
