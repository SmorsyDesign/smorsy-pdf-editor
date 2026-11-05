import { EngineError } from '../engine/errors';
import { ReadFailure, type SaveFailureKind } from '../platform';

export interface OpenProblem {
  readonly reason: string;
  readonly advice: string;
  readonly technical: string;
}

export function explainOpenFailure(error: unknown): OpenProblem {
  if (error instanceof ReadFailure) {
    return {
      reason: 'The file could not be read from your computer.',
      advice: 'Check that it still exists and that you have permission to open it.',
      technical: error.message,
    };
  }
  if (error instanceof EngineError) {
    const technical = `${error.code}: ${error.message}`;
    switch (error.code) {
      case 'empty-file':
        return {
          reason: 'The file is empty.',
          advice: 'Try downloading it again, or ask the sender for a new copy.',
          technical,
        };
      case 'not-a-pdf':
        return {
          reason: 'This file has a .pdf name, but it isn’t a PDF.',
          advice: 'Check it’s the right file, or ask the sender for a new copy.',
          technical,
        };
      case 'open-failed':
        return {
          reason: 'Something unexpected stopped this file from opening. The file may be fine.',
          advice: 'Try opening it again. If that doesn’t work, quit the app and open it again.',
          technical,
        };
      case 'password-required':
        return {
          reason: 'This PDF is protected with a password.',
          advice: 'This version of the app can’t open password-protected files yet.',
          technical,
        };
      case 'damaged':
      case 'page-not-found':
      case 'page-unreadable':
      case 'render-failed':
        return {
          reason:
            'The file is damaged or incomplete. This often happens when a download didn’t finish.',
          advice: 'Try downloading it again, or ask the sender for a new copy.',
          technical,
        };
    }
  }
  return {
    reason: 'Something unexpected stopped this file from opening. The file may be fine.',
    advice: 'Try opening it again. If that doesn’t work, quit the app and open it again.',
    technical: String(error),
  };
}

export function explainSaveFailure(kind: SaveFailureKind): string {
  switch (kind) {
    case 'no-space':
      return 'The disk is full. Free up some space, or choose another location.';
    case 'read-only':
      return 'You don’t have permission to save there, or the disk is read-only.';
    case 'in-use':
      return 'Another app has that file open. Close it there, or choose another location.';
    case 'not-allowed':
      return 'The app wasn’t given access to that location. Choose it again in the save window.';
    case 'invalid-request':
    case 'other':
      return 'Something unexpected stopped the file from being written.';
  }
}
