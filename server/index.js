const path = require('path');
const express = require('express');
require('express-async-errors'); // lets async route errors reach the crash catcher (Express 4)
const apiRoutes = require('./src/routes/api');
const { crashCatcher, installProcessHandlers, logCaptureStatus } = require('./src/middleware/crashCatcher');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json({ limit: '100kb' }));

// Tiny request logger so crashes are easy to spot in the console.
app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
  });
  next();
});

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/api', apiRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

app.use('/sdk', express.static(path.join(PUBLIC_DIR, 'sdk')));
// No long-lived caching: browsers revalidate (cheap 304s), so pulling a new branch or a fix
// never leaves a page running an old script next to new HTML.
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets')));
app.get('/', (req, res) => res.redirect('/shop'));
for (const page of ['shop', 'cart', 'checkout']) {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(PUBLIC_DIR, `${page}.html`)));
}

// Must stay last: turns uncaught 500s into incidents.
app.use(crashCatcher);
installProcessHandlers();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mavs Merch Store listening on http://localhost:${PORT}`);
  logCaptureStatus();
});
