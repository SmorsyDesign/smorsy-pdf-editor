import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRef,
  PDFStream,
  PDFString,
  degrees,
} from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import type { Annotation } from '../edits/annotations';
import { PLAIN_PROBLEM } from '../errors';
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

const read = async (bytes: Uint8Array) =>
  (await new PdfEditor(bytes, fonts).existingAnnotations()).annotations;

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

  it('gives each a different id', async () => {
    const found = await read(await saveWith(KINDS));
    expect(new Set(found.map((one) => one.id)).size).toBe(KINDS.length);
  });

  it('lists one shared by two pages on each, under different ids', async () => {
    const shared = await blank((doc) => {
      const { context } = doc;
      const stamp = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [100, 100, 200, 200] }),
      );
      doc.getPage(0).node.addAnnot(stamp);
      doc.getPage(1).node.addAnnot(stamp);
    });
    const found = await read(shared);
    expect(found.map((one) => one.pageNumber)).toEqual([1, 2]);
    expect(new Set(found.map((one) => one.id)).size).toBe(2);
  });

  it('reads back a very long pen stroke and comment', async () => {
    const points = Array.from({ length: 30_000 }, (_, index) => ({
      x: 100 + (index % 300),
      y: 100 + (index % 500),
    }));
    const long: readonly Annotation[] = [
      { ...common, kind: 'pen', points, width: 2 },
      { ...common, id: 'y', kind: 'comment', at: { x: 5, y: 40 }, text: 'é'.repeat(100_000) },
    ];
    const { annotations, skipped } = await new PdfEditor(
      await saveWith(long),
      fonts,
    ).existingAnnotations();
    expect(skipped).toBe(0);
    expect(annotations.map((one) => one.kind).sort()).toEqual(['comment', 'pen']);
    expect(annotations.every((one) => one.saved?.foreign === false)).toBe(true);
    const comment = annotations.find((one) => one.kind === 'comment');
    expect(comment?.kind === 'comment' ? comment.text.length : 0).toBe(100_000);
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

  it('ignores tags that aren’t a list of words, or are far too long', async () => {
    for (const text of ['nope', '{"a":1}', '[1,2,null]', JSON.stringify(['x'.repeat(70_000)])]) {
      const odd = await tamper(await saveWith([KINDS[4] as Annotation]), (dict) => {
        dict.set(PDFName.of('SmorsyTags'), PDFHexString.fromText(text));
      });
      const [found] = await read(odd);
      expect(found?.tags).toBeUndefined();
    }
  });

  it('keeps a mountain of tags to a sensible number and length', async () => {
    const many = JSON.stringify(
      Array.from({ length: 200 }, (_, i) => `${String(i)}${'x'.repeat(200)}`),
    );
    const odd = await tamper(await saveWith([KINDS[4] as Annotation]), (dict) => {
      dict.set(PDFName.of('SmorsyTags'), PDFHexString.fromText(many));
    });
    const [found] = await read(odd);
    expect(found?.tags?.length).toBeLessThanOrEqual(50);
    expect(found?.tags?.[0]?.length).toBeLessThanOrEqual(60);
  });
});

