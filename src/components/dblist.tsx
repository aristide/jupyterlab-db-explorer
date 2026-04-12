import * as React from 'react';
import { Menu, ContextMenu } from '@lumino/widgets';
import { Clipboard } from '@jupyterlab/apputils';
import { CommandRegistry } from '@lumino/commands';
import { TranslationBundle } from '@jupyterlab/translation';
import {
  refreshIcon,
  copyIcon
} from '@jupyterlab/ui-components';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

import { Loading } from './loading';
import { IDbItem } from '../interfaces';
import { IJpServices } from '../JpServices';
import {
  queryIcon,
  sqlIcon,
  tabIcon,
  viewIcon
} from '../icons';
import {
  tbStyle,
  hrStyle,
  divListStyle,
  activeStyle
} from './styles';
import { ActionBtn } from './ActionBtn';
import { QueryModel } from '../model';
import { newSqlConsole } from '../sqlConsole';

type SelectFunc = (
  item: IDbItem
) => (
  ev: React.MouseEvent<HTMLLIElement | HTMLDivElement, MouseEvent>
) => Promise<void>;

type ListProps = {
  onSelect: SelectFunc;
  list: Array<IDbItem>;
  onRefresh: () => any;
  filter: string;
  wait?: boolean;
  schema?: string;
  jp_services?: IJpServices;
  trans: TranslationBundle;
};

export class SchemaList extends React.Component<
  ListProps,
  { sel_name?: string }
> {
  constructor(props: ListProps) {
    super(props);
    this._contextMenu = this._createContextMenu();
    this.state = {
      sel_name: ''
    };
  }

  private _createContextMenu(): ContextMenu {
    const { trans } = this.props;
    const commands = new CommandRegistry();
    const copy = 'copyName';
    const open_console = 'open-console';
    commands.addCommand(open_console, {
      label: trans.__('Open Sql Console'),
      icon: queryIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: this._open_console
    });
    commands.addCommand(copy, {
      label: trans.__('Copy Table Name'),
      icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: this._copyToClipboard
    });
    const menu = new ContextMenu({ commands });
    menu.addItem({ command: copy, selector: '[data-ptype="table"]', rank: 50 });
    menu.addItem({
      command: open_console,
      selector: '*[data-ptype]',
      rank: 100
    });
    return menu;
  }

  render(): React.ReactElement {
    const { trans, onSelect, list, onRefresh, filter, wait } = this.props;
    const { sel_name } = this.state;

    const l = list.filter(
      p =>
        p.name.toLowerCase().includes(filter) ||
        (p.desc && p.desc.toLowerCase().includes(filter))
    );

    const Row = ({
      index,
      style,
      data
    }: {
      index: number;
      style: React.CSSProperties;
      data: any;
    }) => {
      const p = data[index];
      return (
        <div
          key={index}
          style={style}
          onClick={onSelect(p)}
          title={p.name + '\n' + p.desc}
          className={
            divListStyle + (sel_name === p.name ? ' ' + activeStyle : '')
          }
          data-ptype={p.type}
          onContextMenu={event => this._handleContextMenu(event, p)}
        >
          {p.type === 'db' && (
            <sqlIcon.react
              tag="span"
              width="16px"
              height="16px"
              verticalAlign="text-top"
            />
          )}
          {p.type === 'table' && p.subtype !== 'V' && (
            <tabIcon.react
              tag="span"
              width="16px"
              height="16px"
              verticalAlign="text-top"
            />
          )}
          {p.type === 'table' && p.subtype === 'V' && (
            <viewIcon.react
              tag="span"
              width="16px"
              height="16px"
              verticalAlign="text-top"
            />
          )}
          <span className="name">{p.name}</span>
          <span className="memo">{p.desc}</span>
        </div>
      );
    };
    return (
      <>
        <div className={tbStyle}>
          <div style={{ textAlign: 'right' }}>
            <ActionBtn
              msg={trans.__('refresh')}
              icon={refreshIcon}
              onClick={onRefresh}
            />
          </div>
          <hr className={hrStyle} />
        </div>
        {wait ? (
          <Loading />
        ) : (
          <AutoSizer>
            {({ height, width }: { height: any; width: any }) => (
              <List
                itemCount={l.length}
                itemData={l}
                itemSize={25}
                height={height - 120}
                width={width}
              >
                {Row}
              </List>
            )}
          </AutoSizer>
        )}
      </>
    );
  }

  private _handleContextMenu = (
    event: React.MouseEvent<any>,
    item: IDbItem
  ) => {
    event.preventDefault();
    this._sel_item = item;
    this.setState({ sel_name: item.name });
    this._contextMenu.open(event.nativeEvent);
  };

  private _copyToClipboard = () => {
    const { name } = this._sel_item;
    Clipboard.copyToSystem(name);
  };

  private _open_console = () => {
    const qmodel = new QueryModel({
      conn_readonly: true
    });
    newSqlConsole(qmodel, '', this.props.jp_services as IJpServices);
  };

  private readonly _contextMenu: ContextMenu;
  private _sel_item!: IDbItem;
}

