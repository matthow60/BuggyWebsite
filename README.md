# Mavs Merch Store (buggy demo target)

A small UTA Mavs merch store built with Node and Express plus plain HTML/JS. It has **three deliberate server crashes**, used for the HackUTA auto-patcher demo.

## Run

```bash
npm --prefix server ci        # or: cd server && npm i
node server/index.js          # from the repo root; listens on $PORT (default 3000)
```

It needs no database or API keys. All state (products, carts, orders) is kept in memory, and carts are keyed by the `x-session-id` request header. A new session ID always starts with an empty cart.

Pages: `/shop`, `/cart`, `/checkout`. Health check: `GET /health`.

## The bugs

Each bug lives in its own file under `server/src/services/`, and each fix is 1–3 lines.

| # | Endpoint | File | Exception |
|---|----------|------|-----------|
| 1 | `POST /api/cart/promo` | `pricing.js` | `TypeError: Reduce of empty array with no initial value` |
| 2 | `POST /api/checkout/split` | `split.js` | `TypeError: Cannot read properties of undefined (reading 'map')` |
| 3 | `POST /api/cart/add` | `inventory.js` | `TypeError: Cannot read properties of undefined (reading 'stock')` |

### Reproduce from the request alone

```bash
# 1. Promo on an empty cart (any new session id is empty)
curl -X POST localhost:3000/api/cart/promo -H "content-type: application/json" \
  -H "x-session-id: repro-1" -d '{"code":"MAVS10"}'

# 2. Split with the friends field left blank (payers omitted)
curl -X POST localhost:3000/api/checkout/split -H "content-type: application/json" \
  -H "x-session-id: repro-2" -d '{}'

# 3. Add a size the product doesn't carry (or send no size at all)
curl -X POST localhost:3000/api/cart/add -H "content-type: application/json" \
  -H "x-session-id: repro-3" -d '{"productId":"classic-tee","size":"XXL"}'
```

### Reproduce in the UI

1. **Cart page** with an empty cart: type `MAVS10` and click **Apply**.
2. **Checkout page**: leave "Friends splitting with you" blank and click **Calculate split**.
3. **Shop page**: on *Mavs Classic Tee*, pick **XXL** (or no size) and click **Add to cart**.

A 500 shows up as a red toast containing the exception, and the full stack is printed in the server console.

Promo codes: `MAVS10` (10% off), `BLUEORANGE` (20% off), `GOMAVS` ($15 off orders of $75 or more).