describe('reading a file made to cause trouble', () => {
  it('stops at a sensible amount when one long text is repeated thousands of times', async () => {
    const hostile = await blank((doc) => {
      const { context } = doc;
      const words = context.register(PDFHexString.fromText('x'.repeat(40_000)));
      for (let index = 0; index < 1_000; index += 1) {
        doc.getPage(0).node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Stamp',
              Rect: [100, 100, 200, 200],
              Contents: words,
            }),
          ),
        );
      }
    });
    const { annotations, skipped } = await new PdfEditor(hostile, fonts).existingAnnotations();
    expect(annotations.length).toBeLessThan(1_000);
    expect(skipped).toBeGreaterThan(0);
  });

  it('reads text in any of the encodings PDFs use', async () => {
    const bom = (start: readonly number[], text: string) =>
      PDFHexString.of(
        [...start, ...new TextEncoder().encode(text)]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join(''),
      );
    const encoded = await blank((doc) => {
      const { context } = doc;
      doc.getPage(0).node.addAnnot(
        context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [100, 100, 120, 120],
            Contents: bom([0xef, 0xbb, 0xbf], 'Café'),
          }),
        ),
      );
    });
    expect((await read(encoded))[0]).toMatchObject({ text: 'Café' });
  });

  it('lists something listed twice only once', async () => {
    const twice = await blank((doc) => {
      const { context } = doc;
      const stamp = context.register(
        context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [1, 1, 9, 9] }),
      );
      doc.getPage(0).node.addAnnot(stamp);
      doc.getPage(0).node.addAnnot(stamp);
    });
    const found = await read(twice);
    expect(found).toHaveLength(1);
    if (!found[0]?.saved) throw new Error('It should have been read.');
    const saved = await new PdfEditor(twice, fonts).save([], [], {
      removedSaved: [found[0].saved],
    });
    expect(await read(saved)).toEqual([]);
  });

  it('stops reading, and says how many it left, once the file has used its allowance', async () => {
    const hostile = await blank((doc) => {
      const { context } = doc;
      const huge = context.register(PDFHexString.fromText('x'.repeat(4_000_000)));
      for (let index = 0; index < 40; index += 1) {
        doc.getPage(0).node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Stamp',
              Rect: [1, 1, 9, 9],
              SmorsyAnnotation: huge,
            }),
          ),
        );
      }
    });
    const { annotations, skipped } = await new PdfEditor(hostile, fonts).existingAnnotations();
    expect(annotations.length).toBeLessThan(40);
    expect(annotations.length + skipped).toBe(40);
  });

  it('keeps the others when one can’t be read', async () => {
    const odd = await blank((doc) => {
      const { context } = doc;
      const page = doc.getPage(0);
      page.node.addAnnot(
        context.register(context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [1, 1, 'x', 4] })),
      );
      page.node.addAnnot(
        context.register(
          context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [100, 100, 200, 200] }),
        ),
      );
    });
    const { annotations } = await new PdfEditor(odd, fonts).existingAnnotations();
    expect(annotations.length).toBeGreaterThanOrEqual(1);
  });

  it('counts one held directly in the list, so the person can be told', async () => {
    const direct = await blank((doc) => {
      const { context } = doc;
      doc
        .getPage(0)
        .node.addAnnot(
          context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [1, 1, 2, 2] }) as never,
        );
    });
    const { annotations, skipped } = await new PdfEditor(direct, fonts).existingAnnotations();
    expect(annotations).toEqual([]);
    expect(skipped).toBe(1);
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

  it('stops rather than saying it saved, when what changed can’t be found', async () => {
    const { bytes } = await reopened([KINDS[4] as Annotation]);
    const attempt = new PdfEditor(bytes, fonts).save([], [], {
      removedSaved: [{ ref: '99999R', pageNumber: 1, foreign: false }],
    });
    await expect(attempt).rejects.toThrow(PLAIN_PROBLEM);
  });

  describe('leaves no trace of what’s gone', () => {
    /** Everything in the file, whether or not any page still lists it. */
    const everythingIn = async (bytes: Uint8Array) => {
      const doc = await PDFDocument.load(bytes);
      return doc.context
        .enumerateIndirectObjects()
        .map(([, object]) => {
          if (object instanceof PDFDict) {
            return object
              .entries()
              .map(([, value]) => decoded(value))
              .join(' ');
          }
          return decoded(object);
        })
        .join(' ');
    };

    const decoded = (value: unknown) =>
      value instanceof PDFHexString || value instanceof PDFString ? value.decodeText() : '';

    const SECRET = 'Private words about a student';
    const secret: Annotation = { ...common, kind: 'comment', at: { x: 300, y: 300 }, text: SECRET };

    it('erases a deleted comment’s words', async () => {
      const { bytes, found } = await reopened([secret]);
      expect(await everythingIn(bytes)).toContain(SECRET);
      const source = found[0]?.saved;
      if (!source) throw new Error('It should have been read.');
      const saved = await new PdfEditor(bytes, fonts).save([], [], { removedSaved: [source] });
      expect(await everythingIn(saved)).not.toContain(SECRET);
    });

    it('erases the old words of one reworded', async () => {
      const { bytes, found } = await reopened([secret]);
      const reworded = { ...(found[0] as Annotation), text: 'Something else' } as Annotation;
      const saved = await new PdfEditor(bytes, fonts).save([], [], { annotations: [reworded] });
      const everything = await everythingIn(saved);
      expect(everything).not.toContain(SECRET);
      expect(everything).toContain('Something else');
    });

    it('erases one cleared and saved while still in the box', async () => {
      const { bytes, found } = await reopened([secret]);
      const cleared = { ...(found[0] as Annotation), text: '' } as Annotation;
      const saved = await new PdfEditor(bytes, fonts).save([], [], { annotations: [cleared] });
      expect(await everythingIn(saved)).not.toContain(SECRET);
      expect(await countOn(saved)).toBe(0);
    });

    it('erases a deleted highlight’s words and tags', async () => {
      const marked: Annotation = {
        ...common,
        kind: 'highlight',
        rects: [rect],
        text: SECRET,
        tags: ['Confidential tag'],
      };
      const { bytes, found } = await reopened([marked]);
      const source = found[0]?.saved;
      if (!source) throw new Error('It should have been read.');
      const everything = await everythingIn(
        await new PdfEditor(bytes, fonts).save([], [], { removedSaved: [source] }),
      );
      expect(everything).not.toContain(SECRET);
      expect(everything).not.toContain('Confidential tag');
    });

    it('removes a pop-up and a formatted copy of the words from another app’s comment', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        const popup = context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Popup',
            Rect: [0, 0, 10, 10],
            Contents: PDFHexString.fromText(SECRET),
          }),
        );
        const page = doc.getPage(0);
        page.node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Text',
              Rect: [100, 100, 120, 120],
              Contents: PDFHexString.fromText(SECRET),
              RC: PDFHexString.fromText(SECRET),
              Popup: popup,
            }),
          ),
        );
        page.node.addAnnot(popup);
      });
      const [comment] = await read(original);
      const reworded = await new PdfEditor(original, fonts).save([], [], {
        annotations: [{ ...(comment as Annotation), text: 'New' } as Annotation],
      });
      const dict = (await PDFDocument.load(reworded)).getPage(0).node.Annots()?.lookup(0, PDFDict);
      expect(dict?.has(PDFName.of('RC'))).toBe(false);
      if (!comment?.saved) throw new Error('It should have been read.');
      const deleted = await new PdfEditor(original, fonts).save([], [], {
        removedSaved: [comment.saved],
      });
      expect(await everythingIn(deleted)).not.toContain(SECRET);
    });

    it('isn’t stopped by a broken entry in some page’s list', async () => {
      const { bytes, found } = await reopened([secret]);
      const doc = await PDFDocument.load(bytes);
      doc.getPage(1).node.set(PDFName.of('Annots'), doc.context.obj([PDFRef.of(99_999)]));
      const broken = await doc.save();
      const source = found[0]?.saved;
      if (!source) throw new Error('It should have been read.');
      const saved = await new PdfEditor(broken, fonts).save([], [], { removedSaved: [source] });
      expect(await everythingIn(saved)).not.toContain(SECRET);
    });

    it('erases words held in a drawing nested inside its appearance', async () => {
      const MARK = 'NestedDrawingMark';
      const original = await blank((doc) => {
        const { context } = doc;
        const inner = context.register(
          context.formXObject([], { BBox: [0, 0, 9, 9], Mark: PDFHexString.fromText(MARK) }),
        );
        const outer = context.register(
          context.formXObject([], { BBox: [0, 0, 9, 9], Resources: { XObject: { FRM: inner } } }),
        );
        doc.getPage(0).node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Stamp',
              Rect: [1, 1, 9, 9],
              AP: { N: outer },
            }),
          ),
        );
      });
      const [stamp] = await read(original);
      if (!stamp?.saved) throw new Error('It should have been read.');
      const saved = await new PdfEditor(original, fonts).save([], [], {
        removedSaved: [stamp.saved],
      });
      const doc = await PDFDocument.load(saved);
      const marks = doc.context
        .enumerateIndirectObjects()
        .filter(
          ([, object]) =>
            object instanceof PDFStream && decoded(object.dict.get(PDFName.of('Mark'))) === MARK,
        );
      expect(marks).toEqual([]);
    });

    it('keeps a drawing the page itself also uses', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        const look = context.register(context.formXObject([], { BBox: [0, 0, 9, 9] }));
        const page = doc.getPage(0);
        page.node.newXObject('Shared', look);
        page.node.addAnnot(
          context.register(
            context.obj({ Type: 'Annot', Subtype: 'Stamp', Rect: [1, 1, 9, 9], AP: { N: look } }),
          ),
        );
      });
      const [stamp] = await read(original);
      if (!stamp?.saved) throw new Error('It should have been read.');
      const saved = await new PdfEditor(original, fonts).save([], [], {
        removedSaved: [stamp.saved],
      });
      const page = (await PDFDocument.load(saved)).getPage(0);
      const drawings = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      expect(drawings?.lookup(drawings.keys()[0] as PDFName)).toBeInstanceOf(PDFStream);
    });

    it('updates a reworded comment’s pop-up too, leaving no old words', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        const popup = context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Popup',
            Rect: [0, 0, 9, 9],
            Contents: PDFHexString.fromText(SECRET),
          }),
        );
        const page = doc.getPage(0);
        page.node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Text',
              Rect: [100, 100, 120, 120],
              Contents: PDFHexString.fromText(SECRET),
              Popup: popup,
            }),
          ),
        );
        page.node.addAnnot(popup);
      });
      const [comment] = await read(original);
      const saved = await new PdfEditor(original, fonts).save([], [], {
        annotations: [{ ...(comment as Annotation), text: 'New' } as Annotation],
      });
      expect(await everythingIn(saved)).not.toContain(SECRET);
    });

    it('leaves the words of another comment that shared them', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        const words = context.register(PDFHexString.fromText('Shared words'));
        for (const y of [100, 200]) {
          doc.getPage(0).node.addAnnot(
            context.register(
              context.obj({
                Type: 'Annot',
                Subtype: 'Text',
                Rect: [100, y, 120, y + 20],
                Contents: words,
              }),
            ),
          );
        }
      });
      const [first] = await read(original);
      if (!first?.saved) throw new Error('It should have been read.');
      const saved = await new PdfEditor(original, fonts).save([], [], {
        removedSaved: [first.saved],
      });
      const [left] = await read(saved);
      expect(left).toMatchObject({ kind: 'comment', text: 'Shared words' });
    });

    it('keeps formatted words when only its tags change', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        doc.getPage(0).node.addAnnot(
          context.register(
            context.obj({
              Type: 'Annot',
              Subtype: 'Text',
              Rect: [100, 100, 120, 120],
              Contents: PDFHexString.fromText('Words'),
              RC: PDFHexString.fromText('<b>Words</b>'),
            }),
          ),
        );
      });
      const [comment] = await read(original);
      const saved = await new PdfEditor(original, fonts).save([], [], {
        annotations: [{ ...(comment as Annotation), tags: ['Chapter 1'] }],
      });
      const dict = (await PDFDocument.load(saved)).getPage(0).node.Annots()?.lookup(0, PDFDict);
      expect(dict?.has(PDFName.of('RC'))).toBe(true);
    });

    it('keeps a drawing another annotation is also using', async () => {
      const original = await blank((doc) => {
        const { context } = doc;
        const look = context.register(context.formXObject([], { BBox: [0, 0, 10, 10] }));
        for (const y of [100, 200]) {
          doc.getPage(0).node.addAnnot(
            context.register(
              context.obj({
                Type: 'Annot',
                Subtype: 'Stamp',
                Rect: [100, y, 110, y + 10],
                AP: { N: look },
              }),
            ),
          );
        }
      });
      const [first] = await read(original);
      if (!first?.saved) throw new Error('It should have been read.');
      const saved = await new PdfEditor(original, fonts).save([], [], {
        removedSaved: [first.saved],
      });
      const left = (await PDFDocument.load(saved)).getPage(0).node.Annots()?.lookup(0, PDFDict);
      const ap = left?.lookup(PDFName.of('AP'), PDFDict);
      expect(ap?.lookup(PDFName.of('N'))).toBeInstanceOf(PDFStream);
    });
  });

  describe('another app’s comment with no words', () => {
    const empty = () =>
      blank((doc) => {
        const { context } = doc;
        doc
          .getPage(0)
          .node.addAnnot(
            context.register(
              context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [100, 100, 120, 120] }),
            ),
          );
      });

    it('keeps its tags', async () => {
      const original = await empty();
      const [comment] = await read(original);
      const saved = await new PdfEditor(original, fonts).save([], [], {
        annotations: [{ ...(comment as Annotation), tags: ['Chapter 1'] }],
      });
      expect((await read(saved))[0]?.tags).toEqual(['Chapter 1']);
    });

    it('is marked as needing a pin, since the file has no drawing of it', async () => {
      const [comment] = await read(await empty());
      expect(comment?.saved?.noLook).toBe(true);
    });
  });
});
