import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, degrees } from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Annotation } from '../edits/annotations';
import type { FontBytes } from './choose-font';
import { PdfEditor } from './editor';

const fonts: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

const color = { r: 1, g: 0.5, b: 0 };
const common = { id: 'x', pageNumber: 1, color };
const rect = { x: 100, y: 200, width: 150, height: 40 };

const KINDS: readonly Annotation[] = [
  { ...common, kind: 'highlight', rects: [rect], text: 'marked words' },
  { ...common, kind: 'underline', rects: [rect], text: 'marked words' },
  { ...common, kind: 'strikeout', rects: [rect], text: 'marked words' },
  {
    ...common,
    kind: 'pen',
    width: 2,
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 150 },
    ],
  },
  { ...common, kind: 'rect', rect, width: 2 },
  { ...common, kind: 'ellipse', rect, width: 2 },
  { ...common, kind: 'arrow', from: { x: 100, y: 100 }, to: { x: 200, y: 150 }, width: 2 },
  { ...common, kind: 'comment', at: { x: 300, y: 300 }, text: 'Ask about this' },
];

async function blank(change?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  doc.addPage([612, 792]);
  change?.(doc);
  return doc.save();
}

const saveWith = async (annotations: readonly Annotation[], change?: (doc: PDFDocument) => void) =>
  new PdfEditor(await blank(change), fonts).save([], [], { annotations });

const read = (bytes: Uint8Array) => new PdfEditor(bytes, fonts).existingAnnotations();

/** Changes the file the way another app, or someone tampering with it, might. */
async function tamper(bytes: Uint8Array, change: (dict: PDFDict, doc: PDFDocument) => void) {
  const doc = await PDFDocument.load(bytes);
  const dict = doc.getPage(0).node.Annots()?.lookup(0, PDFDict);
  if (!dict) throw new Error('Nothing to change.');
  change(dict, doc);
  return doc.save();
}

const SMORSY = PDFName.of('SmorsyAnnotation');

describe('reading back what this app saved', () => {
  for (const annotation of KINDS) {
    it(`gets back a ${annotation.kind} ready to edit`, async () => {
      const [found] = await read(await saveWith([annotation]));
      expect(found).toMatchObject({ ...annotation, id: found?.id });
      expect(found?.saved?.foreign).toBe(false);
      expect(found?.saved?.ref).toMatch(/^\d+R$/);
    });
  }

  for (const rotation of [90, 180, 270]) {
    it(`gets them back on a page turned ${String(rotation)}°`, async () => {
      const turned = (doc: PDFDocument) => {
        doc.getPage(0).setRotation(degrees(rotation));
      };
      const found = await read(await saveWith(KINDS, turned));
      expect(found.map((one) => one.kind)).toEqual(KINDS.map((one) => one.kind));
      expect(found.every((one) => one.saved?.foreign === false)).toBe(true);
    });
  }

  it('gets them back on a cropped page', async () => {
    const cropped = (doc: PDFDocument) => {
      doc.getPage(0).setCropBox(50, 60, 400, 500);
    };
    const [found] = await read(await saveWith([KINDS[4] as Annotation], cropped));
    expect(found).toMatchObject({ kind: 'rect', rect });
    expect(found?.saved?.foreign).toBe(false);
  });

  it('gets them back on a page with its own scale', async () => {
    const scaled = (doc: PDFDocument) => {
      doc.getPage(0).node.set(PDFName.of('UserUnit'), PDFNumber.of(2));
    };
    const [found] = await read(await saveWith([KINDS[4] as Annotation], scaled));
    expect(found).toMatchObject({ kind: 'rect', rect });
    expect(found?.saved?.foreign).toBe(false);
  });

  it('says which page each is on', async () => {
    const found = await read(await saveWith([{ ...(KINDS[4] as Annotation), pageNumber: 2 }]));
    expect(found[0]?.pageNumber).toBe(2);
    expect(found[0]?.saved?.pageNumber).toBe(2);
  });

  it('gives each a different id, even when pages share one', async () => {
    const found = await read(await saveWith(KINDS));
    expect(new Set(found.map((one) => one.id)).size).toBe(KINDS.length);
  });

  it('brings tags back', async () => {
    const tags = ['Chapter 1', 'Ask Daniel'];
    const [found] = await read(await saveWith([{ ...(KINDS[0] as Annotation), tags }]));
    expect(found?.tags).toEqual(tags);
  });

  it('leaves tags out when there are none', async () => {
    const [found] = await read(await saveWith([KINDS[0] as Annotation]));
    expect(found?.tags).toBeUndefined();
  });

  it('takes a comment’s words from the file, in case another app reworded it', async () => {
    const reworded = await tamper(await saveWith([KINDS[7] as Annotation]), (dict) => {
      dict.set(PDFName.of('Contents'), PDFHexString.fromText('New words'));
    });
    const [found] = await read(reworded);
    expect(found).toMatchObject({ kind: 'comment', text: 'New words' });
    expect(found?.saved?.foreign).toBe(false);
  });

  it('treats it as another app’s once another app has moved it', async () => {
    const moved = await tamper(await saveWith([KINDS[4] as Annotation]), (dict, doc) => {
      dict.set(PDFName.of('Rect'), doc.context.obj([300, 300, 400, 400]));
    });
    const [found] = await read(moved);
    expect(found).toMatchObject({ kind: 'foreign', subtype: 'Square' });
    expect(found?.saved?.foreign).toBe(true);
  });
});

