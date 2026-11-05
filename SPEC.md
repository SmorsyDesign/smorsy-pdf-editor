# Smorsy PDF Editor: Spec

## Part 1: Goal and constraints

You are a senior engineer experienced with Tauri, TypeScript and the PDF format. Build **Smorsy PDF Editor**, a desktop PDF editor for macOS and Windows, for me and my family. I'm a senior product designer, not a full-time engineer: explain trade-offs plainly when you need my decision.

**Goal:** open any PDF, edit it like a paid editor (text editing and signatures first), and save a new PDF. It should feel like a calm, native desktop tool.

**Constraints. These override everything else:**

- **Offline and private.** Documents never leave the device. No network access except the update check; no analytics or telemetry. Bundle every library and font.
- **macOS and Windows.** A universal macOS build (Apple Silicon and Intel) and Windows 10/11 x64. ⌘ on Mac, Ctrl on Windows. State minimum OS versions in `PLAN.md`.
- **Originals untouched.** Save to a new file by default; overwrite only after explicit confirmation.
- **Honest limits.** When an edit can't be faithful (missing glyphs, a scanned page), say so in the interface.
- **No stubs.** No placeholder UI, `TODO`s or half-built features in delivered code.

## Part 2: Stack, architecture and code quality

Check each library's current version, licence and maintenance with `context7` before installing. Propose replacements in `PLAN.md`.

| Area | Choice |
| --- | --- |
| Desktop shell | Tauri 2: WKWebView on macOS, WebView2 on Windows |
| UI | Vite, TypeScript (`strict`, no `any`), React |
| Rendering | `pdfjs-dist` |
| Editing and saving | `pdf-lib` or its maintained fork `@cantoo/pdf-lib`, plus `@pdf-lib/fontkit` |
| Drawn signatures | `signature_pad` |
| Certificate signing | `@signpdf/*` with `node-forge`, or a Rust crate behind a Tauri command; compare in `PLAN.md` |
| OCR | `tesseract.js`, English data bundled, in a Worker |
| Native features | Official Tauri plugins for dialogs, file system, updater and single instance |
| Tests | Vitest; Playwright against the Vite dev server in Chromium (≈ WebView2) and WebKit (≈ WKWebView); WebdriverIO `@wdio/tauri-service` for the built app on both platforms |
| Linting | typescript-eslint strict, Prettier, clippy, rustfmt, pre-commit hook |

**Architecture:**

- `src/engine/`: all PDF logic behind a typed API, with no React or Tauri imports, fully unit-tested.
- `src/platform/`: the only code that calls Tauri (open, save, file associations, updates), behind an interface with a browser mock for tests.
- Keep Rust minimal: only what the web layer can't do well.
- Every change is an entry in an immutable edit model. The canvas renders from it, undo and redo walk it, and saving applies it to the original bytes in one pass.
- Rendering, OCR, signing and saving run in Web Workers.
- Least-privilege Tauri capabilities: file access only to files the user picks or opens via the OS. Strict CSP; never load remote content.
- Bundle open-licence fonts: a sans, serif and mono with full Latin coverage, plus 3–4 handwriting fonts for typed signatures.

**Code quality:** write engine tests before the code they cover; keep modules small and single-purpose (split past about 300 lines); type errors and surface them in plain language, never swallow them; no dead code or unused dependencies; comments explain why, not what.

## Part 3: Features

Build in priority order. Priority 1 must be excellent before Priority 2 starts.

**P1, text editing (hardest; explain your approach in `PLAN.md`):**

- **Add:** click to place a text box; move, resize, wrap; font, size, colour, bold, italic, alignment.
- **Edit existing:** in Edit Text mode, hover outlines a line or block; click opens it pre-filled, matching position, size, colour and closest font.
- **Replace and delete:** cover the original with a background-matched patch (sample the rendered pixels), then draw the new text on top. Use the embedded font if it has every glyph needed; otherwise the closest bundled font, plus a notice.
- **Stretch, only if reliable across `test-pdfs/`:** also remove the original glyphs from the content stream. Fall back to the patch per page, and say so.
- **Scanned pages:** detect, explain, offer OCR.

**P1, signatures:**

- Create by drawing, typing (handwriting fonts), or uploading an image (auto-remove a white background).
- Save up to 3 signatures and initials locally, with one-click delete. Place, resize, rotate; optional date stamp.
- **Phase 7:** sign with a .p12/.pfx certificate or an in-app self-signed one; show and validate signature details; explain that self-signed shows as "validity unknown" in other readers.

