import { IDisposable } from '@lumino/disposable';
import {
  ITranslator,
  nullTranslator,
  TranslationBundle
} from '@jupyterlab/translation';
import { CommandRegistry } from '@lumino/commands';
import { copyIcon } from '@jupyterlab/ui-components';
import { Menu } from '@lumino/widgets';

import {
  DataGrid,
  TextRenderer,
  BasicKeyHandler,
  BasicMouseHandler,
  BasicSelectionModel
} from '@lumino/datagrid';

import { LazyTableModel } from './lazyTableModel';
import {
  ColumnHeaderPopover,
  IColumnPopoverContext,
  PopoverAction
} from './columnHeaderPopover';
import { IFilterSpec } from '../model';
import { ColumnDtype } from '../interfaces';

export { LazyTableModel } from './lazyTableModel';

namespace CommandIds {
  export const copyToClipboard = 'copy-selection-to-clipboard';
}

namespace Table {
  export interface IOptions {
    translator?: ITranslator;
  }
}

export class Table implements IDisposable {
  constructor(model: LazyTableModel, options?: Table.IOptions) {
    const translator = options?.translator || nullTranslator;
    const trans = translator?.load('jupyterlab_db_explorer');

    this._grid = new DataGrid({
      defaultSizes: {
        rowHeight: 28,
        columnWidth: 152,
        rowHeaderWidth: 0,
        // Canvas headers are hidden — the DOM column-profile strip handles
        // them. Zero out both budgets so no blank band paints and the
        // body's left edge aligns with the first profile card.
        columnHeaderHeight: 0
      },
      headerVisibility: 'none'
    });

    this.theme = 'light';

    this._model = model;
    this._grid.dataModel = model;
    this._grid.keyHandler = new BasicKeyHandler();
    this._grid.mouseHandler = new BasicMouseHandler();
    this._grid.selectionModel = new BasicSelectionModel({ dataModel: model });
    this._grid.node.addEventListener('contextmenu', this._onContextMenu);
    this._popover = new ColumnHeaderPopover();
    this._popover.action.connect(this._onPopoverAction, this);
    this._contextMenu = this._createContextMenu(trans);
  }

  /** Open the popover for the given column at the given client position.
   *  Used by the DOM column-profile strip — the canvas grid no longer
   *  paints headers so there's no in-canvas click handler. */
  openPopoverFor(
    column: string,
    dtype: ColumnDtype,
    x: number,
    y: number
  ): void {
    const colIdx = this._model.columns.indexOf(column);
    if (colIdx < 0) {
      return;
    }
    this._lastPopoverColumn = column;
    const activeSort =
      this._model.activeSort && this._model.activeSort.column === column
        ? this._model.activeSort.direction
        : null;
    const activeFilter =
      this._model.activeFilters.find(f => f.column === column) || null;
    const ctx: IColumnPopoverContext = {
      column,
      dtype: dtype || this._model.dtypes[colIdx] || 'string',
      stats: this._model.stats[colIdx],
      activeSort,
      activeFilter,
      topN: c => this._model.topN(c, 10)
    };
    this._popover.open(ctx, x, y);
  }

  private _onPopoverAction = (
    _sender: ColumnHeaderPopover,
    action: PopoverAction
  ): void => {
    if (action.kind === 'sort') {
      void this._model.applySort(
        action.direction === null
          ? null
          : this._model.activeSort?.column ||
              this._popoverColumnFromLastOpen() ||
              null,
        action.direction || 'ASC'
      );
    } else if (action.kind === 'filter') {
      const filters = this._model.activeFilters.slice();
      if (action.filter) {
        // Replace any existing filter on the same column.
        const idx = filters.findIndex(f => f.column === action.filter!.column);
        if (idx >= 0) {
          filters[idx] = action.filter;
        } else {
          filters.push(action.filter);
        }
      } else {
        // Filter cleared — drop whichever filter was active for that column.
        // We don't have a direct column hint here, so we look back at the
        // popover's context (the popover only clears on its own column).
        const ctxCol = this._popoverColumnFromLastOpen();
        if (ctxCol) {
          const idx = filters.findIndex(f => f.column === ctxCol);
          if (idx >= 0) {
            filters.splice(idx, 1);
          }
        }
      }
      void this._model.applyFilters(filters);
    } else if (action.kind === 'apply-value') {
      // "Click a top value" → adds an equality filter for that column.
      const existing = this._model.activeFilters.slice();
      const newFilter: IFilterSpec = {
        column: action.column,
        op: 'equals',
        value: action.value
      };
      const idx = existing.findIndex(f => f.column === action.column);
      if (idx >= 0) {
        existing[idx] = newFilter;
      } else {
        existing.push(newFilter);
      }
      void this._model.applyFilters(existing);
    }
  };

