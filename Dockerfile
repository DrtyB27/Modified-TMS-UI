# Container image for the read-only 3G sandbox backend, for Cloudflare Containers.
# Reuses the Flask + Playwright backend as-is; the login screen posts credentials
# here, this container drives the headless 3G sandbox login and holds the session.
#
# Base image ships Chromium + all its OS deps + a matching Playwright, so we only
# add the app's Python deps. Bump the tag to match skills/3g-tms-browser as needed.
FROM mcr.microsoft.com/playwright/python:v1.48.0-jammy

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# App + skill code (build context is the repo root; see .dockerignore).
COPY backend/ /app/backend/
COPY skills/3g-tms-browser/ /app/skills/3g-tms-browser/

# Flask/requests/cryptography/flask-cors + a production WSGI server.
# (Playwright + Chromium already come from the base image.)
RUN pip install -r /app/backend/requirements.txt gunicorn

# Live mode with the login gate on; Secure cookie behind Cloudflare TLS.
ENV USE_FIXTURES=0 \
    LOGIN_REQUIRED=1 \
    FORCE_SECURE_COOKIE=1

EXPOSE 8080
WORKDIR /app/backend
# Single worker so the in-memory session store is consistent (POC scope).
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--threads", "8", \
     "--timeout", "120", "app:app"]
