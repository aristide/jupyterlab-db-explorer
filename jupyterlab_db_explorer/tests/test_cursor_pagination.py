"""Test the streaming ResultSession + task store pagination."""
from __future__ import annotations

import asyncio
import json
import os
import time

import pytest

from .. import task as task_mod
from ..result_session import (
    ColumnStats,
    ResultSession,
    _infer_dtype,
    open_session,
)


# ─── Test fixtures ──────────────────────────────────────────────────────────
@pytest.fixture
def sqlite_conn(tmp_path):
    """Register an in-memory SQLite connection in the engine's DB config."""
    from .. import engine

    db_file = tmp_path / "cursor_test.db"
    # Seed the SQLite file with 250 rows of mixed types using sqlalchemy directly.
    import sqlalchemy as sa
    eng = sa.create_engine(f"sqlite+pysqlite:///{db_file}")
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, value REAL)"
        )
        rows = [(i, f"name-{i % 7}", float(i) * 1.5) for i in range(1, 251)]
        conn.exec_driver_sql(
            "INSERT INTO t (id, name, value) VALUES (?, ?, ?)", rows
        )
    eng.dispose()

    # Add it to the live DB config so engine.getEngine() can resolve it.
    dbinfo = {
        'db_id': 'cursor_test',
        'db_type': engine.DB_SQLITE,
        'db_name': str(db_file),
    }
    engine.addEntry(dbinfo)
    yield 'cursor_test'
    # Cleanup: remove from config
    engine.delEntry('cursor_test')


# ─── Unit tests for the helpers ─────────────────────────────────────────────
def test_infer_dtype_basics():
    assert _infer_dtype(1) == 'number'
    assert _infer_dtype(1.5) == 'number'
    assert _infer_dtype('abc') == 'string'
    assert _infer_dtype(True) == 'string'  # bool deliberately not 'number'
    import datetime
    assert _infer_dtype(datetime.datetime.now()) == 'datetime'
    assert _infer_dtype(datetime.date.today()) == 'datetime'
    assert _infer_dtype(None) == 'string'


def test_column_stats_numeric():
    s = ColumnStats(dtype='number')
    for v in [1, 2, 3, 4, 5, None, 3]:
        s.update(v)
    snap = s.snapshot()
    assert snap['count'] == 6
    assert snap['null_count'] == 1
    assert snap['min'] == 1.0
    assert snap['max'] == 5.0
    assert snap['mean'] == pytest.approx((1 + 2 + 3 + 4 + 5 + 3) / 6)
    assert snap['distinct'] == 5  # unique values: 1,2,3,4,5


def test_column_stats_string_distinct_cap():
    s = ColumnStats(dtype='string')
    for i in range(1100):
        s.update(f'v{i}')
    snap = s.snapshot()
    # Once over the 1000 cap, distinct should switch to the '1000+' marker.
    assert snap['distinct'] == '1000+'
    assert snap['count'] == 1100


# ─── ResultSession integration ──────────────────────────────────────────────
def test_session_open_metadata_and_first_page(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, value FROM t ORDER BY id")
    try:
        assert sess.columns == ['id', 'name', 'value']
        assert sess.dtypes == ['number', 'string', 'number']
        # First-page priming put 250 rows into the cache (page_size default 1000).
        first_page = sess.fetch_page(0, sess.page_size)
        assert len(first_page) == 250
        assert first_page[0] == [1, 'name-1', 1.5]
        assert sess.cursor_exhausted is True
        assert sess.total_rows == 250
    finally:
        sess.close()


def test_session_paginated_fetch(sqlite_conn):
    # Force a small page size so we exercise multiple cursor batches.
    os.environ['DB_EXPLORER_RESULT_PAGE_SIZE'] = '40'
    try:
        sess = open_session(sqlite_conn, "SELECT id FROM t ORDER BY id")
        try:
            assert sess.page_size == 40
            # Out-of-order page fetches must work because we cache.
            p2 = sess.fetch_page(80, 40)
            assert [r[0] for r in p2] == list(range(81, 121))
            p0 = sess.fetch_page(0, 40)
            assert [r[0] for r in p0] == list(range(1, 41))
            # Beyond the result: empty list, not error.
            tail = sess.fetch_page(300, 50)
            assert tail == []
            # After full scroll, total_rows is known.
            assert sess.total_rows == 250
        finally:
            sess.close()
    finally:
        os.environ.pop('DB_EXPLORER_RESULT_PAGE_SIZE', None)


def test_session_hard_cap_stops_cursor(sqlite_conn):
    os.environ['DB_EXPLORER_QUERY_LIMIT'] = '100'
    os.environ['DB_EXPLORER_RESULT_PAGE_SIZE'] = '50'
    try:
        sess = open_session(sqlite_conn, "SELECT id FROM t ORDER BY id")
        try:
            # Scroll forward — the session should stop at the cap.
            page = sess.fetch_page(0, 200)
            assert len(page) == 100
            assert sess.cursor_exhausted is True
            assert sess.total_rows == 100
        finally:
            sess.close()
    finally:
        os.environ.pop('DB_EXPLORER_QUERY_LIMIT', None)
        os.environ.pop('DB_EXPLORER_RESULT_PAGE_SIZE', None)


# ─── Task store integration ─────────────────────────────────────────────────
async def test_task_store_round_trip(sqlite_conn):
    # Open via the task layer so we cover the asyncio path too.
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT id, name, value FROM t ORDER BY id"
    )
    rc, payload = await task_mod.get_result(taskid)
    assert rc is True
    assert payload['columns'] == ['id', 'name', 'value']
    assert payload['dtypes'] == ['number', 'string', 'number']
    assert payload['total_rows'] == 250
    assert payload['cursor_exhausted'] is True
    assert len(payload['data']) == 250  # first-page came back

    # get_page returns a slice
    ok, page = task_mod.get_page(taskid, 100, 25)
    assert ok is True
    assert len(page['data']) == 25
    assert page['data'][0][0] == 101

    # stats endpoint
    ok, stats = task_mod.get_stats(taskid)
    assert ok is True
    snap = stats['stats']
    assert snap[0]['dtype'] == 'number'  # id
    assert snap[1]['dtype'] == 'string'  # name
    assert snap[2]['dtype'] == 'number'  # value
    assert snap[0]['count'] == 250

    # delete should close the session cleanly.
    deleted = await task_mod.delete(taskid)
    assert deleted is True
    ok, payload = task_mod.get_page(taskid, 0, 10)
    assert ok is False


