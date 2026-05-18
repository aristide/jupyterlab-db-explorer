/**
 * DOM-rendered column-profile header strip for the SQL Console results
 * table.
 *
 * Sits above the @lumino/datagrid canvas and shows one card per column —
 * the card's body is one of: a numeric histogram sparkline, a unique-count
 * block (datetime / high-card text), or a categorical top-2 + "Other (n)"
 * list (string with low-to-mid cardinality). The strip scrolls in lockstep
 * with the canvas grid via a message hook on the grid's viewport.
 *
 * Clicks anywhere on a card open the existing per-column popover (sort /
 * filter / top-N) — the parent wires this up via the `onColumnClick`
 * callback.
 */

import { Widget } from '@lumino/widgets';
import { Message, MessageLoop, IMessageHandler } from '@lumino/messaging';
import { DataGrid } from '@lumino/datagrid';

import { ColumnDtype, IColumnStats, IHistogramBin } from '../interfaces';
import { ITopValue } from '../model';
import { LazyTableModel } from './lazyTableModel';

const CARD_WIDTH = 152;

export type ProfileKind =
  | 'num-hist'
  | 'num-degenerate'
  | 'date-uniq'
  | 'cat-bool'
  | 'cat-small'
  | 'cat-uniq'
  | 'empty';

export interface IColumnProfileHeaderOptions {
  /** Called when the user clicks a profile card. Coordinates are in
   *  client space — the popover anchors itself there. */
  onColumnClick: (
    column: string,
    dtype: ColumnDtype,
    x: number,
    y: number
  ) => void;
}

/** Decide what visualization to render for a given column. Keeps the
 *  branching in one place so render code can switch on a single string. */
export function decideProfileKind(
  dtype: ColumnDtype,
  stats: IColumnStats | undefined
): ProfileKind {
  if (!stats || stats.count === 0) {
    return 'empty';
  }
  if (dtype === 'number') {
    return stats.distinct === 1 ? 'num-degenerate' : 'num-hist';
  }
  if (dtype === 'datetime') {
    return 'date-uniq';
  }
  const d = stats.distinct;
  if (d === '1000+' || (typeof d === 'number' && d > 20)) {
    return 'cat-uniq';
  }
  if (typeof d === 'number' && d <= 2) {
    return 'cat-bool';
  }
  return 'cat-small';
}

