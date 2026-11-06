import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlacedSignature,
  PlacedSignatureChanges,
  SignatureImage,
} from '../../engine/edits/model';
import { dateStampBox, newPlacementRect } from '../../engine/signatures/placement';
import { LETTER_PAGE, type PageSize } from '../../engine/zoom';
import type { DocumentEditor } from '../editing/useDocumentEditor';
import { INK_BLACK } from './makeSignature';

export type SignatureKind = 'signature' | 'initials';

export interface SignatureSlip {
  readonly image: SignatureImage;
  readonly kind: SignatureKind;
  readonly label: string;
}

const START_WIDTH: Readonly<Record<SignatureKind, number>> = { signature: 168, initials: 72 };
const DUPLICATE_OFFSET = 16;

/** Signatures made for this document, and which is being placed. Everything stays in memory. */
export function useSigning(
  editor: DocumentEditor,
  active: boolean,
  pageSizes: readonly (PageSize | undefined)[],
) {
  const { apply, signatures: placed } = editor;
  const [slips, setSlips] = useState<readonly SignatureSlip[]>([]);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(false);
  const [creating, setCreating] = useState<SignatureKind | null>(null);
  const urls = useRef(new Map<string, string>());

  // Leaving Sign mode shouldn't leave a click on the page waiting to place something.
  useEffect(() => {
    if (active) return;
    setPickedId(null);
    setSelectedId(null);
  }, [active]);

  const placing = pickedId !== null;
  useEffect(() => {
    if (!placing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPickedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [placing]);

  const urlFor = useCallback((image: SignatureImage) => {
    let url = urls.current.get(image.id);
    if (!url) {
      url = URL.createObjectURL(new Blob([new Uint8Array(image.png)], { type: 'image/png' }));
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
    }
    setPickedId(null);
    setSelectedId(id);
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

  const duplicate = (signature: PlacedSignature, page: PageSize) => {
    const id = crypto.randomUUID();
    const { rect } = signature;
    apply({
      kind: 'place-signature',
      placement: {
        ...signature,
        id,
        rect: {
          ...rect,
          x: Math.min(page.width - rect.width, rect.x + DUPLICATE_OFFSET),
          y: Math.min(page.height - rect.height, rect.y + DUPLICATE_OFFSET),
        },
      },
    });
    setSelectedId(id);
  };

  const remove = (id: string) => {
    apply({ kind: 'remove-signature', id });
    setSelectedId(null);
  };

  const addSlip = (image: SignatureImage, kind: SignatureKind, label: string) => {
    setSlips((current) => [...current, { image, kind, label }]);
    setPickedId(image.id);
    setSelectedId(null);
    setCreating(null);
  };

  const removeSlip = (id: string) => {
    setSlips((current) => current.filter((slip) => slip.image.id !== id));
    setPickedId((current) => (current === id ? null : current));
  };

  return {
    slips,
    pickedId,
    picked: slips.find((slip) => slip.image.id === pickedId) ?? null,
    pick: setPickedId,
    selected: placed.find((signature) => signature.id === selectedId) ?? null,
    select: setSelectedId,
    addDate,
    setAddDate,
    creating,
    startCreating: setCreating,
    addSlip,
    removeSlip,
    urlFor,
    place,
    placeInView,
    dropAt,
    change,
    duplicate,
    remove,
  };
}

export type Signing = ReturnType<typeof useSigning>;
