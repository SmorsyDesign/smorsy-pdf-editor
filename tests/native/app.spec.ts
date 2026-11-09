import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument, PDFName, PDFRawStream } from '@cantoo/pdf-lib';
import { openDocument } from '../../src/engine/document';
import { testPng } from '../helpers/test-png';
import { join } from 'node:path';
import { $, browser, expect } from '@wdio/globals';

const workspace = process.env['SMORSY_E2E_DIR'] ?? '';
const plainText = join(workspace, '01-plain-text.pdf');

/** Native dialogs can't be automated, so only they are replaced. File access stays real. */
async function answerDialogs(answers: { open?: string; save?: string; image?: string }) {
  await browser.execute((given: { open?: string; save?: string; image?: string }) => {
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
    {
      timeoutMsg:
        'The page was never drawn. If this ran on a computer in use, check the test window was on screen: systems pause drawing in hidden windows.',
    },
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
        return (error as { kind?: string } | null)?.kind ?? String(error);
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
    await openFromStartScreen(plainText);
    await expect(pageIndicator()).toHaveText('Page 1 of 3');
    // macOS and Windows ignore case by default, so this is the same file under another spelling.
    await answerDialogs({ save: join(workspace, '01-PLAIN-TEXT.pdf') });
    await $('button=Save a copy').click();
    await expect($('h2=Replace your original file?')).toBeDisplayed();
    await $('button=Cancel').click();
  });

  it('edits text and saves it to disk, in the real app', async () => {
    await openFromStartScreen(plainText);
    await expect(pageIndicator()).toHaveText('Page 1 of 3');
    await waitForPageDrawn();

    await $('button=Edit text').click();
    await $('[aria-label^="Edit text: Plain text, page 1"]').click();
    const field = $('[data-testid="text-editor"] textarea');
    await field.setValue('Edited in the real app');
    await $('[aria-label="Delete this text"]').waitForDisplayed();

    const target = join(workspace, 'Edited copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();

    const saved = readFileSync(target);
    expect(saved.equals(readFileSync(plainText))).toBe(false);
    expect(saved.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    const reopened = await openDocument(new Uint8Array(saved));
    const { blocks } = await reopened.pageText(1);
    await reopened.close();
    expect(blocks.map((item) => item.text).join('\n')).toContain('Edited in the real app');

    const violations = await browser.execute(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual([]);
  });

  it('signs with a typed signature and saves it, under the production security policy', async () => {
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Sign').click();
    await $('button=Create signature').click();
    await $('button=Type').click();
    await $('#signature-name').setValue('Mara Okafor');
    await $('button=Use signature').click();
    await $('[data-testid="sign-layer"]').click();
    await expect($('[data-testid="placed-signature"]')).toBeDisplayed();

    const target = join(workspace, 'Signed copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();

    const saved = await PDFDocument.load(new Uint8Array(readFileSync(target)));
    const images = saved.context
      .enumerateIndirectObjects()
      .filter(
        ([, object]) =>
          object instanceof PDFRawStream &&
          object.dict.get(PDFName.of('Subtype')) === PDFName.of('Image'),
      );
    expect(images.length).toBeGreaterThan(0);
    const violations = await browser.execute(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual([]);
  });

  it('uploads a signature image from disk through the real file permissions', async () => {
    const image = join(workspace, 'My signature.png');
    writeFileSync(image, testPng(40, 20));
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Sign').click();
    await $('button=Create signature').click();
    await $('button=Upload').click();
    await answerDialogs({ image });
    await $('button=Choose an image').click();
    await expect($('.file-row strong')).toHaveText('My signature.png');
    await $('button=Use signature').click();
    await expect($('[aria-label^="Place signature 1"]')).toBeDisplayed();
    await $('[data-testid="sign-layer"]').click();
    await expect($('[data-testid="placed-signature"]')).toBeDisplayed();
    const target = join(workspace, 'Uploaded copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();
    expect(readFileSync(target).equals(readFileSync(plainText))).toBe(false);
  });

  it('annotates and saves through the real app', async () => {
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Annotate').click();
    await $('[aria-label="Rectangle"]').click();
    await $('[data-testid="draw-layer"]').click();
    await expect($('[data-kind="rect"]')).toExist();
    const target = join(workspace, 'Annotated copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();
    const saved = await PDFDocument.load(new Uint8Array(readFileSync(target)));
    expect(saved.getPage(0).node.Annots()?.size()).toBe(1);
  });

  it('reopens a saved comment with its tag, and deletes it, through the real app', async () => {
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Annotate').click();
    await $('[aria-label="Comment"]').click();
    await $('[data-testid="draw-layer"]').click();
    await $('textarea[aria-label="Comment"]').setValue('Please check this');
    await $('button.row-text').click();
    await $('input[aria-label="Add a tag"]').setValue('Chapter 1\n');
    const first = join(workspace, 'Commented copy.pdf');
    await answerDialogs({ save: first });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();

    await openFromStartScreen(first);
    await waitForPageDrawn();
    await $('button=Annotate').click();
    await expect($('.row-words')).toHaveText('Please check this');
    await expect($('.tag-filters button')).toHaveText('Chapter 1');
    await $('[aria-label="Delete comment"]').click();
    const second = join(workspace, 'Comment removed copy.pdf');
    await answerDialogs({ save: second });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();
    const saved = await PDFDocument.load(new Uint8Array(readFileSync(second)));
    expect(saved.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  it('turns and reorders pages and saves them through the real app', async () => {
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Pages').click();
    await $('button[aria-label="Page 3"]').click();
    await $('button[title="Move earlier"]').click();
    await $('button[title="Rotate right"]').click();
    const target = join(workspace, 'Arranged copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();
    const saved = await PDFDocument.load(new Uint8Array(readFileSync(target)));
    expect(saved.getPageCount()).toBe(3);
    expect(saved.getPage(1).getRotation().angle).toBe(90);
  });

  it('fills in a form and saves it through the real app', async () => {
    const form = join(workspace, '08-fillable-form.pdf');
    await openFromStartScreen(form);
    await waitForPageDrawn();
    await $('[aria-label="Student name"]').setValue('Theo Okafor');
    const target = join(workspace, 'Filled copy.pdf');
    await answerDialogs({ save: target });
    await $('button=Save a copy').click();
    await expect($('span=Copy saved')).toBeDisplayed();
    const saved = await PDFDocument.load(new Uint8Array(readFileSync(target)));
    expect(saved.getForm().getTextField('student.name').getText()).toBe('Theo Okafor');
  });

  it('asks before quitting the way the macOS Dock does', async function () {
    if (process.platform !== 'darwin') this.skip();
    await openFromStartScreen(plainText);
    await waitForPageDrawn();
    await $('button=Edit text').click();
    await $('[aria-label^="Edit text: Plain text, page 1"]').click();
    await $('[data-testid="text-editor"] textarea').setValue('Unsaved in the real app');
    await browser.keys(['Meta', 'Enter']);
    await browser.execute(() =>
      (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke: (command: string) => Promise<void> };
        }
      ).__TAURI_INTERNALS__.invoke('e2e_request_terminate'),
    );
    const prompt = $('[role="alertdialog"]');
    await expect(prompt).toBeDisplayed();
    await prompt.$('button=Cancel').click();
    await expect($('span*=unsaved change')).toBeDisplayed();
  });

  it('offers the computer’s Times New Roman when it has one', async () => {
    await openFromStartScreen(plainText);
    await expect(pageIndicator()).toHaveText('Page 1 of 3');
    await $('button=Edit text').click();
    await $('[aria-label^="Edit text: Plain text, page 1"]').click();
    await browser.waitUntil(() =>
      browser.execute(() =>
        Array.from(
          document.querySelectorAll<HTMLOptionElement>('select[aria-label="Font"] option'),
        ).some((option) => option.value === 'times-new-roman'),
      ),
    );
    await browser.keys('Escape');
  });

  it('can select text in Select mode, under the production security policy', async () => {
    await openFromStartScreen(plainText);
    await expect(pageIndicator()).toHaveText('Page 1 of 3');
    await browser.waitUntil(() =>
      browser.execute(() => document.querySelector('[data-testid="select-layer"] span') !== null),
    );
    const violations = await browser.execute(
      () => (window as unknown as { cspViolations: string[] }).cspViolations,
    );
    expect(violations).toEqual([]);
  });

  it('refuses to read a font outside its fixed list', async () => {
    const outcome = await invokeFromPage('read_system_font', { style: '../../etc/passwd' });
    expect(outcome).not.toBe('allowed');
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
