#!/usr/bin/env python3
"""
One-time helper to create the Fernet-encrypted 3G credential blob.

Reads username/password from a prompt (no echo) or from the TMS_USERNAME /
TMS_PASSWORD env vars, encrypts them, and writes credentials.enc + fernet.key
(both chmod 600) OUTSIDE the repo. Nothing is printed except the non-secret
destination paths.

    python encrypt_credentials.py
"""

import getpass
import os

from credentials import CRED_PATH, KEY_PATH, save_credentials


def main() -> None:
    username = os.environ.get("TMS_USERNAME") or input("3G sandbox username: ").strip()
    password = os.environ.get("TMS_PASSWORD") or getpass.getpass("3G sandbox password: ")
    if not username or not password:
        raise SystemExit("username and password are both required")
    save_credentials(username, password)
    print(f"Encrypted credentials written to: {CRED_PATH}")
    print(f"Fernet key written to:            {KEY_PATH}")
    print("Both files are chmod 600 and live OUTSIDE the repo.")
    print("For CI / Worker use, export the key instead: TMS_FERNET_KEY=<key>")


if __name__ == "__main__":
    main()
