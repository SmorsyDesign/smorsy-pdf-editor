// Copies the files pdf.js loads at runtime into the app, so it never needs the network.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules/pdfjs-dist');
const target = join(root, 'public/pdfjs');

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
for (const folder of ['cmaps', 'iccs', 'standard_fonts', 'wasm']) {
  cpSync(join(source, folder), join(target, folder), { recursive: true });
}
cpSync(join(source, 'LICENSE'), join(target, 'LICENSE'));
