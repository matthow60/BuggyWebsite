// The size chart every apparel card shows. Sizes a product doesn't stock still render
// as clickable here, which is how bug 3 (POST /api/cart/add) gets triggered from the UI.
const APPAREL_SIZES = ['S', 'M', 'L', 'XL', 'XXL'];

Mavs.renderHeader('shop');

const selected = {}; // productId -> size

function sizeOptions(product) {
  if (product.category !== 'apparel') return product.sizes.map((s) => s.label);
  return APPAREL_SIZES;
}

function cardHtml(p) {
  const stockByLabel = Object.fromEntries(p.sizes.map((s) => [s.label, s.stock]));
  const options = sizeOptions(p);
  if (options.length === 1) selected[p.id] = options[0];

  const sizes = options
    .map((label) => {
      const soldOut = stockByLabel[label] === 0;
      const isSel = selected[p.id] === label;
      return `<button type="button" class="size${soldOut ? ' soldout' : ''}${isSel ? ' selected' : ''}" data-product="${p.id}" data-size="${label}" data-testid="size-${p.id}-${Mavs.slug(label)}" data-track="Select size ${label} · ${Mavs.escapeHtml(p.name)}">${label}</button>`;
    })
    .join('');

  return `
    <article class="card">
      <div class="card-art">
        ${p.badge ? `<span class="badge">${Mavs.escapeHtml(p.badge)}</span>` : ''}
        ${Mavs.art(p.art, p.color)}
      </div>
      <div class="card-body">
        <div class="card-title">
          <h3>${Mavs.escapeHtml(p.name)}</h3>
          <span class="price">${Mavs.money(p.price)}</span>
        </div>
        <div>
          <div class="size-label">Size</div>
          <div class="sizes">${sizes}</div>
        </div>
        <button type="button" class="btn block" data-add="${p.id}" data-testid="add-${p.id}" data-track="Add ${Mavs.escapeHtml(p.name)} to cart">Add to cart</button>
      </div>
    </article>`;
}

async function load() {
  const grid = document.getElementById('grid');
  try {
    const { products } = await Mavs.api('/products');
    grid.innerHTML = products.map(cardHtml).join('');
  } catch (err) {
    grid.innerHTML = '<p class="empty">Could not load products.</p>';
    Mavs.showError(err);
  }
}

document.addEventListener('click', async (e) => {
  const sizeBtn = e.target.closest('.size');
  if (sizeBtn) {
    const id = sizeBtn.dataset.product;
    selected[id] = sizeBtn.dataset.size;
    document.querySelectorAll(`.size[data-product="${id}"]`).forEach((b) => {
      b.classList.toggle('selected', b === sizeBtn);
    });
    return;
  }

  const addBtn = e.target.closest('[data-add]');
  if (addBtn) {
    const productId = addBtn.dataset.add;
    addBtn.disabled = true;
    try {
      const cart = await Mavs.api('/cart/add', {
        method: 'POST',
        body: { productId, size: selected[productId], qty: 1 },
      });
      Mavs.setCount(cart.count);
      const item = cart.items.find((i) => i.productId === productId && i.size === selected[productId]);
      Mavs.toast(`${Mavs.escapeHtml(item ? item.name : 'Item')} (${Mavs.escapeHtml(selected[productId])}) added to cart.`, 'success');
    } catch (err) {
      Mavs.showError(err);
    } finally {
      addBtn.disabled = false;
    }
  }
});

load();
