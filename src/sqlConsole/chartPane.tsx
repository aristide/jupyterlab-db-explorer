/**
 * Vega-Lite chart pane for the SQL Console.
 *
 * A small column-shelf authoring UI on the left (X / Y / Color / Aggregate
 * picks) + a Vega-Lite render target on the right. Aggregate specs hit the
 * server's /query/chart endpoint so we GROUP BY in SQL and only ship the
 * post-aggregate rows to the browser; for the small COUNT-by-column case
 * this comfortably handles 100k-row results without choking the renderer.
 */
import { Widget } from '@lumino/widgets';
import embed, { Result, VisualizationSpec } from 'vega-embed';

import { ColumnDtype } from '../interfaces';
import { ChartAggregate, IChartData, IChartSpec, IQueryModel } from '../model';
import { LazyTableModel } from './lazyTableModel';

const MARKS: Array<{ id: string; label: string }> = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'point', label: 'Point' }
];

const AGGREGATES: ChartAggregate[] = ['count', 'sum', 'avg', 'min', 'max'];

export class ChartPane extends Widget {
  constructor() {
    super({ node: document.createElement('div') });
    this.node.className = 'd4n-ch';
    this.addClass('d4n-ch');
    this._build();
  }

  /** Hook the pane up to a freshly-completed query. */
  bind(model: LazyTableModel, qmodel: IQueryModel | null): void {
    this._model = model;
    this._qmodel = qmodel;
    // Pick sensible defaults so the first render isn't empty.
    if (model.columns.length === 0) {
      this._spec = null;
      this._reset();
    } else {
      const numericIdx = model.dtypes.findIndex(d => d === 'number');
      this._spec = {
        x: model.columns[0],
        y: numericIdx >= 0 ? model.columns[numericIdx] : undefined,
        color: undefined,
        aggregate: numericIdx >= 0 ? 'sum' : 'count'
      };
      this._renderShelf();
      void this._renderChart();
    }
  }

  /** Clear current chart + reset to the empty state. */
  clear(): void {
    this._model = null;
    this._qmodel = null;
    this._spec = null;
    this._reset();
  }

  dispose(): void {
    if (this._view) {
      try {
        this._view.finalize();
      } catch {
        /* ignore */
      }
      this._view = null;
    }
    super.dispose();
  }

  // ── Layout ────────────────────────────────────────────────────────────
  private _build(): void {
    this._shelfEl = document.createElement('aside');
    this._shelfEl.className = 'd4n-ch__shelf';
    this._chartEl = document.createElement('div');
    this._chartEl.className = 'd4n-ch__chart';
    this.node.appendChild(this._shelfEl);
    this.node.appendChild(this._chartEl);
    this._reset();
  }

  private _reset(): void {
    this._shelfEl.innerHTML = '';
    this._chartEl.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'd4n-ch__empty';
    empty.textContent = 'Run a query to plot it.';
    this._chartEl.appendChild(empty);
  }

  private _renderShelf(): void {
    if (!this._model || !this._spec) {
      this._reset();
      return;
    }
    const spec = this._spec;
    const columns = this._model.columns;
    const dtypes = this._model.dtypes;
    this._shelfEl.innerHTML = '';

    const title = document.createElement('h3');
    title.className = 'd4n-ch__shelf-title';
    title.textContent = 'Chart';
    this._shelfEl.appendChild(title);

    // Mark
    this._shelfEl.appendChild(this._slot('Mark'));
    const markGroup = document.createElement('div');
    markGroup.className = 'd4n-ch__marks';
    for (const m of MARKS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `d4n-ch__mark${this._mark === m.id ? ' is-active' : ''}`;
      b.textContent = m.label;
      b.onclick = () => {
        this._mark = m.id;
        this._renderShelf();
        void this._renderChart();
      };
      markGroup.appendChild(b);
    }
    this._shelfEl.appendChild(markGroup);

    // X
    this._shelfEl.appendChild(this._slot('X axis'));
    this._shelfEl.appendChild(
      this._colSelect(spec.x, columns, dtypes, val => {
        spec.x = val;
        this._renderShelf();
        void this._renderChart();
      })
    );

    // Aggregate
    this._shelfEl.appendChild(this._slot('Aggregate'));
    const aggSel = document.createElement('select');
    aggSel.className = 'd4n-ch__select';
    for (const a of AGGREGATES) {
      const opt = document.createElement('option');
      opt.value = a;
      opt.textContent = a.toUpperCase();
      if (a === spec.aggregate) {
        opt.selected = true;
      }
      aggSel.appendChild(opt);
    }
    aggSel.onchange = () => {
      spec.aggregate = aggSel.value as ChartAggregate;
      // 'count' doesn't need Y.
      if (spec.aggregate === 'count') {
        spec.y = undefined;
      } else if (!spec.y) {
        const idx = dtypes.findIndex(d => d === 'number');
        spec.y = idx >= 0 ? columns[idx] : columns[0];
      }
      this._renderShelf();
      void this._renderChart();
    };
    this._shelfEl.appendChild(aggSel);

    // Y (hidden for COUNT)
    if (spec.aggregate !== 'count') {
      this._shelfEl.appendChild(this._slot('Y axis'));
      this._shelfEl.appendChild(
        this._colSelect(spec.y || columns[0], columns, dtypes, val => {
          spec.y = val;
          void this._renderChart();
        })
      );
    }

    // Color
    this._shelfEl.appendChild(this._slot('Color'));
    this._shelfEl.appendChild(
      this._colSelect(
        spec.color || '__none__',
        columns,
        dtypes,
        val => {
          spec.color = val === '__none__' ? undefined : val;
          void this._renderChart();
        },
        true
      )
    );
  }

