# Progress

**Current phase:** 4b finished, waiting for the owner's "continue" before Phase 5.

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
- [x] Part 7 gates and check-in

## Phase 3: Signatures

- [x] Create by drawing
- [x] Create by typing (handwriting fonts)
- [x] Create by uploading an image (auto-remove white background)
- [x] Reuse signatures and initials while the document is open, with nothing stored on the computer
- [x] Place, resize, rotate
- [x] Optional date stamp
- [x] Single-click move and resize, as an alternative to dragging
- [x] Signatures stay visible over form fields
- [x] Part 7 gates and check-in

## Phase 4: Annotations and forms

- [x] Highlight, underline, strikethrough
- [x] Pen, shapes, arrows
- [x] Sticky notes, including reading ones already saved in a file
- [x] Images and whiteout boxes
- [x] Fill forms; optional flattening
- [x] Part 7 gates and check-in

## Phase 4b: Organising annotations

Added by the owner after Phase 4, to come before Phase 5.

- [x] Design approval for the new screens
- [x] Edit saved annotations after reopening
- [x] Comments replace sticky notes, with no author names or replies
- [x] Side panel tabs by purpose, and this page or all pages
- [x] Tags such as "Chapter 1", saved in the file
- [x] Part 7 gates and check-in

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

- [ ] Before anything else, raise code signing with the owner, as they asked: Apple's programme costs about US$99 a year and Windows signing has its own cost; without them, macOS and Windows show security warnings on install
- [ ] Open via dialog, drag and drop, app icon, "Open with", double-click
- [ ] Second file opens in the running app (single instance)
- [ ] Recent files; remember window size and position
- [ ] Warn before closing with unsaved changes (if not already delivered)
- [ ] Auto-updates via `latest.json`; prompt first, never restart mid-edit
- [ ] Universal `.dmg`; NSIS `.exe` that installs WebView2 if missing
- [ ] Ship third-party notices for every bundled library, such as `signature_pad`. Font licences already ship from `assets/fonts`
- [ ] `DEPLOY.md`
- [ ] `FAMILY-GUIDE.md` and short in-app help
- [ ] Retina, Windows 125% and 150%, pinch zoom, unusual file names
- [ ] Manual checklist given to and signed off by owner, including a signature over a form field in Adobe Reader and macOS Preview
- [ ] Part 7 gates and final check-in

## Skipped minor findings

- **Phase 4b, not checked in Adobe Reader or macOS Preview.** The check-in asks the owner to try one. Comments use the standard PDF note type, so they should show there, but that's untested.
- **Phase 4b, a pop-up also listed on another page keeps its words after its comment is deleted.** No app writes files this way, and leaving it is what stops that other page losing something.
- **Phase 4b, an image shared only with a page's tiling pattern could be erased along with a deleted annotation's drawing.** It needs one object used both ways, which isn't seen in practice.
- **Phase 4b, a comment's leading invisible byte-order character is dropped.** It's invisible, and nothing else changes.
- **Phase 4b, another app's comment emptied and saved from inside the box stays as a pin with no words.** Leaving the box deletes it, as with any comment. The words themselves are gone either way.
- **Phase 4b, another app's marks with no drawing of their own may not show on the page, though they're listed.** pdf.js draws its own for most kinds. Comments get a pin here.
- **Phase 4b, typing a tag and then scrolling that row away, without clicking out of it, loses what was typed.** Enter, or clicking anywhere, keeps it.
- **Phase 4b, pasting a tag longer than 60 characters cuts it with no notice.** The tag shows as it was kept.
- **Phase 4b, clicking a row moves focus to the annotation, so reaching its tag field by keyboard means tabbing back to the panel.** Focus on the annotation is what lets arrow keys move it, and only one can come first.
- **Phase 4b, clicking something already selected doesn't bring its row back if a filter has since hidden it.** Clearing the filter does.
- **Phase 4b, a tool picked in the moment before a file's annotations finish loading gets put down.** Loading takes a fraction of a second.
- **Phase 4b, the list isn't virtualised.** With 6,000 annotations, switching tabs takes about two seconds, though rows out of view skip layout. Real documents come nowhere near that.
- **Phase 4b, page tools in Phase 5 have to handle saved annotations.** Rotating a page changes what the kept positions mean. A mismatch only makes them read as another app's, so nothing's lost.
- **Phase 4b, design differences kept on purpose.** "Made in another app" shows only on the selected row, because it would crowd a list of many. The default footer states image and whiteout limits. The title says "3 pages" rather than "No unsaved changes", as it does everywhere else.

