import {
  AnnotationMode,
  OPS,
  TextLayer,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EngineError } from './errors';
import type { FormField } from './forms/fields';
import type { ExistingNote } from './notes';
import { readExistingNotes, readFormFields } from './pdf-annotations';
import { groupTextItems, type PageText, type TextBlock } from './extract';
import { positionOf, type Layout } from './pages/layout';
import { fontsInText, rawItems } from './pdf-page-text';
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
  /** Saved annotations to leave out, by name. Left unset, it stays as it was last asked for. */
  readonly hiddenAnnotations?: readonly string[];
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
  /** Comments saved in the file earlier, whose words the page itself doesn't show. */
  existingNotes(pageNumber: number): Promise<readonly ExistingNote[]>;
  /** The same document with its pages in another order or turned. Page numbers follow that. */
  arranged(layout: Layout): PdfDocument;
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
  /** Shared by every arrangement of one document, as pdf.js keeps one store for it. */
  private readonly hidden: Map<number, readonly string[]>;
  /** Null for the file's own order, unturned. */
  private readonly layout: Layout | null;

  constructor(
    proxy: PDFDocumentProxy,
    loadingTask: PDFDocumentLoadingTask,
    layout: Layout | null = null,
    hidden = new Map<number, readonly string[]>(),
  ) {
    this.proxy = proxy;
    this.loadingTask = loadingTask;
    this.layout = layout;
    this.hidden = hidden;
  }

  get pageCount(): number {
    return this.layout?.length ?? this.proxy.numPages;
  }

  arranged(layout: Layout): PdfDocument {
    return new PdfJsDocument(this.proxy, this.loadingTask, layout, this.hidden);
  }

  /** Which of the file's pages is shown here, and how far it's turned. */
  private slot(pageNumber: number): { readonly source: number; readonly turns: number } {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.pageCount) {
      throw new EngineError('page-not-found', `Page ${pageNumber} of ${this.pageCount}`);
    }
    return this.layout?.[pageNumber - 1] ?? { source: pageNumber, turns: 0 };
  }

  private async page(pageNumber: number): Promise<PDFPageProxy> {
    return this.sourcePage(this.slot(pageNumber).source);
  }

  private async sourcePage(source: number): Promise<PDFPageProxy> {
    try {
      return await this.proxy.getPage(source);
    } catch (error) {
      // A file can open and still have a page that's broken inside it.
      throw new EngineError('page-unreadable', `Page ${source}`, { cause: error });
    }
  }

  /** How a page is shown here: the file's own turn, plus any it's been given since. */
  private viewport(page: PDFPageProxy, pageNumber: number, scale: number) {
    const { turns } = this.slot(pageNumber);
    return page.getViewport({ scale, rotation: (page.rotate + turns * 90) % 360 });
  }

  async pageSize(pageNumber: number): Promise<PageSize> {
    const { width, height } = this.viewport(await this.page(pageNumber), pageNumber, 1);
    return { width, height };
  }

  async pageText(pageNumber: number): Promise<PageText> {
    const page = await this.page(pageNumber);
    const viewport = this.viewport(page, pageNumber, 1);
    // The operator list also loads the page's fonts, which is what makes their details available.
    const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()]);

    const items = rawItems(content.items, viewport.transform);
    const blocks = groupTextItems(items, pageNumber, fontsInText(page, content));
    const scanned =
      blocks.length === 0 && operators.fnArray.some((operator) => IMAGE_OPERATORS.has(operator));
    return { blocks, scanned };
  }

  renderTextLayer(pageNumber: number, container: HTMLElement, zoomPercent: number): RenderTask {
    const stop = new AbortController();
    const finished = (async () => {
      const page = await this.page(pageNumber);
      if (stop.signal.aborted) return;
      const natural = this.viewport(page, pageNumber, 1);
      const { width } = displayedPageSize(natural, zoomPercent);
      const viewport = this.viewport(page, pageNumber, width / natural.width);
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
    const viewport = this.viewport(page, pageNumber, 1);
    const content = await page.getTextContent();
    const blocks = groupTextItems(
      rawItems(content.items, viewport.transform),
      pageNumber,
      new Map(),
    );
    page.cleanup();
    return blocks;
  }

  /**
   * pdf.js leaves out a saved annotation that's marked deleted in its editor's storage. Nothing else
   * can stop it being drawn. The prefix is pdf.js's own, and a test reads the pixels in case it moves.
   */
  private hideAnnotations(pageNumber: number, refs: readonly string[]): void {
    const storage = this.proxy.annotationStorage;
    const key = (ref: string) => `pdfjs_internal_editor_hide_${ref}`;
    // Kept by the file's own page, which is what pdf.js knows it by.
    const { source } = this.slot(pageNumber);
    for (const ref of this.hidden.get(source) ?? []) {
      if (!refs.includes(ref)) storage.remove(key(ref));
    }
    for (const ref of refs) {
      storage.setValue(key(ref), { deleted: true, id: ref, pageIndex: source - 1 });
    }
    this.hidden.set(source, refs);
  }

  render({
    pageNumber,
    canvas,
    zoomPercent,
    devicePixelRatio,
    hiddenAnnotations,
  }: RenderRequest): RenderTask {
    if (hiddenAnnotations) this.hideAnnotations(pageNumber, hiddenAnnotations);
    const stop = new AbortController();

    const finished = (async () => {
      const page = await this.page(pageNumber);
      if (stop.signal.aborted) return;
      const natural = this.viewport(page, pageNumber, 1);
      const displayed = displayedPageSize(natural, zoomPercent);
      // Scale from the rounded size, so the canvas and its CSS box match to the pixel.
      const viewport = this.viewport(page, pageNumber, displayed.width / natural.width);
      const pixels = canvasPixels(displayed, devicePixelRatio);
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      const task = page.render({
        canvas,
        viewport,
        transform: [pixels.outputScale, 0, 0, pixels.outputScale, 0, 0],
        // The only drawing mode that honours what's been asked to be left out.
        annotationMode: AnnotationMode.ENABLE_STORAGE,
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
    return readExistingNotes(page, this.viewport(page, pageNumber, 1));
  }

  formFields(): Promise<readonly FormField[]> {
    return readFormFields(this.proxy, async (source) => {
      const position = this.layout ? positionOf(this.layout, source) : source;
      // A field on a page that's been taken out has nowhere to be filled in.
      if (position === null) return null;
      const page = await this.sourcePage(source);
      return { page, position, viewport: this.viewport(page, position, 1) };
    });
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
