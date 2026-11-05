import { useCallback, useEffect, useRef, useState } from 'react';
import { wrapText } from '../../engine/edits/layout';
import type { Edit, Rect, TextBox, TextStyle } from '../../engine/edits/model';
import type { TextBlock } from '../../engine/extract';
import type { PageSize } from '../../engine/zoom';
import { draftForBlock, draftForBox, draftForNewText, type TextDraft } from './drafts';
import { sameWidthsFont } from './Notices';
import { preparedMeasure } from './preview';
import { whenPageDrawn } from './samplePage';
import type { TextEditorHandle } from './TextEditor';
import type { DocumentEditor } from './useDocumentEditor';

const COVERED_NOTICE_KEY = 'smorsy.coveredNoticeSeen';

function coveredNoticeSeen(): boolean {
  try {
    return localStorage.getItem(COVERED_NOTICE_KEY) === 'yes';
  } catch {
    return false;
  }
}

function rememberCoveredNotice(): void {
  try {
    localStorage.setItem(COVERED_NOTICE_KEY, 'yes');
  } catch {
    // Worst case, the note shows again next time.
  }
}

/** Measures the text and turns a finished draft into the edit to record. */
async function editFromDraft(
  draft: TextDraft,
  text: string,
  rect: Rect,
  style: TextStyle,
): Promise<Edit> {
  const measure = await preparedMeasure(style, draft.original);
  const ratio = style.size / draft.style.size;
  const lineHeight = draft.lineHeight * ratio;
  const lines = wrapText(text, rect.width, measure);
  const fields = {
    rect: { ...rect, height: Math.max(lines.length, 1) * lineHeight },
    text,
    lines,
    style,
    lineHeight,
    firstBaseline: draft.firstBaseline * ratio,
  };
  if (draft.kind === 'update') {
    return lines.length === 0 && draft.covers.length === 0
      ? { kind: 'remove-text', id: draft.id }
      : { kind: 'update-text', id: draft.id, changes: fields };
  }
  const box: TextBox = {
    id: draft.id,
    pageNumber: draft.pageNumber,
    angle: draft.angle,
    covers: draft.covers,
    original: draft.original,
    ...fields,
  };
  return { kind: draft.kind === 'add' ? 'add-text' : 'replace-text', box };
}

export type TextSession = ReturnType<typeof useTextSession>;

/** The text being typed, and how it becomes edits. */
export function useTextSession(editor: DocumentEditor) {
  const { apply, undo: undoLog, redo: redoLog, dismissNotice: clearNotice, notice } = editor;
  const { reportProblem } = editor;
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [coveredSeen, setCoveredSeen] = useState(coveredNoticeSeen);
  const [widthsNoted, setWidthsNoted] = useState<ReadonlySet<string>>(() => new Set());
  const editorHandleRef = useRef<TextEditorHandle | null>(null);
  const pendingCommit = useRef<Promise<void>>(Promise.resolve());
  const commitsInProgress = useRef(0);
  const commitFailed = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const commitDraft = useCallback(
    (current: TextDraft, text: string, rect: Rect, style: TextStyle) => {
      setDraft(null);
      const unchanged =
        text === current.text &&
        rect === current.rect &&
        JSON.stringify(style) === JSON.stringify(current.style);
      if (unchanged || (current.kind === 'add' && text.trim() === '')) return;

      commitsInProgress.current += 1;
      // One after another, so edits are recorded in the order they were made.
      pendingCommit.current = pendingCommit.current
        .then(async () => {
          apply(await editFromDraft(current, text, rect, style));
        })
        .catch((error: unknown) => {
          console.error(error);
          commitFailed.current = true;
          setDraft((open) => open ?? { ...current, text, rect, style });
          reportProblem(
            'That edit couldn’t be applied, because its font didn’t load. Your text is still here. Try again, or choose another font.',
          );
        })
        .finally(() => {
          commitsInProgress.current -= 1;
        });
    },
    [apply, reportProblem],
  );

  const finishOpenEdit = useCallback(() => {
    editorHandleRef.current?.commit();
  }, []);

  /** Finishes any typing. Resolves false if it couldn't be applied, and the person has been told. */
  const flush = useCallback(async () => {
    finishOpenEdit();
    await pendingCommit.current;
    const failed = commitFailed.current;
    commitFailed.current = false;
    return !failed;
  }, [finishOpenEdit]);

  // Open text counts as the latest edit, so undo acts on it, and redo can bring it back.
  const undo = useCallback(() => {
    void flush().then((done) => {
      if (done) undoLog();
    });
  }, [flush, undoLog]);
  const redo = useCallback(() => {
    void flush().then((done) => {
      if (done) redoLog();
    });
  }, [flush, redoLog]);

  const widthsFont = notice ? sameWidthsFont(notice) : null;
  const showCovered = notice !== null && notice.box.covers.length > 0 && !coveredSeen;
  const showSameWidths = widthsFont !== null && !widthsNoted.has(widthsFont);

  // Finishing an edit removes what had focus, and keyboard users shouldn't lose their place.
  const settled = useRef(false);
  useEffect(() => {
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (document.activeElement === document.body) {
      document.querySelector<HTMLElement>('main.canvas')?.focus({ preventScroll: true });
    }
  }, [draft, editor.boxes]);

  const dismissNotice = () => {
    if (showCovered) {
      rememberCoveredNotice();
      setCoveredSeen(true);
    }
    if (showSameWidths) setWidthsNoted((seen) => new Set(seen).add(widthsFont));
    clearNotice();
  };

  const openBlock = async (
    block: TextBlock,
    pageElement: HTMLElement,
    scale: number,
    page: PageSize,
  ) => {
    finishOpenEdit();
    dismissNotice();
    // Sampling an unfinished page would read blank pixels, and patch a coloured page in white.
    const drawn = await whenPageDrawn(pageElement);
    const next = draftForBlock(block, page, pageElement, scale);
    setDraft(drawn ? next : { ...next, backgroundNotFlat: true });
  };

  const openBox = (box: TextBox) => {
    finishOpenEdit();
    dismissNotice();
    setDraft(draftForBox(box));
  };

  const addText = (pageNumber: number, x: number, y: number, page: PageSize) => {
    finishOpenEdit();
    dismissNotice();
    setDraft(draftForNewText(pageNumber, x, y, page));
  };

  /** A click on the empty page ends the current edit, or if there isn't one, starts a new one. */
  const clickEmptyPage = (pageNumber: number, x: number, y: number, page: PageSize) => {
    if (draftRef.current) {
      dismissNotice();
      finishOpenEdit();
    } else {
      addText(pageNumber, x, y, page);
    }
  };

  const deleteBlock = (
    block: TextBlock,
    pageElement: HTMLElement,
    scale: number,
    page: PageSize,
  ) => {
    const target = draftForBlock(block, page, pageElement, scale);
    commitDraft(target, '', target.rect, target.style);
  };

  return {
    draft,
    editorHandleRef,
    commitDraft,
    cancelDraft: () => {
      setDraft(null);
    },
    finishOpenEdit,
    flush,
    hasUnfinishedEdit: () => draftRef.current !== null || commitsInProgress.current > 0,
    undo,
    redo,
    showCovered,
    showSameWidths,
    dismissNotice,
    openBlock,
    openBox,
    addText,
    clickEmptyPage,
    deleteBlock,
  };
}
