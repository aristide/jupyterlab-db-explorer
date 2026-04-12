import { JupyterFrontEnd } from '@jupyterlab/application';
import { CommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import { TranslationBundle } from '@jupyterlab/translation';
import { SqlModel } from './model';

export enum CommandIDs {
  sqlConsole = 'sql:console',
  sqlNewConn = 'sql:newconn',
  sqlClearPass = 'sql:clearpass'
}

export function addCommands(
  app: JupyterFrontEnd,
  model: SqlModel,
  trans: TranslationBundle
): void {
  const { commands } = app;

  commands.addCommand(CommandIDs.sqlNewConn, {
    label: trans.__('New Connection'),
    caption: trans.__('Create New Database Connection'),
    execute: async () => {
      // This is now handled by the panel UI showing the ConnForm
      model.create_conn.emit({} as any);
    }
  });

  commands.addCommand(CommandIDs.sqlClearPass, {
    label: trans.__('Clear Passwd'),
    caption: trans.__('Clear temporary stored password'),
    execute: async () => {
      model.clear_pass();
    }
  });
}

export function createMenu(
  commands: CommandRegistry,
  trans: TranslationBundle
): Menu {
  const menu = new Menu({ commands });
  menu.title.label = trans.__('Database');
  [CommandIDs.sqlNewConn, CommandIDs.sqlClearPass].forEach(command => {
    menu.addItem({ command });
  });

  return menu;
}
