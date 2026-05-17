/**
 * Per-column action popover for the SQL Console result table.
 *
 * Opens on a click in the result grid's column-header region. Hosts three
 * tabs:
 *   - Sort:        ASC / DESC / clear
 *   - Filter:      contains/equals/gt/lt depending on column dtype
 *   - Top values:  lazy-loaded distinct-value counts (top 10)
 *
 * Implemented as a small Lumino `Widget` attached to document.body so it
 * can position itself anywhere in the viewport without being clipped by
 * the DataGrid's overflow constraints. Outside-click / Escape dismiss.
 */
import { Widget } from '@lumino/widgets';
import { Signal, ISignal } from '@lumino/signaling';

import { ColumnDtype, IColumnStats } from '../interfaces';
import { IFilterSpec, ITopValue, SortDirection } from '../model';

export interface IColumnPopoverContext {
  column: string;
  dtype: ColumnDtype;
  stats?: IColumnStats;
  /** Current sort state for this column, if any. */
  activeSort: SortDirection | null;
  /** Current filter for this column, if any. */
  activeFilter: IFilterSpec | null;
  /** Lazy loader for the Top values tab. */
  topN: (column: string) => Promise<ITopValue[]>;
}

export type PopoverAction =
  | { kind: 'sort'; direction: SortDirection | null }
  | { kind: 'filter'; filter: IFilterSpec | null }
  | { kind: 'apply-value'; column: string; value: any };

export class ColumnHeaderPopover extends Widget {
  constructor() {
    super({ node: document.createElement('div') });
    this.node.className = 'd4n-cp';
    this.addClass('d4n-cp');
  }

  get action(): ISignal<this, PopoverAction> {
    return this._action;
  }

  /** Open the popover, anchored at (x, y) in client coordinates. */
  open(ctx: IColumnPopoverContext, x: number, y: number): void {
    this._ctx = ctx;
    this._activeTab = 'sort';
    this._renderTabs();
    this.node.style.position = 'fixed';
    this.node.style.left = `${Math.max(8, Math.min(x, window.innerWidth - 280))}px`;
    this.node.style.top = `${Math.max(8, Math.min(y, window.innerHeight - 300))}px`;
    this.node.style.zIndex = '1000';
    if (!this.isAttached) {
      Widget.attach(this, document.body);
    }
    document.addEventListener('mousedown', this._onOutsideClick, true);
    document.addEventListener('keydown', this._onKey, true);
  }

