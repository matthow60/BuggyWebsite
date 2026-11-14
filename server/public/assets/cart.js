Mavs.renderHeader('cart');

const EMPTY_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h12L22 7H6.2"/></svg>';

function summaryHtml(cart) {
  return `
    <div class="summary-row"><span>Subtotal (${cart.count} item${cart.count === 1 ? '' : 's'})</span><strong>${Mavs.money(cart.subtotal)}</strong></div>
    ${cart.discount ? `<div class="summary-row discount"><span>Discount</span><strong>−${Mavs.money(cart.discount)}</strong></div>` : ''}
    <div class="summary-row"><span>Shipping</span><strong>${cart.shipping ? Mavs.money(cart.shipping) : 'Free'}</strong></div>
    <div class="summary-row"><span>Tax (8.25%)</span><strong>${Mavs.money(cart.tax)}</strong></div>
    <div class="summary-row total"><span>Total</span><strong>${Mavs.money(cart.total)}</strong></div>`;
}

function render(cart) {
  Mavs.setCount(cart.count);
  const items = document.getElementById('items');

  if (cart.items.length === 0) {
    items.innerHTML = `
      <div class="empty">
        ${EMPTY_ICON}
        <h2>Your cart is empty</h2>
        <p>Grab some blue &amp; orange before gameday.</p>
        <a class="btn" href="/shop">Browse merch</a>
      </div>`;
  } else {
    items.innerHTML = `<h2>Items</h2>` + cart.items
      .map((i) => `
        <div class="line-item">
          <div class="thumb">${Mavs.art(i.art, i.color)}</div>
          <div>
            <h3>${Mavs.escapeHtml(i.name)}</h3>
            <div class="meta">Size ${Mavs.escapeHtml(i.size)} · ${Mavs.money(i.price)} each</div>
            <div class="qty">
              <button type="button" data-qty="${i.qty - 1}" data-id="${i.productId}" data-size="${Mavs.escapeHtml(i.size)}" aria-label="Decrease">−</button>
              <span>${i.qty}</span>
              <button type="button" data-qty="${i.qty + 1}" data-id="${i.productId}" data-size="${Mavs.escapeHtml(i.size)}" aria-label="Increase">+</button>
            </div>
          </div>
          <div>
            <div class="line-total">${Mavs.money(i.price * i.qty)}</div>
            <button type="button" class="link-btn" data-qty="0" data-id="${i.productId}" data-size="${Mavs.escapeHtml(i.size)}">Remove</button>
          </div>
        </div>`)
      .join('');
  }

  document.getElementById('summary').innerHTML = summaryHtml(cart);
  document.getElementById('promo-applied').innerHTML = cart.promo
    ? `<div class="promo-applied"><span>✓ ${Mavs.escapeHtml(cart.promo.code)} · ${Mavs.escapeHtml(cart.promo.label)}</span><button type="button" class="link-btn" id="remove-promo">Remove</button></div>`
    : '';
}

async function load() {
  try {
    render(await Mavs.api('/cart'));
  } catch (err) {
    Mavs.showError(err);
  }
}

document.addEventListener('click', async (e) => {
  const qtyBtn = e.target.closest('[data-qty]');
  if (qtyBtn) {
    try {
      render(await Mavs.api('/cart/update', {
        method: 'POST',
        body: { productId: qtyBtn.dataset.id, size: qtyBtn.dataset.size, qty: Number(qtyBtn.dataset.qty) },
      }));
    } catch (err) {
      Mavs.showError(err);
    }
    return;
  }
  if (e.target.id === 'remove-promo') {
    try {
      render(await Mavs.api('/cart/promo', { method: 'DELETE' }));
    } catch (err) {
      Mavs.showError(err);
    }
  }
});

// Bug 1: applying a promo while the cart is empty crashes POST /api/cart/promo.
document.getElementById('promo-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('promo');
  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  try {
    const cart = await Mavs.api('/cart/promo', { method: 'POST', body: { code: input.value } });
    render(cart);
    input.value = '';
    Mavs.toast(Mavs.escapeHtml(cart.message), 'success');
  } catch (err) {
    Mavs.showError(err);
  } finally {
    btn.disabled = false;
  }
});

load();
