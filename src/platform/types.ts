export type OsFamily = 'mac' | 'win';

export function detectOs(): OsFamily {
  return navigator.userAgent.includes('Windows') ? 'win' : 'mac';
}

export type MenuCommand =
  | 'open'
  | 'save'
  | 'save-copy'
  | 'close-document'
  | 'quit'
  | 'add-text'
  | 'undo'
  | 'redo'
  | 'find'
  | 'zoom-in'
  | 'zoom-out'
  | 'zoom-actual'
  | 'zoom-fit';

export type SystemFontStyle = 'regular' | 'bold' | 'italic' | 'bold-italic';

export interface OpenedFile {
  readonly path: string;
  readonly name: string;
  readonly bytes: Uint8Array;
}

export const SAVE_FAILURE_KINDS = [
  'not-allowed',
  'no-space',
  'read-only',
  'in-use',
  'unsupported-text',
  'build-failed',
  'invalid-request',
  'other',
] as const;

export type SaveFailureKind = (typeof SAVE_FAILURE_KINDS)[number];

export class SaveFailure extends Error {
  readonly kind: SaveFailureKind;

  constructor(kind: SaveFailureKind, detail = '') {
    super(detail || kind);
    this.name = 'SaveFailure';
    this.kind = kind;
  }
}

export class ReadFailure extends Error {
  readonly fileName: string;

  constructor(fileName: string, options?: ErrorOptions) {
    super(`Could not read ${fileName}`, options);
    this.name = 'ReadFailure';
    this.fileName = fileName;
  }
}

/** Everything the app needs from the operating system. The browser mock implements it for tests. */
export interface Platform {
  readonly os: OsFamily;
  /** Resolves to null when the person cancels. Rejects with ReadFailure if the file can't be read. */
  chooseFileToOpen(): Promise<OpenedFile | null>;
  /** Resolves to null when the person cancels. */
  chooseSaveLocation(suggestedName: string): Promise<string | null>;
  /** Compares what's on disk rather than the spelling, because one file can have many names. */
  isSameFile(first: string, second: string): Promise<boolean>;
  /** Rejects with SaveFailure. */
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** The computer's own Times New Roman, or null if it doesn't have it. */
  readSystemFont(style: SystemFontStyle): Promise<Uint8Array | null>;
  setWindowTitle(title: string): Promise<void>;
  /** The guard answers whether the window may close. If not, it arranges what happens instead. */
  setCloseGuard(guard: () => boolean): void;
  closeWindow(): Promise<void>;
  /** Tells the system side, so a quit it can't otherwise see waits only when it needs to. */
  setUnsavedWork(unsaved: boolean): Promise<void>;
  setDocumentOpen(open: boolean): Promise<void>;
  /** Returns a function that stops listening. */
  onCommand(listener: (command: MenuCommand) => void): Promise<() => void>;
}
