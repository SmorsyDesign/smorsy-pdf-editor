// Copies what the app loads at runtime into it, so it never needs the network: the files pdf.js
// uses, and the fonts saved PDFs can embed.
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

const fonts = join(root, 'public/fonts');
rmSync(fonts, { recursive: true, force: true });
cpSync(join(root, 'assets/fonts'), fonts, { recursive: true });
