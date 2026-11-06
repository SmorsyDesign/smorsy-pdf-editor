import {
  OPS,
  TextLayer,
  Util,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EngineError } from './errors';
import {
  fieldFromWidget,
  type FormField,
  type WidgetData,
  withBoxGroupsAsChoices,
} from './forms/fields';
import { noteFromAnnotation, type ExistingNote, type NoteData } from './notes';
import {
  groupTextItems,
  type FontFacts,
  type PageText,
  type RawTextItem,
  type TextBlock,
} from './extract';
import { styleFromName } from './fonts/match';
import { canvasPixels, displayedPageSize, type PageSize } from './zoom';

/** Where pdf.js finds its bundled files. Set in the app; Node tests don't need them. */
export interface PdfAssetUrls {
  readonly cMapUrl: string;
  readonly standardFontDataUrl: string;
  readonly wasmUrl: string;
  readonly iccUrl: string;
}

interface RenderRequest {
  readonly pageNumber: number;
  readonly canvas: HTMLCanvasElement;
  readonly zoomPercent: number;
  readonly devicePixelRatio: number;
}

export interface RenderTask {
  readonly finished: Promise<void>;
  cancel(): void;
}

export interface PdfDocument {
  readonly pageCount: number;
  pageSize(pageNumber: number): Promise<PageSize>;
  /** The lines and paragraphs on a page, and whether it's an image with no text. */
  pageText(pageNumber: number): Promise<PageText>;
  /** Just the text, for searching. It skips the images and fonts, which a scan is full of. */
  searchableText(pageNumber: number): Promise<readonly TextBlock[]>;
  /** Fills a container with invisible, selectable text laid over the drawn page. */
  renderTextLayer(pageNumber: number, container: HTMLElement, zoomPercent: number): RenderTask;
  render(request: RenderRequest): RenderTask;
  /** Frees what a page holds in memory. Call it when the page scrolls well out of view. */
  release(pageNumber: number): void;
  /** Every form field in the document, or nothing if it has no form. */
  formFields(): Promise<readonly FormField[]>;
  /** Sticky notes saved in the file earlier, whose words the page itself doesn't show. */
  existingNotes(pageNumber: number): Promise<readonly ExistingNote[]>;
  close(): Promise<void>;
}

const HEADER_SEARCH_BYTES = 1024;
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-

function hasPdfHeader(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length, HEADER_SEARCH_BYTES) - PDF_HEADER.length;
  for (let start = 0; start <= end; start += 1) {
    if (PDF_HEADER.every((value, offset) => bytes[start + offset] === value)) return true;
  }
  return false;
}

const IMAGE_OPERATORS: ReadonlySet<number> = new Set([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageMaskXObject,
]);

interface PdfJsFont {
  readonly name?: string;
  readonly bold?: boolean;
  readonly black?: boolean;
  readonly italic?: boolean;
  readonly isSerifFont?: boolean;
  readonly isMonospace?: boolean;
  readonly isType3Font?: boolean;
}

function readFontFacts(
  page: PDFPageProxy,
  fontKey: string,
  styles: Record<string, { ascent: number; descent: number; fontFamily: string }>,
): FontFacts {
  const font: PdfJsFont = page.commonObjs.has(fontKey)
    ? (page.commonObjs.get(fontKey) as PdfJsFont)
    : {};
  const style = styles[fontKey];
  const name = font.name ?? '';
  const named = styleFromName(name);
  return {
    name,
    bold: named.bold || font.bold === true || font.black === true,
    italic: named.italic || font.italic === true,
    serif: font.isSerifFont ?? style?.fontFamily === 'serif',
    monospace: font.isMonospace ?? style?.fontFamily === 'monospace',
    type3: font.isType3Font === true,
    ascent: style?.ascent || 0.8,
    descent: Math.abs(style?.descent ?? 0.2),
  };
}

