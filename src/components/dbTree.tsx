import * as React from 'react';
import { Signal } from '@lumino/signaling';
import { Menu } from '@lumino/widgets';
import { CommandRegistry } from '@lumino/commands';
import { Clipboard, showDialog, Dialog } from '@jupyterlab/apputils';
import {
  caretRightIcon,
  caretDownIcon,
  folderIcon,
  copyIcon,
  clearIcon
} from '@jupyterlab/ui-components';

import { SqlModel, QueryModel, getSqlModel } from '../model';
import { IDbItem, ConnType } from '../interfaces';
import { IJpServices } from '../JpServices';
import {
  sqlIcon,
  tabIcon,
  viewIcon,
  colIcon,
  queryIcon,
  deleteIcon,
  mysqlIcon,
  pgsqlIcon,
  oracleIcon,
  hiveIcon,
  sqliteIcon,
  trinoIcon,
  starrocksIcon,
  errorIcon
} from '../icons';
import { newSqlConsole } from '../sqlConsole';
import {
  treeRowStyle,
  treeChevronStyle,
  treeIconStyle,
  treeNameStyle,
  treeMemoStyle,
  treeGroupStyle,
  treeErrorBadgeStyle,
  treeSpinnerStyle,
  treeContainerStyle,
  activeStyle
} from './styles';
import { buildVisibleRows, TreeRow, pathKey } from './treeModel';

export interface IDbTreeProps {
  model: SqlModel;
  jp_services: IJpServices;
  filter: string;
}

interface IDbTreeState {
  expanded: Set<string>;
  loading: Set<string>;
  errorKeys: Set<string>;
  selectedKey?: string;
  selectedPath: IDbItem[];
  /** Bumped on every external model mutation so the render re-pulls the latest
   *  state. The Sets above also trigger re-render, but model.load_path /
   *  model.refresh mutate the internal IDbItem.next field in place, which
   *  React can't observe directly. */
  tick: number;
}

