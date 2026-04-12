import { Signal } from '@lumino/signaling';
import { searchIcon } from '@jupyterlab/ui-components';
import * as React from 'react';
import { style } from 'typestyle';
import { SqlModel } from '../model';
import { IDbItem, IDBConn } from '../interfaces';
import { IJpServices } from '../JpServices';
import { rootIcon } from '../icons';
import {
  mysqlIcon,
  pgsqlIcon,
  hiveIcon,
  sqliteIcon,
  oracleIcon,
  trinoIcon,
  starrocksIcon
} from '../icons';
import { SchemaList, TbList } from './dblist';
import { ColList } from './collist';
import { ConnForm } from './new_conn';
import {
  hrStyle,
  toolbarStyle,
  toolbarInfoStyle,
  resetBtnStyle
} from './styles';

const panelMain = style({
  padding: 10,
  paddingBottom: 0
});

const navStyle = style({
  listStyleType: 'none',
  margin: 0,
  padding: 0,
  marginTop: 10,
  marginBottom: 5,
  $nest: {
    '&>li': {
      display: 'inline-block',
      $nest: {
        '&:first-child>span': {
          verticalAlign: 'text-top'
        },
        '&>span': {
          borderRadius: 2,
          margin: '0 1px',
          padding: '0 1px',
          maxWidth: 50,
          display: 'inline-block',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          height: '1.2em',
          lineHeight: '1.2em',
          verticalAlign: 'middle',
          $nest: {
            '&:hover': {
              backgroundColor: 'var(--jp-layout-color2)'
            }
          }
        }
      }
    }
  }
});

const inputIconStyle = style({
  height: 16,
  width: 16,
  float: 'right',
  position: 'relative',
  top: -22,
  right: 5
});

/**
 * Interface describing component properties.
 */
export interface ISqlPanelProps {
  model: SqlModel;
  jp_services: IJpServices;
}

/**
 * Interface describing component state.
 */
export interface ISqlPanelState {
  filter: string;
  path: Array<IDbItem>;
  list_type: string;
  wait: boolean;
  connected: boolean;
  allow_reset: boolean;
  connection: IDBConn | null;
}

/**
 * Get the database type icon for a connection
 */
function getConnTypeIcon(
  dbType: string | undefined
): React.ReactElement | null {
  const iconProps = { tag: 'span' as const, width: '16px', height: '16px' };
  switch (dbType) {
    case '1':
      return <mysqlIcon.react {...iconProps} />;
    case '2':
      return <pgsqlIcon.react {...iconProps} />;
    case '3':
      return <oracleIcon.react {...iconProps} />;
    case '4':
    case '5':
      return <hiveIcon.react {...iconProps} />;
    case '6':
      return <sqliteIcon.react {...iconProps} />;
    case '7':
      return <trinoIcon.react {...iconProps} />;
    case '8':
      return <starrocksIcon.react {...iconProps} />;
    default:
      return null;
  }
}

/**
 * React component for rendering a panel for performing Sql operations.
 */
export class SqlPanel extends React.Component<ISqlPanelProps, ISqlPanelState> {
  constructor(props: ISqlPanelProps) {
    super(props);
    this.state = {
      filter: '',
      path: [],
      list_type: 'db',
      wait: false,
      connected: props.model.connected,
      allow_reset: props.model.allow_reset,
      connection: props.model.connection
    };
  }

  async componentDidMount(): Promise<void> {
    const { model } = this.props;

    model.passwd_settled.connect((_, _db_id) => {
      this._refresh();
    }, this);

    model.connection_changed.connect((_, connected) => {
      this.setState({
        connected,
        connection: model.connection,
        allow_reset: model.allow_reset,
        path: [],
        list_type: 'db',
        filter: '',
        wait: false
      });
      if (connected) {
        this._loadRoot();
      }
    }, this);

    // Initialize model
    await model.init();

    // If already connected, load the tree
    if (model.connected) {
      this.setState({
        connected: true,
        connection: model.connection,
        allow_reset: model.allow_reset
      });
      this._loadRoot();
    }
  }

  componentWillUnmount(): void {
    Signal.clearData(this);
  }

  render(): React.ReactElement {
    const { connected } = this.state;

    if (!connected) {
      return this._renderConnForm();
    }
    return this._renderConnected();
  }

  private _renderConnForm(): React.ReactElement {
    const { trans } = this.props.jp_services;
    return (
      <ConnForm
        ref={r => {
          this._connFormRef = r;
        }}
        trans={trans}
        onSubmit={this._onConnect}
      />
    );
  }