  private _popoverColumnFromLastOpen(): string | null {
    return this._lastPopoverColumn;
  }

  private _createContextMenu(trans: TranslationBundle): Menu {
    const commands = new CommandRegistry();
    commands.addCommand(CommandIds.copyToClipboard, {
      label: trans.__('Copy Selection'),
      icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: () => this._copySelectionToClipboard()
    });
    const menu = new Menu({ commands });
    menu.addItem({ command: CommandIds.copyToClipboard });
    return menu;
  }

  private _copySelectionToClipboard(): void {
    this._grid.copyToClipboard();
  }

  private _onContextMenu = (event: MouseEvent) => {
    const { clientX, clientY } = event;
    this._contextMenu.open(clientX, clientY);
    event.preventDefault();
  };

  set theme(th: string) {
    const isDark = th === 'dark';
    this._grid.style = isDark ? Private.DARK_STYLE : Private.LIGHT_STYLE;
    const textColor = isDark ? '#E5E7EB' : '#0B1F38';
    const mutedColor = isDark ? '#8A929E' : '#5A6B82';
    const bodyFont = "13px 'Roboto', system-ui, sans-serif";
    const monoFont = "12.5px 'JetBrains Mono', ui-monospace, monospace";
    const renderer = new TextRenderer({
      textColor: ({ column }) => {
        const dt = this._model.dtypes[column];
        return dt === 'datetime' ? mutedColor : textColor;
      },
      horizontalAlignment: ({ column }) => {
        return this._model.dtypes[column] === 'number' ? 'right' : 'left';
      },
      font: ({ column }) => {
        const dt = this._model.dtypes[column];
        return dt === 'number' || dt === 'datetime' ? monoFont : bodyFont;
      }
    });
    const rowHeader = new TextRenderer({
      textColor: mutedColor,
      font: monoFont
    });
    this._grid.cellRenderers.update({
      body: renderer,
      'column-header': renderer,
      'corner-header': renderer,
      'row-header': rowHeader
    });
  }

  set dataModel(model: LazyTableModel) {
    this._model = model;
    this._grid.dataModel = model;
    this._grid.selectionModel = new BasicSelectionModel({ dataModel: model });
  }

  get widget(): DataGrid {
    return this._grid;
  }

  get grid(): DataGrid {
    return this._grid;
  }

  get model(): LazyTableModel {
    return this._model;
  }

  get selection(): Array<any> {
    return [];
  }

  get isDisposed(): boolean {
    return this._grid.isDisposed;
  }

  dispose(): void {
    this._grid.node.removeEventListener('contextmenu', this._onContextMenu);
    this._popover.close();
    this._grid.dispose();
  }

  private readonly _grid: DataGrid;
  private readonly _contextMenu: Menu;
  private readonly _popover: ColumnHeaderPopover;
  private _model: LazyTableModel;
  private _lastPopoverColumn: string | null = null;
}

/**
 * A namespace for private data.
 */
namespace Private {
  /**
   * The light theme for the data grid — aligned with the pgw token palette.
   * Backgrounds, grid lines, and row-header chrome match the DOM strip.
   */
  export const LIGHT_STYLE: DataGrid.Style = {
    ...DataGrid.defaultStyle,
    voidColor: '#F4F6FA',
    backgroundColor: '#FFFFFF',
    headerBackgroundColor: '#F4F6FA',
    gridLineColor: 'rgba(15, 61, 110, 0.06)',
    headerGridLineColor: 'rgba(15, 61, 110, 0.08)',
    rowBackgroundColor: () => '#FFFFFF'
  };

  /**
   * The dark theme for the data grid — JupyterLab dark-mode values.
   */
  export const DARK_STYLE: DataGrid.Style = {
    ...DataGrid.defaultStyle,
    voidColor: '#181D21',
    backgroundColor: '#1F2429',
    headerBackgroundColor: '#181D21',
    gridLineColor: 'rgba(255, 255, 255, 0.06)',
    headerGridLineColor: 'rgba(255, 255, 255, 0.10)',
    rowBackgroundColor: () => '#1F2429'
  };
}
