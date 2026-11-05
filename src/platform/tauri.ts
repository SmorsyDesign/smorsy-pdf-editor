import { invoke } from '@tauri-apps/api/core';
import { Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import {
  ReadFailure,
  SAVE_FAILURE_KINDS,
  SaveFailure,
  detectOs,
  type MenuCommand,
  type OsFamily,
  type Platform,
} from './types';

const PDF_FILTER = { name: 'PDF', extensions: ['pdf'] };

/** Native dialogs can't be automated. Only test builds read answers here: Vite strips it from releases. */
function testDialogAnswer(dialog: 'open' | 'save'): string | undefined {
  if (import.meta.env.MODE !== 'e2e') return undefined;
  const { smorsyTestDialogs } = window as unknown as {
    smorsyTestDialogs?: Partial<Record<'open' | 'save', string>>;
  };
  return smorsyTestDialogs?.[dialog];
}

function fileNameOf(path: string): string {
  return path.split(/[\\/]/).at(-1) ?? path;
}

function toSaveFailure(error: unknown): SaveFailure {
  if (typeof error === 'object' && error !== null && 'kind' in error) {
    const { kind } = error;
    const detail = 'detail' in error && typeof error.detail === 'string' ? error.detail : '';
    const known = SAVE_FAILURE_KINDS.find((candidate) => candidate === kind);
    if (known) return new SaveFailure(known, detail);
  }
  return new SaveFailure('other', String(error));
}

/** Returns the items that only work while a document is open. */
async function buildMenu(
  os: OsFamily,
  send: (command: MenuCommand) => void,
): Promise<readonly MenuItem[]> {
  const item = (id: MenuCommand, text: string, accelerator: string, enabled = true) =>
    MenuItem.new({
      id,
      text,
      accelerator,
      enabled,
      action: () => {
        send(id);
      },
    });

  const openItem = await item('open', 'Open…', 'CmdOrCtrl+O');
  const saveItem = await item('save-copy', 'Save a Copy…', 'CmdOrCtrl+S', false);
  const closeItem = await item('close-document', 'Close Document', 'CmdOrCtrl+W', false);
  const zoomInItem = await item('zoom-in', 'Zoom In', 'CmdOrCtrl+=', false);
  const zoomOutItem = await item('zoom-out', 'Zoom Out', 'CmdOrCtrl+-', false);
  const actualItem = await item('zoom-actual', 'Actual Size', 'CmdOrCtrl+0', false);
  const fitItem = await item('zoom-fit', 'Fit to Width', 'CmdOrCtrl+9', false);
  const separator = () => PredefinedMenuItem.new({ item: 'Separator' });

  const file = await Submenu.new({
    text: 'File',
    items: [
      openItem,
      await separator(),
      saveItem,
      await separator(),
      closeItem,
      ...(os === 'mac' ? [] : [await PredefinedMenuItem.new({ item: 'Quit', text: 'Exit' })]),
    ],
  });
  const edit = await Submenu.new({
    text: 'Edit',
    items: [
      await PredefinedMenuItem.new({ item: 'Copy' }),
      await PredefinedMenuItem.new({ item: 'SelectAll' }),
    ],
  });
  const view = await Submenu.new({
    text: 'View',
    items: [zoomInItem, zoomOutItem, actualItem, fitItem],
  });

  if (os === 'mac') {
    const app = await Submenu.new({
      text: 'Smorsy PDF Editor',
      items: [
        await PredefinedMenuItem.new({ item: { About: null }, text: 'About Smorsy PDF Editor' }),
        await separator(),
        await PredefinedMenuItem.new({ item: 'Services' }),
        await separator(),
        await PredefinedMenuItem.new({ item: 'Hide' }),
        await PredefinedMenuItem.new({ item: 'HideOthers' }),
        await PredefinedMenuItem.new({ item: 'ShowAll' }),
        await separator(),
        await PredefinedMenuItem.new({ item: 'Quit' }),
      ],
    });
    const window = await Submenu.new({
      text: 'Window',
      items: [
        await PredefinedMenuItem.new({ item: 'Minimize' }),
        await PredefinedMenuItem.new({ item: 'Maximize', text: 'Zoom' }),
        await separator(),
        await PredefinedMenuItem.new({ item: 'CloseWindow' }),
      ],
    });
    const menu = await Menu.new({ items: [app, file, edit, view, window] });
    await menu.setAsAppMenu();
  } else {
    // Windows menus belong to a window, so the menu is set on this one.
    const menu = await Menu.new({ items: [file, edit, view] });
    await menu.setAsWindowMenu(getCurrentWindow());
  }

  return [saveItem, closeItem, zoomInItem, zoomOutItem, actualItem, fitItem];
}

export async function createTauriPlatform(): Promise<Platform> {
  const os = detectOs();
  const listeners = new Set<(command: MenuCommand) => void>();
  const documentItems = await buildMenu(os, (command) => {
    listeners.forEach((listener) => {
      listener(command);
    });
  });

  return {
    os,
    async chooseFileToOpen() {
      const path =
        testDialogAnswer('open') ??
        (await open({ multiple: false, directory: false, filters: [PDF_FILTER] }));
      if (path === null) return null;
      const name = fileNameOf(path);
      try {
        return { path, name, bytes: await readFile(path) };
      } catch (error) {
        throw new ReadFailure(name, { cause: error });
      }
    },
    async chooseSaveLocation(suggestedName) {
      return (
        testDialogAnswer('save') ?? save({ defaultPath: suggestedName, filters: [PDF_FILTER] })
      );
    },
    isSameFile(first, second) {
      return invoke<boolean>('is_same_file', { first, second });
    },
    async writeFile(path, bytes) {
      try {
        await invoke('write_file_atomic', bytes, {
          headers: { 'x-path': encodeURIComponent(path) },
        });
      } catch (error) {
        throw toSaveFailure(error);
      }
    },
    async setWindowTitle(title) {
      await getCurrentWindow().setTitle(title);
    },
    async setDocumentOpen(isOpen) {
      await Promise.all(documentItems.map((item) => item.setEnabled(isOpen)));
    },
    onCommand(listener) {
      listeners.add(listener);
      return Promise.resolve(() => {
        listeners.delete(listener);
      });
    },
  };
}