function rawItems(items: readonly object[], transform: number[]): RawTextItem[] {
  const raw: RawTextItem[] = [];
  for (const item of items) {
    if (!('str' in item)) continue;
    const text = item as { str: string; transform: number[]; width: number; fontName: string };
    const matrix = Util.transform(transform, text.transform) as number[];
    const [a = 1, b = 0, c = 0, d = 1, e = 0, f = 0] = matrix;
    raw.push({
      text: text.str,
      matrix: [a, b, c, d, e, f],
      width: text.width,
      fontKey: text.fontName,
    });
  }
  return raw;
}

function translateOpenError(error: unknown): EngineError {
  const name = error instanceof Error ? error.name : '';
  const detail = error instanceof Error ? error.message : String(error);
  if (name === 'PasswordException') {
    return new EngineError('password-required', detail, { cause: error });
  }
  if (name === 'InvalidPDFException') {
    return new EngineError('damaged', detail, { cause: error });
  }
  // Anything else is the app failing, so the person shouldn't be told their file is damaged.
  return new EngineError('open-failed', detail, { cause: error });
}

class PdfJsDocument implements PdfDocument {
  private readonly proxy: PDFDocumentProxy;
  private readonly loadingTask: PDFDocumentLoadingTask;

  constructor(proxy: PDFDocumentProxy, loadingTask: PDFDocumentLoadingTask) {
    this.proxy = proxy;
    this.loadingTask = loadingTask;
  }

  get pageCount(): number {
    return this.proxy.numPages;
  }