- **Phase 4, not checked in Adobe Reader or macOS Preview.** Saved annotations, answers and whiteouts are verified with the pdf.js renderer, qpdf and pdf-lib only. There's no copy of Reader here.
- **Phase 4, saved annotations can't be changed here.** New annotations are editable until the file is closed; ones already in a file can only be read (notes) or seen. The panel says so.
- **Phase 4, hybrid XFA forms lose their XFA layer when filled, and pure XFA forms get no form panel.** The W-9 and W-4 are hybrids and fill correctly through their standard fields. Pure XFA is rare, and Phase 6 is the natural place to explain it.
- **Phase 4, answered inputs show above a whiteout on screen until saving, where the file covers them.** Drawing the whiteout over a live input would stop it working, and the save says the field is now part of the page.
- **Phase 4, a saved note under a new whiteout keeps its reading pin until the file is saved and reopened.** The saved copy removes it, and says so.
- **Phase 4, a field listed on two pages is blanked on both by a whiteout on one.** It's unusual, and it errs toward hiding.
- **Phase 4, a field with several buttons under a whiteout stays in the file with its value.** Only that button's look is removed. A viewer that redraws every field could show it. The panel already says whiteout only covers.
- **Phase 4, PDF checkboxes and radio buttons can be under 24 px.** They have to line up with the box drawn on the page, which can be small.
- **Phase 4, list rows with letters no font has show as empty boxes, though a chosen answer stops the save.** Blocking the save over an unchosen row would be worse.
- **Phase 4, an unsupported letter is reported at Save, and doesn't name the field.** The message names the character, and nothing is lost.
- **Phase 4, pasting past a field's length limit cuts the text with no notice.** It's standard browser behaviour for a limited field, and the answer is visible.
- **Phase 4, a custom answer in an editable dropdown shows blank here, though it counts as filled.** It saves unchanged.
- **Phase 4, a signature field in a reopened signed copy still counts as unanswered.** The signature is part of the page by then, so it can't be matched to the field.
- **Phase 4, an image-file problem with an unknown cause says it couldn't be read as an image.** It's accurate for nearly all cases, and nothing changes.
- **Phase 4, keyboard users have to put the current tool down (Esc) before tabbing to annotations.** The panel's rows also reach them with one press.
- **Phase 4, undo doesn't close an open note card or cancel Move.** The next click finishes or closes it, with nothing lost.
- **Phase 4, repeatedly ticking one box in Safari's engine undoes as one step.** It doesn't focus clicked checkboxes, so no run of edits ends. The result is correct.
- **Phase 4, a single pen click makes no mark.** A dot isn't useful, and the hint says to drag.
- **Phase 4, a note's pin is turned with the page on 90° and 270° pages.** It's in the right place, and the words are unaffected.
- **Phase 4, line ends can clip when a page's scale (UserUnit) is below 0.5.** No real-world file here uses one.
- **Phase 4, design differences kept on purpose.** The panel's footer is longer than the approved wording, because it has to state whiteout's limits. The title says "2 unsaved changes" rather than "Unsaved answers", to match other modes. Notes take the chosen swatch colour rather than one fixed yellow.

- **Phase 3, thumbnails are hidden while the Sign panel is open below 1280 px.** The design has a toggle for them there, which isn't built yet. Closing the panel brings them back. It belongs with the other narrow-window work in Phase 8.
- **Phase 3, a signature made and then cancelled with Esc gets no save warning.** Cancelling is a deliberate choice, and the signature stays in the panel. The warning covers one still waiting to be placed.
- **Phase 3, moving a signature to another page leaves its date stamp behind.** The date is its own text box, which can be moved in Edit text.
- **Phase 3, a solid print-only field stays on top of a signature in print.** It has the No View flag, so it paints nothing on screen, and it's rare enough not to move it.
- **Phase 3, retiring a field a form's script reads could break that script in Acrobat.** There's no copy here to test with. It only applies to filled-in solid fields under an edit, and the app says when it happens.
- **Phase 3, a filled-in field that can't be removed from a malformed form stays editable, with only a console message.** Its old text would show under any new text. It takes a malformed file and a later change in another app.
- **Phase 3, a form note is replaced by the "you kept editing" message if you type during a save-and-leave.** The save worked either way, and the document stays open.
- **Phase 3, a filled checkbox style with no background entry can partly cover a signature, with no warning.** Checkboxes are small, and a signature rarely sits on one.
- **Phase 3, a save warning about a field on top doesn't say which field.** The message gives what to do, and most forms have few.
- **Phase 3, a date stamp can overlap on a page narrower than 120 points.** Nothing that small needs signing in practice.
- **Phase 3, not checked in Adobe Reader or macOS Preview.** Signatures over form fields are verified with the pdf.js renderer only, and there's no copy of the others here. It's on the Phase 8 manual checklist.

- **Phase 2, a PDF built to lie about its own text can still mislead font reuse.** A glyph drawn on the page but labelled as another letter passes the checks, because the labels are all a PDF offers. Decoy fonts are refused. Fixing the rest needs real glyph comparison.
- **Phase 2, encryption check misses unusual spellings such as `/Encr#79pt`.** It fails safely: the save stops and nothing is written, though the protected notice doesn't show.
- **Phase 2, signature check misses escaped names and can be fooled by the text.** The wording now says "looks signed" and that it isn't checked. Phase 7 replaces it with real validation.
- **Phase 2, no "Saving…" state or worker timeout.** A worker that never replies leaves Save unresponsive. Known hang sources are capped. Revisit with progress UI.
- **Phase 2, a page whose text can't be read says so only in the log.** Search counts can be low for that page. The page itself still shows.
- **Phase 2, replaced-font count can be off after undo and redo.** It's only the status bar count; saved output is unaffected.
- **Phase 2, the covered note's timing with a hidden notice has no automated test.** It needs a font check to land while other text is open, which can't be timed reliably. The check itself is one condition.
- **Phase 2, thumbnails don't show edits.** They draw the original pages. Pages themselves show edits as an overlay.
- **Phase 2, Windows logout isn't intercepted.** Closing the window asks first, as does Exit. macOS is covered by `src-tauri/src/quit.rs`.

- **Phase 1, native menus aren't automated.** WebdriverIO can't click them. Menu permissions are covered, because the app won't start without them, and clicking them goes on the manual checklist.
- **Phase 1, replacing a file keeps its permissions but not extended attributes or Windows ACLs.** Only saving over the original or an existing file is affected, and that needs confirmation. Revisit if anyone relies on them.
- **Phase 1, no JPX, JBIG2 or predefined CMap fixture.** Generating one needs an encoder. Native tests confirm the app can load these `pdf.js` files.
- **Phase 1, one native test helper's first form returned false in the real app and the cause wasn't traced.** Rewritten to count pixels and compare outside the page; it fails correctly and passes in both engines.
