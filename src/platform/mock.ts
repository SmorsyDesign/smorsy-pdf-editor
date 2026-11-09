import {
  FileTooLarge,
  MAX_IMAGE_BYTES,
  ReadFailure,
  SaveFailure,
  detectOs,
  type MenuCommand,
  type OpenedFile,
  type OsFamily,
  type PickedImage,
  type Platform,
  type SaveFailureKind,
} from './types';

interface MockControls {
  /** What the next open dialog returns. Leave empty to act as if the person cancelled. */
  nextOpen: OpenedFile | 'read-failure' | null;
  nextImage: PickedImage | 'read-failure' | null;
  nextSavePath: string | null;
  /** The name the last save dialog suggested. */
  lastSuggestedName: string | null;
  nextWriteFailure: SaveFailureKind | null;
  /** Runs before a write finishes, so tests can act while a save is under way. */
  beforeWrite: (() => Promise<void>) | null;
  lastWrite: { path: string; bytes: Uint8Array } | null;
  windowTitle: string;
  documentOpen: boolean;
  closeGuard: (() => boolean) | null;
  windowClosed: boolean;
  unsavedWork: boolean;
  os: OsFamily;
}

declare global {
  interface Window {
    smorsyMock?: MockControls;
  }
}

const SHORTCUTS: Readonly<Record<string, MenuCommand>> = {
  o: 'open',
  s: 'save',
  S: 'save-copy',
  w: 'close-document',
  q: 'quit',
  T: 'add-text',
  z: 'undo',
  Z: 'redo',
  f: 'find',
  '=': 'zoom-in',
  '-': 'zoom-out',
  '0': 'zoom-actual',
  '9': 'zoom-fit',
};

/** Someone looking at this in an ordinary browser, rather than a test, gets a real file picker. */
function pickFileInBrowser(): Promise<OpenedFile | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf';
    input.addEventListener('cancel', () => {
      resolve(null);
    });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file.arrayBuffer().then((buffer) => {
        resolve({
          path: `/test-version/${file.name}`,
          name: file.name,
          bytes: new Uint8Array(buffer),
        });
      }, reject);
    });
    input.click();
  });
}

/** A browser can't write to the computer, and "Copy saved" would otherwise look like it had. */
function sayThisIsTheTestVersion(): void {
  const notice = document.createElement('p');
  notice.textContent =
    'Test version: saving doesn’t write a file. For the real app, run npm run tauri dev.';
  notice.setAttribute('role', 'note');
  notice.style.cssText =
    'position:fixed;left:50%;bottom:32px;z-index:100;margin:0;padding:4px 12px;transform:translateX(-50%);border-radius:4px;background:#8a4f00;color:#fff;font:400 12px/16px sans-serif;';
  document.body.append(notice);
}

/** Stands in for the operating system when the UI runs in a plain browser for tests. */
export function createMockPlatform(): Platform {
  if (!navigator.webdriver) sayThisIsTheTestVersion();
  const controls: MockControls = {
    nextOpen: null,
    nextImage: null,
    nextSavePath: null,
    lastSuggestedName: null,
    nextWriteFailure: null,
    beforeWrite: null,
    lastWrite: null,
    windowTitle: '',
    documentOpen: false,
    closeGuard: null,
    windowClosed: false,
    unsavedWork: false,
    os: detectOs(),
  };
  window.smorsyMock = controls;

  return {
    get os() {
      return controls.os;
    },
    chooseFileToOpen() {
      const next = controls.nextOpen;
      controls.nextOpen = null;
      if (next === null && !navigator.webdriver) return pickFileInBrowser();
      if (next === 'read-failure') return Promise.reject(new ReadFailure('Unreadable.pdf'));
      return Promise.resolve(next);
    },
    chooseImage() {
      const next = controls.nextImage;
      controls.nextImage = null;
      if (next === 'read-failure') return Promise.reject(new ReadFailure('Unreadable.png'));
      if (next && next.bytes.length > MAX_IMAGE_BYTES) {
        return Promise.reject(new FileTooLarge(next.name));
      }
      return Promise.resolve(next);
    },
    chooseSaveLocation(suggestedName) {
      controls.lastSuggestedName = suggestedName;
      const next = controls.nextSavePath;
      controls.nextSavePath = null;
      return Promise.resolve(next);
    },
    readSystemFont() {
      return Promise.resolve(null);
    },
    setCloseGuard(guard) {
      controls.closeGuard = guard;
    },
    closeWindow() {
      controls.windowClosed = true;
      return Promise.resolve();
    },
    setUnsavedWork(unsaved) {
      controls.unsavedWork = unsaved;
      return Promise.resolve();
    },
    isSameFile(first, second) {
      return Promise.resolve(first === second);
    },
    async writeFile(path, bytes) {
      await controls.beforeWrite?.();
      const failure = controls.nextWriteFailure;
      controls.nextWriteFailure = null;
      if (failure) throw new SaveFailure(failure);
      controls.lastWrite = { path, bytes };
    },
    setWindowTitle(title) {
      controls.windowTitle = title;
      return Promise.resolve();
    },
    setDocumentOpen(open) {
      controls.documentOpen = open;
      return Promise.resolve();
    },
    onCommand(listener) {
      // In the real app the native menu owns these keys.
      const onKey = (event: KeyboardEvent) => {
        // With Shift held, browsers disagree on whether a letter arrives in upper case.
        const command = SHORTCUTS[event.shiftKey ? event.key.toUpperCase() : event.key];
        if (command && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          listener(command);
        }
      };
      window.addEventListener('keydown', onKey);
      return Promise.resolve(() => {
        window.removeEventListener('keydown', onKey);
      });
    },
  };
}
