import type { Annotation } from '../engine/edits/annotations';
import type { PlacedSignature, TextBox } from '../engine/edits/model';
import type { FontOutcome, SystemFontStyle } from '../engine/save/choose-font';
import type { SaveExtras, SaveReport } from '../engine/save/editor';
import type { SaveRequest, SaveResponse } from './save-worker';

type Pending = (response: SaveResponse) => void;

/** Talks to the save worker. There's one per open document. */
export class SaveClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  /** Once set, the worker is gone, and waiting for its reply would wait forever. */
  private failure: string | null = null;

  constructor(bytes: Uint8Array, systemFonts: Partial<Record<SystemFontStyle, Uint8Array>>) {
    this.worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SaveResponse>) => {
      const { id } = event.data;
      this.pending.get(id)?.(event.data);
      this.pending.delete(id);
    };
    this.worker.onerror = (event) => {
      this.failure = event.message || 'The save worker stopped.';
      this.failPending(this.failure);
    };
    const init: SaveRequest = { type: 'init', bytes: bytes.slice(), systemFonts };
    this.worker.postMessage(init);
  }

  private request(build: (id: number) => SaveRequest): Promise<SaveResponse> {
    if (this.failure !== null) return Promise.reject(new Error(this.failure));
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (response) => {
        if (response.ok) resolve(response);
        else reject(new Error(response.error));
      });
      this.worker.postMessage(build(id));
    });
  }

  async resolveFont(box: TextBox): Promise<FontOutcome> {
    const response = await this.request((id) => ({ type: 'resolve', id, box }));
    if ('outcome' in response) return response.outcome;
    throw new Error('The save worker gave an unexpected reply.');
  }

  async existingAnnotations(): Promise<readonly Annotation[]> {
    const response = await this.request((id) => ({ type: 'read-annotations', id }));
    if ('annotations' in response) return response.annotations;
    throw new Error('The save worker gave an unexpected reply.');
  }

  async save(
    boxes: readonly TextBox[],
    signatures: readonly PlacedSignature[],
    extras: SaveExtras,
  ): Promise<SaveReport> {
    const response = await this.request((id) => ({ type: 'save', id, boxes, signatures, extras }));
    if ('report' in response) return response.report;
    throw new Error('The save worker gave an unexpected reply.');
  }

  /** The worker has gone, so a fresh client is needed. The edits themselves live elsewhere. */
  get failed(): boolean {
    return this.failure !== null;
  }

  close(): void {
    this.worker.terminate();
    this.failure ??= 'The document was closed.';
    this.failPending(this.failure);
  }

  private failPending(error: string): void {
    for (const [id, reply] of this.pending) reply({ id, ok: false, error });
    this.pending.clear();
  }
}
