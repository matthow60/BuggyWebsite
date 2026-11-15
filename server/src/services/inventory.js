// Checks that a product has enough stock in the requested size.

function checkStock(product, size, qty) {
  const variant = product?.sizes?.find((s) => s.label === size);

  if (!variant) {
    return { ok: false, reason: size ? `Size ${size} is not available.` : 'Please select a size.' };
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
