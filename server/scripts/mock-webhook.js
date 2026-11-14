#!/usr/bin/env node
// Stand-in for Member 2's webhook receiver, for testing capture on your own.
//   npm --prefix server run mock-webhook              listens on http://localhost:4000/webhook
//   npm --prefix server run mock-webhook -- --fail    always answers 500 (to test retries)
// Set WEBHOOK_URL=http://localhost:4000/webhook in server/.env.

const http = require('http');

const PORT = Number(process.env.MOCK_WEBHOOK_PORT || 4000);
const FAIL = process.argv.includes('--fail');

http
  .createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      try {
        const { incidentId, incident } = JSON.parse(raw);
        console.log(`\n[webhook] ${req.method} ${req.url}  ${incidentId}${FAIL ? '  (answering 500)' : ''}`);
        console.log(`  secret:   ${req.headers['x-webhook-secret'] ? 'present' : 'none'}`);
        console.log(`  error:    ${incident.error.name}: ${incident.error.message}`);
        console.log(`  topFrame: ${incident.topFrame ? `${incident.topFrame.file}:${incident.topFrame.line}` : 'none'}`);
        console.log(`  request:  ${incident.request.method} ${incident.request.path} ${JSON.stringify(incident.request.body)}`);
        console.log(`  actions:  ${incident.actions.length}`);
        incident.actions.forEach((a, i) => console.log(`    ${String(i + 1).padStart(2)}. ${a.type.padEnd(8)} ${a.label}${a.value ? ` = "${a.value}"` : ''}`));
      } catch (e) {
        console.log('[webhook] could not parse body:', e.message);
      }
      res.writeHead(FAIL ? 500 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: !FAIL }));
    });
  })
  .listen(PORT, () => console.log(`Mock webhook receiver on http://localhost:${PORT}/webhook${FAIL ? ' (failing mode)' : ''}`));
