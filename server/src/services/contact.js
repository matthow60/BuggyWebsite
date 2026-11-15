// Cleans up the email address an order receipt is sent to.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  const clean = (email || '').trim().toLowerCase();
  return EMAIL_RE.test(clean) ? clean : null;
}

module.exports = { normalizeEmail };
