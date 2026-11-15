// Checks that a product has enough stock in the requested size.

function checkStock(product, size, qty) {
  if (!product || !product.sizes) {
    return { ok: false, reason: 'Product or sizes not found.' };
  }

  const variant = product.sizes.find((s) => s.label === size || s.size === size);

  if (!variant) {
    return { ok: false, reason: `${product.name} is not available in ${size}.` };
  }

  if (variant.stock === 0) {
    return { ok: false, reason: `${product.name} is sold out in ${size}.` };
  }
  if (variant.stock < qty) {
    return { ok: false, reason: `Only ${variant.stock} left of ${product.name} in ${size}.` };
  }
  return { ok: true, remaining: variant.stock - qty };
}

module.exports = { checkStock };
