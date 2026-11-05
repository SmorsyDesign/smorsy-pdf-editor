import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type PDFPageProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EngineError } from './errors';
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
  render(request: RenderRequest): RenderTask;
  /** Frees what a page holds in memory. Call it when the page scrolls well out of view. */
  release(pageNumber: number): void;
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
    ...assets,
  });
  try {
    return new PdfJsDocument(await loadingTask.promise, loadingTask);
  } catch (error) {
    await loadingTask.destroy();
    throw translateOpenError(error);
  }
}
