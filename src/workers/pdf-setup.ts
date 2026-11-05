import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import rendererUrl from 'pdfjs-dist/legacy/build/pdf.renderer.min.mjs?url';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import type { PdfAssetUrls } from '../engine/document';

// pdf.js parses documents in one worker and paints pages in another, so a large file can't freeze
// the window. If the painting worker can't start, pdf.js falls back to the main thread.
GlobalWorkerOptions.workerSrc = workerUrl;
GlobalWorkerOptions.rendererSrc = rendererUrl;

const bundled = (folder: string) => new URL(`/pdfjs/${folder}/`, window.location.href).href;

/** All bundled with the app: pdf.js must never fetch these from the network. */
export const pdfAssets: PdfAssetUrls = {
  cMapUrl: bundled('cmaps'),
  standardFontDataUrl: bundled('standard_fonts'),
  wasmUrl: bundled('wasm'),
  iccUrl: bundled('iccs'),
};
