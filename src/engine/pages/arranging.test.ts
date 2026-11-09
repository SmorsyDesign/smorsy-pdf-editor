import { describe, expect, it } from 'vitest';
import type { Annotation } from '../edits/annotations';
import { deriveAnnotations, deriveSignatures, deriveTextBoxes, type Edit } from '../edits/model';
import type { PlacedSignature, TextBox } from '../edits/model';
import {
  annotationsShown,
  deriveLayout,
  editsOnFilePages,
  signaturesShown,
  textBoxesShown,
} from './arranging';
import { identityLayout, movePages, removePages, turnPages, type Layout } from './layout';

const sizes = [
  { width: 600, height: 800 },
  { width: 600, height: 800 },
  { width: 800, height: 600 },
];
const color = { r: 0, g: 0, b: 0 };
const square = (id: string, pageNumber: number, x = 10): Annotation => ({
  id,
  pageNumber,
  color,
  kind: 'rect',
  rect: { x, y: 20, width: 100, height: 50 },
  width: 2,
});

const arrange = (layout: Layout): Edit => ({ kind: 'arrange-pages', layout });
const shown = (edits: readonly Edit[]) => {
  const layout = deriveLayout(edits, sizes.length);
  return annotationsShown(deriveAnnotations(editsOnFilePages(edits, sizes)), layout, sizes);
};

describe('edits on pages that move', () => {
  it('stay with their page when it moves', () => {
    const edits: Edit[] = [
      { kind: 'add-annotation', annotation: square('a', 3) },
      arrange(movePages(identityLayout(3), new Set([3]), 1)),
    ];
    expect(shown(edits)[0]?.pageNumber).toBe(1);
  });

  it('made after a move land on the page that was there', () => {
    const moved = movePages(identityLayout(3), new Set([3]), 1);
    const edits: Edit[] = [arrange(moved), { kind: 'add-annotation', annotation: square('a', 1) }];
    const onFile = editsOnFilePages(edits, sizes);
    const added = onFile.find((edit) => edit.kind === 'add-annotation');
    expect(added?.kind === 'add-annotation' ? added.annotation.pageNumber : 0).toBe(3);
    expect(shown(edits)[0]?.pageNumber).toBe(1);
  });

  it('go when their page is removed, and come back if it does', () => {
    const add: Edit = { kind: 'add-annotation', annotation: square('a', 2) };
    const removed = arrange(removePages(identityLayout(3), new Set([2])));
    expect(shown([add, removed])).toEqual([]);
    expect(shown([add, removed, arrange(identityLayout(3))])).toHaveLength(1);
  });

  it('change in place, wherever their page is', () => {
    const moved = movePages(identityLayout(3), new Set([1]), 4);
    const edits: Edit[] = [
      { kind: 'add-annotation', annotation: square('a', 1) },
      arrange(moved),
      { kind: 'change-annotation', annotation: square('a', 3, 200) },
    ];
    expect(shown(edits)).toEqual([{ ...square('a', 3, 200) }]);
  });
});

describe('edits on pages that turn', () => {
  it('turn with their page, and show where they were drawn', () => {
    const turned = turnPages(identityLayout(3), new Set([1]), 1);
    const [before] = shown([{ kind: 'add-annotation', annotation: square('a', 1) }]);
    const [after] = shown([
      { kind: 'add-annotation', annotation: square('a', 1) },
      arrange(turned),
    ]);
    expect(before?.kind === 'rect' && before.rect).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });
    expect(after?.kind === 'rect' && after.rect).toEqual({ x: 730, y: 10, width: 50, height: 100 });
  });

  it('made on a turned page are kept as the file’s page has them, and shown as drawn', () => {
    const turned = turnPages(identityLayout(3), new Set([1]), 1);
    const drawn = square('a', 1, 300);
    const edits: Edit[] = [arrange(turned), { kind: 'add-annotation', annotation: drawn }];
    expect(shown(edits)).toEqual([drawn]);
    const onFile = editsOnFilePages(edits, sizes).find((edit) => edit.kind === 'add-annotation');
    expect(onFile?.kind === 'add-annotation' ? onFile.annotation : null).toMatchObject({
      pageNumber: 1,
      rect: { x: 20, y: 400, width: 50, height: 100 },
    });
  });

  it('come back exactly after turning all the way round', () => {
    let layout = identityLayout(3);
    const edits: Edit[] = [{ kind: 'add-annotation', annotation: square('a', 3) }];
    for (let turn = 0; turn < 4; turn += 1) {
      layout = turnPages(layout, new Set([3]), 1);
      edits.push(arrange(layout));
    }
    expect(shown(edits)).toEqual([square('a', 3)]);
  });
});

describe('text boxes and signatures', () => {
  const box = {
    id: 't',
    pageNumber: 2,
    rect: { x: 10, y: 20, width: 200, height: 30 },
    angle: 0,
    text: 'Hello',
    lines: ['Hello'],
    firstBaseline: 20,
    lineHeight: 24,
    style: {} as TextBox['style'],
    covers: [],
    original: null,
  } as TextBox;

  it('a text box moved after its page turned lands where it was put', () => {
    const turned = turnPages(identityLayout(3), new Set([2]), 1);
    const edits: Edit[] = [
      { kind: 'add-text', box },
      arrange(turned),
      {
        kind: 'update-text',
        id: 't',
        changes: { rect: { x: 500, y: 40, width: 200, height: 30 } },
      },
    ];
    const layout = deriveLayout(edits, 3);
    const [shownBox] = textBoxesShown(
      deriveTextBoxes(editsOnFilePages(edits, sizes)),
      layout,
      sizes,
    );
    expect(shownBox?.rect).toEqual({ x: 500, y: 40, width: 200, height: 30 });
    expect(shownBox?.angle).toBe(90);
  });

  it('a signature moved to a page turned differently keeps looking the same', () => {
    const placed = {
      id: 's',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 100 },
      angle: 0,
      image: { id: 'i' },
    } as unknown as PlacedSignature;
    const turned = turnPages(identityLayout(3), new Set([2]), 1);
    const edits: Edit[] = [
      { kind: 'place-signature', placement: placed },
      arrange(turned),
      { kind: 'update-signature', id: 's', changes: { pageNumber: 2, rect: placed.rect } },
    ];
    const layout = deriveLayout(edits, 3);
    const [shownPlaced] = signaturesShown(
      deriveSignatures(editsOnFilePages(edits, sizes)),
      layout,
      sizes,
    );
    expect(shownPlaced).toMatchObject({ pageNumber: 2, angle: 0, rect: placed.rect });
  });

  it('a signature moved to a turned page lands where it was put', () => {
    const placed = {
      id: 's',
      pageNumber: 1,
      rect: { x: 100, y: 100, width: 200, height: 100 },
      angle: 0,
      image: { id: 'i' },
    } as unknown as PlacedSignature;
    const turned = turnPages(identityLayout(3), new Set([2]), 1);
    const target = { x: 50, y: 60, width: 200, height: 100 };
    const edits: Edit[] = [
      arrange(turned),
      { kind: 'place-signature', placement: placed },
      { kind: 'update-signature', id: 's', changes: { pageNumber: 2, rect: target, angle: 0 } },
    ];
    const layout = deriveLayout(edits, 3);
    const [shownPlaced] = signaturesShown(
      deriveSignatures(editsOnFilePages(edits, sizes)),
      layout,
      sizes,
    );
    expect(shownPlaced).toMatchObject({ pageNumber: 2, rect: target, angle: 0 });
  });
});
