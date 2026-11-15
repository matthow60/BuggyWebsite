#!/usr/bin/env node
// Resets the demo: deletes all incidents and checks that the five bugs still crash,
// both in this checkout and on origin/main.
//
//   npm --prefix server run reset-demo              (asks before deleting)
//   npm --prefix server run reset-demo -- --yes     (no prompt)
//   npm --prefix server run reset-demo -- --check-only

const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');
const config = require('../src/capture/config');

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

const SERVICES = 'server/src/services';
const BUGS = [
  {
    file: 'pricing.js',
    name: 'Bug 1: promo on empty cart',
    run: (m) => m.applyPromo([], 'MAVS10'),
    expect: 'Reduce of empty array with no initial value',
  },
  {
    file: 'split.js',
    name: 'Bug 2: split with blank payers',
    run: (m) => m.splitPayment(10, undefined),
    expect: "Cannot read properties of undefined (reading 'map')",
  },
  {
    file: 'inventory.js',
    name: 'Bug 3: missing size',
    run: (m) => m.checkStock({ name: 'Tee', sizes: [{ label: 'S', stock: 1 }] }, 'XXL', 1),
    expect: "Cannot read properties of undefined (reading 'stock')",
  },
  {
    file: 'contact.js',
    name: 'Bug 4: place order with blank email',
    run: (m) => m.normalizeEmail(undefined),
    expect: "Cannot read properties of undefined (reading 'trim')",
  },
  {
    file: 'shipping.js',
    name: 'Bug 5: delivery estimate outside Texas',
    run: (m) => m.estimateDelivery('10001'),
    expect: 'Invalid time value',
  },
];

function loadModuleFromSource(source, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mavs-bugcheck-'));
  const file = path.join(dir, label);
  fs.writeFileSync(file, source);
  try {
    return require(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function stillCrashes(bug, mod) {
  try {
    bug.run(mod);
    return false;
  } catch (e) {
    return e instanceof Error && e.message === bug.expect;
  }
}

function git(cmd) {
  return execSync(`git ${cmd}`, { cwd: config.repoRoot, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
}

function checkBugs() {
  let ok = true;

  console.log('\nWorking tree:');
  for (const bug of BUGS) {
    const mod = require(path.join(config.repoRoot, SERVICES, bug.file));
    const crashes = stillCrashes(bug, mod);
    ok = ok && crashes;
    console.log(`  ${crashes ? 'OK  ' : 'FIXED'} ${bug.name}`);
  }

  console.log('\norigin/main:');
  try {
    git('fetch origin main --quiet');
  } catch (e) {
    console.log('  (could not fetch origin; checking the last fetched origin/main)');
  }
  for (const bug of BUGS) {
    try {
      const source = git(`show origin/main:${SERVICES}/${bug.file}`);
      const crashes = stillCrashes(bug, loadModuleFromSource(source, bug.file));
      ok = ok && crashes;
      console.log(`  ${crashes ? 'OK  ' : 'FIXED'} ${bug.name}`);
    } catch (e) {
      console.log(`  ??   ${bug.name} (origin/main:${SERVICES}/${bug.file} not found; push the app first)`);
    }
  }

  if (!ok) {
    console.log('\nA bug is fixed. Revert the fix on main (don\'t merge fix PRs before the pitch).');
  }
  return ok;
}

function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => (rl.close(), resolve(/^y(es)?$/i.test(a.trim())))));
}

async function resetDatabase() {
  if (!config.mongoUri) {
    console.log('CRASH_REPORT_MONGODB_URI is not set (.env), skipping the database reset.');
    return;
  }
  const { collections, close } = require('../src/capture/db');
  try {
    const { incidents } = await collections();
    const count = await incidents.countDocuments();

    if (!flag('--yes')) {
      const go = await confirm(`Delete all ${count} incidents in ${config.dbName}.${config.incidentsCollection}? [y/N] `);
      if (!go) {
        console.log('Database left as is.');
        return;
      }
    }
    await incidents.deleteMany({});
    console.log(`Deleted ${count} incidents.`);
  } finally {
    await close();
  }
}

(async () => {
  if (!flag('--check-only')) await resetDatabase();
  const ok = checkBugs();
  process.exit(ok ? 0 : 1);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
