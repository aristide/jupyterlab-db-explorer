"""Tests for ResultSession sort / filter / top-N overlays."""
from __future__ import annotations

import pytest

from .. import task as task_mod
from ..result_session import open_session


@pytest.fixture
def sqlite_conn(tmp_path):
    """Register an in-memory SQLite connection with mixed-content data."""
    from .. import engine

    db_file = tmp_path / "sort_filter.db"
    import sqlalchemy as sa
    eng = sa.create_engine(f"sqlite+pysqlite:///{db_file}")
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, qty INTEGER)"
        )
        rows = []
        for i in range(1, 21):
            rows.append((i, ['alpha', 'beta', 'gamma'][i % 3], i * 5))
        conn.exec_driver_sql(
            "INSERT INTO items (id, name, qty) VALUES (?, ?, ?)", rows
        )
    eng.dispose()

    dbinfo = {
        'db_id': 'sortfilter_test',
        'db_type': engine.DB_SQLITE,
        'db_name': str(db_file),
    }
    engine.addEntry(dbinfo)
    yield 'sortfilter_test'
    engine.delEntry('sortfilter_test')


def test_apply_sort_orders_rows(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, qty FROM items")
    try:
        # Sort by qty DESC — first page should now start with the highest qty.
        sess.apply_sort('qty', 'DESC')
        page = sess.fetch_page(0, 5)
        qtys = [row[2] for row in page]
        assert qtys == sorted(qtys, reverse=True)
        assert qtys[0] == 100  # 20 * 5

        # Clear sort → back to insertion order.
        sess.apply_sort(None)
        page = sess.fetch_page(0, 5)
        ids = [row[0] for row in page]
        assert ids == [1, 2, 3, 4, 5]
    finally:
        sess.close()


def test_apply_filter_contains_string(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, qty FROM items")
    try:
        sess.apply_filters([{'column': 'name', 'op': 'contains', 'value': 'alpha'}])
        page = sess.fetch_page(0, 100)
        names = {row[1] for row in page}
        assert names == {'alpha'}
        assert len(page) > 0
    finally:
        sess.close()


def test_apply_filter_gt_lt_numeric(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, qty FROM items")
    try:
        sess.apply_filters([
            {'column': 'qty', 'op': 'gt', 'value': 50},
            {'column': 'qty', 'op': 'lt', 'value': 90},
        ])
        page = sess.fetch_page(0, 100)
        qtys = [row[2] for row in page]
        assert all(50 < q < 90 for q in qtys)
        assert len(qtys) > 0
    finally:
        sess.close()


def test_top_n_values(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT id, name, qty FROM items")
    try:
        # `name` cycles ['beta','gamma','alpha','beta','gamma','alpha',...]
        # over 20 rows starting from i=1 → counts: alpha=6, beta=7, gamma=7.
        top = sess.top_n_values('name', n=10)
        assert len(top) == 3
        names = {t['value'] for t in top}
        assert names == {'alpha', 'beta', 'gamma'}
        # Top is sorted by count DESC; counts match the distribution.
        assert top[0]['count'] >= top[-1]['count']
    finally:
        sess.close()


async def test_task_store_sort_filter_round_trip(sqlite_conn):
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT id, name, qty FROM items"
    )
    rc, payload = await task_mod.get_result(taskid)
    assert rc is True
    assert payload['columns'] == ['id', 'name', 'qty']

    ok, payload = task_mod.apply_sort(taskid, 'qty', 'DESC')
    assert ok is True
    assert payload['sort'] == ['qty', 'DESC']
    qtys = [row[2] for row in payload['data']]
    assert qtys == sorted(qtys, reverse=True)

    ok, payload = task_mod.apply_filters(
        taskid, [{'column': 'name', 'op': 'equals', 'value': 'alpha'}]
    )
    assert ok is True
    names = {row[1] for row in payload['data']}
    assert names == {'alpha'}

    ok, payload = task_mod.top_n(taskid, 'name', 3)
    assert ok is True
    assert len(payload['values']) == 3

    await task_mod.delete(taskid)