**P2, core editor and desktop integration:**

- Open via native dialog, drag and drop onto the window or app icon, "Open with", or double-click (the default PDF app if the user chooses). A second file opens in the running app, not a new copy.
- Native menus with standard shortcuts (app menu on macOS, menu bar on Windows); recent files; remember window size and position.
- Thumbnails, continuous scroll, zoom, search; undo and redo for every edit.
- Annotations: highlight, underline, strikethrough, pen, shapes, arrows, sticky notes. Images and whiteout boxes.
- Fill forms with optional flattening. Save through the native dialog; warn before closing with unsaved changes.

**P3, page and document tools:** reorder, rotate, delete, duplicate, insert; merge, split, extract; OCR; safe redaction (remove the content beneath, or flatten that page and say so); page numbers, watermarks, headers and footers; compression; metadata removal; set and open passwords.

**Out of scope:** cloud, accounts, collaboration, send-for-signature, Office conversion.

## Part 4: Phase 0, plan and design (no app code)

**Step 1: Plan.** Run `/plugin` and note any missing tools from Part 6. Write `PLAN.md`: my open questions first, then confirmed stack, text-editing and signing approach with limits, edit model, folder structure, phases with relative size, top risks. Create `CLAUDE.md` (commands, conventions, Part 1 constraints, under 100 lines) and `PROGRESS.md` (a checklist of every phase and feature).

**Step 2: Two directions.** Using `frontend-design`, build the main editor window (document open, Edit Text active, signature panel open) as two distinct static HTML/CSS prototypes in `design/`, with realistic content. Screenshot each at 1280 and 1440 px wide, light and dark. **Stop** until I choose one.

**Step 3: Full set.** In the chosen direction: start screen, each editor mode (select, edit text, annotate, sign, pages), signature dialog (draw, type, upload), form filling, font-substitution notice, update prompt, and error state. **Stop** and iterate until I explicitly approve. Then start Phase 1.

**Design rules:** windows designed at 1280 and 1440 px, usable down to a 1024 px minimum window. Whole pixels only, spacing on a 4 px scale. Tokens as CSS custom properties, carried into the build. Light and dark, following the OS. WCAG 2.2 AA contrast, full keyboard access, targets at least 24 px. Feels native on both platforms without imitating either; shortcut labels match the platform.

## Part 5: Build phases

End every phase with the Part 7 gates and a check-in, then wait for "continue". If a phase grows much larger than planned, split it and tell me.

1. **Foundation:** Tauri + Vite scaffold, tokens, app shell and menus, open and render PDFs, thumbnails, zoom, save a copy via the native dialog, test scripts. A GitHub Actions workflow that builds unsigned macOS and Windows apps from day one, so platform problems surface early.
2. **Text editing:** add, edit, delete; font matching and notices; undo and redo. This phase gets the most care.
3. **Signatures:** draw, type, upload; saved signatures; place, resize, rotate; date stamp.
4. **Annotations and forms.**
5. **Page tools.**
6. **Document tools:** OCR, redaction, page numbers, watermarks, headers and footers, compression, metadata, passwords.
7. **Certificate signing.**
8. **Release:** file associations, single instance, auto-updates, installers, `DEPLOY.md`, `FAMILY-GUIDE.md`, final pass on both platforms (Part 8).

## Part 6: Skills and tools

If a tool is missing, note it in `PLAN.md` and continue without it.

| Tool | When to use it |
| --- | --- |
| `frontend-design` | Before Phase 0 design work and before building each new screen |
| `context7` | Before using any Tauri, PDF.js, pdf-lib, Vite or test-library API. Prefer it to web search and memory |
| `typescript-lsp`, `rust-analyzer-lsp` | Check types and find symbols instead of reading whole files |
| `playwright` | Drive the UI in Chromium and WebKit, reproduce bugs, take screenshots |
| `pdf` skill | Inspect `test-pdfs/`, generate edge-case fixtures, validate saved output |
| `security-guidance` | Runs automatically; fix its warnings as they appear |
| `pr-review-toolkit` | End-of-phase review |
| `code-simplifier` | After review fixes, on the phase's changed files |
| `/security-review` | Built in. End of every phase touching files, signing, storage, capabilities or updates (1, 2, 3, 6, 7, 8) |
| `claude-md-management` | End of each phase, to keep `CLAUDE.md` short and accurate |

