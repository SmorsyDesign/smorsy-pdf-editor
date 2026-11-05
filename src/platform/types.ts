export type OsFamily = 'mac' | 'win';

export type MenuCommand =
  'open' | 'save-copy' | 'close-document' | 'zoom-in' | 'zoom-out' | 'zoom-actual' | 'zoom-fit';

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
  setWindowTitle(title: string): Promise<void>;
  setDocumentOpen(open: boolean): Promise<void>;
  /** Returns a function that stops listening. */
  onCommand(listener: (command: MenuCommand) => void): Promise<() => void>;
}
