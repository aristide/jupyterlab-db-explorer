#!/usr/bin/env bash
# Dev entrypoint for the `jupyter` service.
#
# Runs on every `docker compose up`. It installs/refreshes the JS and Python
# dependencies for whatever is currently on disk (bind-mounted from the host),
# then starts the TypeScript/labextension watcher and JupyterLab. Nothing here
# gets baked into the image, so editing source or dependency manifests never
# requires an image rebuild.
set -euo pipefail

cd /workspace

# The node_modules named volume (see docker-compose.yml) has no matching
# content baked into the image, so Docker creates it fresh and root-owned.
# Fix that up front so `jlpm install`, running as the `jupyter` user, can
# write to it.
sudo mkdir -p /workspace/node_modules
sudo chown jupyter:jupyter /workspace/node_modules

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

echo "==> Starting JupyterLab on :8888"
exec jupyter lab \
    --ip=0.0.0.0 \
    --port=8888 \
    --no-browser \
    --ServerApp.token='' \
    --notebook-dir=/workspace/notebooks
