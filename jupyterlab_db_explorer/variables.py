"""User-defined SQL variables.

Variables are stored in ``~/.database/variables.json`` as
``{ "<name>": {"value": "...", "description": "..."}, ... }`` and referenced in
SQL with the ``${name}`` syntax. At query time :func:`resolve` substitutes each
placeholder with the matching custom variable, falling back to the server's
environment (``os.environ``) when no custom variable is defined.

Substitution is raw textual replacement into the SQL string. This is
injection-shaped, but the values are the user's own (same trust model as the
filter-overlay escaping in ``result_session.py``) — the Jupyter server runs as
the user, so its environment holds the user's own secrets.
"""

import json
import os
import re

from .const import VAR_CFG

# ${name} where name is a normal identifier. Anything that doesn't match
# (e.g. "${bad name}" or a literal "$" followed by something else) is left
# untouched.
_VAR_RE = re.compile(r'\$\{([A-Za-z_][A-Za-z0-9_]*)\}')
_NAME_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')


def _path():
    return os.path.expanduser(VAR_CFG)


def _read():
    """Return the raw store dict ``{name: {value, description}}``."""
    path = _path()
    if not os.path.exists(path):
        return {}
    try:
        with open(path, mode='rt') as f:
            data = json.load(f)
    except Exception:
        return {}
    return data if isinstance(data, dict) else {}


def _write(store):
    path = _path()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, mode='wt') as f:
        f.write(json.dumps(store, indent=4))


def get_variables():
    """List custom variables as ``[{name, value, description}, ...]``.

    System environment variables are a runtime fallback for :func:`resolve` and
    are intentionally not listed here.
    """
    store = _read()
    out = []
    for name in sorted(store):
        entry = store[name] or {}
        out.append({
            'name': name,
            'value': entry.get('value', ''),
            'description': entry.get('description', ''),
        })
    return out


def save_variable(name, value, description=''):
    """Create or update a variable. Raises ValueError on an invalid name."""
    name = (name or '').strip()
    if not _NAME_RE.match(name):
        raise ValueError(
            "invalid variable name '%s': must match [A-Za-z_][A-Za-z0-9_]*" % name
        )
    store = _read()
    store[name] = {'value': value or '', 'description': description or ''}
    _write(store)
    return get_variables()


def delete_variable(name):
    """Remove a variable. No-op if it doesn't exist."""
    store = _read()
    if name in store:
        del store[name]
        _write(store)
    return get_variables()


def resolve(sql):
    """Replace every ``${name}`` in ``sql`` with its resolved value.

    Resolution order per name: custom variable first, then ``os.environ``.
    Raises ValueError naming every placeholder that resolves to neither.
    """
    if not sql or '${' not in sql:
        return sql

    store = _read()
    missing = []

    def _sub(match):
        name = match.group(1)
        if name in store:
            return str((store[name] or {}).get('value', ''))
        if name in os.environ:
            return os.environ[name]
        missing.append(name)
        return match.group(0)

    result = _VAR_RE.sub(_sub, sql)
    if missing:
        # Preserve first-seen order, de-duplicated.
        seen = list(dict.fromkeys(missing))
        raise ValueError('undefined SQL variable(s): ' + ', '.join(seen))
    return result
