# Progress

**Current phase:** 1, at check-in. Waiting for the owner to say "continue" before Phase 2.

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

- [ ] Immutable edit model; undo and redo
- [ ] Add: place, move, resize, wrap
- [ ] Add: font, size, colour, bold, italic, alignment
- [ ] Edit existing: hover outline, click opens pre-filled and matched
- [ ] Replace and delete with background-matched patch
- [ ] Reuse embedded font when it has every glyph
- [ ] Closest bundled font, plus notice
- [ ] Times New Roman from the computer's own copy, checking its embedding flag; Liberation Serif fallback with notice
- [ ] Digitally signed PDFs: open in View mode, warn before the first edit (design this screen first, for approval)
- [ ] Same-file check and Save flow from `PLAN.md` decision 2 (⌘S after the first save)
- [ ] Saving moves to a Web Worker once it does real work
- [ ] Scanned pages: detect, explain, offer OCR
- [ ] Stretch: remove original glyphs, per-page fallback, stated in the interface
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

- [ ] OCR (English bundled, in a Worker)
- [ ] Safe redaction
- [ ] Page numbers, watermarks, headers and footers
- [ ] Compression
- [ ] Metadata removal
- [ ] Set and open passwords
- [ ] Part 7 gates and check-in

## Phase 7: Certificate signing

- [ ] Sign with .p12/.pfx
- [ ] In-app self-signed certificate
- [ ] Show and validate signature details
- [ ] Explain "validity unknown" for self-signed
- [ ] Part 7 gates and check-in

## Phase 8: Release

- [ ] Open via dialog, drag and drop, app icon, "Open with", double-click
- [ ] Second file opens in the running app (single instance)
- [ ] Recent files; remember window size and position
- [ ] Continuous scroll and search (if not already delivered)
- [ ] Warn before closing with unsaved changes (if not already delivered)
- [ ] Auto-updates via `latest.json`; prompt first, never restart mid-edit
- [ ] Universal `.dmg`; NSIS `.exe` that installs WebView2 if missing
- [ ] `DEPLOY.md`
- [ ] `FAMILY-GUIDE.md` and short in-app help
- [ ] Retina, Windows 125% and 150%, pinch zoom, unusual file names
- [ ] Manual checklist given to and signed off by owner
- [ ] Part 7 gates and final check-in

## Skipped minor findings

- **Phase 1, native menus aren't automated.** WebdriverIO can't click them. Menu permissions are covered, because the app won't start without them, and clicking them goes on the manual checklist.
- **Phase 1, replacing a file keeps its permissions but not extended attributes or Windows ACLs.** Only saving over the original or an existing file is affected, and that needs confirmation. Revisit if anyone relies on them.
- **Phase 1, no JPX, JBIG2 or predefined CMap fixture.** Generating one needs an encoder. Native tests confirm the app can load these `pdf.js` files.
- **Phase 1, one native test helper's first form returned false in the real app and the cause wasn't traced.** Rewritten to count pixels and compare outside the page; it fails correctly and passes in both engines.
