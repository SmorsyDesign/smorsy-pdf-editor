import { EngineError } from '../engine/errors';
import { ReadFailure, type SaveFailureKind } from '../platform';

export interface OpenProblem {
  readonly reason: string;
  readonly advice: string;
  readonly technical: string;
}

const UNEXPECTED_OPEN_FAILURE = {
  reason: 'Something unexpected stopped this file from opening. The file may be fine.',
  advice: 'Try opening it again. If that doesn’t work, quit the app and open it again.',
};

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
        return { ...UNEXPECTED_OPEN_FAILURE, technical };
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
  return { ...UNEXPECTED_OPEN_FAILURE, technical: String(error) };
}

/** What the person should know about a save that worked, or null if there's nothing to add. */
export function explainFormChanges(retired: number, onTop: number, annotations = 0): string | null {
  const notes: string[] = [];
  if (annotations === 1) {
    notes.push(
      'An annotation under a whiteout box is now part of the page, so it can’t be changed in the saved file.',
    );
  } else if (annotations > 1) {
    notes.push(
      `${annotations} annotations under whiteout boxes are now part of the page, so they can’t be changed in the saved file.`,
    );
  }
  if (retired === 1) {
    notes.push(
      'A filled-in form field under your edit is now part of the page, so it can’t be changed in the saved file.',
    );
  } else if (retired > 1) {
    notes.push(
      `${retired} filled-in form fields under your edits are now part of the page, so they can’t be changed in the saved file.`,
    );
  }
  if (onTop > 0) {
    notes.push(
      'A form field, button or existing annotation could still cover part of your edit in the saved file. Check it, or move your edit away from it.',
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

export function explainSaveFailure(kind: SaveFailureKind, detail = ''): string {
  switch (kind) {
    case 'plain-problem':
      return detail;
    case 'unsupported-text':
      return `No font available to the app has these characters: ${detail}. Change or remove them, then save again.`;
    case 'build-failed':
      return 'Something went wrong while building the edited file, so nothing was written.';
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