  private _slot(label: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'd4n-ch__slot-label';
    el.textContent = label;
    return el;
  }

  private _colSelect(
    current: string,
    columns: string[],
    dtypes: ColumnDtype[],
    onChange: (v: string) => void,
    allowNone = false
  ): HTMLElement {
    const sel = document.createElement('select');
    sel.className = 'd4n-ch__select';
    if (allowNone) {
      const opt = document.createElement('option');
      opt.value = '__none__';
      opt.textContent = '(none)';
      if (current === '__none__') {
        opt.selected = true;
      }
      sel.appendChild(opt);
    }
    for (let i = 0; i < columns.length; i++) {
      const opt = document.createElement('option');
      opt.value = columns[i];
      opt.textContent = `${columns[i]}  · ${dtypes[i] || 'string'}`;
      if (columns[i] === current) {
        opt.selected = true;
      }
      sel.appendChild(opt);
    }
    sel.onchange = () => onChange(sel.value);
    return sel;
  }

  // ── Render via vega-embed ─────────────────────────────────────────────
  private async _renderChart(): Promise<void> {
    if (!this._spec || !this._qmodel) {
      this._reset();
      return;
    }
    this._chartEl.innerHTML = '';
    const loading = document.createElement('div');
    loading.className = 'd4n-ch__loading';
    loading.textContent = 'Loading…';
    this._chartEl.appendChild(loading);

    const myToken = ++this._renderToken;
    const data: IChartData | null = await this._qmodel.chartData(this._spec);
    if (myToken !== this._renderToken) {
      return; // a newer render came in — discard
    }
    if (!data || !data.rows || data.rows.length === 0) {
      this._chartEl.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'd4n-ch__empty';
      empty.textContent = 'No data for this combination.';
      this._chartEl.appendChild(empty);
      return;
    }

    const xType = this._inferVegaType(this._spec.x);
    const yField = 'y';
    const vlSpec: VisualizationSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      data: { values: data.rows },
      mark: this._mark as 'bar' | 'line' | 'point',
      width: 'container',
      height: 'container',
      autosize: { type: 'fit', contains: 'padding' },
      encoding: {
        x: {
          field: 'x',
          type: xType,
          title: this._spec.x,
          axis: { labelLimit: 80 }
        },
        y: {
          field: yField,
          type: 'quantitative',
          title:
            this._spec.aggregate === 'count'
              ? 'count'
              : `${this._spec.aggregate.toUpperCase()}(${this._spec.y || ''})`
        },
        ...(this._spec.color
          ? {
              color: {
                field: 'color',
                type: 'nominal',
                title: this._spec.color
              }
            }
          : {})
      },
      config: {
        background: 'transparent',
        view: { stroke: 'transparent' },
        axis: {
          labelColor: '#5a6b82',
          titleColor: '#0b1f38',
          titleFont: 'Montserrat',
          titleFontWeight: 600,
          domainColor: '#c8d1dd',
          gridColor: '#e4e9f0'
        },
        range: {
          category: [
            '#0f3d6e',
            '#1fa0a0',
            '#e63558',
            '#fdb813',
            '#7a4fbe',
            '#a91d22',
            '#1f8a5e',
            '#c97c0a'
          ]
        },
        legend: {
          labelColor: '#5a6b82',
          titleColor: '#0b1f38'
        }
      }
    } as VisualizationSpec;

    this._chartEl.innerHTML = '';
    try {
      const result = await embed(this._chartEl, vlSpec, {
        actions: false,
        renderer: 'svg'
      });
      if (this._view) {
        try {
          this._view.finalize();
        } catch {
          /* ignore */
        }
      }
      this._view = result;
    } catch (err) {
      this._chartEl.innerHTML = '';
      const fail = document.createElement('div');
      fail.className = 'd4n-ch__empty';
      const e = err as { message?: string };
      fail.textContent = `Chart error: ${(e && e.message) || String(err)}`;
      this._chartEl.appendChild(fail);
    }
  }

  private _inferVegaType(
    column: string
  ): 'quantitative' | 'temporal' | 'nominal' {
    if (!this._model) {
      return 'nominal';
    }
    const idx = this._model.columns.indexOf(column);
    if (idx < 0) {
      return 'nominal';
    }
    const dt = this._model.dtypes[idx];
    if (dt === 'number') {
      return 'quantitative';
    }
    if (dt === 'datetime') {
      return 'temporal';
    }
    return 'nominal';
  }

  // ── State ─────────────────────────────────────────────────────────────
  private _shelfEl!: HTMLElement;
  private _chartEl!: HTMLElement;
  private _model: LazyTableModel | null = null;
  private _qmodel: IQueryModel | null = null;
  private _spec: IChartSpec | null = null;
  private _mark = 'bar';
  private _view: Result | null = null;
  /** Increments on every render call; in-flight render that no longer
   *  matches gets discarded so we never paint stale data. */
  private _renderToken = 0;
}
