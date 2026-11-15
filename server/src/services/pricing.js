// Promo codes and the subtotal used when a promo is applied.

const PROMOS = {
  MAVS10: { type: 'percent', value: 10, label: '10% off your order' },
  MAVS20: { type: 'percent', value: 20, label: '20% off gameday gear' },
  BLUEORANGE: { type: 'percent', value: 20, label: '20% off your order' },
  GOMAVS: { type: 'flat', value: 15, minSubtotal: 75, label: '$15 off orders over $75' },
};

function round2(n) {
  return Math.round(n * 100) / 100;
}

function subtotal(items) {
  return items.map((item) => item.price * item.qty).reduce((a, b) => a + b, 0);
}

function discountFor(promo, amount) {
  if (promo.minSubtotal && amount < promo.minSubtotal) return 0;
  if (promo.type === 'percent') return round2((amount * promo.value) / 100);
  return Math.min(promo.value, amount);
}

function applyPromo(items, rawCode) {
  const amount = subtotal(items);
  const code = String(rawCode || '').trim().toUpperCase();
  const promo = PROMOS[code];

  if (!promo) {
    return { ok: false, reason: `"${rawCode || ''}" isn't a valid promo code.` };
  }
  if (promo.minSubtotal && amount < promo.minSubtotal) {
    return { ok: false, reason: `${code} needs a subtotal of at least $${promo.minSubtotal}.` };
  }
  return { ok: true, code, label: promo.label, discount: discountFor(promo, amount) };
}

module.exports = { PROMOS, round2, discountFor, applyPromo };
