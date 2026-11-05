export type EngineErrorCode =
  | 'empty-file'
  | 'not-a-pdf'
  | 'damaged'
  | 'password-required'
  | 'open-failed'
  | 'page-not-found'
  | 'page-unreadable'
  | 'render-failed';

/** Every failure the engine reports has a code, so the interface can explain it in plain words. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, detail: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = 'EngineError';
    this.code = code;
  }
}
