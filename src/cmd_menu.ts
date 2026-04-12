import { JupyterFrontEnd } from '@jupyterlab/application';
import { CommandRegistry } from '@lumino/commands';
import { Menu } from '@lumino/widgets';
import { TranslationBundle } from '@jupyterlab/translation';
import { SqlModel } from './model';

export enum CommandIDs {
  sqlConsole = 'sql:console',
  sqlClearPass = 'sql:clearpass',
  sqlReset = 'sql:reset'
}

/**
 * Adds commands
 *
 * @param app  - Jupyter App
 * @param model - SqlModel
 * @param trans - language translator
 */
export function addCommands(
  app: JupyterFrontEnd,
  model: SqlModel,
  trans: TranslationBundle
): void {
  const { commands } = app;

  commands.addCommand(CommandIDs.sqlClearPass, {
    label: trans.__('Clear Passwd'),
    caption: trans.__('Clear temporary stored password'),
    execute: async () => {
      model.clear_pass();
    }
  });

  commands.addCommand(CommandIDs.sqlReset, {
    label: trans.__('Reset Connection'),
    caption: trans.__('Reset the database connection'),
    execute: async () => {
      if (model.allow_reset) {
        model.reset();
      }
    }
  });
}

/**
 * Adds commands and menu items.
 *
 * @param commands - Jupyter App commands registry
 * @param trans - language translator
 * @returns menu
 */
export function createMenu(
  commands: CommandRegistry,
  trans: TranslationBundle
): Menu {
  const menu = new Menu({ commands });
  menu.title.label = trans.__('Database');
  [CommandIDs.sqlClearPass, CommandIDs.sqlReset].forEach(command => {
    menu.addItem({ command });
  });

  return menu;
}
