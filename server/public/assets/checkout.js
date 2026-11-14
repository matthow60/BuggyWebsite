Mavs.renderHeader('checkout');

// Blank field -> payers is undefined (dropped from the JSON body). That's bug 2.
function readPayers() {
  const raw = document.getElementById('payers').value.trim();
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
}

function renderSummary(cart) {
  Mavs.setCount(cart.count);
  const lines = cart.items
    .map((i) => `<div class="summary-row"><span>${Mavs.escapeHtml(i.name)} · ${Mavs.escapeHtml(i.size)} × ${i.qty}</span><strong>${Mavs.money(i.price * i.qty)}</strong></div>`)
    .join('');
  document.getElementById('summary').innerHTML = `
    ${lines || '<p class="hint" style="color:var(--muted);margin:0 0 8px">Your cart is empty. <a href="/shop">Go shopping</a>.</p>'}
    <div class="divider" style="margin:10px 0"></div>
    <div class="summary-row"><span>Subtotal</span><strong>${Mavs.money(cart.subtotal)}</strong></div>
    ${cart.discount ? `<div class="summary-row discount"><span>Discount (${Mavs.escapeHtml(cart.promo.code)})</span><strong>−${Mavs.money(cart.discount)}</strong></div>` : ''}
    <div class="summary-row"><span>Shipping</span><strong>${cart.shipping ? Mavs.money(cart.shipping) : 'Free'}</strong></div>
    <div class="summary-row"><span>Tax</span><strong>${Mavs.money(cart.tax)}</strong></div>
    <div class="summary-row total"><span>Total</span><strong>${Mavs.money(cart.total)}</strong></div>`;
}

function renderSplit(split) {
  document.getElementById('split-result').innerHTML = split.shares
    .map((s) => `<div class="split-row"><span>${Mavs.escapeHtml(s.name)}</span><strong>${Mavs.money(s.amount)}</strong></div>`)
    .join('');
}

async function load() {
  try {
    renderSummary(await Mavs.api('/cart'));
  } catch (err) {
    Mavs.showError(err);
  }
}

document.getElementById('split-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const split = await Mavs.api('/checkout/split', { method: 'POST', body: { payers: readPayers() } });
    renderSplit(split);
  } catch (err) {
    Mavs.showError(err);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('place-btn').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const order = await Mavs.api('/checkout/place', {
      method: 'POST',
      body: {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        payers: readPayers(),
      },
    });
    Mavs.setCount(0);
    const split = order.split
      ? `<div class="split-result" style="max-width:320px;margin:16px auto 0">${order.split.shares
          .map((s) => `<div class="split-row"><span>${Mavs.escapeHtml(s.name)}</span><strong>${Mavs.money(s.amount)}</strong></div>`)
          .join('')}</div>`
      : '';
    document.getElementById('main').innerHTML = `
      <div class="panel confirmation">
        <div class="check">✓</div>
        <h1>Order placed!</h1>
        <p class="subtitle">Thanks, ${Mavs.escapeHtml(order.name)}. Order <strong>${Mavs.escapeHtml(order.orderId)}</strong> · ${Mavs.money(order.total)}</p>
        ${split}
        <a class="btn" href="/shop" style="display:inline-block;text-decoration:none;margin-top:20px">Keep shopping</a>
      </div>`;
  } catch (err) {
    Mavs.showError(err);
    btn.disabled = false;
  }
});

load();
