# Docker dev environment

Development environment with all services needed to build and test the extension, run via plain `docker compose` (no VS Code / Dev Containers required) — and no image to build, locally or in CI.

The `docker-compose.yml` lives at the repo root; run all commands below from there.

## Quick start

```bash
cp .env.sample .env      # first time only; adjust COMPOSE_PROFILES / HOST_SSH_DIR as needed
docker compose up -d
docker compose logs -f jupyter
```

JupyterLab is served automatically at http://localhost:8888/lab (no token). Open a shell in the running container with:

```bash
docker compose exec jupyter bash
```

Stop everything with `docker compose down` (add `-v` to also delete the `pgdata`/`srdata`/`node_modules`/`python-local` volumes for a clean slate).

## How it works — no build, live reload both ways

The `jupyter` service runs [`nikolaik/python-nodejs:python3.12-nodejs22`](https://github.com/nikolaik/docker-python-nodejs) — a pre-built, off-the-shelf Python 3.12 + Node 22 image pulled straight from Docker Hub, unmodified. There is no `docker/Dockerfile` and `docker compose up` never builds anything; the first run just pulls the image, same as any other public image.

The repo is bind-mounted at `/workspace`. On every `docker compose up` / restart, `docker/entrypoint.sh` runs automatically and:

1. `apt-get install postgresql-client mariadb-client` — the CLI clients used below to poke at the DB services (not part of the base image)
2. `pip install jupyterlab hatchling hatch-jupyter-builder hatch-nodejs-version` — the CLI tooling the project needs (not part of the base image)
3. `jlpm install` — installs/updates JS dependencies
4. `pip install -e ".[test,pgsql,trino,starrocks,vault]"` — installs the Python package in editable mode (this also runs the TS/webpack build once via the `hatch-jupyter-builder` hook)
5. `jupyter labextension develop . --overwrite` — symlinks the extension into JupyterLab
6. `jupyter server extension enable jupyterlab_db_explorer`
7. `jlpm watch` in the background — recompiles TypeScript and rebuilds the labextension bundle on every source change
8. `jupyter lab --autoreload` in the foreground on `:8888`

So:

- **Frontend (`src/`, `style/`)** changes are picked up live by `jlpm watch`; refresh the browser tab to see them.
- **Backend (`jupyterlab_db_explorer/*.py`)** changes are picked up automatically — `--autoreload` makes Jupyter Server watch every imported `.py` file and restart the whole process when one changes. No `docker compose restart` needed. (If autoreload ever misbehaves, `docker compose restart jupyter` is the manual fallback — still just a process restart, no rebuild.)
- **Dependency changes** (`package.json`, `pyproject.toml`) are picked up automatically on the next `docker compose restart jupyter` / `up`, since steps 3–4 above re-run every start.
- There is genuinely nothing to rebuild, ever — not even after changing this dev environment's own tooling, since it isn't baked into an image.

`node_modules` and the whole Python install prefix (`/usr/local` — site-packages, console scripts, ...) live in named Docker volumes (`node_modules`, `python-local`) rather than the bind-mounted workspace or the container's disposable writable layer. That means installs stay native to the container's Linux filesystem (avoiding host/container binary mismatches) _and_ survive a full `docker compose down` + `up`, not just a `restart`: once a package is already installed, `pip install`/`jlpm install` just verify it's there instead of re-downloading and rebuilding it (e.g. compiling `psycopg2`) from scratch every time.

One directory is deliberately excluded from that persistence: `/usr/local/share/jupyter/labextensions` is mounted as `tmpfs` (always empty on a fresh container), so `jupyter labextension develop --overwrite` always symlinks it fresh. Persisting it caused pip's editable-install uninstall/reinstall dance to collide with a stale symlink there on a second full recreate when this was tried in the sibling `jupyterlab-airflow` project; tmpfs sidesteps that, and there's nothing worth persisting in a directory that's fully rebuilt every start anyway.

The container runs as **root** (`user: root`): the base image's default non-root user (`pn`) can't write the root-owned named volumes above without `sudo`, which isn't installed in this image. Root is fine for a disposable local dev container; `jupyter lab` is passed `--allow-root` accordingly.

## Services

| Service        | Image                                        | Ports      | Profile     | Purpose                     |
| -------------- | -------------------------------------------- | ---------- | ----------- | --------------------------- |
| jupyter        | `nikolaik/python-nodejs:python3.12-nodejs22` | 8888, 9999 | (always on) | JupyterLab dev container    |
| postgres       | postgres:16                                  | 5432       | postgres    | PostgreSQL for testing      |
| trino          | trinodb/trino:latest                         | 8080       | trino       | Trino query engine          |
| starrocks      | starrocks/allin1-ubuntu                      | 9030, 8030 | starrocks   | StarRocks OLAP database     |
| starrocks-init | mariadb:latest                               | —          | starrocks   | Seeds StarRocks sample data |
| vault          | hashicorp/vault:1.17                         | 8200       | vault       | HashiCorp Vault for secrets |

## Enable / disable services

Database services are controlled via Docker Compose **profiles**. Edit `.env` at the repo root:

```env
# Remove a profile name to disable that service.
COMPOSE_PROFILES=postgres,trino,starrocks,vault
```

For example, to run only PostgreSQL and Trino:

```env
COMPOSE_PROFILES=postgres,trino,vault
```

After changing, run `docker compose up -d` again.

## Test credentials

| Service    | Host      | Port | User     | Password | Database                  |
| ---------- | --------- | ---- | -------- | -------- | ------------------------- |
| PostgreSQL | postgres  | 5432 | testuser | testpass | testdb                    |
| Trino      | trino     | 8080 | any      | —        | postgresql / tpch / tpcds |
| StarRocks  | starrocks | 9030 | root     | (empty)  | testdb                    |
| Vault      | vault     | 8200 | (token)  | devtoken | —                         |

## Trino catalogs

- **postgresql** — connects to the PostgreSQL service (`testdb` database)
- **tpch** — built-in TPC-H benchmark data (schemas: `tiny`, `sf1`, etc.)
- **tpcds** — built-in TPC-DS benchmark data (schemas: `tiny`, `sf1`, etc.)

> Note: The `postgresql` catalog requires the `postgres` profile to be enabled.

## Sample data

**PostgreSQL** is seeded on first start with:

- `sample.countries` — country codes, names, population, area
- `sample.indicators` — economic indicators by country and year

To reset: `docker compose down -v` (or remove just the `pgdata` volume) and start again.

**StarRocks** is seeded by the `starrocks-init` container after StarRocks is healthy:

- `testdb.countries` — same data as PostgreSQL
- `testdb.indicators` — same data as PostgreSQL

To reset: `docker compose down -v` (or remove just the `srdata` volume) and start again.

## Verify services

From a terminal inside the container (`docker compose exec jupyter bash`):

```bash
# PostgreSQL
psql -h postgres -U testuser -d testdb -c "SELECT * FROM sample.countries"

# Trino (via PostgreSQL catalog)
trino --server trino:8080 --execute "SELECT * FROM postgresql.sample.countries"

# Trino (TPC-H sample data)
trino --server trino:8080 --execute "SELECT * FROM tpch.tiny.orders LIMIT 5"

# StarRocks
mariadb -h starrocks -P 9030 -u root -e "SELECT * FROM testdb.countries"

# Vault (dev mode)
vault login token=devtoken
vault kv put secret/database/production password="test123" username="admin"
vault kv get secret/database/production
```

## SSH keys inside the container

`HOST_SSH_DIR` (in `.env`) is bind-mounted read-only to `/root/.ssh` (the container runs as root — see above). It defaults to the empty, gitignored `docker/ssh-keys/` folder (a no-op). Point it at your real SSH directory to use your own keys for `git` inside the container, e.g. `HOST_SSH_DIR=${HOME}/.ssh` (macOS/Linux/Git Bash) or `HOST_SSH_DIR=C:/Users/you/.ssh` (Windows).

## Updating the base image

There's nothing to rebuild, but you can bump the pinned tag in `docker-compose.yml` (e.g. a newer Node major) and pull it:

```bash
docker compose pull jupyter
docker compose up -d
```