describe('reading a file that says something strange', () => {
  const STRANGE = [
    'not json at all',
    '[]',
    'null',
    '{"kind":"rect"}',
    '{"kind":"rect","rect":{"x":"1","y":2,"width":3,"height":4},"width":2}',
    '{"kind":"rect","rect":{"x":1e308,"y":2,"width":3,"height":4},"width":2}',
    '{"kind":"rect","rect":{"x":1,"y":2,"width":3,"height":4},"width":-1}',
    '{"kind":"pen","points":[],"width":2}',
    '{"kind":"pen","points":"lots","width":2}',
    '{"kind":"pen","points":[{"x":1}],"width":2}',
    '{"kind":"highlight","rects":[null]}',
    '{"kind":"__proto__"}',
    '{"kind":"whiteout","rect":{"x":1,"y":2,"width":3,"height":4},"width":2}',
  ];
  for (const text of STRANGE) {
    it(`treats ${text.slice(0, 40)} as another app’s, without failing`, async () => {
      const odd = await tamper(await saveWith([KINDS[4] as Annotation]), (dict) => {
        dict.set(SMORSY, PDFHexString.fromText(text));
      });
      const [found] = await read(odd);
      expect(found).toMatchObject({ kind: 'foreign', subtype: 'Square' });
    });
  }

  it('ignores tags that aren’t a list of words', async () => {
    for (const text of ['nope', '{"a":1}', '[1,2,null]']) {
      const odd = await tamper(await saveWith([KINDS[4] as Annotation]), (dict) => {
        dict.set(PDFName.of('SmorsyTags'), PDFHexString.fromText(text));
      });
      const [found] = await read(odd);
      expect(found?.tags).toBeUndefined();
    }
  });

  it('keeps a mountain of tags to a sensible number and length', async () => {
    const many = JSON.stringify(
      Array.from({ length: 500 }, (_, i) => `${String(i)}${'x'.repeat(200)}`),
    );
    const odd = await tamper(await saveWith([KINDS[4] as Annotation]), (dict) => {
      dict.set(PDFName.of('SmorsyTags'), PDFHexString.fromText(many));
    });
    const [found] = await read(odd);
    expect(found?.tags?.length).toBeLessThanOrEqual(50);
    expect(found?.tags?.[0]?.length).toBeLessThanOrEqual(60);
  });
});

describe('reading what another app saved', () => {
  it('lists its comments and marks, but not its links', async () => {
    const found = await read(new Uint8Array(readFileSync('test-pdfs/11-annotations-links.pdf')));
    expect(found.map((one) => one.kind).sort()).toEqual(['comment', 'foreign']);
    expect(found.every((one) => one.saved?.foreign)).toBe(true);
    expect(found.find((one) => one.kind === 'foreign')).toMatchObject({ subtype: 'Highlight' });
  });

  const withStamp = (extra: Record<string, unknown> = {}, direct = false) =>
    blank((doc) => {
      const { context } = doc;
      const dict = context.obj({
        Type: 'Annot',
        Subtype: 'Stamp',
        Rect: [100, 600, 200, 650],
        ...(extra as Record<string, never>),
      });
      doc.getPage(0).node.addAnnot(direct ? (dict as never) : context.register(dict));
    });

  it('places it on the page as displayed', async () => {
    const [found] = await read(await withStamp());
    expect(found).toMatchObject({
      kind: 'foreign',
      rect: { x: 100, y: 142, width: 100, height: 50 },
    });
  });

  it('skips what the file has hidden', async () => {
    expect(await read(await withStamp({ F: 2 }))).toEqual([]);
    expect(await read(await withStamp({ F: 32 }))).toEqual([]);
  });

  it('skips one held directly in the list, which can’t be found again', async () => {
    expect(await read(await withStamp({}, true))).toEqual([]);
  });

  it('skips form fields, which have their own panel', async () => {
    const form = await blank((doc) => {
      doc.getForm().createTextField('name').addToPage(doc.getPage(0));
    });
    expect(await read(form)).toEqual([]);
  });

  it('finds nothing in a file with nothing in it', async () => {
    expect(await read(await blank())).toEqual([]);
  });
});

