import { Signal } from '@lumino/signaling';
import { searchIcon, refreshIcon } from '@jupyterlab/ui-components';
import * as React from 'react';
import { style } from 'typestyle';
import { SqlModel } from '../model';
import { IDBConn } from '../interfaces';
import { IJpServices } from '../JpServices';
import { connAddIcon } from '../icons';
import { ConnForm } from './new_conn';
import { ActionBtn } from './ActionBtn';
import { DbTree } from './dbTree';
import { hrStyle, treeToolbarStyle } from './styles';

const panelMain = style({
  padding: 10,
  paddingBottom: 0,
  flexShrink: 0
});

const inputIconStyle = style({
  height: 16,
  width: 16,
  float: 'right',
  position: 'relative',
  top: -22,
  right: 5
});

export interface ISqlPanelProps {
  model: SqlModel;
  jp_services: IJpServices;
}

export interface ISqlPanelState {
  filter: string;
  showNewConn: boolean;
}

export class SqlPanel extends React.Component<ISqlPanelProps, ISqlPanelState> {
  constructor(props: ISqlPanelProps) {
    super(props);
    this.state = {
      filter: '',
      showNewConn: false
    };
    this._treeRef = React.createRef<DbTree>();
  }

  componentDidMount(): void {
    // The DbTree manages its own model interactions and re-renders on
    // passwd_settled / conn_changed signals. The panel only needs to react
    // to conn_changed so it can dismiss the new-connection form on success.
    this.props.model.conn_changed.connect(() => {
      this.setState({ showNewConn: false });
    }, this);
  }

  componentWillUnmount(): void {
    Signal.clearData(this);
  }

  render(): React.ReactElement {
    const { showNewConn } = this.state;
    if (showNewConn) {
      return this._renderNewConnForm();
    }
    return this._renderTree();
  }

  private _renderNewConnForm(): React.ReactElement {
    const { trans } = this.props.jp_services;
    return (
      <ConnForm
        trans={trans}
        onSubmit={this._onCreateConn}
        onCancel={() => this.setState({ showNewConn: false })}
        onTest={this._onTestConn}
        allowedTypes={this.props.model.allowed_types}
        vaultEnabled={this.props.model.vault_enabled}
      />
    );
  }

  private _renderTree(): React.ReactElement {
    const { filter } = this.state;
    const { model, jp_services } = this.props;
    const { trans } = jp_services;
    return (
      <>
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
          <div className={treeToolbarStyle} style={{ justifyContent: 'flex-end' }}>
            <ActionBtn
              msg={trans.__('Add new database connection')}
              icon={connAddIcon}
              onClick={this._add}
            />
            <ActionBtn
              msg={trans.__('Refresh')}
              icon={refreshIcon}
              onClick={this._refresh}
            />
          </div>
          <hr className={hrStyle} />
        </div>
        <DbTree
          ref={this._treeRef}
          model={model}
          jp_services={jp_services}
          filter={filter.toLowerCase()}
        />
      </>
    );
  }

  private _add = (): void => {
    this.setState({ showNewConn: true });
  };

  private _refresh = async (): Promise<void> => {
    await this._treeRef.current?.refreshSelected();
  };

  private _onCreateConn = async (conn: IDBConn): Promise<void> => {
    await this.props.model.add_conn(conn);
    // If create_conn signal fires (error), form stays open via the signal handler
  };

  private _onTestConn = async (conn: IDBConn): Promise<IDBConn> => {
    return await this.props.model.test_conn(conn);
  };

  private _setFilter = (ev: React.ChangeEvent<HTMLInputElement>): void => {
    const filter = ev.target.value;
    this.setState({ filter });
  };

  private _treeRef: React.RefObject<DbTree>;
}
