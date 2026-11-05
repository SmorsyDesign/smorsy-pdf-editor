// Regenerates test-pdfs/ 01 to 15 and tests/fixtures/. Run with `npm run fixtures`; needs qpdf and
// the Liberation fonts in assets/.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import fontkit from '@cantoo/fontkit';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
} from '@cantoo/pdf-lib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'test-pdfs');
const invalid = join(root, 'tests/fixtures');
const fontDir = join(root, 'assets/fonts/liberation');
const FIXED_DATE = new Date('2026-01-15T12:00:00Z');

mkdirSync(out, { recursive: true });
mkdirSync(invalid, { recursive: true });

const PARAGRAPH = [
  'This agreement renews the lease for Apartment 4B between Maple Court',
  'Apartments and the tenant. The renewal term begins on April 1, 2027 and',
  'ends on March 31, 2028. Monthly rent for the renewal term is $1,760, due',
  'on the first day of each month. All other terms stay in effect.',
];

async function newDoc(title) {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setCreationDate(FIXED_DATE);
  doc.setModificationDate(FIXED_DATE);
  doc.setProducer('Smorsy PDF Editor test fixtures');
  doc.setCreator('Smorsy PDF Editor test fixtures');
  return doc;
}

function drawLines(page, lines, { x = 72, y = 700, font, size = 12, gap = 16, color } = {}) {
  lines.forEach((text, index) => {
    page.drawText(text, { x, y: y - index * gap, font, size, ...(color ? { color } : {}) });
  });
}

async function save(doc, name) {
  writeFileSync(join(out, name), await doc.save({ updateFieldAppearances: false }));
}

