import * as React from 'react';
import { Signal } from '@lumino/signaling';
import { Menu } from '@lumino/widgets';
import { CommandRegistry } from '@lumino/commands';
import { Clipboard, showDialog, Dialog } from '@jupyterlab/apputils';
import { copyIcon, clearIcon } from '@jupyterlab/ui-components';

import { SqlModel, QueryModel, getSqlModel } from '../model';
import { IDbItem, ConnType } from '../interfaces';
import { IJpServices } from '../JpServices';
import { queryIcon, deleteIcon } from '../icons';
import { newSqlConsole } from '../sqlConsole';
import { buildVisibleRows, TreeRow, pathKey } from './treeModel';

// Brand-logo SVGs used as masked glyphs on the colored connection swatch.
import postgresSvg from '../../style/db-icons/postgresql.svg';
import mysqlBrandSvg from '../../style/db-icons/mysql.svg';
import sqliteBrandSvg from '../../style/db-icons/sqlite.svg';
import oracleBrandSvg from '../../style/db-icons/oracle.svg';
import hiveBrandSvg from '../../style/db-icons/apachehive.svg';
import trinoBrandSvg from '../../style/db-icons/trino.svg';
import starrocksBrandSvg from '../../style/db-icons/starrocks.svg';
import sqlserverBrandSvg from '../../style/db-icons/microsoftsqlserver.svg';

export interface IDbTreeProps {
  model: SqlModel;
  jp_services: IJpServices;
  /** Called when the user clicks the "Add new connection" toolbar button. */
  onAddConn: () => void;
}

interface IDbTreeState {
  filter: string;
  expanded: Set<string>;
  loading: Set<string>;
  errorKeys: Set<string>;
  selectedKey?: string;
  selectedPath: IDbItem[];
  refreshing: boolean;
  /** Bumped on every external model mutation so the render re-pulls the
   *  latest state. The model mutates IDbItem.next in place which React can't
   *  observe directly. */
  tick: number;
}

// ─── DB type catalog (brand swatches mirror ConnectionForm + design) ──────
type DbCatalogEntry = { swatch: string; mono: string; brandSvg: string };
const DB_CATALOG: Record<number, DbCatalogEntry> = {
  [ConnType.DB_MYSQL]: { swatch: '#E48E00', mono: 'MY', brandSvg: mysqlBrandSvg },
  [ConnType.DB_PGSQL]: { swatch: '#336791', mono: 'PG', brandSvg: postgresSvg },
  [ConnType.DB_ORACLE]: { swatch: '#C74634', mono: 'OR', brandSvg: oracleBrandSvg },
  [ConnType.DB_HIVE_LDAP]: { swatch: '#FDB813', mono: 'HV', brandSvg: hiveBrandSvg },
  [ConnType.DB_HIVE_KERBEROS]: { swatch: '#FDB813', mono: 'HV', brandSvg: hiveBrandSvg },
  [ConnType.DB_SQLITE]: { swatch: '#003B57', mono: 'SQ', brandSvg: sqliteBrandSvg },
  [ConnType.DB_TRINO]: { swatch: '#DD00A1', mono: 'TR', brandSvg: trinoBrandSvg },
  [ConnType.DB_STARROCKS]: { swatch: '#1FA0A0', mono: 'SR', brandSvg: starrocksBrandSvg },
  [ConnType.DB_SQLSERVER]: { swatch: '#A91D22', mono: 'MS', brandSvg: sqlserverBrandSvg }
};

const DB_LABEL: Record<number, string> = {
  [ConnType.DB_MYSQL]: 'MySQL',
  [ConnType.DB_PGSQL]: 'PostgreSQL',
  [ConnType.DB_ORACLE]: 'Oracle',
  [ConnType.DB_HIVE_LDAP]: 'Hive (LDAP)',
  [ConnType.DB_HIVE_KERBEROS]: 'Hive (Kerberos)',
  [ConnType.DB_SQLITE]: 'SQLite',
  [ConnType.DB_TRINO]: 'Trino',
  [ConnType.DB_STARROCKS]: 'StarRocks',
  [ConnType.DB_SQLSERVER]: 'SQL Server'
};

