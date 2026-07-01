---
name: 3g-tms-browser
description: >
  Read-only, sandbox-first client for 3G TMS (shipdlx-sb.3gtms.com). Logs in
  with Playwright, lifts the session cookies into a requests session, and calls
  the list endpoints (loadList, orderList). Use for pulling Order/Load data for
  the DLX consolidation wireframe POC. Credentials are Fernet-encrypted and live
  outside the repo. Strictly read-only: write/action endpoints are blocked in code.
---

# 3g-tms-browser (sandbox POC extension)

Hybrid **Playwright + requests** client for 3G TMS. Playwright handles the
session-cookie login; `requests` handles the fast JSON list calls.

## Hard rules (enforced in `tms_client.py`)

- **Sandbox by default** — `TmsClient(sandbox=True)` targets
  `https://shipdlx-sb.3gtms.com`. The list helpers refuse to run against
  production even if `sandbox=False` is set.
- **Read-only** — `assert_read_only()` fails closed. Only `/web/loadList/tab0`
  and `/web/orderList` are allow-listed; any path/param containing a write verb
  (`save`, `create`, `plan`, `assign`, `delete`, `cancel`, `send`, `add`, ...)
  raises `ReadOnlyViolation` before any request is sent.
- **No plaintext credentials** — see `credentials.py` (Fernet, chmod 600,
  outside the repo).

## Files

| File | Purpose |
|------|---------|
| `tms_client.py` | `TmsClient` — login, `list_loads`, `list_orders`, read-only guard |
| `credentials.py` | Fernet encrypt/decrypt; key via `TMS_FERNET_KEY` or key file |
| `encrypt_credentials.py` | one-time setup of the encrypted cred blob |
| `capture_orderlist.py` | live network capture to document `/web/orderList` |
| `requirements.txt` | requests, cryptography, playwright |

## Setup

```bash
pip install -r requirements.txt
playwright install chromium
python encrypt_credentials.py          # writes creds outside the repo, chmod 600
```

## Usage

```python
from credentials import load_credentials
from tms_client import TmsClient

creds = load_credentials()
client = TmsClient(sandbox=True)
client.login(creds["username"], creds["password"])

loads  = client.list_loads(saved_query_id="<savedQueryId>", pagenum=1, pagesize=50)
orders = client.list_orders(pagenum=1, pagesize=50)
```

## Endpoints

- **`POST /web/loadList/tab0`** — confirmed. Params:
  `filterscount=0&groupscount=0&pagenum&pagesize&recordstartindex&recordendindex&savedQueryId`.
  Returns full Load records (~588 fields).
- **`POST /web/orderList`** — exists, param shape **not yet captured**.
  `list_orders()` currently sends the same jqGrid envelope as loadList as the
  working hypothesis. Run `capture_orderlist.py` against the live sandbox to
  confirm, then update `list_orders()` and the docs.

## Verify login (needed once, live)

The login-form selectors in `tms_client.py` (`username_selector`,
`password_selector`, `submit_selector`) are best-guess defaults. On first live
run, open `/web/login` in `--headed` mode and confirm the real field names;
override via the `TmsClient(...)` kwargs if they differ. This could not be done
in the build sandbox because egress to `shipdlx-sb.3gtms.com` is blocked there.
