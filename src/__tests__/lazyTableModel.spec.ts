/**
 * Tests for LazyTableModel — the data model that drives the SQL Console's
 * result DataGrid. Verifies: header rows, cached body cells, miss-triggers-
 * fetch, in-flight de-dupe, cells-changed emission on resolve, stale-gen
 * fetches discarded after setQuery.
 */
import { Signal } from '@lumino/signaling';
import { LazyTableModel } from '../sqlConsole/lazyTableModel';
import { IPageData, IStatsData, ITableData, IQueryRes } from '../interfaces';
import { IQueryModel, IQueryStatus } from '../model';

class FakeQueryModel implements IQueryModel {
  dbid = 'fake';
  conns: string[] = ['fake'];
  isConnReadOnly = true;
  /** Pages to hand back per offset request. Resolves can be deferred for
   *  in-flight de-dupe tests via the gate Promise. */
  pages: Map<number, IPageData> = new Map();
  fetchCalls: Array<{ offset: number; limit: number }> = [];
  gate?: () => Promise<void>;

  async query(_sql: string): Promise<IQueryRes> {
    return { status: 'OK' };
  }
  async fetchPage(offset: number, limit: number): Promise<IPageData | null> {
    this.fetchCalls.push({ offset, limit });
    if (this.gate) {
      await this.gate();
    }
    return this.pages.get(offset) || null;
  }
  async fetchStats(): Promise<IStatsData | null> {
    return null;
  }
  stop = (): void => {};
  private _begin: Signal<IQueryModel, void> = new Signal<IQueryModel, void>(this);
  private _finish: Signal<IQueryModel, IQueryStatus> = new Signal<
    IQueryModel,
    IQueryStatus
  >(this);
  get query_begin(): Signal<IQueryModel, void> {
    return this._begin;
  }
  get query_finish(): Signal<IQueryModel, IQueryStatus> {
    return this._finish;
  }
}

function makeSeed(
  pageSize: number,
  totalRows: number,
  cursorExhausted: boolean
): ITableData {
  return {
    columns: ['a', 'b'],
    dtypes: ['number', 'string'],
    stats: [
      { dtype: 'number', count: 1, null_count: 0, distinct: 1, min: 1, max: 1 },
      { dtype: 'string', count: 1, null_count: 0, distinct: 1 }
    ],
    total_rows: totalRows,
    cursor_exhausted: cursorExhausted,
    page_size: pageSize,
    taskid: 't1',
    data: [[1, 'one']]
  };
}

describe('LazyTableModel', () => {
  it('renders two column-header rows (name + stats)', () => {
    const m = new LazyTableModel();
    m.setQuery(makeSeed(10, 1, true), new FakeQueryModel());
    expect(m.rowCount('column-header')).toBe(2);
    expect(m.data('column-header', 0, 0)).toBe('a');
    // Stats row formatted for a numeric column with min/max + μ.
    const stats0 = m.data('column-header', 1, 0) as string;
    expect(stats0).toMatch(/^NUM · /);
    // String column stats.
    const stats1 = m.data('column-header', 1, 1) as string;
    expect(stats1).toMatch(/^TEXT · /);
  });

  it('serves cells from the seeded first page synchronously', () => {
    const m = new LazyTableModel();
    m.setQuery(makeSeed(10, 1, true), new FakeQueryModel());
    expect(m.data('body', 0, 0)).toBe(1);
    expect(m.data('body', 0, 1)).toBe('one');
  });

  it('returns a placeholder on miss and triggers exactly one fetch', async () => {
    const q = new FakeQueryModel();
    q.pages.set(10, { data: [[11, 'eleven'], [12, 'twelve']] });
    const m = new LazyTableModel();
    m.setQuery(makeSeed(10, 100, false), q);

    // Row 10 is the first row of page 10 (page size 10). First call → placeholder.
    const first = m.data('body', 10, 0);
    expect(first).toBe('…');
    // Two synchronous re-asks for cells in the same unloaded page should
    // de-dupe to a single fetchPage call.
    m.data('body', 10, 1);
    m.data('body', 11, 0);
    expect(q.fetchCalls).toEqual([{ offset: 10, limit: 10 }]);

    // Wait for the in-flight fetch to resolve.
    await Promise.resolve();
    await Promise.resolve();
    expect(m.data('body', 10, 0)).toBe(11);
    expect(m.data('body', 10, 1)).toBe('eleven');
    expect(m.data('body', 11, 0)).toBe(12);
  });

  it('emits cells-changed once a page resolves', async () => {
    const q = new FakeQueryModel();
    q.pages.set(0, { data: [[1, 'one'], [2, 'two']] });
    const m = new LazyTableModel();
    // Seed without page 0 so the fetch actually fires.
    m.setQuery(
      {
        columns: ['a', 'b'],
        dtypes: ['number', 'string'],
        total_rows: 2,
        cursor_exhausted: true,
        page_size: 10,
        taskid: 't',
        data: []
      },
      q
    );
    const events: Array<any> = [];
    m.changed.connect((_s, args) => events.push(args));
    m.data('body', 0, 0); // triggers fetch
    await Promise.resolve();
    await Promise.resolve();
    expect(events.some(e => e.type === 'cells-changed')).toBe(true);
  });

  it('discards stale page fetches after setQuery bumps the generation', async () => {
    const q1 = new FakeQueryModel();
    let release: () => void = () => {};
    q1.gate = () => new Promise<void>(r => (release = r));
    q1.pages.set(0, { data: [[99, 'STALE']] });
    const m = new LazyTableModel();
    m.setQuery(
      {
        columns: ['a', 'b'],
        dtypes: ['number', 'string'],
        total_rows: 1,
        cursor_exhausted: true,
        page_size: 10,
        taskid: 't1',
        data: []
      },
      q1
    );
    m.data('body', 0, 0); // start q1 fetch (still gated)
    // Swap to a fresh query before q1 resolves.
    const q2 = new FakeQueryModel();
    m.setQuery(makeSeed(10, 1, true), q2);
    // Release the stale q1 fetch — it should be ignored.
    release();
    await Promise.resolve();
    await Promise.resolve();
    // Cell 0,0 should still be the q2 seed value, not the stale STALE row.
    expect(m.data('body', 0, 0)).toBe(1);
  });

  it('clear() drops all state', () => {
    const m = new LazyTableModel();
    m.setQuery(makeSeed(10, 1, true), new FakeQueryModel());
    m.clear();
    expect(m.rowCount('body')).toBe(0);
    expect(m.columnCount('body')).toBe(0);
  });

  it('formatCount produces k/M suffixes', () => {
    expect(LazyTableModel.formatCount(42)).toBe('42');
    expect(LazyTableModel.formatCount(1500)).toBe('1.5k');
    expect(LazyTableModel.formatCount(1_200_000)).toBe('1.2M');
  });
});
