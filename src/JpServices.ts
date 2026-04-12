import { JupyterFrontEnd } from '@jupyterlab/application';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { TranslationBundle } from '@jupyterlab/translation';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { IThemeManager } from '@jupyterlab/apputils';
import { FileBrowser } from '@jupyterlab/filebrowser';

export interface IJpServices {
  app: JupyterFrontEnd;
  editorService: IEditorServices;
  trans: TranslationBundle;
  docManager: IDocumentManager;
  themeManager: IThemeManager | null;
  fileBrowser: FileBrowser | null;
}