  close(): void {
    document.removeEventListener('mousedown', this._onOutsideClick, true);
    document.removeEventListener('keydown', this._onKey, true);
    if (this.isAttached) {
      Widget.detach(this);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────
  private _renderTabs(): void {
    if (!this._ctx) {
      return;
    }
    const ctx = this._ctx;
    this.node.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'd4n-cp__header';
    const title = document.createElement('div');
    title.className = 'd4n-cp__title';
    title.textContent = ctx.column;
    const subtitle = document.createElement('div');
    subtitle.className = 'd4n-cp__subtitle';
    subtitle.textContent = ctx.dtype.toUpperCase();
    header.appendChild(title);
    header.appendChild(subtitle);
    this.node.appendChild(header);

    const tabs = document.createElement('div');
    tabs.className = 'd4n-cp__tabs';
    const mkTab = (id: typeof this._activeTab, label: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `d4n-cp__tab${this._activeTab === id ? ' is-active' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        this._activeTab = id;
        this._renderTabs();
      };
      return b;
    };
    tabs.appendChild(mkTab('sort', 'Sort'));
    tabs.appendChild(mkTab('filter', 'Filter'));
    tabs.appendChild(mkTab('topn', 'Top values'));
    this.node.appendChild(tabs);

    const body = document.createElement('div');
    body.className = 'd4n-cp__body';
    if (this._activeTab === 'sort') {
      this._renderSort(body, ctx);
    } else if (this._activeTab === 'filter') {
      this._renderFilter(body, ctx);
    } else {
      this._renderTopN(body, ctx);
    }
    this.node.appendChild(body);
  }

  private _renderSort(host: HTMLElement, ctx: IColumnPopoverContext): void {
    const buttons: Array<[string, SortDirection | null]> = [
      ['Ascending', 'ASC'],
      ['Descending', 'DESC'],
      ['Clear sort', null]
    ];
    for (const [label, dir] of buttons) {
      const b = document.createElement('button');
      b.type = 'button';
      const active = ctx.activeSort === dir;
      b.className = `d4n-cp__row${active ? ' is-active' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        this._emit({ kind: 'sort', direction: dir });
        this.close();
      };
      host.appendChild(b);
    }
  }

  private _renderFilter(host: HTMLElement, ctx: IColumnPopoverContext): void {
    const dtype = ctx.dtype;
    const isNumeric = dtype === 'number';
    const opOptions: Array<[string, IFilterSpec['op']]> = isNumeric
      ? [
          ['equals', 'equals'],
          ['>', 'gt'],
          ['<', 'lt']
        ]
      : [
          ['contains', 'contains'],
          ['equals', 'equals']
        ];
    const initialOp: IFilterSpec['op'] =
      ctx.activeFilter?.op ?? (isNumeric ? 'equals' : 'contains');
    const initialValue =
      ctx.activeFilter?.value !== undefined
        ? String(ctx.activeFilter.value)
        : '';

    const opSelectWrap = document.createElement('div');
    opSelectWrap.className = 'd4n-cp__row';
    const opSelect = document.createElement('select');
    opSelect.className = 'd4n-cp__select';
    for (const [label, val] of opOptions) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (val === initialOp) {
        opt.selected = true;
      }
      opSelect.appendChild(opt);
    }
    opSelectWrap.appendChild(opSelect);
    host.appendChild(opSelectWrap);

    const input = document.createElement('input');
    input.type = isNumeric ? 'number' : 'text';
    input.className = 'd4n-cp__input';
    input.value = initialValue;
    input.placeholder = isNumeric ? 'value' : 'substring…';
    host.appendChild(input);

    const actions = document.createElement('div');
    actions.className = 'd4n-cp__actions';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'd4n-cp__btn d4n-cp__btn--primary';
    applyBtn.textContent = 'Apply';
    applyBtn.onclick = () => {
      const raw = input.value.trim();
      if (raw === '') {
        // Empty value with apply → clear.
        this._emit({ kind: 'filter', filter: null });
      } else {
        const value: any = isNumeric ? Number(raw) : raw;
        this._emit({
          kind: 'filter',
          filter: {
            column: ctx.column,
            op: opSelect.value as IFilterSpec['op'],
            value
          }
        });
      }
      this.close();
    };
    actions.appendChild(applyBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'd4n-cp__btn';
    clearBtn.textContent = 'Clear';
    clearBtn.onclick = () => {
      this._emit({ kind: 'filter', filter: null });
      this.close();
    };
    actions.appendChild(clearBtn);
    host.appendChild(actions);
    input.focus();
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        applyBtn.click();
      }
    });
  }

  private _renderTopN(host: HTMLElement, ctx: IColumnPopoverContext): void {
    const loading = document.createElement('div');
    loading.className = 'd4n-cp__loading';
    loading.textContent = 'Loading…';
    host.appendChild(loading);
    ctx
      .topN(ctx.column)
      .then(values => {
        host.innerHTML = '';
        if (values.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'd4n-cp__empty';
          empty.textContent = 'No values';
          host.appendChild(empty);
          return;
        }
        const list = document.createElement('ul');
        list.className = 'd4n-cp__topn';
        for (const v of values) {
          const li = document.createElement('li');
          li.className = 'd4n-cp__topn-row';
          li.onclick = () => {
            this._emit({
              kind: 'apply-value',
              column: ctx.column,
              value: v.value
            });
            this.close();
          };
          const val = document.createElement('span');
          val.className = 'd4n-cp__topn-val';
          val.textContent = v.value === null ? '(null)' : String(v.value);
          const cnt = document.createElement('span');
          cnt.className = 'd4n-cp__topn-cnt';
          cnt.textContent = String(v.count);
          li.appendChild(val);
          li.appendChild(cnt);
          list.appendChild(li);
        }
        host.appendChild(list);
      })
      .catch(err => {
        host.innerHTML = '';
        const fail = document.createElement('div');
        fail.className = 'd4n-cp__empty';
        fail.textContent = `Failed: ${err?.message || err}`;
        host.appendChild(fail);
      });
  }

  // ── Dismiss ──────────────────────────────────────────────────────────
  private _onOutsideClick = (ev: MouseEvent): void => {
    if (!this.node.contains(ev.target as Node)) {
      this.close();
    }
  };

  private _onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') {
      this.close();
    }
  };

  private _emit(action: PopoverAction): void {
    this._action.emit(action);
  }

  private _ctx: IColumnPopoverContext | null = null;
  private _activeTab: 'sort' | 'filter' | 'topn' = 'sort';
  private _action = new Signal<this, PopoverAction>(this);
}
