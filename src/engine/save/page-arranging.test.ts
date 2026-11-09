import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFStream,
  StandardFonts,
  degrees,
} from '@cantoo/pdf-lib';
import { describe, expect, it } from 'vitest';
import { openDocument } from '../document';
import type { Annotation } from '../edits/annotations';
import { identityLayout, keepPages, movePages, removePages, turnPages } from '../pages/layout';
import type { FontBytes } from './choose-font';
import { PdfEditor } from './editor';
import { testPng } from '../../../tests/helpers/test-png';

const fonts: FontBytes = {
  bundled: (file) => Promise.resolve(new Uint8Array(readFileSync(join('assets/fonts', file)))),
  system: () => Promise.resolve(null),
};

async function numbered(count = 4, change?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let index = 1; index <= count; index += 1) {
    doc
      .addPage([600, 800])
      .drawText(`Page ${String(index)} words`, { x: 72, y: 700, size: 20, font });
  }
  change?.(doc);
  return doc.save();
}

const arranged = async (bytes: Uint8Array, layout: ReturnType<typeof identityLayout>) =>
  new PdfEditor(bytes, fonts).save([], [], { layout });

async function firstLines(bytes: Uint8Array): Promise<readonly string[]> {
  const doc = await openDocument(bytes);
  const lines: string[] = [];
  for (let page = 1; page <= doc.pageCount; page += 1) {
    const { blocks } = await doc.pageText(page);
    lines.push(blocks[0]?.text ?? '');
  }
  await doc.close();
  return lines;
}

/** Every bit of text in the file, whether or not a page still uses it. */
async function everythingIn(bytes: Uint8Array): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const text: string[] = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (object instanceof PDFStream) {
      try {
        const { decodePDFRawStream } = await import('@cantoo/pdf-lib');
        text.push(new TextDecoder('latin1').decode(decodePDFRawStream(object as never).decode()));
      } catch {
        // Not a stream the test can read, which can't hold the page's words.
      }
    }
    if (object instanceof PDFHexString) text.push(object.decodeText());
  }
  return text.join(' ');
}