describe('saving changes to what was already there', () => {
  const reopened = async (annotations: readonly Annotation[]) => {
    const bytes = await saveWith(annotations);
    return { bytes, found: await read(bytes) };
  };

  const countOn = async (bytes: Uint8Array, page = 0) =>
    (await PDFDocument.load(bytes)).getPage(page).node.Annots()?.size() ?? 0;

  it('replaces a changed one rather than adding a second', async () => {
    const { bytes, found } = await reopened([KINDS[4] as Annotation]);
    const moved = { ...(found[0] as Annotation), rect: { ...rect, x: 300 } } as Annotation;
    const saved = await new PdfEditor(bytes, fonts).save([], [], { annotations: [moved] });
    expect(await countOn(saved)).toBe(1);
    const [again] = await read(saved);
    expect(again).toMatchObject({ kind: 'rect', rect: { x: 300 } });
    expect(again?.saved?.foreign).toBe(false);
  });

  it('removes a deleted one, leaving the others', async () => {
    const { bytes, found } = await reopened([KINDS[4] as Annotation, KINDS[5] as Annotation]);
    const source = found[0]?.saved;
    if (!source) throw new Error('It should have been read.');
    const saved = await new PdfEditor(bytes, fonts).save([], [], { removedSaved: [source] });
    expect((await read(saved)).map((one) => one.kind)).toEqual(['ellipse']);
  });

  it('moves one to another page without leaving it behind', async () => {
    const { bytes, found } = await reopened([KINDS[4] as Annotation]);
    const moved = { ...(found[0] as Annotation), pageNumber: 2 };
    const saved = await new PdfEditor(bytes, fonts).save([], [], { annotations: [moved] });
    expect(await countOn(saved, 0)).toBe(0);
    expect(await countOn(saved, 1)).toBe(1);
  });

  it('survives being saved and reopened over and over', async () => {
    let { bytes, found } = await reopened(KINDS);
    for (let round = 0; round < 3; round += 1) {
      bytes = await new PdfEditor(bytes, fonts).save([], [], { annotations: found });
      found = await read(bytes);
    }
    expect(found.map((one) => one.kind).sort()).toEqual(KINDS.map((one) => one.kind).sort());
    expect(found.every((one) => one.saved?.foreign === false)).toBe(true);
    expect(await countOn(bytes)).toBe(KINDS.length);
  });

  describe('made in another app', () => {
    const fixture = () => new Uint8Array(readFileSync('test-pdfs/11-annotations-links.pdf'));

    const foreignComment = async () => {
      const found = await read(fixture());
      const comment = found.find((one) => one.kind === 'comment');
      if (comment?.kind !== 'comment') throw new Error('The fixture should have a comment.');
      return comment;
    };

    it('changes a comment’s words, and leaves how it looks alone', async () => {
      const comment = await foreignComment();
      const saved = await new PdfEditor(fixture(), fonts).save([], [], {
        annotations: [{ ...comment, text: 'Reworded' }],
      });
      const again = (await read(saved)).find((one) => one.kind === 'comment');
      expect(again).toMatchObject({ text: 'Reworded', at: comment.at });
      expect(again?.saved?.foreign).toBe(true);
    });

    it('adds and removes tags on it', async () => {
      const comment = await foreignComment();
      const tagged = await new PdfEditor(fixture(), fonts).save([], [], {
        annotations: [{ ...comment, tags: ['Chapter 1'] }],
      });
      const withTag = (await read(tagged)).find((one) => one.kind === 'comment');
      expect(withTag?.tags).toEqual(['Chapter 1']);
      const cleared = await new PdfEditor(tagged, fonts).save([], [], {
        annotations: [{ ...(withTag as Annotation), tags: [] }],
      });
      expect((await read(cleared)).find((one) => one.kind === 'comment')?.tags).toBeUndefined();
    });

    it('deletes it, without touching the links on the same page', async () => {
      const before = await PDFDocument.load(fixture());
      const count = before.getPage(0).node.Annots()?.size() ?? 0;
      const comment = await foreignComment();
      if (!comment.saved) throw new Error('It should have been read.');
      const saved = await new PdfEditor(fixture(), fonts).save([], [], {
        removedSaved: [comment.saved],
      });
      expect(await countOn(saved)).toBeLessThan(count);
      expect((await read(saved)).some((one) => one.kind === 'comment')).toBe(false);
      const links = (await PDFDocument.load(saved))
        .getPage(0)
        .node.Annots()
        ?.asArray()
        .filter((entry) => {
          const dict = (before.context.lookup(entry) ?? null) as PDFDict | null;
          return dict?.get(PDFName.of('Subtype')) === PDFName.of('Link');
        });
      expect(links?.length).toBe(2);
    });
  });

  it('ignores a reference that this page doesn’t list', async () => {
    const { bytes } = await reopened([KINDS[4] as Annotation]);
    const saved = await new PdfEditor(bytes, fonts).save([], [], {
      removedSaved: [{ ref: '99999R', pageNumber: 1, foreign: false }],
    });
    expect(await countOn(saved)).toBe(1);
  });
});