## Part 7: Quality gates and review

A phase is done only when every gate passes. Never mark work complete with failing tests or open critical or major findings.

**Tests:**

- Engine unit tests: apply each edit type, save, reopen, assert the result.
- UI end-to-end tests with Playwright in Chromium and WebKit, using the platform mock.
- Native-integration tests (open, save, "Open with", updates) with WebdriverIO against the built app, run in CI on macOS and Windows.
- Round-trip every file in `test-pdfs/` (open, edit, save, reopen); validate output with the `pdf` skill or `qpdf --check`.

**Test PDFs:** in Phase 1, build `test-pdfs/` to at least 15 files. Generate fixtures with the `pdf` skill or pdf-lib covering plain text, multiple and subset-embedded fonts, non-Latin text, rotated and mixed-size pages, a fillable form, an image-only scanned page, a password-protected file, existing annotations and links, and a 100+ page document. Add a few real-world files with clear licences (public government forms work well) and record each source in `test-pdfs/SOURCES.md`. My own files go in `test-pdfs/private/`, which is git-ignored.

**Review, in order:**

1. `/pr-review-toolkit:review-pr` on the phase's changes. Also check privacy (no network use beyond updates, capabilities minimal), PDF integrity (original untouched; forms, annotations, links and bookmarks preserved), accessibility, performance (a 100-page PDF shows page 1 in under 2 seconds, no UI freezes) and design fidelity (tokens, whole pixels, 4 px scale).
2. `/security-review` for the phases listed in Part 6.
3. Fix every critical and major finding and re-review the fixes. Log skipped minor findings, with reasons, in `PROGRESS.md`.
4. `code-simplifier` on changed files, then re-run all tests.
5. Screenshot new screens at 1280 and 1440 px, light and dark; compare against the approved design and fix drift.

**Check-in format:** what's done, how to try it (exact command), known limits, what's next. No recap of steps.

## Part 8: Distribution and working rules

**Distribution:**

- Installers: a universal `.dmg` for macOS and an NSIS `.exe` for Windows, built by GitHub Actions on macOS and Windows runners. The Windows installer must install WebView2 if it's missing.
- Auto-updates with the Tauri updater, using a `latest.json` on GitHub Releases. Walk me through generating the updater signing key; store the private key as a GitHub secret, never in the repo. Prompt before installing an update; never restart mid-edit.
- Ship unsigned at first. In `DEPLOY.md`, explain how to publish a release, and what Apple notarization and Windows code signing would cost and involve if I want them later.
- `FAMILY-GUIDE.md`: one non-technical page on installing (including the first-launch security prompt on each platform), editing text, signing and saving. A short version goes in the in-app help.
- Test Retina and Windows scaling at 125% and 150%, trackpad pinch zoom, and file names with spaces or non-English characters. Before the final check-in, give me a short manual checklist to run on a real Mac and Windows PC.
- Never create accounts or enter credentials for me; walk me through those steps.

**Working rules:**

- Ask me only about visual direction, feature behaviour, cost, and accounts. Decide clear technical choices yourself and note them in `PLAN.md`.
- Verify before claiming: run the tests and the app, reopen saved files. Say what you couldn't verify.
- Keep a task list per phase; commit small and often, at least once per feature.
- After three failed attempts at one problem, stop, summarise what you tried, and propose options.

**Token efficiency:**

- Delegate broad searches, reviews and test-failure triage to subagents; have them return conclusions, not file contents.
- Use `context7` and the LSPs instead of web pages and whole-file reads. Never paste whole docs, files or logs into context.
- Run tests with terse reporters and show only failures. Don't re-read files you just wrote or restate code in chat.
- Keep `CLAUDE.md` under 100 lines and `PROGRESS.md` a checklist, not a diary. Update both at the end of each phase so the next one can start fresh.

**Definition of done:** all P1 and P2 features work on both platforms; P3 and certificate signing work, or each gap is documented and agreed with me; every `test-pdfs/` file passes the round-trip check; all tests pass with no open critical or major findings; no document data ever leaves the device; installers and auto-updates work from GitHub Releases; `DEPLOY.md` and `FAMILY-GUIDE.md` are written; I've signed off on the manual checklist.
