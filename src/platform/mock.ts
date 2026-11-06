import {
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

/** Stands in for the operating system when the UI runs in a plain browser for tests. */
export function createMockPlatform(): Platform {
  const controls: MockControls = {
    nextOpen: null,
    nextImage: null,
    nextSavePath: null,
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
      if (next === 'read-failure') return Promise.reject(new ReadFailure('Unreadable.pdf'));
      return Promise.resolve(next);
    },
    chooseImage() {
      const next = controls.nextImage;
      controls.nextImage = null;
      if (next === 'read-failure') return Promise.reject(new ReadFailure('Unreadable.png'));
      return Promise.resolve(next);
    },
    chooseSaveLocation() {
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