function svgToDataUrl(svg: string): string {
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

// Pre-compute brand-SVG data URLs once at module load.
const DB_GLYPH_URL: Record<number, string> = Object.fromEntries(
  Object.entries(DB_CATALOG).map(([k, v]) => [k, svgToDataUrl(v.brandSvg)])
) as Record<number, string>;

// ─── Inline SVG glyphs (ported from the design's <Icon name=…/>) ──────────
type GlyphName =
  | 'chev'
  | 'search'
  | 'close'
  | 'refresh'
  | 'add-conn'
  | 'folder'
  | 'schema'
  | 'table'
  | 'view'
  | 'column'
  | 'spinner'
  | 'warning';

function Glyph({
  name,
  size = 16
}: {
  name: GlyphName;
  size?: number;
}): React.ReactElement {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 20 20',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  };
  switch (name) {
    case 'chev':
      return (
        <svg {...common}>
          <path d="M6 8l4 4 4-4" />
        </svg>
      );
    case 'search':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="5.2" />
          <path d="M13 13l3.5 3.5" />
        </svg>
      );
    case 'close':
      return (
        <svg {...common}>
          <path d="M5 5l10 10M15 5L5 15" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M3 10a7 7 0 0112-4.9L17 8" />
          <path d="M17 3v5h-5" />
        </svg>
      );
    case 'add-conn':
      return (
        <svg {...common}>
          <ellipse cx="8" cy="5" rx="4.5" ry="1.6" />
          <path d="M3.5 5v8c0 .9 2 1.6 4.5 1.6" />
          <path d="M3.5 9c0 .9 2 1.6 4.5 1.6" />
          <circle cx="14.5" cy="13.5" r="3.5" />
          <path d="M14.5 12v3M13 13.5h3" />
        </svg>
      );
    case 'folder':
      return (
        <svg {...common}>
          <path d="M3 6.5C3 5.7 3.7 5 4.5 5h3l1.5 1.5h6.5c.8 0 1.5.7 1.5 1.5v6.5c0 .8-.7 1.5-1.5 1.5h-11C3.7 16 3 15.3 3 14.5v-8z" />
        </svg>
      );
    case 'schema':
      return (
        <svg {...common}>
          <ellipse cx="10" cy="5" rx="5.5" ry="2" />
          <path d="M4.5 5v10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2V5" />
          <path d="M4.5 10c0 1.1 2.46 2 5.5 2s5.5-.9 5.5-2" />
        </svg>
      );
    case 'table':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="13" height="11" rx="1.2" />
          <path d="M3.5 8.5h13M3.5 12h13M8 4.5v11M13 4.5v11" />
        </svg>
      );
    case 'view':
      return (
        <svg {...common}>
          <rect x="3.5" y="4.5" width="13" height="11" rx="1.2" />
          <path d="M6 8h8M6 11h8M6 14h5" />
        </svg>
      );
    case 'column':
      return (
        <svg {...common}>
          <path d="M5 4v12M10 4v12M15 4v12" />
        </svg>
      );
    case 'spinner':
      return (
        <svg {...common}>
          <path d="M10 2a8 8 0 018 8" strokeWidth={2} />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M10 3l8 14H2l8-14z" />
          <path d="M10 8v4M10 14.5v.5" />
        </svg>
      );
    default:
      return <svg {...common} />;
  }
}

// ─── Filter-match highlighting in labels ───────────────────────────────────
function Highlight({
  text,
  query
}: {
  text: string;
  query: string;
}): React.ReactElement {
  if (!query) {
    return <>{text}</>;
  }
  const q = query.trim();
  if (!q) {
    return <>{text}</>;
  }
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) {
    return <>{text}</>;
  }
  return (
    <>
      {text.slice(0, idx)}
      <span className="d4n-tv__hit">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
}

export class DbTree extends React.Component<IDbTreeProps, IDbTreeState> {
  constructor(props: IDbTreeProps) {
    super(props);
    this.state = {
      filter: '',
      expanded: new Set(),
      loading: new Set(),
      errorKeys: new Set(),
      selectedPath: [],
      refreshing: false,
      tick: 0
    };
  }

  async componentDidMount(): Promise<void> {
    const { model } = this.props;
    model.passwd_settled.connect(this._onPasswdSettled, this);
    model.conn_changed.connect(this._onConnChanged, this);

    await model.init();
    await this._safeLoad([]);
    this._bump();
  }

  componentWillUnmount(): void {
    Signal.clearData(this);
  }

