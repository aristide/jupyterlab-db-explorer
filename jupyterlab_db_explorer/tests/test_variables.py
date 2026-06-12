"""Tests for user-defined SQL variables: store CRUD + ${name} resolution."""
from __future__ import annotations

import pytest

from .. import variables


@pytest.fixture
def store(tmp_path, monkeypatch):
    """Point the variable store at a temp file."""
    cfg = tmp_path / "variables.json"
    monkeypatch.setattr(variables, "VAR_CFG", str(cfg))
    return cfg


# ── CRUD round-trip ─────────────────────────────────────────────────────────
def test_empty_store(store):
    assert variables.get_variables() == []


def test_save_get_delete_roundtrip(store):
    variables.save_variable("schema", "analytics", "default schema")
    got = variables.get_variables()
    assert got == [
        {"name": "schema", "value": "analytics", "description": "default schema"}
    ]
    assert store.exists()

    # Update overwrites in place.
    variables.save_variable("schema", "staging")
    got = variables.get_variables()
    assert got[0]["value"] == "staging"
    assert got[0]["description"] == ""

    variables.delete_variable("schema")
    assert variables.get_variables() == []


def test_variables_sorted_by_name(store):
    variables.save_variable("zeta", "1")
    variables.save_variable("alpha", "2")
    names = [v["name"] for v in variables.get_variables()]
    assert names == ["alpha", "zeta"]


def test_invalid_name_rejected(store):
    with pytest.raises(ValueError):
        variables.save_variable("bad name", "x")
    with pytest.raises(ValueError):
        variables.save_variable("1leading", "x")
    assert variables.get_variables() == []


def test_delete_missing_is_noop(store):
    variables.delete_variable("nope")  # should not raise
    assert variables.get_variables() == []


# ── resolve() ───────────────────────────────────────────────────────────────
def test_resolve_uses_custom_variable(store):
    variables.save_variable("schema", "analytics")
    sql = "SELECT * FROM ${schema}.orders"
    assert variables.resolve(sql) == "SELECT * FROM analytics.orders"


def test_custom_wins_over_env(store, monkeypatch):
    monkeypatch.setenv("schema", "from_env")
    variables.save_variable("schema", "from_custom")
    assert variables.resolve("USE ${schema}") == "USE from_custom"


def test_env_fallback(store, monkeypatch):
    monkeypatch.setenv("REGION_ID", "5")
    assert variables.resolve("WHERE region = ${REGION_ID}") == "WHERE region = 5"


def test_missing_variable_raises_naming_it(store):
    with pytest.raises(ValueError) as exc:
        variables.resolve("SELECT ${nope}, ${alsobad}")
    msg = str(exc.value)
    assert "nope" in msg and "alsobad" in msg


def test_no_placeholder_passthrough(store):
    sql = "SELECT 1"
    assert variables.resolve(sql) is sql


def test_malformed_placeholder_untouched(store):
    # ${bad name} has a space -> doesn't match the identifier pattern, left as-is.
    sql = "SELECT '${bad name}'"
    assert variables.resolve(sql) == sql


def test_multiple_occurrences(store):
    variables.save_variable("t", "users")
    out = variables.resolve("SELECT * FROM ${t} JOIN ${t}")
    assert out == "SELECT * FROM users JOIN users"
