const express = require('express');
const { PRODUCTS, orders, getSessionId, getCart, findProduct } = require('../store');
const { summarize } = require('../services/cart');
const { applyPromo } = require('../services/pricing');
const { splitPayment } = require('../services/split');
const { checkStock } = require('../services/inventory');
const { normalizeEmail } = require('../services/contact');
const { estimateDelivery } = require('../services/shipping');

const router = express.Router();

router.get('/products', (req, res) => {
  res.json({ products: PRODUCTS });
});

router.get('/cart', (req, res) => {
  const cart = getCart(getSessionId(req));
  res.json(summarize(cart));
});

// Bug 3 lives in services/inventory.js
router.post('/cart/add', (req, res) => {
  const cart = getCart(getSessionId(req));
  const { productId, size } = req.body || {};
  const qty = Number(req.body && req.body.qty) || 1;

  const product = findProduct(productId);
  if (!product) {
    return res.status(404).json({ error: `No product with id "${productId}".` });
  }

  const existing = cart.items.find((i) => i.productId === productId && i.size === size);
  const wanted = (existing ? existing.qty : 0) + qty;

  const stock = checkStock(product, size, wanted);
  if (!stock.ok) {
    return res.status(409).json({ error: stock.reason });
  }

  if (existing) {
    existing.qty = wanted;
  } else {
    cart.items.push({
      productId,
      name: product.name,
      art: product.art,
      color: product.color,
      size,
      price: product.price,
      qty,
    });
  }
  res.json(summarize(cart));
});

router.post('/cart/update', (req, res) => {
  const cart = getCart(getSessionId(req));
  const { productId, size } = req.body || {};
  const qty = Math.max(0, Number(req.body && req.body.qty) || 0);

  const item = cart.items.find((i) => i.productId === productId && i.size === size);
  if (!item) {
    return res.status(404).json({ error: 'That item is not in your cart.' });
  }

  if (qty === 0) {
    cart.items = cart.items.filter((i) => i !== item);
  } else {
    const stock = checkStock(findProduct(productId), size, qty);
    if (!stock.ok) return res.status(409).json({ error: stock.reason });
    item.qty = qty;
  }
  res.json(summarize(cart));
});

// Bug 1 lives in services/pricing.js
router.post('/cart/promo', (req, res) => {
  const cart = getCart(getSessionId(req));
  const result = applyPromo(cart.items, req.body && req.body.code);
  if (!result.ok) {
    return res.status(400).json({ error: result.reason });
  }
  cart.promo = result.code;
  res.json({ ...summarize(cart), message: `${result.code} applied: ${result.label}` });
});

router.delete('/cart/promo', (req, res) => {
  const cart = getCart(getSessionId(req));
  cart.promo = null;
  res.json(summarize(cart));
});

// Bug 5 lives in services/shipping.js
router.post('/cart/shipping', (req, res) => {
  const zip = String((req.body && req.body.zip) || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Enter a 5-digit ZIP code.' });
  }
  res.json(estimateDelivery(zip));
});

// Bug 2 lives in services/split.js
router.post('/checkout/split', (req, res) => {
  const cart = getCart(getSessionId(req));
  const { total } = summarize(cart);
  const split = splitPayment(total, req.body && req.body.payers);
  res.json({ total, ...split });
});

// Bug 4 lives in services/contact.js
router.post('/checkout/place', (req, res) => {
  const sessionId = getSessionId(req);
  const cart = getCart(sessionId);
  const summary = summarize(cart);
  const { name, payers } = req.body || {};
  const email = normalizeEmail(req.body && req.body.email);

  if (summary.items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }

  const orderId = `MAV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
  const order = {
    orderId,
    name: name || 'Maverick',
    email: email || null,
    ...summary,
    split: Array.isArray(payers) && payers.length ? splitPayment(summary.total, payers) : null,
    placedAt: new Date().toISOString(),
  };
  orders.set(orderId, order);

  cart.items = [];
  cart.promo = null;
  res.json(order);
});

module.exports = router;