async function plainText() {
  const doc = await newDoc('Plain text');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 3; n += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Plain text, page ${n}`, { x: 72, y: 730, font, size: 18 });
    drawLines(page, PARAGRAPH, { font });
  }
  await save(doc, '01-plain-text.pdf');
}

async function standardFonts() {
  const doc = await newDoc('Standard fonts');
  const page = doc.addPage([612, 792]);
  const fonts = [
    StandardFonts.Helvetica,
    StandardFonts.HelveticaBold,
    StandardFonts.TimesRoman,
    StandardFonts.TimesRomanItalic,
    StandardFonts.Courier,
    StandardFonts.CourierBold,
  ];
  let y = 720;
  for (const name of fonts) {
    const font = await doc.embedFont(name);
    page.drawText(`${name}: Monthly rent is $1,760`, { x: 72, y, font, size: 13 });
    y -= 32;
  }
  await save(doc, '02-standard-fonts.pdf');
}

async function embeddedFonts(name, title, subset) {
  const doc = await newDoc(title);
  doc.registerFontkit(fontkit);
  const sans = await doc.embedFont(readFileSync(join(fontDir, 'LiberationSans-Regular.ttf')), {
    subset,
  });
  const serif = await doc.embedFont(readFileSync(join(fontDir, 'LiberationSerif-Regular.ttf')), {
    subset,
  });
  const page = doc.addPage([612, 792]);
  page.drawText(subset ? 'Subset fonts: few glyphs stored' : 'Fully embedded fonts', {
    x: 72,
    y: 730,
    font: sans,
    size: 18,
  });
  drawLines(page, PARAGRAPH, { font: serif });
  await save(doc, name);
}

async function nonLatin() {
  const doc = await newDoc('Non-Latin text');
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(readFileSync(join(fontDir, 'LiberationSerif-Regular.ttf')), {
    subset: true,
  });
  const page = doc.addPage([612, 792]);
  drawLines(
    page,
    [
      'English: Monthly rent is due on the first day.',
      'Ukrainian: Орендна плата сплачується першого дня.',
      'Russian: Арендная плата вносится в первый день.',
      'Greek: Το ενοίκιο καταβάλλεται την πρώτη ημέρα.',
      'French: Le loyer est dû le premier jour du mois.',
    ],
    { font, gap: 24 },
  );
  await save(doc, '05-non-latin.pdf');
}

async function rotatedPages() {
  const doc = await newDoc('Rotated pages');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const angle of [0, 90, 180, 270]) {
    const page = doc.addPage([612, 792]);
    page.setRotation(degrees(angle));
    page.drawText(`This page has /Rotate ${angle}`, { x: 72, y: 700, font, size: 18 });
  }
  await save(doc, '06-rotated-pages.pdf');
}

async function mixedSizes() {
  const doc = await newDoc('Mixed page sizes');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const sizes = [
    ['US Letter', 612, 792],
    ['A4', 595, 842],
    ['Letter landscape', 792, 612],
    ['Legal', 612, 1008],
    ['Receipt', 226, 566],
    ['A3', 842, 1191],
  ];
  for (const [label, width, height] of sizes) {
    const page = doc.addPage([width, height]);
    page.drawText(label, { x: 24, y: height - 48, font, size: 18 });
  }
  await save(doc, '07-mixed-sizes.pdf');
}

async function fillableForm() {
  const doc = await newDoc('Fillable form');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const form = doc.getForm();
  page.drawText('Field trip consent form', { x: 72, y: 730, font, size: 18 });

  page.drawText('Student name', { x: 72, y: 690, font, size: 11 });
  form.createTextField('student.name').addToPage(page, { x: 72, y: 660, width: 300, height: 24 });
  page.drawText('Grade', { x: 72, y: 630, font, size: 11 });
  const grade = form.createDropdown('student.grade');
  grade.addOptions(['1', '2', '3', '4', '5']);
  grade.addToPage(page, { x: 72, y: 600, width: 100, height: 24 });
  page.drawText('Allergies?', { x: 72, y: 570, font, size: 11 });
  const allergies = form.createRadioGroup('health.allergies');
  allergies.addOptionToPage('no', page, { x: 72, y: 540, width: 16, height: 16 });
  allergies.addOptionToPage('yes', page, { x: 120, y: 540, width: 16, height: 16 });
  page.drawText('I give permission for my child to attend.', { x: 96, y: 512, font, size: 11 });
  form.createCheckBox('permission').addToPage(page, { x: 72, y: 508, width: 16, height: 16 });
  form.updateFieldAppearances(font);
  writeFileSync(join(out, '08-fillable-form.pdf'), await doc.save());
}

// A deliberately small PNG encoder, so a page can hold pixels and no text at all.
function chunk(type, data) {
  const head = Buffer.alloc(4);
  head.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([head, body, tail]);
}

function scannedPng(width, height) {
  const rows = Buffer.alloc((width + 1) * height);
  let seed = 7;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let y = 0; y < height; y += 1) {
    const row = y * (width + 1);
    const onTextLine = y > 120 && y < height - 120 && y % 40 < 18;
    for (let x = 0; x < width; x += 1) {
      const inMargin = x < 110 || x > width - 110;
      const ink = onTextLine && !inMargin && Math.floor(x / 9) % 6 !== 0 && random() > 0.35;
      rows[row + 1 + x] = ink ? 40 + random() * 40 : 228 + random() * 20;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function scanned() {
  const doc = await newDoc('Scanned page');
  const image = await doc.embedPng(scannedPng(1020, 1320));
  const page = doc.addPage([612, 792]);
  page.drawImage(image, { x: 0, y: 0, width: 612, height: 792 });
  await save(doc, '09-scanned-image-only.pdf');
}

async function passwordProtected() {
  const doc = await newDoc('Password protected');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  drawLines(doc.addPage([612, 792]), PARAGRAPH, { font });
  const plain = join(invalid, 'password-source.tmp.pdf');
  writeFileSync(plain, await doc.save());
  execFileSync('qpdf', [
    '--encrypt',
    'smorsy-test',
    'smorsy-owner',
    '256',
    '--',
    plain,
    join(out, '10-password-protected.pdf'),
  ]);
  rmSync(plain);
}

function annotation(doc, fields) {
  return doc.context.register(doc.context.obj({ Type: 'Annot', ...fields }));
}

async function annotationsAndLinks() {
  const doc = await newDoc('Annotations and links');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const second = doc.addPage([612, 792]);
  second.drawText('Second page, the target of an internal link', { x: 72, y: 700, font, size: 14 });
  drawLines(page, PARAGRAPH, { font });
  page.drawText('Visit example.com', { x: 72, y: 600, font, size: 12, color: rgb(0, 0, 0.8) });
  page.drawText('Go to page 2', { x: 72, y: 570, font, size: 12, color: rgb(0, 0, 0.8) });

  const uri = doc.context.obj({ S: 'URI' });
  uri.set(PDFName.of('URI'), PDFString.of('https://example.com/'));
  const refs = [
    annotation(doc, {
      Subtype: 'Highlight',
      Rect: [72, 696, 300, 714],
      QuadPoints: [72, 714, 300, 714, 72, 696, 300, 696],
      C: [1, 0.9, 0.2],
    }),
    annotation(doc, {
      Subtype: 'Text',
      Rect: [420, 690, 444, 714],
      Name: 'Comment',
      T: PDFString.of('Mara'),
      Contents: PDFString.of('Ask Daniel about the late fee.'),
      C: [1, 0.9, 0.3],
    }),
    annotation(doc, { Subtype: 'Link', Rect: [72, 596, 180, 612], Border: [0, 0, 0], A: uri }),
    annotation(doc, {
      Subtype: 'Link',
      Rect: [72, 566, 160, 582],
      Border: [0, 0, 0],
      Dest: [second.ref, PDFName.of('Fit')],
    }),
  ];
  page.node.set(PDFName.of('Annots'), doc.context.obj(refs));
  await save(doc, '11-annotations-links.pdf');
}

async function bookmarks() {
  const doc = await newDoc('Bookmarks');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = ['Introduction', 'Terms', 'Signatures'].map((title) => {
    const page = doc.addPage([612, 792]);
    page.drawText(title, { x: 72, y: 720, font, size: 20 });
    return { title, page };
  });
  const outlineRef = doc.context.nextRef();
  const refs = pages.map(() => doc.context.nextRef());
  pages.forEach(({ title, page }, index) => {
    const item = doc.context.obj({
      Title: PDFString.of(title),
      Parent: outlineRef,
      Dest: [page.ref, PDFName.of('Fit')],
    });
    if (index > 0) item.set(PDFName.of('Prev'), refs[index - 1]);
    if (index < pages.length - 1) item.set(PDFName.of('Next'), refs[index + 1]);
    doc.context.assign(refs[index], item);
  });
  doc.context.assign(
    outlineRef,
    doc.context.obj({
      Type: 'Outlines',
      First: refs[0],
      Last: refs[refs.length - 1],
      Count: PDFNumber.of(refs.length),
    }),
  );
  doc.catalog.set(PDFName.of('Outlines'), outlineRef);
  await save(doc, '12-bookmarks.pdf');
}

async function largeDocument() {
  const doc = await newDoc('120 page document');
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  for (let n = 1; n <= 120; n += 1) {
    const page = doc.addPage([612, 792]);
    page.drawText(`Chapter ${Math.ceil(n / 10)}, page ${n}`, { x: 72, y: 730, font, size: 16 });
    for (let block = 0; block < 6; block += 1) {
      drawLines(page, PARAGRAPH, { font, y: 690 - block * 100 });
    }
  }
  await save(doc, '13-large-120-pages.pdf');
}

async function imagesAndText() {
  const doc = await newDoc('Images and text');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const image = await doc.embedPng(scannedPng(300, 200));
  const page = doc.addPage([792, 612]);
  page.drawImage(image, { x: 72, y: 300, width: 300, height: 200 });
  drawLines(page, PARAGRAPH, { font, x: 72, y: 260 });
  await save(doc, '14-images-and-text.pdf');
}

async function colouredBackgrounds() {
  const doc = await newDoc('Coloured text and backgrounds');
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 640, width: 612, height: 152, color: rgb(0.08, 0.27, 0.45) });
  page.drawText('White text on a flat dark band', {
    x: 72,
    y: 700,
    font,
    size: 20,
    color: rgb(1, 1, 1),
  });
  for (let index = 0; index < 60; index += 1) {
    const shade = index / 60;
    page.drawRectangle({
      x: 72 + index * 8,
      y: 480,
      width: 8,
      height: 100,
      color: rgb(1 - shade, 0.8, shade),
    });
  }
  page.drawText('Text over a gradient, where a patch will show', {
    x: 84,
    y: 524,
    font,
    size: 13,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText('Red text on white', { x: 72, y: 430, font, size: 14, color: rgb(0.75, 0.1, 0.1) });
  await save(doc, '15-coloured-backgrounds.pdf');
}

// Enough of a signature for the app to detect it. It isn't a valid one, because no test needs it to
// verify yet; Phase 7's certificate signing brings real signatures.
async function digitallySigned() {
  const doc = await newDoc('Digitally signed');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  drawLines(page, PARAGRAPH, { font });
  const signature = doc.context.register(
    doc.context.obj({
      Type: 'Sig',
      Filter: 'Adobe.PPKLite',
      SubFilter: 'adbe.pkcs7.detached',
      ByteRange: [0, 100, 200, 300],
      Contents: PDFString.of('0000'),
    }),
  );
  const field = doc.context.register(
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Widget',
      FT: 'Sig',
      T: PDFString.of('Signature1'),
      V: signature,
      Rect: [72, 72, 272, 112],
      P: page.ref,
      F: 132,
    }),
  );
  page.node.set(PDFName.of('Annots'), doc.context.obj([field]));
  doc.catalog.set(PDFName.of('AcroForm'), doc.context.obj({ Fields: [field], SigFlags: 3 }));
  await save(doc, '19-digitally-signed.pdf');
}

async function invalidFiles() {
  writeFileSync(join(invalid, 'not-a-pdf.pdf'), 'This is a text file with a .pdf name.\n');
  writeFileSync(join(invalid, 'empty.pdf'), '');
  const whole = readFileSync(join(out, '01-plain-text.pdf'));
  writeFileSync(join(invalid, 'truncated.pdf'), whole.subarray(0, Math.floor(whole.length / 4)));

  // Opens fine, but its second page points at something that isn't a page. The extra layer in the
  // page tree stops pdf.js repairing this at open, which it does when the last page can't load.
  const doc = await newDoc('One damaged page');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let n = 1; n <= 3; n += 1) {
    doc.addPage([612, 792]).drawText(`Page ${n}`, { x: 72, y: 700, font, size: 18 });
  }
  const root = doc.catalog.Pages();
  const [first, , third] = doc.getPages();
  const broken = doc.context.register(PDFNumber.of(5));
  const branch = doc.context.register(
    doc.context.obj({
      Type: 'Pages',
      Parent: doc.catalog.get(PDFName.of('Pages')),
      Count: 2,
      Kids: [first.ref, broken],
    }),
  );
  root.set(PDFName.of('Kids'), doc.context.obj([branch, third.ref]));
  root.set(PDFName.of('Count'), PDFNumber.of(3));
  writeFileSync(join(invalid, 'bad-page.pdf'), await doc.save({ useObjectStreams: false }));
}

await plainText();
await standardFonts();
await embeddedFonts('03-subset-embedded.pdf', 'Subset fonts', true);
await embeddedFonts('04-full-embedded.pdf', 'Fully embedded fonts', false);
await nonLatin();
await rotatedPages();
await mixedSizes();
await fillableForm();
await scanned();
await passwordProtected();
await annotationsAndLinks();
await bookmarks();
await largeDocument();
await imagesAndText();
await colouredBackgrounds();
await digitallySigned();
await invalidFiles();
