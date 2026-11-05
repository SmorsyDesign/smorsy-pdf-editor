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

async function openThroughDialog() {
  const choose = $('button=Choose a file');
  await choose.click();
}

const pageIndicator = () => $('[data-testid="page-indicator"]');

describe('the built app', () => {
  it('starts on the start screen', async () => {
    await expect($('h1=Open a PDF')).toBeDisplayed();
  });

  it('runs with the production security policy and no violations', async () => {
    const policy = await browser.execute(() => {
      const violations: string[] = [];
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push(`${event.violatedDirective}: ${event.blockedURI}`);
      });
      (window as unknown as { cspViolations: string[] }).cspViolations = violations;
      return 'listening';
    });
    expect(policy).toBe('listening');
  });

  it('reads a real file from disk and draws it', async () => {
    await answerDialogs({ open: plainText });
    await openThroughDialog();
    await expect(pageIndicator()).toHaveText('Page 1 of 3');

    await browser.waitUntil(
      () =>
        browser.execute(() => {
          const canvas = document.querySelector<HTMLCanvasElement>('[data-page="1"] canvas');
          const context = canvas?.getContext('2d');
          if (!canvas || !context || canvas.width === 0) return false;
          const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
          for (let index = 0; index < data.length; index += 4) {
            if ((data[index] ?? 255) < 128) return true;
          }
          return false;
        }),
      { timeoutMsg: 'the page was never drawn' },
    );
  });

  it('caused no security policy violations while drawing', async () => {
    const violations = await browser.execute(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual([]);
  });

  it('saves a byte-identical copy to disk, with spaces and non-English characters', async () => {
    const target = join(workspace, 'Résumé финал (2).pdf');
    await answerDialogs({ save: target });

    const save = $('button=Save a copy');
    await save.click();
    await expect($('span=Copy saved')).toBeDisplayed();

    expect(readFileSync(target).equals(readFileSync(plainText))).toBe(true);
  });

  it('refuses to write anywhere the dialogs and scope did not allow', async () => {
    const outcome = await browser.execute(
      async (path: string) => {
        const internals = (
          window as unknown as {
            __TAURI_INTERNALS__: {
              invoke: (
                command: string,
                body: Uint8Array,
                options: { headers: Record<string, string> },
              ) => Promise<unknown>;
            };
          }
        ).__TAURI_INTERNALS__;
        try {
          await internals.invoke('write_file_atomic', new Uint8Array([1, 2, 3]), {
            headers: { 'x-path': encodeURIComponent(path) },
          });
          return 'written';
        } catch (error) {
          return (error as { kind?: string }).kind ?? 'unknown';
        }
      },
      join(workspace, '..', 'smorsy-outside-the-scope.pdf'),
    );
    expect(outcome).toBe('not-allowed');
  });
});
