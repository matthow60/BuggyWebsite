#!/usr/bin/env node
// Prints the user actions stored on the newest incident (or a given one), so you can confirm
// the last 15 actions really reached MongoDB. Read-only.
//
//   npm --prefix server run check-actions              newest incident
//   npm --prefix server run check-actions incident-0042     a specific incident

const config = require('../src/capture/config');
const { collections, close } = require('../src/capture/db');

(async () => {
  if (!config.mongoUri) throw new Error('MONGODB_URI is not set in server/.env');
  const id = process.argv[2];
  try {
    const { incidents } = await collections();
    const total = await incidents.countDocuments();
    const doc = id ? await incidents.findOne({ incidentId: id }) : await incidents.find().sort({ createdAt: -1 }).limit(1).next();

    console.log(`Database ${config.dbName}, collection ${config.incidentsCollection}: ${total} incident(s)`);
    if (!doc) {
      console.log(id ? `No incident ${id}.` : 'No incidents yet. Trigger a bug in the store first.');
      process.exitCode = 1;
      return;
    }

    const actions = doc.actions || [];
    console.log(`\n${doc.incidentId}  status=${doc.status}  ${doc.route}  ${new Date(doc.createdAt).toLocaleString()}`);
    console.log(`error: ${doc.error && doc.error.message}`);
    console.log(`\nactions stored: ${actions.length} (max 15, oldest first)\n`);
    actions.forEach((a, i) => {
      const when = a.t ? new Date(a.t).toLocaleTimeString() : '?';
      const value = a.type === 'input' ? `  = "${a.value}"` : '';
      console.log(`${String(i + 1).padStart(2)}. ${when}  ${a.type.padEnd(8)} ${a.label || ''}${value}`);
      console.log(`      target: ${a.target || '(none)'}   url: ${a.url}`);
    });

    const problems = [];
    if (actions.length === 0) problems.push('no actions were stored (was the page loaded with /sdk/recorder.js?)');
    if (actions.length > 15) problems.push('more than 15 actions stored');
    actions.forEach((a, i) => {
      if (!['navigate', 'click', 'input'].includes(a.type)) problems.push(`step ${i + 1}: unknown type "${a.type}"`);
      if (a.type !== 'navigate' && !a.target) problems.push(`step ${i + 1}: no target selector, the patcher can't replay it`);
      if (typeof a.t !== 'number') problems.push(`step ${i + 1}: t is not a timestamp`);
    });
    console.log(problems.length ? `\nPROBLEMS:\n - ${problems.join('\n - ')}` : '\nOK: actions look complete and replayable.');
    if (problems.length) process.exitCode = 1;
  } finally {
    await close();
  }
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