  private _renderConnected(): React.ReactElement {
    const { filter, path, list_type, wait, connection, allow_reset } =
      this.state;
    const { model, jp_services } = this.props;
    const { trans } = jp_services;
    const filter_l = filter.toLowerCase();

    return (
      <>
        {/* Reset Toolbar */}
        <div className={toolbarStyle}>
          <div className={toolbarInfoStyle}>
            {getConnTypeIcon(connection?.db_type)}
            <div>
              <div className="conn-name">
                {connection?.name || connection?.db_id || 'Database'}
              </div>
              {connection?.db_host && (
                <div className="conn-host">{connection.db_host}</div>
              )}
            </div>
          </div>
          <button
            className={resetBtnStyle}
            disabled={!allow_reset}
            onClick={this._onReset}
            title={
              allow_reset
                ? trans.__('Reset connection')
                : trans.__('Reset is disabled')
            }
          >
            {trans.__('Reset')}
          </button>
        </div>

        {/* Filter + Breadcrumb */}
        <div className={panelMain}>
          <div className="jp-InputGroup bp3-input-group">
            <input
              className="bp3-input"
              placeholder={trans.__('filter by name')}
              value={filter}
              onChange={this._setFilter}
            />
            <searchIcon.react tag="span" className={inputIconStyle} />
          </div>
          <ul className={navStyle}>
            <li onClick={this._go(0, 'db')}>
              <rootIcon.react
                tag="span"
                width="16px"
                height="16px"
                top="2px"
              />
            </li>
            {path.map((p, idx) => (
              <li key={idx} onClick={this._go(idx + 1, p.type)}>
                &gt;<span title={p.name}>{p.name}</span>
              </li>
            ))}
          </ul>
          <hr className={hrStyle} />
        </div>

        {/* Schema / Table / Column lists */}
        {list_type === 'db' && (
          <SchemaList
            onSelect={this._select}
            trans={trans}
            jp_services={jp_services}
            list={model.get_list(path)}
            filter={filter_l}
            wait={wait}
            onRefresh={this._refresh}
          />
        )}
        {list_type === 'table' && (
          <TbList
            onSelect={this._select}
            trans={trans}
            jp_services={jp_services}
            list={model.get_list(path)}
            filter={filter_l}
            wait={wait}
            schema={path.length > 0 ? path[path.length - 1].name : ''}
            onRefresh={this._refresh}
          />
        )}
        {list_type === 'col' && (
          <ColList
            list={model.get_list(path)}
            jp_services={jp_services}
            filter={filter_l}
            onRefresh={this._refresh}
            wait={wait}
            dbid={this.props.model.connection?.db_id || 'default'}
            schema={path.length >= 1 && path[0].type === 'db' ? path[0].name : ''}
            table={path[path.length - 1].name}
          />
        )}
      </>
    );
  }

  private _loadRoot = async () => {
    this.setState({ wait: true });
    const { path } = this.state;
    const rc = await this.props.model.load_path(path);
    if (rc) {
      this.setState({ wait: false });
    }
  };

  private _go =
    (idx: number, list_type: string) =>
    (_ev: React.MouseEvent<HTMLLIElement, MouseEvent>) => {
      const { path } = this.state;
      this.setState({ path: path.slice(0, idx), list_type, filter: '' });
    };

  private _select =
    (item: IDbItem) =>
    async (
      _ev: React.MouseEvent<HTMLLIElement | HTMLDivElement, MouseEvent>
    ) => {
      const { path } = this.state;
      const p = [...path, item];
      // Determine what list type to show next
      let nextType = item.type;
      if (item.type === 'table') {
        nextType = 'col';
      }
      this.setState({ path: p, list_type: nextType, filter: '', wait: true });
      const rc = await this.props.model.load_path(p);
      if (rc) {
        this.setState({ wait: false });
      }
    };

  private _onConnect = async (conn: IDBConn) => {
    const success = await this.props.model.connect(conn);
    if (!success && this._connFormRef) {
      this._connFormRef.setError(
        this.props.model.conn_error ? 'Connection failed' : 'Connection failed'
      );
    }
  };

  private _onReset = async () => {
    await this.props.model.reset();
  };

  private _refresh = async () => {
    const { path } = this.state;
    const { model } = this.props;
    model.refresh(path);
    this.setState({ wait: true });
    const rc = await model.load_path(path);
    if (rc) {
      this.setState({ wait: false });
    }
  };

  private _setFilter = (ev: React.ChangeEvent<HTMLInputElement>) => {
    const filter = ev.target.value;
    this.setState({ filter });
  };

  private _connFormRef: ConnForm | null = null;
}
