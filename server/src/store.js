// In-memory data. Nothing external is needed to boot the app.

const PRODUCTS = [
  {
    id: 'classic-tee',
    name: 'Mavs Classic Tee',
    category: 'apparel',
    art: 'tee',
    color: '#0064B1',
    price: 24.0,
    badge: 'Best seller',
    sizes: [
      { label: 'S', stock: 18 },
      { label: 'M', stock: 25 },
      { label: 'L', stock: 20 },
      { label: 'XL', stock: 9 },
      // No XXL in this run.
    ],
  },
  {
    id: 'blaze-hoodie',
    name: 'Blaze Orange Hoodie',
    category: 'apparel',
    art: 'hoodie',
    color: '#F58025',
    price: 54.0,
    badge: 'New',
    sizes: [
      { label: 'S', stock: 6 },
      { label: 'M', stock: 11 },
      { label: 'L', stock: 0 },
      { label: 'XL', stock: 4 },
      { label: 'XXL', stock: 2 },
    ],
  },
  {
    id: 'blue-crewneck',
    name: 'Blue Pride Crewneck',
    category: 'apparel',
    art: 'crew',
    color: '#003A70',
    price: 46.0,
    sizes: [
      { label: 'M', stock: 7 },
      { label: 'L', stock: 12 },
      { label: 'XL', stock: 0 },
      { label: 'XXL', stock: 3 },
    ],
  },
  {
    id: 'gameday-jersey',
    name: 'Gameday Jersey',
    category: 'apparel',
    art: 'jersey',
    color: '#F58025',
    price: 68.0,
    badge: 'Limited',
    sizes: [
      { label: 'S', stock: 3 },
      { label: 'M', stock: 0 },
      { label: 'L', stock: 5 },
      { label: 'XL', stock: 5 },
    ],
  },
  {
    id: 'snapback-cap',
    name: 'Maverick Snapback',
    category: 'accessories',
    art: 'cap',
    color: '#0064B1',
    price: 28.0,
    sizes: [{ label: 'One Size', stock: 30 }],
  },
  {
    id: 'knit-beanie',
    name: 'Arlington Knit Beanie',
    category: 'accessories',
    art: 'beanie',
    color: '#F58025',
    price: 22.0,
    sizes: [{ label: 'One Size', stock: 14 }],
  },
  {
    id: 'camp-mug',
    name: 'Mavs Camp Mug',
    category: 'home',
    art: 'mug',
    color: '#0064B1',
    price: 16.0,
    sizes: [{ label: 'One Size', stock: 40 }],
  },
  {
    id: 'felt-pennant',
    name: 'Felt Pennant',
    category: 'home',
    art: 'pennant',
    color: '#F58025',
    price: 14.0,
    sizes: [{ label: 'One Size', stock: 22 }],
  },
];

// carts: sessionId -> { items: [{ productId, name, art, color, size, price, qty }], promo: string|null }
const carts = new Map();
const orders = new Map();

function getSessionId(req) {
  return String(req.get('x-session-id') || 'guest');
}

function getCart(sessionId) {
  if (!carts.has(sessionId)) {
    carts.set(sessionId, { items: [], promo: null });
  }
  return carts.get(sessionId);
}

function findProduct(productId) {
  return PRODUCTS.find((p) => p.id === productId);
}

module.exports = { PRODUCTS, carts, orders, getSessionId, getCart, findProduct };
