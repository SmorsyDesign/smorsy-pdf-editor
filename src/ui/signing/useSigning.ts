import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlacedSignature,
  PlacedSignatureChanges,
  SignatureImage,
} from '../../engine/edits/model';
import { dateStampBox, keptOnPage, newPlacementRect } from '../../engine/signatures/placement';
import { LETTER_PAGE, type PageSize } from '../../engine/zoom';
import type { DocumentEditor } from '../editing/useDocumentEditor';
import { INK_BLACK, pngObjectUrl } from './makeSignature';

export type SignatureKind = 'signature' | 'initials';

export interface SignatureSlip {
  readonly image: SignatureImage;
  readonly kind: SignatureKind;
  readonly label: string;
}

const START_WIDTH: Readonly<Record<SignatureKind, number>> = { signature: 168, initials: 72 };
const START_IMAGE_WIDTH = 240;
const DUPLICATE_OFFSET = 16;

const focusPages = () => {
  document.querySelector<HTMLElement>('main.canvas')?.focus({ preventScroll: true });
};

/** Signatures made for this document, and which is being placed. Everything stays in memory. */
export function useSigning(
  editor: DocumentEditor,
  active: boolean,
  pageSizes: readonly (PageSize | undefined)[],
) {
  const { apply, signatures: placed, boxes } = editor;
  const [slips, setSlips] = useState<readonly SignatureSlip[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(false);
  const [creating, setCreating] = useState<SignatureKind | null>(null);
  // Asked for once, because focusing whenever a page reappears would steal it and move the view.
  const [focusPlacedId, setFocusPlacedId] = useState<string | null>(null);
  const [focusSlipId, setFocusSlipId] = useState<string | null>(null);
  const urls = useRef(new Map<string, string>());
  const opener = useRef<HTMLElement | null>(null);
  const wasActive = useRef(active);
  // What each date stamp said, because the day may have changed by the time it's checked.
  const stampTexts = useRef(new Map<string, string>());

  // Leaving Sign mode shouldn't leave a click on the page waiting to do something.
  useEffect(() => {
    if (active) {
      wasActive.current = true;
      return;
    }
    setPickedId(null);
    setSelectedId(null);
    setMovingId(null);
    if (wasActive.current && document.activeElement === document.body) focusPages();
    wasActive.current = false;
  }, [active]);

  const waiting = pickedId !== null || movingId !== null;
  useEffect(() => {
    if (!waiting) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setPickedId(null);
      setMovingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [waiting]);

  const urlFor = useCallback((image: SignatureImage) => {
    let url = urls.current.get(image.id);
    if (!url) {
      url = pngObjectUrl(image.png);
      urls.current.set(image.id, url);
    }
    return url;
  }, []);

  useEffect(() => {
    const known = urls.current;
    return () => {
      for (const url of known.values()) URL.revokeObjectURL(url);
      known.clear();
    };
  }, []);

  const place = (
    slip: SignatureSlip,
    pageNumber: number,
    centreX: number,
    centreY: number,
    page: PageSize,
  ) => {
    const { image } = slip;
    const rect = newPlacementRect(
      centreX,
      centreY,
      START_WIDTH[slip.kind],
      image.width / image.height,
      page,
    );
    const id = crypto.randomUUID();
    const placement: PlacedSignature = { id, pageNumber, rect, angle: 0, image };
    // Sharing a group means one undo takes back the signature and its date together.
    apply({ kind: 'place-signature', placement }, id);
    if (addDate) {
      const box = dateStampBox(
        `date-${id}`,
        pageNumber,
        rect,
        0,
        page,
        image.ink ?? INK_BLACK,
        new Date(),
      );
      apply({ kind: 'add-text', box }, id);
      stampTexts.current.set(box.id, box.text);
    }
    setPickedId(null);
    setSelectedId(id);
    setFocusPlacedId(id);
  };

  /** An image from the Annotate tools. It handles just like a signature, without a date. */
  const placeImage = (image: SignatureImage, pageNumber: number) => {
    const page = pageSizes[pageNumber - 1] ?? LETTER_PAGE;
    const rect = newPlacementRect(
      page.width / 2,
      page.height / 2,
      START_IMAGE_WIDTH,
      image.width / image.height,
      page,
    );
    const id = crypto.randomUUID();
    apply({
      kind: 'place-signature',
      placement: { id, pageNumber, rect, angle: 0, image, purpose: 'image' },
    });
    setSelectedId(id);
    setFocusPlacedId(id);
  };

  /** For a keyboard, where there's no pointer to say where it goes. */
  const placeInView = (slip: SignatureSlip, pageNumber: number) => {
    const page = pageSizes[pageNumber - 1] ?? LETTER_PAGE;
    place(slip, pageNumber, page.width / 2, page.height / 2, page);
  };

  /** Places it at a point on screen, if that point is on a page. */
  const dropAt = (slip: SignatureSlip, clientX: number, clientY: number) => {
    const sheet = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>('[data-page]');
    const pageNumber = Number(sheet?.dataset['page']);
    const page = pageSizes[pageNumber - 1];
    if (!sheet || !page) return;
    const bounds = sheet.getBoundingClientRect();
    const scale = bounds.width / page.width;
    place(slip, pageNumber, (clientX - bounds.left) / scale, (clientY - bounds.top) / scale, page);
  };

  const change = (id: string, changes: PlacedSignatureChanges, group?: string) => {
    apply({ kind: 'update-signature', id, changes }, group);
  };

  /** Moves the chosen signature here, for anyone who can't drag it. */
  const moveHere = (
    signature: PlacedSignature,
    pageNumber: number,
    centreX: number,
    centreY: number,
    page: PageSize,
  ) => {
    const { rect, angle } = signature;
    const moved = { ...rect, x: centreX - rect.width / 2, y: centreY - rect.height / 2 };
    change(signature.id, { pageNumber, rect: keptOnPage(moved, angle, page) });
    setMovingId(null);
    setFocusPlacedId(signature.id);
  };

  const duplicate = (signature: PlacedSignature, page: PageSize) => {
    const id = crypto.randomUUID();
    const { rect, angle } = signature;
    const offset = { ...rect, x: rect.x + DUPLICATE_OFFSET, y: rect.y + DUPLICATE_OFFSET };
    apply({
      kind: 'place-signature',
      placement: { ...signature, id, rect: keptOnPage(offset, angle, page) },
    });
    setSelectedId(id);
    setFocusPlacedId(id);
  };

  const remove = (id: string) => {
    apply({ kind: 'remove-signature', id }, `removed-${id}`);
    // A date that came with it goes too, unless it's been reworded and so is the person's own text.
    const stampId = `date-${id}`;
    const stamp = boxes.find((box) => box.id === stampId);
    if (stamp && stamp.text === stampTexts.current.get(stampId)) {
      apply({ kind: 'remove-text', id: stampId }, `removed-${id}`);
    }
    setSelectedId(null);
    setMovingId(null);
    focusPages();
  };

  const startCreating = (kind: SignatureKind) => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCreating(kind);
  };

  const stopCreating = () => {
    setCreating(null);
    // Taken from the dialog as it closes, and handed back to where the person was.
    window.setTimeout(() => {
      opener.current?.focus();
      opener.current = null;
    }, 0);
  };

  const addSlip = (image: SignatureImage, kind: SignatureKind, label: string) => {
    setSlips((current) => [...current, { image, kind, label }]);
    setPickedId(image.id);
    setSelectedId(null);
    setMovingId(null);
    setCreating(null);
    opener.current = null;
    setFocusSlipId(image.id);
  };

  const removeSlip = (id: string) => {
    setSlips((current) => current.filter((slip) => slip.image.id !== id));
    setPickedId((current) => (current === id ? null : current));
  };

  const selected = placed.find((signature) => signature.id === selectedId) ?? null;

  return {
    slips,
    pickedId,
    picked: slips.find((slip) => slip.image.id === pickedId) ?? null,
    pick: (id: string | null) => {
      setPickedId(id);
      setMovingId(null);
    },
    selected,
    select: (id: string | null) => {
      // Choosing something else shouldn't leave the last one waiting to jump to the next click.
      setSelectedId(id);
      setMovingId((current) => (current === id ? current : null));
    },
    moving: selected && movingId === selected.id ? selected : null,
    toggleMoving: (id: string) => {
      setPickedId(null);
      setMovingId((current) => (current === id ? null : id));
    },
    addDate,
    setAddDate,
    creating,
    startCreating,
    stopCreating,
    addSlip,
    removeSlip,
    urlFor,
    place,
    placeImage,
    placeInView,
    dropAt,
    change,
    moveHere,
    duplicate,
    remove,
    focusPlacedId,
    placedFocused: () => {
      setFocusPlacedId(null);
    },
    focusSlipId,
    slipFocused: () => {
      setFocusSlipId(null);
    },
  };
}

export type Signing = ReturnType<typeof useSigning>;
