# jupyterlab-db-explorer

A JupyterLab extension for browsing database objects and running SQL queries. Supports multiple database engines including MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, and StarRocks.

## Features

- Browse and navigate data objects (tables, views, columns) using a tree structure.
- Run SQL statements directly in JupyterLab and view results.
- Support for multiple databases: MySQL, PostgreSQL, Hive, Trino, SQLite, Oracle, StarRocks.
- Edit annotations for data objects with local and shared (team database) modes.

## Requirements

- JupyterLab >= 4.0 (for JupyterLab 3.x use version 0.1.x)
- sqlalchemy >= 1.4

## Install

```bash
pip install jupyterlab-db-explorer
```

Install with a specific database driver:

```bash
pip install jupyterlab-db-explorer[pgsql]
pip install jupyterlab-db-explorer[trino]
pip install jupyterlab-db-explorer[hive]
pip install jupyterlab-db-explorer[mysql]
```

## Uninstall

```bash
pip uninstall jupyterlab-db-explorer
```

## Usage

### Add Database Connection

Open the dialog to add a data connection via "Database -> New Connection" from the menu.

### Edit Comments

Right-click on a connection, table, or column in the database navigation tree and select "Edit Comment" to add or modify comments.

### Share Comments

By default, comments are saved locally. To share within a team, add the following to `$HOME/.jupyter/jupyter_notebook_config.py` (on Windows `%USERPROFILE%/.jupyter/jupyter_notebook_config.py`):

```python
c.JupyterLabSqlExplorer.comments_store = 'database::your_database_connection_string'
```

For example, with MySQL:

```python
c.JupyterLabSqlExplorer.comments_store = 'database::mysql+pymysql://root:12345@192.168.1.100:3306/data'
```

## Troubleshoot

Check server extension is enabled:

```bash
jupyter server extension list
```

Check frontend extension is installed:

```bash
jupyter labextension list
```

## Development

### Devcontainer

The project includes a devcontainer with PostgreSQL, Trino, and StarRocks services for testing. Each database can be enabled or disabled via the `COMPOSE_PROFILES` variable in `.devcontainer/.env`. See [.devcontainer/README.md](.devcontainer/README.md) for details.

### Manual Setup

You will need NodeJS to build the extension. The `jlpm` command is JupyterLab's pinned version of [yarn](https://yarnpkg.com/).

```bash
# Install package in development mode
pip install -e ".[test,pgsql,trino]"
# Link your development version of the extension with JupyterLab
jupyter labextension develop . --overwrite
# Enable server extension
jupyter server extension enable jupyterlab-db-explorer
# Build extension
jlpm build
```

Watch for changes during development:

```bash
# Terminal 1: watch and rebuild on changes
jlpm watch
# Terminal 2: run JupyterLab
jupyter lab
```

### Development Uninstall

```bash
jupyter server extension disable jupyterlab-db-explorer
pip uninstall jupyterlab-db-explorer
```

Also remove the symlink created by `jupyter labextension develop`. Run `jupyter labextension list` to find the `labextensions` folder, then remove the `jupyterlab-db-explorer` symlink.

### Testing

#### Server tests

```bash
pip install -e ".[test]"
jupyter labextension develop . --overwrite
pytest -vv -r ap --cov jupyterlab-db-explorer
```

#### Frontend tests

```bash
jlpm
jlpm test
```

#### Integration tests

Uses [Playwright](https://playwright.dev/) via the [Galata](https://github.com/jupyterlab/jupyterlab/tree/master/galata) helper. See [ui-tests/README.md](./ui-tests/README.md).

### Packaging

See [RELEASE.md](RELEASE.md).
