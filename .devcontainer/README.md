# Devcontainer

Development environment with all services needed to build and test the extension.

## Services

| Service        | Image                        | Ports      | Profile    | Purpose                       |
|----------------|------------------------------|------------|------------|-------------------------------|
| jupyter-minio  | aristidetm/labextension-dev  | 8888, 9999 | (always on)| JupyterLab dev container      |
| minio          | minio                        | 9000, 9001 | (always on)| S3-compatible object storage  |
| postgres       | postgres:16                  | 5432       | postgres   | PostgreSQL for testing        |
| trino          | trinodb/trino:latest         | 8080       | trino      | Trino query engine            |
| starrocks      | starrocks/allin1-ubuntu      | 9030, 8030 | starrocks  | StarRocks OLAP database       |
| starrocks-init | mariadb:latest               | —          | starrocks  | Seeds StarRocks sample data   |

## Enable / Disable Services

Database services are controlled via Docker Compose **profiles**. Edit `.devcontainer/.env`:

```env
# Remove a profile name to disable that service.
COMPOSE_PROFILES=postgres,trino,starrocks
```

For example, to run only PostgreSQL and Trino:

```env
COMPOSE_PROFILES=postgres,trino
```

After changing, rebuild the devcontainer.

## Test Credentials

| Service    | Host       | Port | User     | Password | Database             |
|------------|------------|------|----------|----------|----------------------|
| PostgreSQL | postgres   | 5432 | testuser | testpass | testdb               |
| Trino      | trino      | 8080 | any      | —        | postgresql / tpch / tpcds |
| StarRocks  | starrocks  | 9030 | root     | (empty)  | testdb               |
| MinIO      | minio      | 9000 | minioadmin | minioadmin | —                 |

## Trino Catalogs

- **postgresql** — connects to the PostgreSQL service (`testdb` database)
- **tpch** — built-in TPC-H benchmark data (schemas: `tiny`, `sf1`, etc.)
- **tpcds** — built-in TPC-DS benchmark data (schemas: `tiny`, `sf1`, etc.)

> Note: The `postgresql` catalog requires the `postgres` profile to be enabled.

## Sample Data

**PostgreSQL** is seeded on first start with:
- `sample.countries` — country codes, names, population, area
- `sample.indicators` — economic indicators by country and year

To reset: remove the `pgdata` volume and rebuild.

**StarRocks** is seeded by the `starrocks-init` container after StarRocks is healthy:
- `testdb.countries` — same data as PostgreSQL
- `testdb.indicators` — same data as PostgreSQL

To reset: remove the `srdata` volume and rebuild.

## Quick Start

1. Open the project in VS Code with the Dev Containers extension
2. Edit `.devcontainer/.env` to enable the profiles you need
3. Select "Reopen in Container"
4. Wait for services to become healthy and `postCreateCommand` to finish

## Verify Services

From a terminal inside the container:

```bash
# PostgreSQL
psql -h postgres -U testuser -d testdb -c "SELECT * FROM sample.countries"

# Trino (via PostgreSQL catalog)
trino --server trino:8080 --execute "SELECT * FROM postgresql.sample.countries"

# Trino (TPC-H sample data)
trino --server trino:8080 --execute "SELECT * FROM tpch.tiny.orders LIMIT 5"

# StarRocks
mariadb -h starrocks -P 9030 -u root -e "SELECT * FROM testdb.countries"
```

## Build Image

```bash
docker build -t aristidetm/labextension-dev .
```
