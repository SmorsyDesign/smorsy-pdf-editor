# Smorsy PDF Editor

Desktop PDF editor for macOS and Windows, for the owner and their family. Tauri 2, React, TypeScript.

## Before starting any work

1. Read `PROGRESS.md` to find the current phase and what's left.
2. Read the `SPEC.md` parts for that phase: Part 1 always, Part 2 for code, Part 3 for the features involved, Part 4 for design, Part 5 for phase scope, Part 7 for gates, Part 8 for release and working rules.
3. Check `PLAN.md` for decisions already made. Don't reopen them without a reason.

`SPEC.md` is the source of truth. Follow every stop point: end each phase with the Part 7 gates and a check-in, then wait for "continue".

## Constraints (these override everything else)

- **Offline and private.** Documents never leave the device. No network access except the update check; no analytics or telemetry. Bundle every library and font.
- **macOS and Windows.** Universal macOS build and Windows 10/11 x64. ⌘ on Mac, Ctrl on Windows.
- **Originals untouched.** Save to a new file by default; overwrite only after explicit confirmation.
- **Honest limits.** When an edit can't be faithful (missing glyphs, a scanned page), say so in the interface.
- **No stubs.** No placeholder UI, `TODO`s or half-built features in delivered code.

## Commands

- `npm run dev`: Vite dev server, with the browser mock
- `npm run tauri dev`: desktop app in development
- `npm run tauri build`: installers
- `npm run check`: types, ESLint, Prettier, clippy, rustfmt
- `npm test`: Vitest engine tests
- `npm run test:rust`: Rust tests
- `npm run test:e2e`: Playwright in Chromium and WebKit
- `npm run test:roundtrip`: round-trip every file in `test-pdfs/`; needs `qpdf`
- `npm run test:native`: WebdriverIO against the test build. Build it first: `npx tauri build --debug --no-bundle --features e2e --config src-tauri/tauri.e2e.conf.json`
- `npm run fixtures`: regenerate `test-pdfs/` 01 to 15 and `tests/fixtures/`

Node is pinned to 26 LTS in `.nvmrc`. Use terse test reporters and show only failures.

## Architecture

- `src/engine/`: all PDF logic behind a typed API. No React or Tauri imports. Fully unit-tested.
- `src/platform/`: the only code that calls Tauri, behind an interface with a browser mock.
- Rendering, OCR, signing and saving run in Web Workers. `pdf.js` parses and paints in its own two, set up in `src/workers/`, and `save-worker.ts` applies edits.
- `src-tauri/`: minimal Rust, only what the web layer can't do well. `quit.rs` holds off a macOS quit while `setUnsavedWork` says there's unsaved work.
- Every change is an entry in the immutable edit log. The canvas renders from it, undo and redo walk it, and saving applies it to the original bytes in one pass.
- Least-privilege Tauri capabilities: only files the user picks or opens via the OS. Strict CSP; never load remote content.
- Saved output is checked by reopening it and reading rendered pixels (`tests/e2e/saved-output.spec.ts`, and `expectSavedToMatchScreen` for signatures), since a file can read correctly while something sits elsewhere.
- Signatures are never stored on the computer, only held in memory while a PDF is open.
- Viewers always paint form fields last, so anything drawn over a solid field needs `clearFieldsUnder` first. They paint all annotations over the page, so whiteout needs `clearForWhiteout` too.
- Annotations save as real PDF annotations, on top of the page, carrying what it takes to edit them after reopening. Whiteout and images go in the page itself.
- Pages are arranged by an `arrange-pages` edit. Other edits are stored as made, restated on the file's own pages by `editsOnFilePages`, and saving arranges pages last with `arrangePages`.
- Deleting erases with `eraseAnnotation`. A save writes every object it knows of, so only unlisting would leave the words in the file. Treat everything read from a file as untrusted.
- Lock answers with `lockAnswers`, never the library's `flatten`, which paints hidden fields and can lose answers.
- The webview has no network route. The update check runs in Rust.

## Conventions

- Write engine tests before the code they cover.
- TypeScript `strict`, no `any`. Keep modules small and split past about 300 lines.
- Type errors and surface them in plain language. Never swallow them.
- No dead code or unused dependencies. Comments explain why, not what.
- Commit small and often, at least once per feature.
- The repository is public: never commit personal documents, keys or secrets. Personal PDFs go in `test-pdfs/private/`, which is git-ignored.
- Times New Roman is the one font not bundled, because its licence forbids it. Use the computer's copy if its embedding flag allows; otherwise Liberation Serif and a notice.
- Design: whole pixels, 4 px spacing scale, CSS custom property tokens, light and dark following the OS, WCAG 2.2 AA, full keyboard access, targets at least 24 px, 1024 px minimum window. Shortcut labels match the platform.

## Pinned versions (see `PLAN.md` for why)

TypeScript 6.0 (not 7), `webdriverio` 9 (not 10), `@cantoo/pdf-lib` with `@cantoo/fontkit`, the `pdf.js` legacy build.

## Working with the owner

- They're a senior product designer, not a full-time engineer. Explain trade-offs plainly.
- Ask only about visual direction, feature behaviour, cost and accounts. Decide clear technical choices and note them in `PLAN.md`.
- Never create accounts or enter credentials for them; walk them through it.
- Verify before claiming: run the tests and the app, reopen saved files. Say what couldn't be verified.
- After three failed attempts at one problem, stop, summarise, and propose options.
- Check-ins: what's done, how to try it (exact command), known limits, what's next. No recap of steps.

## Keeping these files useful

Delegate broad searches, reviews and test-failure triage to subagents. Prefer `context7` and the LSPs to web pages and whole-file reads. Keep this file under 100 lines and `PROGRESS.md` a checklist, and update both at the end of each phase.