describe('saving arranged pages', () => {
  it('puts them in the new order', async () => {
    const saved = await arranged(await numbered(), movePages(identityLayout(4), new Set([4]), 1));
    expect(await firstLines(saved)).toEqual([
      'Page 4 words',
      'Page 1 words',
      'Page 2 words',
      'Page 3 words',
    ]);
  });

  it('turns them, on top of any turn they had', async () => {
    const original = await numbered(2, (doc) => {
      doc.getPage(1).setRotation(degrees(90));
    });
    const saved = await PDFDocument.load(
      await arranged(original, turnPages(identityLayout(2), new Set([1, 2]), 1)),
    );
    expect(saved.getPages().map((page) => page.getRotation().angle)).toEqual([90, 180]);
  });

  it('leaves out removed pages, and erases what was on them', async () => {
    const saved = await arranged(await numbered(), removePages(identityLayout(4), new Set([2])));
    expect(await firstLines(saved)).toEqual(['Page 1 words', 'Page 3 words', 'Page 4 words']);
    // The library writes standard-font text as hex, which is what to look for.
    const asDrawn = (text: string) => Buffer.from(text, 'latin1').toString('hex').toUpperCase();
    const everything = (await everythingIn(saved)).toUpperCase();
    expect(everything).toContain(asDrawn('Page 3'));
    expect(everything).not.toContain(asDrawn('Page 2'));
  });

  it('erases a removed page’s pictures and comments, but keeps what kept pages share', async () => {
    const original = await numbered(2, (doc) => {
      const { context } = doc;
      const shared = context.register(context.formXObject([], { BBox: [0, 0, 1, 1] }));
      const secret = context.register(
        context.formXObject([], {
          BBox: [0, 0, 1, 1],
          Mark: PDFHexString.fromText('Removed picture'),
        }),
      );
      doc.getPage(0).node.newXObject('Shared', shared);
      doc.getPage(1).node.newXObject('Shared', shared);
      doc.getPage(1).node.newXObject('Secret', secret);
      doc.getPage(1).node.addAnnot(
        context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Text',
            Rect: [1, 1, 9, 9],
            Contents: PDFHexString.fromText('Removed comment'),
          }),
        ),
      );
    });
    const saved = await arranged(original, removePages(identityLayout(2), new Set([2])));
    const doc = await PDFDocument.load(saved);
    const everything = [...doc.context.enumerateIndirectObjects()]
      .map(([, object]) => (object instanceof PDFStream ? object.dict.toString() : String(object)))
      .join(' ');
    expect(everything).not.toContain('Removed');
    const drawings = doc.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
    // The library adds its own ending to the name, so this looks at whatever is there.
    const [kept] = drawings?.values() ?? [];
    expect(doc.context.lookup(kept)).toBeInstanceOf(PDFStream);
  });

  it('removes a form field that was only on a removed page', async () => {
    const original = await numbered(2, (doc) => {
      const form = doc.getForm();
      form.createTextField('keep').addToPage(doc.getPage(0));
      form.createTextField('gone').addToPage(doc.getPage(1));
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(2), new Set([2]))),
    );
    expect(
      saved
        .getForm()
        .getFields()
        .map((field) => field.getName()),
    ).toEqual(['keep']);
  });

  it('drops links to a removed page, and bookmarks keep their names without going there', async () => {
    const original = await numbered(3, (doc) => {
      const { context } = doc;
      const target = doc.getPage(2).ref;
      doc.getPage(0).node.addAnnot(
        context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'Link',
            Rect: [1, 1, 9, 9],
            Dest: [target, 'Fit'],
          }),
        ),
      );
      const outlinesRef = context.nextRef();
      const item = context.register(
        context.obj({
          Title: PDFHexString.fromText('Chapter'),
          Parent: outlinesRef,
          Dest: [target, 'Fit'],
        }),
      );
      context.assign(
        outlinesRef,
        context.obj({ Type: 'Outlines', First: item, Last: item, Count: 1 }),
      );
      doc.catalog.set(PDFName.of('Outlines'), outlinesRef);
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(3), new Set([3]))),
    );
    expect(saved.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    const outlines = saved.catalog.lookup(PDFName.of('Outlines'), PDFDict);
    const first = outlines.lookup(PDFName.of('First'), PDFDict);
    expect(first.has(PDFName.of('Dest'))).toBe(false);
    expect(first.has(PDFName.of('Title'))).toBe(true);
  });

  it('keeps a page’s size and pictures when they come from the page tree above it', async () => {
    const original = await numbered(2, (doc) => {
      const page = doc.getPage(1);
      const parent = page.node.Parent();
      parent?.set(PDFName.of('MediaBox'), doc.context.obj([0, 0, 300, 400]));
      page.node.delete(PDFName.of('MediaBox'));
    });
    const saved = await PDFDocument.load(
      await arranged(original, movePages(identityLayout(2), new Set([2]), 1)),
    );
    expect(saved.getPage(0).getSize()).toEqual({ width: 300, height: 400 });
    expect(saved.getPageCount()).toBe(2);
  });

  it('flattens a deep page tree, with nothing left over', async () => {
    const saved = await PDFDocument.load(
      await arranged(
        new Uint8Array(readFileSync('test-pdfs/13-large-120-pages.pdf')),
        movePages(identityLayout(120), new Set([120]), 1),
      ),
    );
    expect(saved.getPageCount()).toBe(120);
    const root = saved.catalog.lookup(PDFName.of('Pages'), PDFDict);
    expect(root.lookup(PDFName.of('Count'), PDFNumber).asNumber()).toBe(120);
    expect(root.lookup(PDFName.of('Kids'), PDFArray).size()).toBe(120);
  });

  it('saves edits on the pages they were made on, wherever those pages end up', async () => {
    const mark: Annotation = {
      id: 'a',
      pageNumber: 2,
      color: { r: 1, g: 0, b: 0 },
      kind: 'comment',
      at: { x: 100, y: 100 },
      text: 'On page two',
    };
    const saved = await new PdfEditor(await numbered(3), fonts).save([], [], {
      annotations: [mark],
      layout: movePages(identityLayout(3), new Set([2]), 1),
    });
    const doc = await openDocument(saved);
    const notes = await doc.existingNotes(1);
    const { blocks } = await doc.pageText(1);
    await doc.close();
    expect(blocks[0]?.text).toBe('Page 2 words');
    expect(notes.map((note) => note.text)).toEqual(['On page two']);
  });

  it('erases a removed page’s thumbnail, picture masks, attached files and tags', async () => {
    const original = await numbered(2, (doc) => {
      const { context } = doc;
      const secret = (mark: string) =>
        context.register(
          context.formXObject([], { BBox: [0, 0, 1, 1], Mark: PDFHexString.fromText(mark) }),
        );
      const page = doc.getPage(1);
      page.node.set(PDFName.of('Thumb'), secret('Removed thumbnail'));
      const mask = secret('Removed mask');
      const picture = context.register(
        context.formXObject([], { BBox: [0, 0, 1, 1], SMask: mask }),
      );
      page.node.newXObject('Picture', picture);
      const file = secret('Removed attachment');
      page.node.addAnnot(
        context.register(
          context.obj({
            Type: 'Annot',
            Subtype: 'FileAttachment',
            Rect: [1, 1, 9, 9],
            FS: { Type: 'Filespec', EF: { F: file } },
          }),
        ),
      );
      const tag = context.register(
        context.obj({
          Type: 'StructElem',
          S: 'P',
          Alt: PDFHexString.fromText('Removed tag'),
          Pg: page.ref,
        }),
      );
      doc.catalog.set(
        PDFName.of('StructTreeRoot'),
        context.register(context.obj({ Type: 'StructTreeRoot', K: tag })),
      );
    });
    const saved = await arranged(original, removePages(identityLayout(2), new Set([2])));
    const doc = await PDFDocument.load(saved);
    const everything = [...doc.context.enumerateIndirectObjects()]
      .map(([, object]) => (object instanceof PDFStream ? object.dict.toString() : String(object)))
      .join(' ');
    expect(everything).not.toContain('Removed');
    expect(doc.catalog.has(PDFName.of('StructTreeRoot'))).toBe(false);
  });

  it('keeps what the document as a whole shares with a removed page', async () => {
    const original = await numbered(2, (doc) => {
      const { context } = doc;
      const profile = context.register(context.formXObject([], { BBox: [0, 0, 1, 1] }));
      doc.catalog.set(
        PDFName.of('OutputIntents'),
        context.obj([{ Type: 'OutputIntent', S: 'GTS_PDFA1', DestOutputProfile: profile }]),
      );
      doc.getPage(1).node.set(PDFName.of('Shared'), profile);
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(2), new Set([2]))),
    );
    const intents = saved.catalog.lookup(PDFName.of('OutputIntents'), PDFArray);
    const intent = intents.lookup(0, PDFDict);
    expect(intent.lookup(PDFName.of('DestOutputProfile'))).toBeInstanceOf(PDFStream);
  });

  it('drops named links to a page that’s gone, and an opening action written as an action', async () => {
    const original = await numbered(2, (doc) => {
      const { context } = doc;
      const gone = doc.getPage(1).ref;
      doc.catalog.set(
        PDFName.of('Dests'),
        context.obj({ Away: [gone, 'Fit'], Here: [doc.getPage(0).ref, 'Fit'] }),
      );
      doc.catalog.set(PDFName.of('OpenAction'), context.obj({ S: 'GoTo', D: [gone, 'Fit'] }));
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(2), new Set([2]))),
    );
    const dests = saved.catalog.lookup(PDFName.of('Dests'), PDFDict);
    expect(dests.has(PDFName.of('Away'))).toBe(false);
    expect(dests.has(PDFName.of('Here'))).toBe(true);
    expect(saved.catalog.has(PDFName.of('OpenAction'))).toBe(false);
  });

  it('doesn’t open on a page that’s gone', async () => {
    const original = await numbered(2, (doc) => {
      doc.catalog.set(PDFName.of('OpenAction'), doc.context.obj([doc.getPage(1).ref, 'Fit']));
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(2), new Set([2]))),
    );
    expect(saved.catalog.has(PDFName.of('OpenAction'))).toBe(false);
  });

  it('keeps a field’s boxes on pages that stay, and their looks', async () => {
    const original = await numbered(2, (doc) => {
      const group = doc.getForm().createRadioGroup('choice');
      group.addOptionToPage('a', doc.getPage(0));
      group.addOptionToPage('b', doc.getPage(1));
    });
    const saved = await PDFDocument.load(
      await arranged(original, removePages(identityLayout(2), new Set([2]))),
    );
    const widgets = saved.getForm().getRadioGroup('choice').acroField.getWidgets();
    expect(widgets).toHaveLength(1);
    expect(widgets[0]?.getNormalAppearance()).toBeDefined();
  });

  it('leaves nothing of a signature or new text placed on a page removed in the same save', async () => {
    const png = testPng(40, 20);
    const box = {
      id: 't',
      pageNumber: 2,
      rect: { x: 72, y: 72, width: 300, height: 30 },
      angle: 0,
      text: 'Ünique new words',
      lines: ['Ünique new words'],
      firstBaseline: 20,
      lineHeight: 24,
      style: {
        font: 'serif',
        size: 18,
        color: { r: 0, g: 0, b: 0 },
        bold: false,
        italic: false,
        align: 'left',
      },
      covers: [],
      original: null,
    } as const;
    const saved = await new PdfEditor(await numbered(2), fonts).save(
      [box],
      [
        {
          id: 's',
          pageNumber: 2,
          rect: { x: 100, y: 100, width: 120, height: 60 },
          angle: 0,
          image: { id: 'i', png, width: 40, height: 20, ink: null },
        },
      ],
      { layout: removePages(identityLayout(2), new Set([2])) },
    );
    const doc = await PDFDocument.load(saved);
    const kinds = [...doc.context.enumerateIndirectObjects()].map(([, object]) =>
      object instanceof PDFStream ? object.dict.toString() : '',
    );
    expect(kinds.some((kind) => kind.includes('/Image'))).toBe(false);
    expect(kinds.some((kind) => kind.includes('FontFile'))).toBe(false);
  });

  it('makes a new file of just some pages', async () => {
    const saved = await arranged(await numbered(), keepPages(identityLayout(4), new Set([3, 1])));
    expect(await firstLines(saved)).toEqual(['Page 1 words', 'Page 3 words']);
  });

  it('leaves the pages alone when nothing has moved', async () => {
    const original = await numbered(2);
    const saved = await PDFDocument.load(await arranged(original, identityLayout(2)));
    const before = await PDFDocument.load(original);
    expect(saved.getPages().map((page) => page.ref.toString())).toEqual(
      before.getPages().map((page) => page.ref.toString()),
    );
  });
});
