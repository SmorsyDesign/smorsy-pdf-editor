import { useImperativeHandle, type RefObject } from 'react';
import { zoomIn, zoomOut } from '../engine/zoom';
import type { MenuCommand } from '../platform';
import type { TextSession } from './editing/useTextSession';

export interface DocumentViewHandle {
  command(command: MenuCommand): void;
  /** Finishes any text being typed, so a save includes it. False if it couldn't be applied. */
  flush(): Promise<boolean>;
  /** True while text is being typed or an edit is still being recorded. */
  hasUnfinishedEdit(): boolean;
}

/** Fields have their own undo, which comes first. A colour picker has none. */
const isTyping = () => {
  const active = document.activeElement;
  return (
    active instanceof HTMLTextAreaElement ||
    (active instanceof HTMLInputElement && active.type !== 'color')
  );
};

interface DocumentCommands {
  readonly handleRef: RefObject<DocumentViewHandle | null>;
  readonly session: TextSession;
  readonly percent: number;
  readonly applyZoom: (percent: number) => void;
  readonly fit: () => void;
  readonly onFind: () => void;
  readonly onAddText: () => void;
}

/** What the native menus can ask of an open document. */
export function useDocumentCommands({
  handleRef,
  session,
  percent,
  applyZoom,
  fit,
  onFind,
  onAddText,
}: DocumentCommands) {
  useImperativeHandle(handleRef, () => ({
    flush: session.flush,
    hasUnfinishedEdit: session.hasUnfinishedEdit,
    command(command) {
      switch (command) {
        case 'zoom-in':
          applyZoom(zoomIn(percent));
          break;
        case 'zoom-out':
          applyZoom(zoomOut(percent));
          break;
        case 'zoom-actual':
          applyZoom(100);
          break;
        case 'zoom-fit':
          fit();
          break;
        case 'undo':
          // While typing, undo belongs to the text field rather than the document. Menus intercept
          // the shortcut before the field sees it, and this is the only way to pass it on.
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (isTyping()) document.execCommand('undo');
          else session.undo();
          break;
        case 'redo':
          // eslint-disable-next-line @typescript-eslint/no-deprecated
          if (isTyping()) document.execCommand('redo');
          else session.redo();
          break;
        case 'find':
          onFind();
          break;
        case 'add-text':
          onAddText();
          break;
        default:
          break;
      }
    },
  }));
}
