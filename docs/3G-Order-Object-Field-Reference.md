# 3G Order Object — Field Reference

**Status: PROVISIONAL — not yet captured from live sandbox traffic.**

This document mirrors the format of `3G-Load-Object-Field-Reference.md` (field
name · sample value · note on relevance to consolidation / tracking / risk).
Unlike the Load reference — which was captured from a confirmed
`POST /web/loadList/tab0` response — the Order shape below is a **hypothesis**
based on 3G conventions and the wireframe's needs. It **must be reconciled with
a real capture** before it is trusted.

> Why this isn't filled in from live data yet: capturing it requires reaching
> `shipdlx-sb.3gtms.com` with valid sandbox credentials. The environment this
> POC was scaffolded in blocks egress to that host (network policy 403), so the
> live capture step is deferred to a run that has sandbox access. Use
> `skills/3g-tms-browser/capture_orderlist.py` to perform it.

## How to complete this doc (read-only)

1. Configure encrypted sandbox credentials
   (`skills/3g-tms-browser/encrypt_credentials.py`).
2. Run `python skills/3g-tms-browser/capture_orderlist.py --headed`.
   It opens the Orders grid and records 3G's own `POST /web/orderList` XHR —
   no write action is ever issued.
3. Copy the real request `post_data` into the "Request shape" table below and
   into `list_orders()` in `tms_client.py`.
4. For each field in one representative Order record, fill the table: name,
   sample value, and whether it matters for **consolidation** (grouping orders
   onto loads), **tracking** (status/location), or **risk** (weather/traffic).

## Request shape (to confirm)

`POST /web/orderList`

| Param | Hypothesized value | Confirmed? |
|-------|--------------------|-----------|
| `filterscount` | `0` | ☐ |
| `groupscount` | `0` | ☐ |
| `pagenum` | `1` | ☐ |
| `pagesize` | `50` | ☐ |
| `recordstartindex` | `0` | ☐ |
| `recordendindex` | `50` | ☐ |
| `savedQueryId` | *(unknown — orderList may or may not use one)* | ☐ |

## Field table (provisional — placeholders match `backend/fixtures/orders.json`)

| Field | Sample value | Relevance |
|-------|--------------|-----------|
| `orderNum` | `O-550231` | **Tracking** — primary identifier |
| `status` | `Available` | **Consolidation / Tracking** — is it plannable? |
| `customerName` | `Acme Manufacturing` | Display / grouping |
| `originCity` / `originState` | `Kansas City` / `MO` | **Consolidation / Risk** — lane origin |
| `destCity` / `destState` | `Dallas` / `TX` | **Consolidation / Risk** — lane dest |
| `totalWeight` / `weightUom` | `12400` / `LB` | **Consolidation** — capacity math |
| `totalVolume` / `volumeUom` | `640` / `CUFT` | **Consolidation** — cube math |
| `pieceCount` | `18` | **Consolidation** — handling units |
| `requestedShipDate` | `2026-07-06` | **Consolidation / Risk** — timing window |
| `requestedDeliveryDate` | `2026-07-08` | **Consolidation / Risk** — timing window |
| `loadNum` | `` (empty = unassigned) | **Consolidation** — already on a load? |

> Replace every row above with the real field names/values from the capture.
> 3G list responses are typically wide (the Load object has ~588 fields); expect
> the Order object to be similarly wide and keep only the fields that matter for
> consolidation, tracking, and risk in the wireframe.
