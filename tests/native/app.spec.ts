import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { $, browser, expect } from '@wdio/globals';

const workspace = process.env['SMORSY_E2E_DIR'] ?? '';
const plainText = join(workspace, '01-plain-text.pdf');

/** Native dialogs can't be automated, so only they are replaced. File access stays real. */
async function answerDialogs(answers: { open?: string; save?: string }) {
  await browser.execute((given: { open?: string; save?: string }) => {
    (window as unknown as { smorsyTestDialogs: unknown }).smorsyTestDialogs = given;
  }, answers);
}

const pageIndicator = () => $('[data-testid="page-indicator"]');

/** Counts opaque dark pixels, so a page that was sized but never painted doesn't pass. */
async function waitForPageDrawn() {
  await browser.waitUntil(
    async () => {
      const dark = await browser.execute(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-page="1"] canvas');
        if (!canvas || canvas.width === 0) return 0;
        const copy = document.createElement('canvas');
        copy.width = canvas.width;
        copy.height = canvas.height;
        const context = copy.getContext('2d');
        if (!context) return 0;
        context.drawImage(canvas, 0, 0);
        const pixels = context.getImageData(0, 0, copy.width, copy.height).data;
        let count = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          if ((pixels[index + 3] ?? 0) === 255 && (pixels[index] ?? 255) < 128) count += 1;
        }
        return count;
      });
      return dark > 50;
    },
    { timeoutMsg: 'the page was never drawn' },
  );
}

async function invokeFromPage(command: string, body: unknown, path?: string) {
  return browser.execute(
    async (name: string, payload: unknown, target?: string) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: {
            invoke: (
              command: string,
              args: unknown,
              options?: { headers: Record<string, string> },
            ) => Promise<unknown>;
          };
        }
      ).__TAURI_INTERNALS__;
      try {
        const args = target ? new Uint8Array(payload as number[]) : payload;
        const options = target ? { headers: { 'x-path': encodeURIComponent(target) } } : undefined;
        await internals.invoke(name, args, options);
        return 'allowed';
      } catch (error) {
        return (error as { kind?: string }).kind ?? String(error);
      }
    },
    command,
    body,
    path,
  );
}

/** Native menus can't be automated either, so each file opens from a freshly loaded start screen. */
async function openFromStartScreen(path: string) {
  await browser.refresh();
  await expect($('h1=Open a PDF')).toBeDisplayed();
  await answerDialogs({ open: path });
  await browser.execute(() => {
    const violations: string[] = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
    (window as unknown as { cspViolations: string[] }).cspViolations = violations;
  });
  await $('button=Choose a file').click();
}

describe('the built app', () => {
  it('starts on the start screen', async () => {
    await expect($('h1=Open a PDF')).toBeDisplayed();
  });

  it('enforces the production security policy', async () => {
    const violation = await browser.execute(
      () =>
        new Promise<string>((resolve) => {
          document.addEventListener(
            'securitypolicyviolation',
            (event) => {
              resolve(event.effectiveDirective);
            },
            { once: true },
          );
          const script = document.createElement('script');
          script.textContent = 'window.inlineScriptRan = true;';
          document.head.append(script);
          setTimeout(() => {
            resolve('none');
          }, 2000);
        }),
    );
    expect(violation).toMatch(/^script-src/);
    const ran = await browser.execute(
      () => (window as unknown as { inlineScriptRan?: boolean }).inlineScriptRan ?? false,
    );
    expect(ran).toBe(false);
  });

  for (const [name, pages] of [
    ['01-plain-text.pdf', 3],
    ['05-non-latin.pdf', 1],
    ['09-scanned-image-only.pdf', 1],
    ['16-irs-form-w9.pdf', 6],
  ] as const) {
    it(`reads ${name} from disk and draws it, with no policy violations`, async () => {
      await openFromStartScreen(join(workspace, name));
      await expect(pageIndicator()).toHaveText(`Page 1 of ${pages}`);
      await waitForPageDrawn();
      const violations = await browser.execute(
        () => (window as unknown as { cspViolations: string[] }).cspViolations,
      );
      expect(violations).toEqual([]);
    });
  }

  it('can reach every file pdf.js loads at runtime', async () => {
    const statuses = await browser.execute(async () => {
      const paths = [
        '/pdfjs/cmaps/UniJIS-UTF16-H.bcmap',
        '/pdfjs/standard_fonts/LiberationSans-Regular.ttf',
        '/pdfjs/wasm/openjpeg.wasm',
        '/pdfjs/wasm/qcms_bg.wasm',
      ];
      return Promise.all(paths.map(async (path) => (await fetch(path)).status));
    });
    expect(statuses).toEqual([200, 200, 200, 200]);
  });

  it('saves a byte-identical copy to disk, with spaces and non-English characters', async () => {
    await openFromStartScreen(plainText);
    await expect(pageIndicator()).toHaveText('Page 1 of 3');

    const target = join(workspace, 'Résumé финал (2).pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();

    expect(readFileSync(target).equals(readFileSync(plainText))).toBe(true);
  });

  it('asks before replacing the original, even when the name is spelled differently', async () => {
    // macOS and Windows ignore case by default, so this is the same file under another spelling.
    await answerDialogs({ save: join(workspace, '01-PLAIN-TEXT.pdf') });
    await $('button=Save a copy').click();
    await expect($('h2=Replace your original file?')).toBeDisplayed();
    await $('button=Cancel').click();
  });

  it('refuses to write outside the allowed folder', async () => {
    const outcome = await invokeFromPage(
      'write_file_atomic',
      [1, 2, 3],
      join(workspace, '..', 'smorsy-outside-the-scope.pdf'),
    );
    expect(outcome).toBe('not-allowed');
  });

  it('refuses to read outside the allowed folder', async () => {
    const outcome = await invokeFromPage('plugin:fs|read_file', {
      path: join(workspace, '..', 'smorsy-outside-the-scope.pdf'),
    });
    expect(outcome).not.toBe('allowed');
  });
});