  render(): React.ReactElement {
    const { model, jp_services } = this.props;
    const { trans } = jp_services;
    const {
      filter,
      expanded,
      loading,
      errorKeys,
      selectedKey,
      refreshing
    } = this.state;
    const rows = buildVisibleRows(
      model,
      this._effectiveExpanded(expanded, filter),
      loading,
      errorKeys,
      filter.toLowerCase()
    );
    const connCount = model.get_list([]).length;
    const matchCount = filter ? this._countMatches(rows, filter) : 0;

    return (
      <section className="d4n-tv d4n-tv--refined d4n-tv--comfortable-density d4n-tv--guides">
        <header className="d4n-tv__header">
          <div className="d4n-tv__header-row">
            <div className="d4n-tv__icon">
              <Glyph name="schema" size={18} />
            </div>
            <div className="d4n-tv__titles">
              <h2 className="d4n-tv__title">{trans.__('Databases')}</h2>
              <p className="d4n-tv__subtitle">
                <span
                  className={`d4n-tv__pulse ${refreshing ? 'is-loading' : ''}`}
                  aria-hidden="true"
                />
                {refreshing
                  ? trans.__('Refreshing…')
                  : `${connCount} ${connCount === 1 ? trans.__('connection') : trans.__('connections')}`}
              </p>
            </div>
          </div>
        </header>

        <div className="d4n-tv__toolbar">
          <div className="d4n-tv__filter">
            <span className="d4n-tv__filter-icon">
              <Glyph name="search" size={14} />
            </span>
            <input
              type="text"
              placeholder={trans.__('filter by name')}
              value={filter}
              onChange={this._setFilter}
              aria-label={trans.__('Filter tree')}
            />
            {filter && (
              <>
                <span className="d4n-tv__filter-count">{matchCount}</span>
                <button
                  type="button"
                  className="d4n-tv__filter-clear"
                  aria-label={trans.__('Clear filter')}
                  onClick={this._clearFilter}
                >
                  <Glyph name="close" size={12} />
                </button>
              </>
            )}
          </div>
          <span className="d4n-tv__actions">
            <button
              type="button"
              className="d4n-tv-iconbtn"
              aria-label={trans.__('Add new connection')}
              title={trans.__('Add new connection')}
              onClick={this.props.onAddConn}
            >
              <Glyph name="add-conn" size={16} />
            </button>
            <button
              type="button"
              className={`d4n-tv-iconbtn ${refreshing ? 'is-spinning' : ''}`}
              aria-label={trans.__('Refresh')}
              title={trans.__('Refresh')}
              onClick={() => this.refreshSelected()}
            >
              <Glyph name="refresh" size={14} />
            </button>
          </span>
        </div>

        <div
          className="d4n-tv__scroll"
          role="tree"
          aria-label={trans.__('Database connections')}
        >
          {rows.length === 0 ? (
            <div className="d4n-tv__empty">
              <strong>
                {filter ? trans.__('No matches') : trans.__('No connections')}
              </strong>
              {filter
                ? trans.__('Nothing in this tree matches "%1".', filter)
                : trans.__(
                    'Use the + button above to add a database connection.'
                  )}
            </div>
          ) : (
            rows.map(row => this._renderRow(row, selectedKey, filter))
          )}
        </div>
      </section>
    );
  }

  /** Public — called by SqlPanel's Refresh toolbar button if it holds a ref.
   *  Also bound to our own internal Refresh button. */
  refreshSelected = async (): Promise<void> => {
    const { model } = this.props;
    const { selectedPath } = this.state;
    this.setState({ refreshing: true });
    try {
      if (selectedPath.length === 0) {
        model.refresh([]);
        this.setState({ expanded: new Set(), errorKeys: new Set() });
        await this._safeLoad([]);
      } else {
        model.refresh(selectedPath);
        const key = pathKey(selectedPath);
        const errorKeys = new Set(this.state.errorKeys);
        errorKeys.delete(key);
        this.setState({ errorKeys });
        await this._safeLoad(selectedPath);
      }
    } finally {
      this.setState({ refreshing: false });
      this._bump();
    }
  };

  private _effectiveExpanded(expanded: Set<string>, filter: string): Set<string> {
    // When filtering, force-open all loaded nodes so matches surface without
    // requiring manual expansion. buildVisibleRows still drives visibility
    // off node-matching logic, so non-matching subtrees stay hidden.
    if (!filter) {
      return expanded;
    }
    return expanded;
  }

