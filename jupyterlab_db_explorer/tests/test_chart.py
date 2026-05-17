"""Tests for ResultSession.chart_data and the /query/chart task path."""
from __future__ import annotations

import pytest

from .. import task as task_mod
from ..result_session import open_session


@pytest.fixture
def sqlite_conn(tmp_path):
    from .. import engine

    db_file = tmp_path / "chart_test.db"
    import sqlalchemy as sa
    eng = sa.create_engine(f"sqlite+pysqlite:///{db_file}")
    with eng.begin() as conn:
        conn.exec_driver_sql(
            "CREATE TABLE sales (region TEXT, product TEXT, units INTEGER)"
        )
        rows = [
            ('north', 'apple', 10), ('north', 'banana', 5),
            ('south', 'apple', 7),  ('south', 'banana', 3),
            ('east',  'apple', 4),  ('east',  'banana', 9),
        ]
        conn.exec_driver_sql(
            "INSERT INTO sales (region, product, units) VALUES (?, ?, ?)", rows
        )
    eng.dispose()

    dbinfo = {
        'db_id': 'chart_test',
        'db_type': engine.DB_SQLITE,
        'db_name': str(db_file),
    }
    engine.addEntry(dbinfo)
    yield 'chart_test'
    engine.delEntry('chart_test')


def test_chart_count_by_region(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT region, product, units FROM sales")
    try:
        out = sess.chart_data({'x': 'region', 'aggregate': 'count'})
        rows = out['rows']
        # Three regions, two rows each → count == 2 for each.
        assert len(rows) == 3
        by_x = {r['x']: r['y'] for r in rows}
        assert by_x == {'east': 2, 'north': 2, 'south': 2}
    finally:
        sess.close()


def test_chart_sum_units_by_region(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT region, product, units FROM sales")
    try:
        out = sess.chart_data({
            'x': 'region', 'y': 'units', 'aggregate': 'sum'
        })
        by_x = {r['x']: r['y'] for r in out['rows']}
        assert by_x == {'east': 13, 'north': 15, 'south': 10}
    finally:
        sess.close()


def test_chart_with_color_groups(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT region, product, units FROM sales")
    try:
        out = sess.chart_data({
            'x': 'region', 'y': 'units', 'color': 'product',
            'aggregate': 'sum'
        })
        # 3 regions × 2 products = 6 groups.
        assert len(out['rows']) == 6
        # Spot-check: north + apple = 10
        north_apple = next(
            r for r in out['rows'] if r['x'] == 'north' and r['color'] == 'apple'
        )
        assert north_apple['y'] == 10
    finally:
        sess.close()


def test_chart_rejects_unknown_column(sqlite_conn):
    sess = open_session(sqlite_conn, "SELECT region, product, units FROM sales")
    try:
        with pytest.raises(ValueError):
            sess.chart_data({'x': 'bogus', 'aggregate': 'count'})
    finally:
        sess.close()


async def test_task_store_chart_round_trip(sqlite_conn):
    taskid = await task_mod.create_query_task(
        sqlite_conn, "SELECT region, product, units FROM sales"
    )
    rc, _ = await task_mod.get_result(taskid)
    assert rc is True
    ok, payload = task_mod.chart_data(taskid, {
        'x': 'region', 'y': 'units', 'aggregate': 'avg'
    })
    assert ok is True
    assert len(payload['rows']) == 3
    await task_mod.delete(taskid)
