import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const binary = process.platform === 'win32' ? 'smorsy-pdf-editor.exe' : 'smorsy-pdf-editor';
const application = join(root, 'src-tauri/target/debug', binary);

// Native dialogs can't be automated. The test build grants this one folder instead, and tests
// replace only the dialogs, so file reading and saving run for real.
// WebdriverIO loads this file in several processes, and they must all share one folder.
if (!process.env['SMORSY_E2E_DIR']) {
  const workspace = mkdtempSync(join(tmpdir(), 'smorsy-native-'));
  for (const name of [
    '01-plain-text.pdf',
    '08-fillable-form.pdf',
    '05-non-latin.pdf',
    '09-scanned-image-only.pdf',
    '16-irs-form-w9.pdf',
  ]) {
    copyFileSync(join(root, 'test-pdfs', name), join(workspace, name));
  }
  process.env['SMORSY_E2E_DIR'] = workspace;
}

export const config = {
  runner: 'local',
  specs: [join(here, '*.spec.ts')],
  maxInstances: 1,
  services: [['@wdio/tauri-service', { appBinaryPath: application, driverProvider: 'embedded' }]],
  capabilities: [{ browserName: 'tauri', 'tauri:options': { application } }],
  logLevel: 'warn',
  bail: 0,
  waitforTimeout: 15_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 90_000 },
};
