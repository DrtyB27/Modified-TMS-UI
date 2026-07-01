"""
Fernet-encrypted credential handling for the 3g-tms-browser skill.

Design goals (unchanged from the existing skill pattern):
  * Credentials NEVER live in the repo or in plaintext on disk.
  * The encrypted blob and the key live OUTSIDE the repo, chmod 600.
  * Nothing here logs a secret.

Layout (defaults, all overridable via env):
  ~/.config/3g-tms/credentials.enc   Fernet ciphertext (chmod 600)
  ~/.config/3g-tms/fernet.key        Fernet key         (chmod 600)

Or provide the key inline via the TMS_FERNET_KEY env var (preferred for CI /
Cloudflare Worker secrets, where the key is injected, not stored on disk).

Create the encrypted blob once with:  python encrypt_credentials.py
"""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Dict

from cryptography.fernet import Fernet

CONFIG_DIR = Path(os.environ.get("TMS_CONFIG_DIR", Path.home() / ".config" / "3g-tms"))
CRED_PATH = Path(os.environ.get("TMS_CRED_PATH", CONFIG_DIR / "credentials.enc"))
KEY_PATH = Path(os.environ.get("TMS_KEY_PATH", CONFIG_DIR / "fernet.key"))


def _load_key() -> bytes:
    env_key = os.environ.get("TMS_FERNET_KEY")
    if env_key:
        return env_key.encode()
    if KEY_PATH.exists():
        return KEY_PATH.read_bytes().strip()
    raise FileNotFoundError(
        f"No Fernet key found. Set TMS_FERNET_KEY or create {KEY_PATH} "
        "(run encrypt_credentials.py)."
    )


def _chmod_600(path: Path) -> None:
    path.chmod(stat.S_IRUSR | stat.S_IWUSR)  # 0o600


def load_credentials() -> Dict[str, str]:
    """Decrypt and return {'username': ..., 'password': ...}.

    Raises if the encrypted file or key is missing. The returned dict is the
    only place plaintext creds exist -- keep it in memory, never log it.
    """
    if not CRED_PATH.exists():
        raise FileNotFoundError(
            f"No encrypted credentials at {CRED_PATH}. Run encrypt_credentials.py."
        )
    fernet = Fernet(_load_key())
    plaintext = fernet.decrypt(CRED_PATH.read_bytes())
    return json.loads(plaintext.decode())


def save_credentials(username: str, password: str, key: bytes | None = None) -> None:
    """Encrypt creds to CRED_PATH (chmod 600). Generates a key if none given
    and writes it to KEY_PATH (chmod 600). Prints only non-secret paths."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    if key is None:
        if os.environ.get("TMS_FERNET_KEY"):
            key = os.environ["TMS_FERNET_KEY"].encode()
        elif KEY_PATH.exists():
            key = KEY_PATH.read_bytes().strip()
        else:
            key = Fernet.generate_key()
            KEY_PATH.write_bytes(key)
            _chmod_600(KEY_PATH)
    fernet = Fernet(key)
    blob = fernet.encrypt(json.dumps({"username": username, "password": password}).encode())
    CRED_PATH.write_bytes(blob)
    _chmod_600(CRED_PATH)
