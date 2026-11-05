import type { TextBox } from '../engine/edits/model';
import type { FontOutcome, SystemFontStyle } from '../engine/save/editor';
import type { SaveRequest, SaveResponse } from './save-worker';

type Pending = (response: SaveResponse) => void;

/** Talks to the save worker. There's one per open document. */
export class SaveClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(bytes: Uint8Array, systemFonts: Partial<Record<SystemFontStyle, Uint8Array>>) {
    this.worker = new Worker(new URL('./save-worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<SaveResponse>) => {
      const { id } = event.data;
      this.pending.get(id)?.(event.data);
      this.pending.delete(id);
    };
    this.worker.onerror = (event) => {
      const failure = event.message || 'The save worker stopped.';
      for (const [id, reply] of this.pending) reply({ id, ok: false, error: failure });
      this.pending.clear();
    };
    const init: SaveRequest = { type: 'init', bytes: bytes.slice(), systemFonts };
    this.worker.postMessage(init);
  }

  private request(build: (id: number) => SaveRequest): Promise<SaveResponse> {
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

  async save(boxes: readonly TextBox[]): Promise<Uint8Array> {
    const response = await this.request((id) => ({ type: 'save', id, boxes }));
    if ('bytes' in response) return response.bytes;
    throw new Error('The save worker gave an unexpected reply.');
  }

  close(): void {
    this.worker.terminate();
  }
}