export class TbList extends React.Component<ListProps, { sel_name?: string }> {
  constructor(props: ListProps) {
    super(props);
    this._contextMenu = this._createContextMenu();
    this.state = {
      sel_name: ''
    };
  }

  private _createContextMenu(): Menu {
    const { trans } = this.props;
    const commands = new CommandRegistry();
    const copy = 'copyName';
    const open_console = 'open-console';
    commands.addCommand(open_console, {
      label: trans.__('Open Sql Console'),
      icon: queryIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: this._open_console
    });
    commands.addCommand(copy, {
      label: trans.__('Copy Table Name'),
      icon: copyIcon.bindprops({ stylesheet: 'menuItem' }),
      execute: this._copyToClipboard
    });
    const menu = new Menu({ commands });
    menu.addItem({ command: open_console });
    menu.addItem({ command: copy });
    return menu;
  }

  render(): React.ReactElement {
    const { trans, onSelect, list, onRefresh, filter, wait } = this.props;

    const { sel_name } = this.state;

    const l = list.filter(
      p =>
        p.name.toLowerCase().includes(filter) ||
        (p.desc && p.desc.toLowerCase().includes(filter))
    );

    const Row = ({
      index,
      style,
      data
    }: {
      index: number;
      style: React.CSSProperties;
      data: any;
    }) => {
      const p = data[index];
      return (
        <div
          key={index}
          style={style}
          onClick={onSelect(p)}
          title={p.name + '\n' + p.desc}
          className={
            divListStyle + ' ' + (sel_name === p.name ? activeStyle : '')
          }
          onContextMenu={event => this._handleContextMenu(event, p)}
        >
          {p.type === 'table' && p.subtype !== 'V' && (
            <tabIcon.react
              tag="span"
              width="14px"
              height="14px"
              right="5px"
              verticalAlign="text-top"
            />
          )}
          {p.type === 'table' && p.subtype === 'V' && (
            <viewIcon.react
              tag="span"
              width="16px"
              height="16px"
              verticalAlign="text-top"
            />
          )}
          <span className="name">{p.name}</span>
          <span className="memo">{p.desc}</span>
        </div>
      );
    };

    return (
      <>
        <div className={tbStyle}>
          <div style={{ textAlign: 'right' }}>
            <ActionBtn
              msg={trans.__('refresh')}
              icon={refreshIcon}
              onClick={onRefresh}
            />
          </div>
          <hr className={hrStyle} />
        </div>
        {wait ? (
          <Loading />
        ) : (
          <AutoSizer>
            {({ height, width }: { height: any; width: any }) => (
              <List
                itemCount={l.length}
                itemData={l}
                itemSize={25}
                height={height - 120}
                width={width}
              >
                {Row}
              </List>
            )}
          </AutoSizer>
        )}
      </>
    );
  }

  private _handleContextMenu = (
    event: React.MouseEvent<any>,
    item: IDbItem
  ) => {
    event.preventDefault();
    this._sel_item = item;
    this.setState({ sel_name: item.name });
    this._contextMenu.open(event.clientX, event.clientY);
  };

  private _copyToClipboard = () => {
    const { name } = this._sel_item;
    const { schema } = this.props;
    Clipboard.copyToSystem(`${schema}.${name}`);
  };

  private _open_console = () => {
    const qmodel = new QueryModel({
      conn_readonly: true
    });
    newSqlConsole(qmodel, '', this.props.jp_services as IJpServices);
  };

  private readonly _contextMenu: Menu;
  private _sel_item!: IDbItem;
}
