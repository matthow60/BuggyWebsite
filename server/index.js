const path = require('path');
const express = require('express');
const apiRoutes = require('./src/routes/api');

const app = express();
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(express.json());

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

app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '1h' }));
app.get('/', (req, res) => res.redirect('/shop'));
for (const page of ['shop', 'cart', 'checkout']) {
  app.get(`/${page}`, (req, res) => res.sendFile(path.join(PUBLIC_DIR, `${page}.html`)));
}

// Any uncaught exception in a route ends up here and becomes a JSON 500.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error(`\n[500] ${req.method} ${req.originalUrl}`);
    console.error(err.stack);
  }
  res.status(status).json({
    error: err.message,
    name: err.name,
    stack: status >= 500 ? String(err.stack).split('\n').map((line) => line.trim()) : undefined,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Mavs Merch Store listening on http://localhost:${PORT}`);
});
