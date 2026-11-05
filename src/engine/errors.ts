type EngineErrorCode =
  | 'empty-file'
  | 'not-a-pdf'
  | 'damaged'
  | 'password-required'
  | 'open-failed'
  | 'page-not-found'
  | 'page-unreadable'
  | 'render-failed';

/** Starts the error sent back when text can't be saved, followed by the characters. */
export const UNSUPPORTED_TEXT = 'unsupported-text:';

/** Every failure the engine reports has a code, so the interface can explain it in plain words. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, detail: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = 'EngineError';
    this.code = code;
  }
}
