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

/** Starts the error sent back when a form answer can't be saved, followed by what to tell people. */
export const FIELD_PROBLEM = 'field-problem:';

/** A character as a person can read it, including the ones that can't be seen. */
export function nameCharacter(character: string): string {
  if (character === ' ') return 'space';
  if (character === '\t') return 'tab';
  const code = character.codePointAt(0) ?? 0;
  const invisible =
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x2028 && code <= 0x202f) ||
    code < 0x20 ||
    code === 0xad ||
    (code >= 0x200b && code <= 0x200f) ||
    code === 0xfeff;
  return invisible ? `U+${code.toString(16).toUpperCase().padStart(4, '0')}` : character;
}

/** Every failure the engine reports has a code, so the interface can explain it in plain words. */
export class EngineError extends Error {
  readonly code: EngineErrorCode;

  constructor(code: EngineErrorCode, detail: string, options?: ErrorOptions) {
    super(detail, options);
    this.name = 'EngineError';
    this.code = code;
  }
}
