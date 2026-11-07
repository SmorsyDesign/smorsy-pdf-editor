import type { PlacedSignature, TextBox } from '../engine/edits/model';
import type { ReadAnnotations } from '../engine/save/annotation-reading';
import type { FontOutcome, SystemFontStyle } from '../engine/save/choose-font';
import { PdfEditor, type SaveExtras, type SaveReport } from '../engine/save/editor';

export type SaveRequest =
  | {
      readonly type: 'init';
      readonly bytes: Uint8Array;
      readonly systemFonts: Partial<Record<SystemFontStyle, Uint8Array>>;
    }
  | { readonly type: 'resolve'; readonly id: number; readonly box: TextBox }
  | { readonly type: 'read-annotations'; readonly id: number }
  | {
      readonly type: 'save';
      readonly id: number;
      readonly boxes: readonly TextBox[];
      readonly signatures: readonly PlacedSignature[];
      readonly extras: SaveExtras;
    };

export type SaveResponse =
  | { readonly id: number; readonly ok: true; readonly outcome: FontOutcome }
  | { readonly id: number; readonly ok: true; readonly report: SaveReport }
  | { readonly id: number; readonly ok: true; readonly existing: ReadAnnotations }
  | { readonly id: number; readonly ok: false; readonly error: string };

let editor: PdfEditor | null = null;

async function bundledFont(file: string): Promise<Uint8Array> {
  const response = await fetch(`/fonts/${file}`);
  if (!response.ok) throw new Error(`Bundled font ${file} is missing.`);
  return new Uint8Array(await response.arrayBuffer());
}

async function handle(request: Exclude<SaveRequest, { type: 'init' }>): Promise<SaveResponse> {
  if (!editor) throw new Error('The editor was used before it was set up.');
  if (request.type === 'resolve') {
    return { id: request.id, ok: true, outcome: await editor.resolveFont(request.box) };
  }
  if (request.type === 'read-annotations') {
    return { id: request.id, ok: true, existing: await editor.existingAnnotations() };
  }
  return {
    id: request.id,
    ok: true,
    report: await editor.saveWithReport(request.boxes, request.signatures, request.extras),
  };
}

// Saving can take seconds on a large file, and this worker keeps the window responsive meanwhile.
self.onmessage = (event: MessageEvent<SaveRequest>) => {
  const request = event.data;
  if (request.type === 'init') {
    const { bytes, systemFonts } = request;
    editor = new PdfEditor(bytes, {
      bundled: bundledFont,
      system: (style) => Promise.resolve(systemFonts[style] ?? null),
    });
    return;
  }
  handle(request)
    .then((response) => {
      if ('report' in response) {
        self.postMessage(response, { transfer: [response.report.bytes.buffer] });
      } else self.postMessage(response);
    })
    .catch((error: unknown) => {
      const failure: SaveResponse = {
        id: request.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
      self.postMessage(failure);
    });
};
