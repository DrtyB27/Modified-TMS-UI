# Frontend wireframe

Vite + React + Tailwind v4. Two columns — **Loads** and **Orders** — rendering
whatever the backend proxy returns. No drag-and-drop, no editing (out of scope).

## Run

```bash
npm install
npm run dev          # http://localhost:5173
```

Start the backend first (see `../backend/README.md`). Vite proxies `/api/*` to
`http://127.0.0.1:5001`, so the browser only ever talks same-origin — it never
calls 3G directly.

A badge in the header shows whether data is **LIVE SANDBOX** or **FIXTURES
(offline)**.

## Login screen

When the backend requires login (live mode, or `LOGIN_REQUIRED=1` in fixtures
for a demo), the app shows a sign-in screen first. Credentials are posted to the
proxy's `POST /api/login`, which opens the 3G sandbox session; the browser keeps
only an `httpOnly` session cookie (fetches use `credentials: 'include'`). A
**Sign out** button and the signed-in user show in the header. In fixtures mode
any username/password signs in and shows sample data.

## Live loads

Loads are scoped by a saved query. Pass one via the URL:

```
http://localhost:5173/?savedQueryId=<realSavedQueryId>
```

Ignored in fixtures mode.

## Fields shown

- **Loads:** Load Num, Status, order count (`ordCount`), weight/volume
  utilization (`wtUtilizationPercent` / `volUtilizationPercent`), origin →
  dest city/state, carrier.
- **Orders:** Order Num, Status, customer, origin → dest, weight, volume,
  pieces, requested ship date, assigned load. *(Order fields are provisional
  until the live `/web/orderList` capture — see
  `../docs/3G-Order-Object-Field-Reference.md`.)*
