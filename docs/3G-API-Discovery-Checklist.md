# 3G API Discovery Checklist

Running notes on the 3G TMS endpoints used by the DLX consolidation POC.
**Sandbox only** (`https://shipdlx-sb.3gtms.com`). **Read-only.**

## Auth

- [x] Session/cookie based (no separate API key/token).
- [x] Obtain session by driving the login form with Playwright, then reuse the
      cookies in a `requests.Session` (see `skills/3g-tms-browser/tms_client.py`).
- [ ] Confirm the live `/web/login` field selectors (`username` / `password` /
      submit). Defaults in `tms_client.py` are best-guess and overridable.
- [x] User role carries `Standard API: All APIs` — read access not blocked.

## `POST /web/loadList/tab0` — Loads (CONFIRMED)

- [x] Returns full Load records (~588 fields).
- [x] Params:
      `filterscount=0&groupscount=0&pagenum={n}&pagesize={n}&recordstartindex={a}&recordendindex={b}&savedQueryId={id}`
- [x] Rows scoped by a saved query (`savedQueryId`).
- [x] Wireframe uses: `loadNum`, `status`, `ordCount`, `wtUtilizationPercent`,
      `volUtilizationPercent`, origin/dest city+state, `carrierName`.
- Reference: `3G-Load-Object-Field-Reference.md`.

## `POST /web/orderList` — Orders (SHAPE NOT YET CAPTURED)

- [x] Endpoint exists (confirmed via network capture).
- [ ] **Capture request param shape** — run `capture_orderlist.py` on a host that
      can reach the sandbox. Open question: does orderList use `savedQueryId`
      like loadList, or a different filter envelope?
- [ ] **Capture response shape** — record the row wrapper key (`Rows`? `records`?)
      and the field names of one representative Order.
- [ ] Fill in `3G-Order-Object-Field-Reference.md` from the capture.
- [ ] Reconcile `list_orders()` in `tms_client.py` with the real params.
- **Working hypothesis** (in code now): same jqGrid envelope as loadList,
  `savedQueryId` optional. Marked provisional until confirmed.

### What the actual `/web/orderList` request/response turned out to be

> _To be filled after the live capture._ Record here: exact POST body, response
> row-wrapper key, total-count field, and any params that differ from loadList.

## Read-only guarantee

- [x] Client allow-lists only `/web/loadList/tab0` and `/web/orderList`.
- [x] Any path/param containing a write verb (`save`, `create`, `plan`,
      `assign`, `delete`, `cancel`, `send`, `add`, ...) raises `ReadOnlyViolation`
      before a request is sent (`assert_read_only`).
- [x] List helpers refuse to run against the production host.
- [ ] Confirm the live-run network log contains **zero** write/action calls
      (re-check after the first live capture).

## Environment note

The scaffolding in this repo was built in an environment whose egress policy
**blocks `shipdlx-sb.3gtms.com`** (proxy returns HTTP 403 on CONNECT). All
live-capture / live-render steps above are therefore deferred to a run with
sandbox network access and configured credentials. Everything runs today against
local fixtures (`USE_FIXTURES=1`) to prove the render path end-to-end.