export class ColumnProfileHeader extends Widget implements IMessageHandler {
  constructor(
    model: LazyTableModel,
    grid: DataGrid,
    options: IColumnProfileHeaderOptions
  ) {
    super({ node: ColumnProfileHeader._createNode() });
    this.addClass('pgw-profstrip');
    this._model = model;
    this._grid = grid;
    this._onColumnClick = options.onColumnClick;
    this._inner = this.node.firstElementChild as HTMLDivElement;

    this._model.changed.connect(this._onModelChanged, this);
    MessageLoop.installMessageHook(this._grid.viewport, this);
    this._render();
    this._syncScroll();
  }

  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._model.changed.disconnect(this._onModelChanged, this);
    MessageLoop.removeMessageHook(this._grid.viewport, this);
    super.dispose();
  }

  /** Message hook on the grid's viewport — fires on every paint/scroll
   *  tick. We read scrollX and translate the inner row. Returns true to
   *  let the grid keep processing the message. */
  messageHook(_handler: IMessageHandler, msg: Message): boolean {
    if (
      msg.type === 'paint-request' ||
      msg.type === 'scroll-request' ||
      msg.type === 'resize'
    ) {
      this._syncScroll();
    }
    return true;
  }

  private _onModelChanged = (
    _sender: LazyTableModel,
    args: { type: string }
  ): void => {
    if (args.type === 'model-reset') {
      this._gen++;
      this._histCache.clear();
      this._topNCache.clear();
      this._render();
      this._syncScroll();
    }
  };

  private _syncScroll(): void {
    this._inner.style.transform = `translateX(${-this._grid.scrollX}px)`;
  }

  private _render(): void {
    const columns = this._model.columns;
    this._inner.innerHTML = '';
    this._inner.style.width = `${columns.length * CARD_WIDTH}px`;
    if (columns.length === 0) {
      return;
    }
    const dtypes = this._model.dtypes;
    const stats = this._model.stats;
    columns.forEach((name, i) => {
      const dtype = (dtypes[i] || 'string') as ColumnDtype;
      const card = this._buildCard(i, name, dtype, stats[i]);
      this._inner.appendChild(card);
    });
  }

  private _buildCard(
    colIndex: number,
    name: string,
    dtype: ColumnDtype,
    stats: IColumnStats | undefined
  ): HTMLDivElement {
    const card = document.createElement('div');
    card.className = 'pgw-prof-card';
    card.addEventListener('click', (e: MouseEvent) => {
      this._onColumnClick(name, dtype, e.clientX, e.clientY);
    });
    const prof = document.createElement('div');
    prof.className = 'pgw-prof';

    const kind = decideProfileKind(dtype, stats);

    prof.appendChild(this._buildHead(name, dtype, kind));
    const viz = document.createElement('div');
    viz.className = 'pgw-prof__viz';
    prof.appendChild(viz);

    switch (kind) {
      case 'num-hist':
        this._buildNumHist(viz, colIndex, name, stats!);
        break;
      case 'num-degenerate':
        this._buildNumDegenerate(viz, stats!);
        break;
      case 'date-uniq':
        this._buildDateUniq(viz, stats!);
        break;
      case 'cat-bool':
        this._buildCatList(viz, colIndex, name, stats!, /* showOther */ false);
        break;
      case 'cat-small':
        this._buildCatList(viz, colIndex, name, stats!, /* showOther */ true);
        break;
      case 'cat-uniq':
        this._buildCatUniq(viz, stats!);
        break;
      case 'empty':
      default:
        this._buildEmpty(viz);
        break;
    }

    card.appendChild(prof);
    return card;
  }

  // ── Head: type-chip + name ──────────────────────────────────────────────
  private _buildHead(
    name: string,
    dtype: ColumnDtype,
    kind: ProfileKind
  ): HTMLDivElement {
    const head = document.createElement('div');
    head.className = 'pgw-prof__head';
    head.appendChild(this._buildTypeIcon(dtype, kind));
    const label = document.createElement('span');
    label.className = 'pgw-prof__name';
    label.textContent = name;
    label.title = name;
    head.appendChild(label);
    return head;
  }

  private _buildTypeIcon(
    dtype: ColumnDtype,
    kind: ProfileKind
  ): HTMLSpanElement {
    const span = document.createElement('span');
    if (dtype === 'datetime') {
      span.className = 'pgw-typeicon pgw-typeicon--date';
      span.setAttribute('aria-label', 'Date');
      span.innerHTML =
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        '<rect x="3.5" y="5" width="13" height="11" rx="1.5"/>' +
        '<path d="M7 3v4M13 3v4M3.5 9h13"/></svg>';
      return span;
    }
    if (dtype === 'number') {
      span.className = 'pgw-typeicon pgw-typeicon--num';
      span.textContent = '#';
      return span;
    }
    // string-typed columns: bool variant only when distinct ≤ 2.
    if (kind === 'cat-bool') {
      span.className = 'pgw-typeicon pgw-typeicon--bool';
      span.setAttribute('aria-label', 'Boolean');
      span.innerHTML =
        '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M3 7h6a3 3 0 010 6H3"/>' +
        '<path d="M11 7h6a3 3 0 110 6h-6"/></svg>';
      return span;
    }
    span.className = 'pgw-typeicon pgw-typeicon--cat';
    span.textContent = 'Aa';
    return span;
  }

  // ── Num histogram ───────────────────────────────────────────────────────
  private _buildNumHist(
    host: HTMLElement,
    colIndex: number,
    name: string,
    stats: IColumnStats
  ): void {
    const spark = document.createElement('div');
    spark.className = 'pgw-spark';
    spark.setAttribute('role', 'img');
    spark.setAttribute('aria-label', `Histogram of ${name}`);
    // Skeleton placeholder: 10 muted bars until the fetch resolves.
    for (let i = 0; i < 10; i++) {
      const bar = document.createElement('span');
      bar.className = 'pgw-spark__bar pgw-spark__bar--skeleton';
      bar.style.height = '40%';
      spark.appendChild(bar);
    }
    host.appendChild(spark);
    host.appendChild(this._buildRange(stats));

    const cached = this._histCache.get(name);
    if (cached) {
      this._paintHist(spark, cached);
      return;
    }
    const myGen = this._gen;
    void this._model.histogram(name, 10).then(bins => {
      if (myGen !== this._gen) {
        return;
      }
      this._histCache.set(name, bins);
      this._paintHist(spark, bins);
    });
  }

  private _paintHist(spark: HTMLElement, bins: IHistogramBin[]): void {
    spark.innerHTML = '';
    if (bins.length === 0) {
      // Treat empty histogram like the degenerate single-bar fallback.
      const bar = document.createElement('span');
      bar.className = 'pgw-spark__bar pgw-spark__bar--muted';
      bar.style.height = '40%';
      spark.appendChild(bar);
      return;
    }
    let maxCount = 0;
    for (const b of bins) {
      if (b.count > maxCount) {
        maxCount = b.count;
      }
    }
    for (const b of bins) {
      const bar = document.createElement('span');
      bar.className = 'pgw-spark__bar';
      const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
      bar.style.height = `${Math.max(2, pct)}%`;
      bar.title = `[${LazyTableModel.formatNum(b.min)} – ${LazyTableModel.formatNum(b.max)}]: ${b.count}`;
      spark.appendChild(bar);
    }
  }

  private _buildRange(stats: IColumnStats): HTMLDivElement {
    const range = document.createElement('div');
    range.className = 'pgw-prof__range';
    const lo = document.createElement('span');
    const hi = document.createElement('span');
    lo.textContent =
      stats.min !== undefined ? LazyTableModel.formatNum(stats.min) : '–';
    hi.textContent =
      stats.max !== undefined ? LazyTableModel.formatNum(stats.max) : '–';
    range.appendChild(lo);
    range.appendChild(hi);
    return range;
  }

  // ── Num degenerate (distinct == 1) ──────────────────────────────────────
  private _buildNumDegenerate(host: HTMLElement, stats: IColumnStats): void {
    const spark = document.createElement('div');
    spark.className = 'pgw-spark';
    const bar = document.createElement('span');
    bar.className = 'pgw-spark__bar';
    bar.style.height = '100%';
    spark.appendChild(bar);
    host.appendChild(spark);
    host.appendChild(this._buildRange(stats));
  }

  // ── Datetime: unique-count + range ──────────────────────────────────────
  private _buildDateUniq(host: HTMLElement, stats: IColumnStats): void {
    const uniq = document.createElement('div');
    uniq.className = 'pgw-uniq';
    const num = document.createElement('span');
    num.className = 'pgw-uniq__num';
    num.textContent =
      typeof stats.distinct === 'number'
        ? LazyTableModel.formatCount(stats.distinct)
        : String(stats.distinct);
    const label = document.createElement('span');
    label.className = 'pgw-uniq__label';
    label.textContent = 'Unique values';
    uniq.appendChild(num);
    uniq.appendChild(label);
    host.appendChild(uniq);

    const range = document.createElement('div');
    range.className = 'pgw-prof__range';
    const lo = document.createElement('span');
    const hi = document.createElement('span');
    lo.textContent = stats.min !== undefined ? String(stats.min) : '–';
    hi.textContent = stats.max !== undefined ? String(stats.max) : '–';
    range.appendChild(lo);
    range.appendChild(hi);
    host.appendChild(range);
  }

  // ── Categorical (top values + optional "Other") ─────────────────────────
  private _buildCatList(
    host: HTMLElement,
    colIndex: number,
    name: string,
    stats: IColumnStats,
    showOther: boolean
  ): void {
    const list = document.createElement('div');
    list.className = 'pgw-catlist';
    // Skeleton rows.
    for (let i = 0; i < 2; i++) {
      list.appendChild(this._buildCatRow('', null, true /* skeleton */));
    }
    host.appendChild(list);

    const cached = this._topNCache.get(name);
    if (cached) {
      this._paintCatList(list, cached, stats, showOther);
      return;
    }
    const myGen = this._gen;
    void this._model.topN(name, 3).then(values => {
      if (myGen !== this._gen) {
        return;
      }
      this._topNCache.set(name, values);
      this._paintCatList(list, values, stats, showOther);
    });
  }

  private _paintCatList(
    list: HTMLElement,
    values: ITopValue[],
    stats: IColumnStats,
    showOther: boolean
  ): void {
    list.innerHTML = '';
    const total = stats.count || 1;
    const taken = values.slice(0, 2);
    let coveredCount = 0;
    let coveredDistinct = 0;
    for (const v of taken) {
      const pct = total > 0 ? (v.count / total) * 100 : 0;
      list.appendChild(
        this._buildCatRow(
          v.value === null ? '(null)' : String(v.value),
          pct,
          false
        )
      );
      coveredCount += v.count;
      coveredDistinct += 1;
    }
    if (showOther && typeof stats.distinct === 'number') {
      const otherDistinct = Math.max(0, stats.distinct - coveredDistinct);
      const otherCount = Math.max(0, total - coveredCount);
      if (otherDistinct > 0) {
        const pct = total > 0 ? (otherCount / total) * 100 : 0;
        const row = this._buildCatRow(`Other (${otherDistinct})`, pct, false);
        row.classList.add('pgw-catrow--other');
        list.appendChild(row);
      }
    } else if (showOther && stats.distinct === '1000+') {
      const pct = total > 0 ? ((total - coveredCount) / total) * 100 : 0;
      const row = this._buildCatRow('Other (1000+)', pct, false);
      row.classList.add('pgw-catrow--other');
      list.appendChild(row);
    }
    if (taken.length === 0) {
      const empty = this._buildCatRow('no values', 0, false);
      empty.classList.add('pgw-catrow--other');
      list.appendChild(empty);
    }
  }

  private _buildCatRow(
    label: string,
    pct: number | null,
    skeleton: boolean
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'pgw-catrow';
    const bar = document.createElement('span');
    bar.className = 'pgw-catrow__bar';
    bar.style.width = skeleton
      ? '50%'
      : `${Math.max(2, Math.min(100, pct || 0))}%`;
    if (skeleton) {
      bar.classList.add('pgw-catrow__bar--skeleton');
    }
    row.appendChild(bar);
    const labelEl = document.createElement('span');
    labelEl.className = 'pgw-catrow__label';
    labelEl.textContent = skeleton ? '' : label;
    if (skeleton) {
      labelEl.classList.add('pgw-catrow__label--skeleton');
    }
    row.appendChild(labelEl);
    const pctEl = document.createElement('span');
    pctEl.className = 'pgw-catrow__pct';
    pctEl.textContent = skeleton || pct === null ? '' : `${Math.round(pct)}%`;
    row.appendChild(pctEl);
    return row;
  }

  // ── High-cardinality text: unique count only ────────────────────────────
  private _buildCatUniq(host: HTMLElement, stats: IColumnStats): void {
    const uniq = document.createElement('div');
    uniq.className = 'pgw-uniq';
    const num = document.createElement('span');
    num.className = 'pgw-uniq__num';
    num.textContent =
      typeof stats.distinct === 'number'
        ? LazyTableModel.formatCount(stats.distinct)
        : String(stats.distinct);
    const label = document.createElement('span');
    label.className = 'pgw-uniq__label';
    label.textContent = 'Unique values';
    uniq.appendChild(num);
    uniq.appendChild(label);
    host.appendChild(uniq);
  }

  // ── Empty placeholder ───────────────────────────────────────────────────
  private _buildEmpty(host: HTMLElement): void {
    const empty = document.createElement('div');
    empty.className = 'pgw-prof__empty';
    empty.textContent = 'no data';
    host.appendChild(empty);
  }

  private static _createNode(): HTMLElement {
    const outer = document.createElement('div');
    const inner = document.createElement('div');
    inner.className = 'pgw-profstrip__inner';
    outer.appendChild(inner);
    return outer;
  }

  private readonly _model: LazyTableModel;
  private readonly _grid: DataGrid;
  private readonly _inner: HTMLDivElement;
  private readonly _onColumnClick: (
    column: string,
    dtype: ColumnDtype,
    x: number,
    y: number
  ) => void;
  private _gen = 0;
  private _histCache = new Map<string, IHistogramBin[]>();
  private _topNCache = new Map<string, ITopValue[]>();
}
