"""
3G TMS read-only client (sandbox-first).

Login pattern: Playwright drives the interactive login form to obtain a valid
session, then the resulting session cookies are handed to a `requests.Session`
so the fast JSON list endpoints can be called directly. This is the
"Playwright + requests hybrid" the 3g-tms-browser skill has always used for
contract/rate work -- here it is pointed at the SANDBOX host by default.

Hard rules enforced in code (see ReadOnlyViolation):
  * Only list/fetch style endpoints may be called. Any path or 3G action name
    containing a write-ish verb is rejected before a request is ever sent.
  * The default host is the sandbox. Production must be opted into explicitly
    AND is still blocked for the list helpers, so a stray flag can never make
    this module hammer live traffic.

Nothing in this file logs credentials or cookie values.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import requests

# --------------------------------------------------------------------------- #
# Hosts
# --------------------------------------------------------------------------- #
SANDBOX_HOST = "https://shipdlx-sb.3gtms.com"
PRODUCTION_HOST = "https://shipdlx.3gtms.com"

# --------------------------------------------------------------------------- #
# Read-only guard
# --------------------------------------------------------------------------- #
# Any 3G action/endpoint token containing one of these substrings is a write or
# side-effecting call and must never be issued by this proof-of-concept.
FORBIDDEN_TOKENS = (
    "save", "create", "plan", "unplan", "assign", "unassign",
    "delete", "remove", "cancel", "send", "update", "add",
    "commit", "post", "execute", "dispatch", "tender", "book",
)

# Explicit names called out in the task brief, kept for readable error messages.
FORBIDDEN_ACTIONS = (
    "orderPlan", "orderUnplan", "loadAddOrder", "loadRemoveOrder",
    "createLoad", "loadSave", "loadSendToEcosystem",
)

# The only endpoints this POC is allowed to reach.
ALLOWED_PATHS = (
    "/web/loadList/tab0",
    "/web/orderList",
)


class ReadOnlyViolation(RuntimeError):
    """Raised when something tries to call a non read-only 3G endpoint."""


def assert_read_only(path: str) -> None:
    """Fail closed unless `path` is an explicitly allow-listed read endpoint."""
    normalized = path.split("?", 1)[0].rstrip("/")
    lowered = normalized.lower()

    for token in FORBIDDEN_TOKENS:
        if token in lowered:
            raise ReadOnlyViolation(
                f"Refusing to call '{path}': contains write verb '{token}'. "
                "This POC is strictly read-only."
            )

    allowed = {p.rstrip("/") for p in ALLOWED_PATHS}
    if normalized not in allowed:
        raise ReadOnlyViolation(
            f"Refusing to call '{path}': not in the read-only allow-list "
            f"{sorted(allowed)}."
        )


# --------------------------------------------------------------------------- #
# Client
# --------------------------------------------------------------------------- #
@dataclass
class TmsClient:
    """Session-cookie client for the 3G list endpoints.

    Typical use:

        from credentials import load_credentials
        creds = load_credentials()                # decrypts Fernet blob
        client = TmsClient(sandbox=True)
        client.login(creds["username"], creds["password"])
        loads = client.list_loads(saved_query_id="123")
        orders = client.list_orders(page=1)
    """

    sandbox: bool = True
    headless: bool = True
    timeout: int = 60
    # Login-form selectors are overridable so the exact 3G markup can be pinned
    # once verified against the live login page (see SKILL.md -> "Verify login").
    username_selector: str = "input[name='username'], input#username, input[name='j_username']"
    password_selector: str = "input[name='password'], input#password, input[name='j_password']"
    submit_selector: str = "button[type='submit'], input[type='submit']"

    _session: requests.Session = field(default_factory=requests.Session, repr=False)
    _logged_in: bool = field(default=False, repr=False)

    # -- host handling ----------------------------------------------------- #
    @property
    def base_url(self) -> str:
        if self.sandbox:
            return SANDBOX_HOST
        # Production is intentionally awkward to reach: the list helpers below
        # still refuse to run against it. See list_loads / list_orders.
        return PRODUCTION_HOST

    def _guard_sandbox(self) -> None:
        if not self.sandbox:
            raise ReadOnlyViolation(
                "This proof-of-concept is sandbox-only. Refusing to issue list "
                f"calls against production ({PRODUCTION_HOST}). "
                "Set sandbox=True."
            )

    # -- authentication ---------------------------------------------------- #
    def login(self, username: str, password: str) -> None:
        """Drive the 3G login form with Playwright, then lift the session
        cookies into the requests session. Credentials are never logged."""
        try:
            from playwright.sync_api import sync_playwright
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "Playwright is required for login. Install with:\n"
                "  pip install playwright && playwright install chromium"
            ) from exc

        login_url = f"{self.base_url}/web/login"
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=self.headless)
            try:
                context = browser.new_context()
                page = context.new_page()
                page.goto(login_url, wait_until="domcontentloaded", timeout=self.timeout * 1000)

                # Anchor on the password field — every login form has exactly one.
                pw = page.locator("input[type='password']").first
                pw.wait_for(state="visible", timeout=self.timeout * 1000)

                # Username: try named guesses, then any visible non-password text
                # input. This is resilient to whatever the sandbox names its field.
                user_selectors = [
                    "input[name='username']", "input#username", "input[name='j_username']",
                    "input[name='userName']", "input[name='user']", "input[name='email']",
                    "input[name='login']", "input[type='email']",
                    "input[type='text']:visible", "input:not([type]):visible",
                ]
                user_field = None
                for sel in user_selectors:
                    loc = page.locator(sel).first
                    try:
                        if loc.count() > 0:
                            user_field = loc
                            break
                    except Exception:
                        continue
                if user_field is None:
                    raise RuntimeError("Could not locate a username field on the login form.")

                user_field.fill(username)
                pw.fill(password)

                # Submit: a submit control if present, else Enter in the password box.
                clicked = False
                for sel in [
                    "button[type='submit']", "input[type='submit']",
                    "button:has-text('Log In')", "button:has-text('Login')",
                    "button:has-text('Sign In')", "button:has-text('Sign in')",
                ]:
                    b = page.locator(sel).first
                    try:
                        if b.count() > 0:
                            b.click()
                            clicked = True
                            break
                    except Exception:
                        continue
                if not clicked:
                    pw.press("Enter")

                # A successful login navigates away from /web/login.
                try:
                    page.wait_for_url(lambda u: "/web/login" not in u, timeout=self.timeout * 1000)
                except Exception:
                    pass
                page.wait_for_load_state("networkidle", timeout=self.timeout * 1000)

                # Verify we actually left the login page (else creds/selectors failed).
                if "/web/login" in page.url:
                    raise RuntimeError(
                        "Still on the login page after submit — login was rejected "
                        "(check credentials, or the form structure differs)."
                    )

                cookies = context.cookies()
            finally:
                browser.close()

        host = re.sub(r"^https?://", "", self.base_url)
        for c in cookies:
            self._session.cookies.set(
                c["name"], c["value"],
                domain=c.get("domain", host),
                path=c.get("path", "/"),
            )
        self._session.headers.update({
            "X-Requested-With": "XMLHttpRequest",
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Origin": self.base_url,
            "Referer": f"{self.base_url}/web/",
        })
        self._logged_in = True

    def use_cookies(self, cookies: Dict[str, str]) -> None:
        """Alternative to login(): inject already-captured session cookies
        (useful for tests / when a session was exported elsewhere)."""
        host = re.sub(r"^https?://", "", self.base_url)
        for name, value in cookies.items():
            self._session.cookies.set(name, value, domain=host, path="/")
        self._logged_in = True

    # -- low-level POST ---------------------------------------------------- #
    def _post(self, path: str, data: Dict[str, Any]) -> Any:
        assert_read_only(path)
        self._guard_sandbox()
        if not self._logged_in:
            raise RuntimeError("Not authenticated. Call login() first.")

        resp = self._session.post(
            f"{self.base_url}{path}",
            data=data,
            timeout=self.timeout,
        )
        resp.raise_for_status()
        # 3G list endpoints return JSON; fall back to raw text if not.
        try:
            return resp.json()
        except ValueError:
            return {"_raw": resp.text}

    # -- read helpers ------------------------------------------------------ #
    def list_loads(
        self,
        saved_query_id: str,
        pagenum: int = 1,
        pagesize: int = 50,
    ) -> Any:
        """POST /web/loadList/tab0 -> parsed Load records.

        Mirrors the confirmed capture: filterscount/groupscount = 0, paging via
        recordstartindex/recordendindex, and the saved query that scopes rows.
        """
        recordstartindex = (pagenum - 1) * pagesize
        recordendindex = recordstartindex + pagesize
        data = {
            "filterscount": 0,
            "groupscount": 0,
            "pagenum": pagenum,
            "pagesize": pagesize,
            "recordstartindex": recordstartindex,
            "recordendindex": recordendindex,
            "savedQueryId": saved_query_id,
        }
        return self._post("/web/loadList/tab0", data)

    def list_orders(
        self,
        pagenum: int = 1,
        pagesize: int = 50,
        saved_query_id: Optional[str] = None,
        extra_params: Optional[Dict[str, Any]] = None,
    ) -> Any:
        """POST /web/orderList -> parsed Order records.

        NOTE: the exact param shape for orderList has not yet been captured from
        live traffic. This sends the same jqGrid-style envelope that loadList
        uses, which is the documented starting hypothesis. When capturing live
        (see docs/3G-API-Discovery-Checklist.md), record the real field names
        and fold any differences back here and into the discovery checklist.
        """
        recordstartindex = (pagenum - 1) * pagesize
        recordendindex = recordstartindex + pagesize
        data: Dict[str, Any] = {
            "filterscount": 0,
            "groupscount": 0,
            "pagenum": pagenum,
            "pagesize": pagesize,
            "recordstartindex": recordstartindex,
            "recordendindex": recordendindex,
        }
        if saved_query_id is not None:
            data["savedQueryId"] = saved_query_id
        if extra_params:
            # Guard against a write-ish param sneaking in via extra_params.
            for k in extra_params:
                if any(tok in k.lower() for tok in FORBIDDEN_TOKENS):
                    raise ReadOnlyViolation(
                        f"Refusing extra param '{k}' (write verb)."
                    )
            data.update(extra_params)
        return self._post("/web/orderList", data)