  private _countMatches(rows: TreeRow[], filter: string): number {
    const q = filter.toLowerCase();
    let n = 0;
    for (const r of rows) {
      if (
        r.kind === 'real' &&
        r.item &&
        (r.item.name.toLowerCase().includes(q) ||
          (r.item.desc && r.item.desc.toLowerCase().includes(q)))
      ) {
        n++;
      }
    }
    return n;
  }

  private _setFilter = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    this.setState({ filter: ev.target.value });
  };

  private _clearFilter = (): void => {
    this.setState({ filter: '' });
  };

  private _renderRow(
    row: TreeRow,
    selectedKey: string | undefined,
    filter: string
  ): React.ReactElement {
    const isSelected = selectedKey === row.pathKey;
    const classBase = `d4n-tv__row is-${this._rowTypeClass(row)}`;
    const cls = `${classBase}${isSelected ? ' is-selected' : ''}`;
    const isLeaf = !row.hasChildren;
    return (
      <div
        key={row.pathKey}
        className={cls}
        role="treeitem"
        aria-expanded={isLeaf ? undefined : row.isOpen}
        aria-selected={isSelected}
        onClick={this._onRowClick(row)}
        onContextMenu={this._onRowContextMenu(row)}
        title={this._rowTitle(row)}
      >
        <span className="d4n-tv__indent" aria-hidden="true">
          {Array.from({ length: row.depth }).map((_, i) => (
            <span className="d4n-tv__rail" key={i} />
          ))}
        </span>

        <button
          type="button"
          className={`d4n-tv__twisty${!row.isOpen ? ' is-collapsed' : ''}${isLeaf ? ' is-leaf' : ''}`}
          onClick={this._onTwistyClick(row)}
          aria-label={isLeaf ? '' : row.isOpen ? 'Collapse' : 'Expand'}
          tabIndex={-1}
        >
          <Glyph name="chev" size={12} />
        </button>

        {this._renderGlyph(row)}

        <span className="d4n-tv__label">
          {row.kind === 'group' || row.kind === 'empty' ? (
            row.label || ''
          ) : row.item ? (
            <Highlight text={row.item.name} query={filter} />
          ) : (
            ''
          )}
        </span>

        {row.kind === 'real' && row.item?.type === 'conn' && row.item.desc && (
          <span className="d4n-tv__sublabel">{row.item.desc}</span>
        )}

        {row.kind === 'real' && row.item?.type === 'col' && row.item.desc && (
          <span className="d4n-tv__col-type">{row.item.desc}</span>
        )}

        {row.isLoading && (
          <span
            className="d4n-tv__nicon"
            style={{ marginLeft: 'auto', width: 14, height: 14 }}
          >
            <Glyph name="spinner" size={12} />
          </span>
        )}
        {row.isError && !row.isLoading && (
          <span
            className="d4n-tv__nicon"
            style={{ marginLeft: 'auto', color: 'var(--tv-danger)' }}
            title="Load failed — right-click to retry"
          >
            <Glyph name="warning" size={12} />
          </span>
        )}
      </div>
    );
  }

  private _rowTypeClass(row: TreeRow): string {
    if (row.kind === 'group') {
      return 'folder';
    }
    if (row.kind === 'empty') {
      return 'folder';
    }
    if (row.kind === 'error') {
      return 'folder';
    }
    if (!row.item) {
      return 'folder';
    }
    switch (row.item.type) {
      case 'conn':
        return 'conn';
      case 'db':
        return 'schema';
      case 'table':
        return row.item.subtype === 'V' ? 'view' : 'table';
      case 'col':
        return 'column';
      default:
        return 'folder';
    }
  }

  private _renderGlyph(row: TreeRow): React.ReactElement {
    if (row.kind === 'group' || row.kind === 'empty') {
      return (
        <span className="d4n-tv__nicon d4n-tv__nicon--folder">
          <Glyph name="folder" size={14} />
        </span>
      );
    }
    if (!row.item) {
      return <span className="d4n-tv__nicon" />;
    }
    const item = row.item;
    if (item.type === 'conn') {
      const subtype = (item.subtype as ConnType) || ConnType.DB_MYSQL;
      const cat = DB_CATALOG[subtype];
      const glyphUrl = DB_GLYPH_URL[subtype];
      return (
        <span
          className="d4n-tv__nicon d4n-tv__nicon--conn"
          style={{ background: cat?.swatch || 'var(--d4n-slate)' }}
        >
          {glyphUrl ? (
            <span
              className="d4n-tv__conn-glyph"
              style={{ ['--db-icon' as string]: glyphUrl }}
            />
          ) : (
            <span className="d4n-tv__conn-mono">{cat?.mono || '??'}</span>
          )}
        </span>
      );
    }
    if (item.type === 'db') {
      return (
        <span className="d4n-tv__nicon d4n-tv__nicon--schema">
          <Glyph name="schema" size={15} />
        </span>
      );
    }
    if (item.type === 'table') {
      if (item.subtype === 'V') {
        return (
          <span className="d4n-tv__nicon d4n-tv__nicon--view">
            <Glyph name="view" size={14} />
          </span>
        );
      }
      return (
        <span className="d4n-tv__nicon d4n-tv__nicon--table">
          <Glyph name="table" size={14} />
        </span>
      );
    }
    if (item.type === 'col') {
      return (
        <span className="d4n-tv__nicon d4n-tv__nicon--column">
          <Glyph name="column" size={12} />
        </span>
      );
    }
    return <span className="d4n-tv__nicon" />;
  }

  private _rowTitle(row: TreeRow): string {
    if (row.kind === 'group' || row.kind === 'empty') {
      return row.label || '';
    }
    if (!row.item) {
      return '';
    }
    const t = row.item.name + (row.item.desc ? '\n' + row.item.desc : '');
    return row.isError ? t + '\n(load failed — right-click to retry)' : t;
  }

  private _onTwistyClick =
    (row: TreeRow) => (ev: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      ev.stopPropagation();
      if (!row.hasChildren) {
        return;
      }
      this._toggleRow(row);
    };

  private _onRowClick =
    (row: TreeRow) =>
    async (_ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const selectedPath = row.item
        ? row.ancestors.concat(row.item)
        : row.ancestors;
      this.setState({ selectedKey: row.pathKey, selectedPath });
      if (row.hasChildren) {
        await this._toggleRow(row);
      }
    };

  private async _toggleRow(row: TreeRow): Promise<void> {
    const expanded = new Set(this.state.expanded);
    if (row.isOpen) {
      expanded.delete(row.pathKey);
      this.setState({ expanded });
      return;
    }
    expanded.add(row.pathKey);
    this.setState({ expanded });
    if (row.kind === 'real' && !row.isLoaded && row.item) {
      const path = row.ancestors.concat(row.item);
      await this._safeLoad(path);
      this._bump();
    }
  }

  private async _safeLoad(path: IDbItem[]): Promise<boolean> {
    const key = pathKey(path);
    const loading = new Set(this.state.loading);
    loading.add(key);
    this.setState({ loading });
    let ok = false;
    try {
      ok = await this.props.model.load_path(path);
    } finally {
      const next = new Set(this.state.loading);
      next.delete(key);
      const errorKeys = new Set(this.state.errorKeys);
      if (ok) {
        errorKeys.delete(key);
      } else if (path.length > 0) {
        errorKeys.add(key);
      }
      this.setState({ loading: next, errorKeys });
    }
    return ok;
  }

  private _bump(): void {
    this.setState({ tick: this.state.tick + 1 });
  }

  private _onConnChanged = (): void => {
    this.setState({ selectedKey: undefined, selectedPath: [] });
    this._bump();
  };

  private _onPasswdSettled = async (
    _sender: SqlModel,
    dbid: string
  ): Promise<void> => {
    const errorKeys = new Set(this.state.errorKeys);
    for (const k of Array.from(errorKeys)) {
      if (k.startsWith(`conn:${dbid}`)) {
        errorKeys.delete(k);
      }
    }
    this.setState({ errorKeys });

    const root = this.props.model.get_list([]);
    const conn = root.find(c => c.name === dbid);
    if (!conn) {
      return;
    }
    this.props.model.refresh([conn]);
    await this._safeLoad([conn]);
    this._bump();
  };

  private _onRowContextMenu =
    (row: TreeRow) =>
    (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      ev.preventDefault();
      if (row.kind !== 'real' || !row.item) {
        return;
      }
      const selectedPath = row.ancestors.concat(row.item);
      this.setState({ selectedKey: row.pathKey, selectedPath });
      const menu = this._buildMenu(row);
      if (!menu) {
        return;
      }
      menu.open(ev.clientX, ev.clientY);
    };

  private _buildMenu(row: TreeRow): Menu | null {
    if (!row.item) {
      return null;
    }
    const { trans } = this.props.jp_services;
    const item = row.item;
    const ancestors = row.ancestors;
    const commands = new CommandRegistry();
    const menu = new Menu({ commands });

    if (item.type === 'conn') {
      commands.addCommand('open-console', {
        label: trans.__('Open Sql Console'),
        icon: queryIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => this._openConsole(item.name, '')
      });
      commands.addCommand('del-conn', {
        label: trans.__('Del Connection'),
        icon: deleteIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => this._delConn(item.name)
      });
      commands.addCommand('clear-pass', {
        label: trans.__('Clear Passwd'),
        icon: clearIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => getSqlModel().clear_pass(item.name)
      });
      menu.addItem({ command: 'open-console' });
      menu.addItem({ command: 'del-conn' });
      menu.addItem({ command: 'clear-pass' });
      return menu;
    }

    if (item.type === 'db') {
      const dbid = ancestors[0]?.name || '';
      commands.addCommand('open-console', {
        label: trans.__('Open Sql Console'),
        icon: queryIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => this._openConsole(dbid, '')
      });
      commands.addCommand('copy-name', {
        label: trans.__('Copy Name'),
        icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => Clipboard.copyToSystem(item.name)
      });
      menu.addItem({ command: 'open-console' });
      menu.addItem({ command: 'copy-name' });
      return menu;
    }

    if (item.type === 'table') {
      const dbid = ancestors[0]?.name || '';
      const schemaItem = ancestors.length >= 2 ? ancestors[1] : undefined;
      const schema =
        schemaItem && schemaItem.type === 'db' ? schemaItem.name : '';
      const fqName = schema ? `${schema}.${item.name}` : item.name;
      commands.addCommand('open-console', {
        label: trans.__('Open Sql Console'),
        icon: queryIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => this._openConsoleForTable(dbid, schema, item.name)
      });
      commands.addCommand('copy-name', {
        label: trans.__('Copy Table Name'),
        icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => Clipboard.copyToSystem(fqName)
      });
      menu.addItem({ command: 'open-console' });
      menu.addItem({ command: 'copy-name' });
      return menu;
    }

    if (item.type === 'col') {
      commands.addCommand('copy-name', {
        label: trans.__('Copy Column Name'),
        icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
        execute: () => Clipboard.copyToSystem(item.name)
      });
      menu.addItem({ command: 'copy-name' });
      return menu;
    }
    return null;
  }

  private _openConsole(dbid: string, sql: string): void {
    const qmodel = new QueryModel({ dbid, conn_readonly: true });
    newSqlConsole(qmodel, sql, this.props.jp_services);
  }

  private _openConsoleForTable(
    dbid: string,
    schema: string,
    table: string
  ): void {
    const conn = getSqlModel()
      .get_list([])
      .find(c => c.name === dbid);
    let qOpen = '"';
    let qClose = '"';
    if (
      conn &&
      (conn.subtype === ConnType.DB_MYSQL ||
        conn.subtype === ConnType.DB_STARROCKS)
    ) {
      qOpen = '`';
      qClose = '`';
    } else if (conn && conn.subtype === ConnType.DB_SQLSERVER) {
      qOpen = '[';
      qClose = ']';
    }
    const fq =
      (schema ? `${qOpen}${schema}${qClose}.` : '') +
      `${qOpen}${table}${qClose}`;
    const sql = `SELECT *\nFROM ${fq} t LIMIT 200`;
    this._openConsole(dbid, sql);
  }

  private _delConn = async (name: string): Promise<void> => {
    const { trans } = this.props.jp_services;
    const result = await showDialog({
      title: trans.__('Are You Sure?'),
      body: trans.__('Delete Database Connection: ') + name,
      buttons: [Dialog.cancelButton(), Dialog.okButton()]
    });
    if (result.button.accept) {
      await getSqlModel().del_conn(name);
    }
  };
}

// Suppress unused-import warning for DB_LABEL — exported for use by other
// design-driven components (e.g. ConnForm pill labels) in a future pass.
export { DB_LABEL };
