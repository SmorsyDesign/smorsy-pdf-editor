# Progress

**Current phase:** 2, in Part 7 review.

**Next steps for Phase 2:** read the code reviewer's re-review if it finished (otherwise run it again on `git diff b7e42b6..HEAD`), fix critical and major findings, re-review, run `code-simplifier`, run every test suite, retake `design/screenshots/phase-2/` with the new signature wording, confirm CI on the latest commit, then check in. Ask the owner to try Quit from the Dock with unsaved edits.

## Phase 0: Plan and design

- [x] Step 1: `PLAN.md`, `CLAUDE.md`, `PROGRESS.md`
- [x] Step 2: two directions in `design/`, screenshots at 1280 and 1440 px, light and dark
- [x] **Stop:** owner chose Blue Pencil
- [x] Step 3 screens in the chosen direction:
  - [x] Start screen
  - [x] Modes: select, edit text, annotate, sign, pages
  - [x] Signature dialog: draw, type, upload
  - [x] Form filling
  - [x] Font-substitution notice
  - [x] Update prompt
  - [x] Error state
- [x] **Stop:** owner explicitly approved the full set

## Before Phase 1

- [x] Owner accepts the Xcode licence
- [x] Owner authorises `context7`
- [x] Owner signs in to GitHub (`gh auth login`) and git identity set to the no-reply address
- [x] Project moved to a permanent folder
- [x] Open questions in `PLAN.md` answered
- [x] Install Rust, `qpdf`, `gh`, Node 26 LTS
- [x] Initialise git; first commit; create the public repository

## Phase 1: Foundation

- [x] Tauri + Vite scaffold
- [x] Design tokens carried into the build
- [x] App shell and native menus
- [x] Open and render PDFs
- [x] Thumbnails
- [x] Zoom
- [x] Save a copy via the native dialog (unedited copies are byte-identical)
- [x] Test scripts
- [x] GitHub Actions: unsigned macOS and Windows builds
- [x] `test-pdfs/`, at least 15 files, with `SOURCES.md`
- [x] Part 7 gates and check-in

## Phase 2: Text editing

- [x] Mode bar from the approved design, showing modes as they become real (Select, Edit text)
- [x] Select mode: select and copy text, search
- [x] Immutable edit model; undo and redo
- [x] Add: place, move, resize, wrap
- [x] Add: font, size, colour, bold, italic, alignment
- [x] Edit existing: hover outline, click opens pre-filled and matched
- [x] Replace and delete with background-matched patch
- [x] Reuse embedded font when it has every glyph
- [x] Closest bundled font, plus notice
- [x] Times New Roman from the computer's own copy, checking its embedding flag; Liberation Serif fallback with notice
- [x] Digitally signed PDFs: open in View mode, warn before the first edit (design this screen first, for approval)
- [x] Same-file check and Save flow from `PLAN.md` decision 2 (⌘S after the first save)
- [x] Saving runs in a Web Worker
- [x] Scanned pages: detect and explain, with new text allowed on top. The OCR offer comes with OCR itself in Phase 6
- [x] Stretch decision: removing original letters moves to Phase 6, built with safe redaction, which needs the same content-stream rewriting. Replaced text stays patched, and the interface says so.
- [ ] Part 7 gates and check-in

## Phase 3: Signatures

- [ ] Create by drawing
- [ ] Create by typing (handwriting fonts)
- [ ] Create by uploading an image (auto-remove white background)
- [ ] Save up to 3 signatures and initials locally; one-click delete
- [ ] Place, resize, rotate
- [ ] Optional date stamp
- [ ] Part 7 gates and check-in

## Phase 4: Annotations and forms

- [ ] Highlight, underline, strikethrough
- [ ] Pen, shapes, arrows
- [ ] Sticky notes
- [ ] Images and whiteout boxes
- [ ] Fill forms; optional flattening
- [ ] Part 7 gates and check-in

## Phase 5: Page tools

- [ ] Reorder, rotate, delete, duplicate, insert
- [ ] Merge, split, extract
- [ ] Part 7 gates and check-in

## Phase 6: Document tools

- [ ] OCR (English bundled, in a Worker), offered from the scanned-page card built in Phase 2
- [ ] Safe redaction, including removing original letters from the content stream (moved from Phase 2)
- [ ] Page numbers, watermarks, headers and footers
- [ ] Compression
- [ ] Metadata removal
- [ ] Set and open passwords
- [ ] Part 7 gates and check-in

## Phase 7: Certificate signing

- [ ] Sign with .p12/.pfx
- [ ] In-app self-signed certificate
- [ ] Show and validate signature details, replacing Phase 2's "looks digitally signed" wording, which is based on a text check
- [ ] Explain "validity unknown" for self-signed
- [ ] Part 7 gates and check-in

## Phase 8: Release

- [ ] Open via dialog, drag and drop, app icon, "Open with", double-click
- [ ] Second file opens in the running app (single instance)
- [ ] Recent files; remember window size and position
- [ ] Warn before closing with unsaved changes (if not already delivered)
- [ ] Auto-updates via `latest.json`; prompt first, never restart mid-edit
- [ ] Universal `.dmg`; NSIS `.exe` that installs WebView2 if missing
- [ ] `DEPLOY.md`
- [ ] `FAMILY-GUIDE.md` and short in-app help
- [ ] Retina, Windows 125% and 150%, pinch zoom, unusual file names
- [ ] Manual checklist given to and signed off by owner
- [ ] Part 7 gates and final check-in

## Skipped minor findings

- **Phase 2, a PDF built to lie about its own text can still mislead font reuse.** A glyph drawn on the page but labelled as another letter passes the checks, because the labels are all a PDF offers. Decoy fonts are refused. Fixing the rest needs real glyph comparison.
- **Phase 2, encryption check misses unusual spellings such as `/Encr#79pt`.** It fails safely: the save stops and nothing is written, though the protected notice doesn't show.
- **Phase 2, signature check misses escaped names and can be fooled by the text.** The wording now says "looks signed" and that it isn't checked. Phase 7 replaces it with real validation.
- **Phase 2, no "Saving…" state or worker timeout.** A worker that never replies leaves Save unresponsive. Known hang sources are capped. Revisit with progress UI.
- **Phase 2, a page whose text can't be read says so only in the log.** Search counts can be low for that page. The page itself still shows.
- **Phase 2, replaced-font count can be off after undo and redo.** It's only the status bar count; saved output is unaffected.
- **Phase 2, a failed font read in the worker stays failed for that document.** Saving fails with a clear dialog, and a new worker clears it only after the worker itself fails.
- **Phase 2, the message after replacing the original compares paths as text.** The same file reached by a different path says "Copy saved".

- **Phase 1, native menus aren't automated.** WebdriverIO can't click them. Menu permissions are covered, because the app won't start without them, and clicking them goes on the manual checklist.
- **Phase 1, replacing a file keeps its permissions but not extended attributes or Windows ACLs.** Only saving over the original or an existing file is affected, and that needs confirmation. Revisit if anyone relies on them.
- **Phase 1, no JPX, JBIG2 or predefined CMap fixture.** Generating one needs an encoder. Native tests confirm the app can load these `pdf.js` files.
- **Phase 1, one native test helper's first form returned false in the real app and the cause wasn't traced.** Rewritten to count pixels and compare outside the page; it fails correctly and passes in both engines.
