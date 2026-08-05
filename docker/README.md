# Docker dev environment

Development environment with all services needed to build and test the extension, run via plain `docker compose` (no VS Code / Dev Containers required).

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

Stop everything with `docker compose down` (add `-v` to also delete the `pgdata`/`srdata`/`node_modules`/`pyenv` volumes for a clean slate).

## How live reload works

The `jupyter` service builds from `docker/Dockerfile`, which only installs OS-level tooling (git, pyenv/Python, nvm/Node, JupyterLab, build tools). It never `COPY`s any project source, so it almost never needs rebuilding.

The repo is bind-mounted at `/workspace`. On every `docker compose up`, `docker/entrypoint.sh` runs automatically and:

1. `jlpm install` — installs/updates JS dependencies
2. `pip install -e ".[test,pgsql,trino,starrocks,vault]"` — installs the Python package in editable mode (this also runs the TS/webpack build once via the `hatch-jupyter-builder` hook)
3. `jupyter labextension develop . --overwrite` — symlinks the extension into JupyterLab
4. `jupyter server extension enable jupyterlab_db_explorer`
5. `jlpm watch` in the background — recompiles TypeScript and rebuilds the labextension bundle on every source change
6. `jupyter lab` in the foreground on `:8888`

So:

- **Frontend (`src/`, `style/`)** changes are picked up live by `jlpm watch`; refresh the browser tab to see them.
- **Backend (`jupyterlab_db_explorer/*.py`)** changes are picked up on the next process restart. Since nothing needs rebuilding, that's just `docker compose restart jupyter` (seconds, not a rebuild).
- **Dependency changes** (`package.json`, `pyproject.toml`) are picked up automatically on the next `docker compose restart jupyter` / `up`, since steps 1–2 above re-run every start.
- A **Dockerfile rebuild** (`docker compose up --build`) is only needed when `docker/Dockerfile` itself changes (new OS package, new Node/Python version, etc).

`node_modules` and the pyenv install live in named Docker volumes (`node_modules`, `pyenv`) rather than the bind-mounted workspace, so installs stay native to the container's Linux filesystem (avoiding host/container binary mismatches) and persist across `docker compose down` + `up`.

## Services

| Service        | Image                       | Ports      | Profile     | Purpose                     |
| -------------- | ---------------------------- | ---------- | ----------- | --------------------------- |
| jupyter        | built from `docker/Dockerfile` | 8888, 9999 | (always on) | JupyterLab dev container    |
| postgres       | postgres:16                 | 5432       | postgres    | PostgreSQL for testing      |
| trino          | trinodb/trino:latest        | 8080       | trino       | Trino query engine          |
| starrocks      | starrocks/allin1-ubuntu     | 9030, 8030 | starrocks   | StarRocks OLAP database     |
| starrocks-init | mariadb:latest              | —          | starrocks   | Seeds StarRocks sample data |
| vault          | hashicorp/vault:1.17        | 8200       | vault       | HashiCorp Vault for secrets |

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

`HOST_SSH_DIR` (in `.env`) is bind-mounted read-only to `/home/jupyter/.ssh`. It defaults to the empty, gitignored `docker/ssh-keys/` folder (a no-op). Point it at your real SSH directory to use your own keys for `git` inside the container, e.g. `HOST_SSH_DIR=${HOME}/.ssh` (macOS/Linux/Git Bash) or `HOST_SSH_DIR=C:/Users/you/.ssh` (Windows).

## Rebuilding the image

Only needed after changing `docker/Dockerfile`:

```bash
docker compose build jupyter
# or: docker compose up -d --build
```