# ─── Histogram endpoint ─────────────────────────────────────────────────────
def test_histogram_continuous_numeric(sqlite_conn):
    """Continuous float column: n_bins equal-width bins, counts sum to non-null rows."""
    sess = open_session(sqlite_conn, "SELECT value FROM t ORDER BY id")
    try:
        bins = sess.histogram('value', n_bins=10)
        assert len(bins) == 10
        assert sum(b['count'] for b in bins) == 250
        # Bin edges should span [min, max] of the data.
        assert bins[0]['min'] == pytest.approx(1.5)
        assert bins[-1]['max'] == pytest.approx(375.0)
    finally:
        sess.close()


def test_histogram_low_card_integer(sqlite_conn):
    """Low-cardinality integer column: one bin per distinct value, not 10 wider bins."""
    # 250 ids, but we only group on `id % 5` so distinct == 5 (<= n_bins).
    sess = open_session(
        sqlite_conn, "SELECT id % 5 AS bucket FROM t"
    )
    try:
        bins = sess.histogram('bucket', n_bins=10)
        # 5 distinct values → 5 bins (not 10).
        assert len(bins) == 5
        # Each bucket has 50 rows (250 / 5).
        for b in bins:
            assert b['count'] == 50
            # min == max for low-card-integer bins.
            assert b['min'] == b['max']
        # Ordered ascending.
        assert [b['min'] for b in bins] == [0.0, 1.0, 2.0, 3.0, 4.0]
    finally:
        sess.close()


def test_histogram_two_mode(sqlite_conn):
    """Two-mode integer column: 10 bins, only first and last populated."""
    # Two distinct values, but their range is wide enough that distinct
    # (=2) is below n_bins yet they hit the integer-fast-path anyway.
    # Force a column with two distinct ints whose range > 2.
    sess = open_session(
        sqlite_conn,
        "SELECT CASE WHEN id <= 125 THEN 2011 ELSE 2012 END AS year FROM t",
    )
    try:
        bins = sess.histogram('year', n_bins=10)
        # Distinct = 2, integral → low-card integer path returns 2 bins.
        assert len(bins) == 2
        assert bins[0]['min'] == 2011.0 and bins[0]['count'] == 125
        assert bins[1]['min'] == 2012.0 and bins[1]['count'] == 125
    finally:
        sess.close()


def test_histogram_single_value(sqlite_conn):
    """min == max → single bin with full count."""
    sess = open_session(sqlite_conn, "SELECT 42 AS k FROM t")
    try:
        bins = sess.histogram('k', n_bins=10)
        assert len(bins) == 1
        assert bins[0]['min'] == 42.0
        assert bins[0]['max'] == 42.0
        assert bins[0]['count'] == 250
    finally:
        sess.close()


def test_histogram_all_null_numeric(sqlite_conn):
    """All-null numeric column → []."""
    sess = open_session(
        sqlite_conn, "SELECT CAST(NULL AS INTEGER) AS n FROM t"
    )
    try:
        bins = sess.histogram('n', n_bins=10)
        assert bins == []
    finally:
        sess.close()


def test_histogram_rejects_string(sqlite_conn):
    """String columns must return [] — the frontend uses topN for those."""
    sess = open_session(sqlite_conn, "SELECT name FROM t")
    try:
        bins = sess.histogram('name', n_bins=10)
        assert bins == []
    finally:
        sess.close()


def test_histogram_respects_filter_overlay(sqlite_conn):
    """With an active filter, histogram should reflect only matching rows."""
    sess = open_session(sqlite_conn, "SELECT id FROM t")
    try:
        sess.apply_filters([{'column': 'id', 'op': 'lt', 'value': 51}])
        bins = sess.histogram('id', n_bins=10)
        # Only id < 51 → 50 rows after filtering.
        assert sum(b['count'] for b in bins) == 50
    finally:
        sess.close()


async def test_task_histogram_round_trip(sqlite_conn):
    """task.histogram delegates through the session and returns {bins:[]}."""
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT value FROM t ORDER BY id"
    )
    rc, _ = await task_mod.get_result(taskid)
    assert rc is True
    ok, payload = task_mod.histogram(taskid, 'value', 10)
    assert ok is True
    assert 'bins' in payload
    assert len(payload['bins']) == 10
    assert sum(b['count'] for b in payload['bins']) == 250
    await task_mod.delete(taskid)


async def test_task_store_ttl_eviction(sqlite_conn, monkeypatch):
    # Make TTL effectively zero so the very next eviction sweep drops the entry.
    monkeypatch.setenv('DB_EXPLORER_RESULT_TTL_SEC', '1')
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT id FROM t LIMIT 5"
    )
    rc, _ = await task_mod.get_result(taskid)
    assert rc is True

    # Backdate last_access so the TTL sweep evicts it.
    entry = task_mod.task_dict[taskid]
    entry.last_access = time.time() - 3600

    # Trigger eviction via any task-store call (e.g. another create).
    task_mod._evict_expired()
    assert taskid not in task_mod.task_dict
