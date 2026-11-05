import type { OsFamily } from '../engine/save';
import {
  ReadFailure,
  SaveFailure,
  type MenuCommand,
  type OpenedFile,
  type Platform,
  type SaveFailureKind,
} from './types';

export interface MockControls {
  /** What the next open dialog returns. Leave empty to act as if the person cancelled. */
  nextOpen: OpenedFile | 'read-failure' | null;
  nextSavePath: string | null;
  nextWriteFailure: SaveFailureKind | null;
  lastWrite: { path: string; bytes: Uint8Array } | null;
  windowTitle: string;
  documentOpen: boolean;
  os: OsFamily;
}

declare global {
  interface Window {
    smorsyMock?: MockControls;
  }
}

const SHORTCUTS: Readonly<Record<string, MenuCommand>> = {
  o: 'open',
  s: 'save-copy',
  w: 'close-document',
  '=': 'zoom-in',
  '-': 'zoom-out',
  '0': 'zoom-actual',
  '9': 'zoom-fit',
};

/** Stands in for the operating system when the UI runs in a plain browser for tests. */
export function createMockPlatform(): Platform {
  const controls: MockControls = {
    nextOpen: null,
    nextSavePath: null,
    nextWriteFailure: null,
    lastWrite: null,
    windowTitle: '',
    documentOpen: false,
    os: navigator.userAgent.includes('Windows') ? 'win' : 'mac',
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
    chooseSaveLocation() {
      const next = controls.nextSavePath;
      controls.nextSavePath = null;
      return Promise.resolve(next);
    },
    writeFile(path, bytes) {
      const failure = controls.nextWriteFailure;
      controls.nextWriteFailure = null;
      if (failure) return Promise.reject(new SaveFailure(failure));
      controls.lastWrite = { path, bytes };
      return Promise.resolve();
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
        const command = SHORTCUTS[event.key];
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
