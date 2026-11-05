// Fails if test-only code reached a release: it includes a WebDriver server that would let other
// programs control the app. Usage: node scripts/check-release-clean.mjs <path-to-built-binary>
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN_IN_BUNDLE = ['smorsyTestDialogs', 'smorsyMock', '__wdio', 'tauri-plugin-wdio'];
const FORBIDDEN_IN_BINARY = ['tauri_plugin_wdio', 'tauri-plugin-wdio', 'wdio-webdriver'];

const problems = [];

function search(label, content, needles) {
  for (const needle of needles) {
    if (content.includes(needle)) problems.push(`${label} contains ${needle}`);
  }
}

for (const name of readdirSync('dist/assets')) {
  if (!name.endsWith('.js')) continue;
  search(
    `dist/assets/${name}`,
    readFileSync(join('dist/assets', name), 'latin1'),
    FORBIDDEN_IN_BUNDLE,
  );
}

const binary = process.argv[2];
if (!binary) {
  problems.push('No binary path was given.');
} else {
  search(binary, readFileSync(binary).toString('latin1'), FORBIDDEN_IN_BINARY);
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('No test code in this release.');