export class DbTree extends React.Component<IDbTreeProps, IDbTreeState> {
  constructor(props: IDbTreeProps) {
    super(props);
    this.state = {
      expanded: new Set(),
      loading: new Set(),
      errorKeys: new Set(),
      selectedPath: [],
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
    const { model, filter } = this.props;
    const { expanded, loading, errorKeys, selectedKey } = this.state;
    const rows = buildVisibleRows(model, expanded, loading, errorKeys, filter);

    return (
      <div className={`jp-sql-explorer-tree ${treeContainerStyle}`}>
        {rows.map(row => this._renderRow(row, selectedKey))}
        {rows.length === 0 && (
          <div className={treeGroupStyle} style={{ padding: '8px 12px' }}>
            {filter
              ? this.props.jp_services.trans.__('No matches.')
              : this.props.jp_services.trans.__(
                  'No database connections. Use the + button above to add one.'
                )}
          </div>
        )}
      </div>
    );
  }

  /** Public — called by SqlPanel's Refresh toolbar button. */
  refreshSelected = async (): Promise<void> => {
    const { model } = this.props;
    const { selectedPath } = this.state;
    if (selectedPath.length === 0) {
      model.refresh([]);
      this.setState({ expanded: new Set(), errorKeys: new Set() });
      await this._safeLoad([]);
      this._bump();
      return;
    }
    model.refresh(selectedPath);
    const key = pathKey(selectedPath);
    const errorKeys = new Set(this.state.errorKeys);
    errorKeys.delete(key);
    this.setState({ errorKeys });
    await this._safeLoad(selectedPath);
    this._bump();
  };

  private _renderRow(row: TreeRow, selectedKey?: string): React.ReactElement {
    const isSelected = selectedKey === row.pathKey;
    const indent = row.depth * 14 + 6;
    const cls = `${treeRowStyle}${isSelected ? ' ' + activeStyle : ''}`;
    const title = this._rowTitle(row);
    return (
      <div
        key={row.pathKey}
        className={cls}
        style={{ paddingLeft: indent }}
        onClick={this._onRowClick(row)}
        onContextMenu={this._onRowContextMenu(row)}
        title={title}
      >
        {this._renderChevron(row)}
        {this._renderIcon(row)}
        {row.kind === 'group' ? (
          <span className={treeGroupStyle}>{row.label}</span>
        ) : row.kind === 'empty' ? (
          <span className={treeGroupStyle}>{row.label}</span>
        ) : (
          <>
            <span className={treeNameStyle}>
              {row.item ? row.item.name : ''}
            </span>
            {row.item && row.item.desc && (
              <span className={treeMemoStyle}>{row.item.desc}</span>
            )}
          </>
        )}
        {row.isLoading && <span className={treeSpinnerStyle} />}
        {row.isError && !row.isLoading && (
          <errorIcon.react
            tag="span"
            width="12px"
            height="12px"
            className={treeErrorBadgeStyle}
          />
        )}
      </div>
    );
  }

  private _renderChevron(row: TreeRow): React.ReactElement {
    if (!row.hasChildren) {
      return <span className={treeChevronStyle} />;
    }
    const Ic = row.isOpen ? caretDownIcon : caretRightIcon;
    return (
      <span className={treeChevronStyle}>
        <Ic.react tag="span" width="14px" height="14px" />
      </span>
    );
  }

  private _renderIcon(row: TreeRow): React.ReactElement {
    if (row.kind === 'group') {
      // Pick a hint icon that suits the group label.
      if (row.label === 'Tables') {
        return (
          <tabIcon.react
            tag="span"
            width="14px"
            height="14px"
            className={treeIconStyle}
          />
        );
      }
      if (row.label === 'Views') {
        return (
          <viewIcon.react
            tag="span"
            width="14px"
            height="14px"
            className={treeIconStyle}
          />
        );
      }
      return (
        <folderIcon.react
          tag="span"
          width="14px"
          height="14px"
          className={treeIconStyle}
        />
      );
    }
    if (row.kind === 'empty') {
      return <span className={treeIconStyle} />;
    }
    if (!row.item) {
      return <span className={treeIconStyle} />;
    }
    const it = row.item;
    if (it.type === 'conn') {
      const Ic = this._connIconFor(it.subtype as ConnType);
      return (
        <Ic.react
          tag="span"
          width="16px"
          height="16px"
          className={treeIconStyle}
        />
      );
    }
    if (it.type === 'db') {
      return (
        <sqlIcon.react
          tag="span"
          width="14px"
          height="14px"
          className={treeIconStyle}
        />
      );
    }
    if (it.type === 'table') {
      const Ic = it.subtype === 'V' ? viewIcon : tabIcon;
      return (
        <Ic.react
          tag="span"
          width="14px"
          height="14px"
          className={treeIconStyle}
        />
      );
    }
    if (it.type === 'col') {
      return (
        <colIcon.react
          tag="span"
          width="14px"
          height="14px"
          className={treeIconStyle}
        />
      );
    }
    return <span className={treeIconStyle} />;
  }

  private _connIconFor(subtype: ConnType | string | undefined): typeof sqlIcon {
    switch (subtype as ConnType) {
      case ConnType.DB_MYSQL:
        return mysqlIcon;
      case ConnType.DB_PGSQL:
        return pgsqlIcon;
      case ConnType.DB_ORACLE:
        return oracleIcon;
      case ConnType.DB_HIVE_LDAP:
      case ConnType.DB_HIVE_KERBEROS:
        return hiveIcon;
      case ConnType.DB_SQLITE:
        return sqliteIcon;
      case ConnType.DB_TRINO:
        return trinoIcon;
      case ConnType.DB_STARROCKS:
        return starrocksIcon;
      default:
        return sqlIcon;
    }
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

  private _onRowClick =
    (row: TreeRow) =>
    async (_ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
      const selectedPath = row.item ? row.ancestors.concat(row.item) : row.ancestors;
      this.setState({ selectedKey: row.pathKey, selectedPath });
      if (!row.hasChildren) {
        return;
      }
      const expanded = new Set(this.state.expanded);
      if (row.isOpen) {
        expanded.delete(row.pathKey);
        this.setState({ expanded });
        return;
      }
      expanded.add(row.pathKey);
      this.setState({ expanded });
      // Lazy-load on first open for real (non-group) nodes.
      if (row.kind === 'real' && !row.isLoaded && row.item) {
        await this._loadRow(row);
      }
    };

  private async _loadRow(row: TreeRow): Promise<void> {
    if (!row.item) {
      return;
    }
    const path = row.ancestors.concat(row.item);
    await this._safeLoad(path);
    this._bump();
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
    // Connection added/removed — drop selection and force a re-render.
    this.setState({ selectedKey: undefined, selectedPath: [] });
    this._bump();
  };

  private _onPasswdSettled = async (
    _sender: SqlModel,
    dbid: string
  ): Promise<void> => {
    // Clear errors that match this connection id, then retry the deepest
    // related path so the user sees the result of supplying their password.
    const errorKeys = new Set(this.state.errorKeys);
    for (const k of Array.from(errorKeys)) {
      if (k.startsWith(`conn:${dbid}`)) {
        errorKeys.delete(k);
      }
    }
    this.setState({ errorKeys });

    // Find the conn IDbItem in the root list and re-trigger the load that
    // failed. We refresh and reload the top-level conn node — the user can
    // re-expand from there.
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
      const schema = schemaItem && schemaItem.type === 'db' ? schemaItem.name : '';
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
    // Dialect-aware quoting (ported from collist.tsx): MySQL/StarRocks use
    // backticks, others use double quotes.
    const conn = getSqlModel()
      .get_list([])
      .find(c => c.name === dbid);
    const useBacktick =
      conn &&
      (conn.subtype === ConnType.DB_MYSQL ||
        conn.subtype === ConnType.DB_STARROCKS);
    const q = useBacktick ? '`' : '"';
    const fq = (schema ? `${q}${schema}${q}.` : '') + `${q}${table}${q}`;
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
