#!/usr/bin/env bash
# Dev entrypoint for the `jupyter` service.
#
# Runs on every `docker compose up` / restart, against a plain, pre-built
# Python+Node image — there is no docker/Dockerfile and nothing is ever
# built. This script installs/refreshes the OS, JS and Python dependencies
# for whatever is currently on disk (bind-mounted from the host), then
# starts JupyterLab with both halves live-reloading:
#   - frontend: a background `jlpm watch` rebuilds TS/CSS on every change
#   - backend:  `jupyter lab --autoreload` restarts the server process
#               whenever an imported .py file (incl. jupyterlab_db_explorer/)
#               changes
set -euo pipefail

cd /workspace

echo "==> Installing CLI clients (psql, mariadb) used to poke at the DB services"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install --no-install-recommends -y -qq \
    postgresql-client mariadb-client >/dev/null
rm -rf /var/lib/apt/lists/*

echo "==> Installing JupyterLab + build tooling"
pip install --no-cache-dir \
    "jupyterlab>=4.0.0,<5" \
    "hatchling>=1.5.0" \
    "hatch-jupyter-builder>=0.5" \
    "hatch-nodejs-version>=0.3.2"

echo "==> Installing JS dependencies (jlpm install)"
jlpm install

echo "==> Installing Python package in editable mode"
pip install --no-cache-dir -e ".[test,pgsql,trino,starrocks,vault]"

echo "==> Linking labextension for development"
jupyter labextension develop . --overwrite

echo "==> Enabling server extension"
jupyter server extension enable jupyterlab_db_explorer

echo "==> Starting TypeScript/labextension watch (background, logs: /tmp/jlpm-watch.log)"
jlpm watch >/tmp/jlpm-watch.log 2>&1 &

echo "==> Starting JupyterLab on :8888 (--autoreload picks up backend .py changes)"
exec jupyter lab \
    --ip=0.0.0.0 \
    --port=8888 \
    --no-browser \
    --allow-root \
    --autoreload \
    --ServerApp.token='' \
    --notebook-dir=/workspace/notebooks