  private async page(pageNumber: number): Promise<PDFPageProxy> {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new EngineError('page-not-found', `Page ${pageNumber} of ${this.pageCount}`);
    }
    try {
      return await this.proxy.getPage(pageNumber);
    } catch (error) {
      // A file can open and still have a page that's broken inside it.
      throw new EngineError('page-unreadable', `Page ${pageNumber}`, { cause: error });
    }
  }

  async pageSize(pageNumber: number): Promise<PageSize> {
    const { width, height } = (await this.page(pageNumber)).getViewport({ scale: 1 });
    return { width, height };
  }

  async pageText(pageNumber: number): Promise<PageText> {
    const page = await this.page(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    // The operator list also loads the page's fonts, which is what makes their details available.
    const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

    const items = rawItems(content.items, viewport.transform);
    const fonts = new Map<string, FontFacts>();
    const drawn = new Map<string, Set<string>>();
    for (const item of content.items) {
      if (!('str' in item)) continue;
      if (!fonts.has(item.fontName)) {
        fonts.set(item.fontName, readFontFacts(page, item.fontName, content.styles));
        drawn.set(item.fontName, new Set());
      }
      const characters = drawn.get(item.fontName);
      for (const character of item.str) characters?.add(character);
    }
    for (const [key, facts] of fonts) {
      fonts.set(key, { ...facts, knownCharacters: [...(drawn.get(key) ?? [])].join('') });
    }

    const blocks = groupTextItems(items, pageNumber, fonts);
    const scanned =
      blocks.length === 0 && operators.fnArray.some((operator) => IMAGE_OPERATORS.has(operator));
    return { blocks, scanned };
  }

  renderTextLayer(pageNumber: number, container: HTMLElement, zoomPercent: number): RenderTask {
    const stop = new AbortController();
    const finished = (async () => {
      const page = await this.page(pageNumber);
      if (stop.signal.aborted) return;
      const natural = page.getViewport({ scale: 1 });
      const { width } = displayedPageSize(natural, zoomPercent);
      const viewport = page.getViewport({ scale: width / natural.width });
      const layer = new TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      });
      stop.signal.addEventListener('abort', () => {
        layer.cancel();
      });
      await layer.render();
    })();
    return {
      finished,
      cancel: () => {
        stop.abort();
      },
    };
  }

  async searchableText(pageNumber: number): Promise<readonly TextBlock[]> {
    const page = await this.page(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const blocks = groupTextItems(
      rawItems(content.items, viewport.transform),
      pageNumber,
      new Map(),
    );
    page.cleanup();
    return blocks;
  }

  render({ pageNumber, canvas, zoomPercent, devicePixelRatio }: RenderRequest): RenderTask {
    const stop = new AbortController();

    const finished = (async () => {
      const page = await this.page(pageNumber);
      if (stop.signal.aborted) return;
      const natural = page.getViewport({ scale: 1 });
      const displayed = displayedPageSize(natural, zoomPercent);
      // Scale from the rounded size, so the canvas and its CSS box match to the pixel.
      const viewport = page.getViewport({ scale: displayed.width / natural.width });
      const pixels = canvasPixels(displayed, devicePixelRatio);
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const task = page.render({
        canvas,
        viewport,
        transform: [pixels.outputScale, 0, 0, pixels.outputScale, 0, 0],
      });
      stop.signal.addEventListener('abort', () => {
        task.cancel();
      });
      try {
        await task.promise;
      } catch (error) {
        if (error instanceof Error && error.name === 'RenderingCancelledException') return;
        throw new EngineError('render-failed', `Page ${pageNumber}`, { cause: error });
      }
    })();

    return {
      finished,
      cancel: () => {
        stop.abort();
      },
    };
  }

  release(pageNumber: number): void {
    // Nothing to free if the page can't load, and pdf.js skips pages that are still drawing.
    this.page(pageNumber).then(
      (page) => page.cleanup(),
      () => undefined,
    );
  }

  async existingNotes(pageNumber: number): Promise<readonly ExistingNote[]> {
    const page = await this.page(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const annotations = (await page.getAnnotations()) as readonly NoteData[];
    return annotations.flatMap(
      (data) =>
        noteFromAnnotation(data, ([x1 = 0, y1 = 0, x2 = 0, y2 = 0]) => [
          ...(viewport.convertToViewportPoint(x1, y1) as readonly number[]),
          ...(viewport.convertToViewportPoint(x2, y2) as readonly number[]),
        ]) ?? [],
    );
  }

  async formFields(): Promise<readonly FormField[]> {
    const objects = await this.proxy.getFieldObjects();
    if (!objects) return [];
    const pageNumbers = new Set<number>();
    for (const entries of objects.values()) {
      for (const entry of entries as readonly { page?: number }[]) {
        // A field that only groups others isn't on any page, which it reports as page -1.
        if (typeof entry.page === 'number' && entry.page >= 0) pageNumbers.add(entry.page + 1);
      }
    }
    const fields: FormField[] = [];
    for (const pageNumber of [...pageNumbers].sort((one, two) => one - two)) {
      const page = await this.page(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const widgets = (await page.getAnnotations()) as readonly WidgetData[];
      for (const widget of widgets) {
        const field = fieldFromWidget(widget, pageNumber, ([x1 = 0, y1 = 0, x2 = 0, y2 = 0]) => [
          ...(viewport.convertToViewportPoint(x1, y1) as readonly number[]),
          ...(viewport.convertToViewportPoint(x2, y2) as readonly number[]),
        ]);
        if (field) fields.push(field);
      }
    }
    return withBoxGroupsAsChoices(fields);
  }

  close(): Promise<void> {
    return this.loadingTask.destroy();
  }
}

export async function openDocument(bytes: Uint8Array, assets?: PdfAssetUrls): Promise<PdfDocument> {
  if (bytes.length === 0) throw new EngineError('empty-file', 'The file has no content.');
  if (!hasPdfHeader(bytes)) throw new EngineError('not-a-pdf', 'No PDF header found.');

  const loadingTask = getDocument({
    // pdf.js takes ownership of what it's given, and the original must survive for saving.
    data: bytes.slice(),
    fontExtraProperties: true,
    ...assets,
  });
  try {
    return new PdfJsDocument(await loadingTask.promise, loadingTask);
  } catch (error) {
    await loadingTask.destroy();
    throw translateOpenError(error);
  }
}
