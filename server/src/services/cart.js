// Totals shown on the cart and checkout pages.
const { PROMOS, round2, discountFor } = require('./pricing');

const TAX_RATE = 0.0825; // Arlington, TX
const FREE_SHIPPING_AT = 50;
const SHIPPING_FEE = 5.99;

function summarize(cart) {
  const subtotal = round2(cart.items.reduce((sum, item) => sum + item.price * item.qty, 0));
  const promo = cart.promo ? PROMOS[cart.promo] : null;
  const discount = promo ? discountFor(promo, subtotal) : 0;
  const afterDiscount = round2(subtotal - discount);
  const shipping = subtotal === 0 || afterDiscount >= FREE_SHIPPING_AT ? 0 : SHIPPING_FEE;
  const tax = round2(afterDiscount * TAX_RATE);
  const total = round2(afterDiscount + shipping + tax);
  const count = cart.items.reduce((n, item) => n + item.qty, 0);

  return {
    items: cart.items,
    count,
    promo: promo ? { code: cart.promo, label: promo.label } : null,
    subtotal,
    discount,
    shipping,
    tax,
    total,
  };
}

module.exports = { summarize };
