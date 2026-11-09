# Smorsy PDF Editor: Plan

`SPEC.md` is the source of truth. This file records the decisions it asks for. Versions and licences were checked on 2026-11-05.

## 1. Your decisions

Answered by the owner on 2026-11-05. The Blue Pencil screen set is approved.

| #   | Question                         | Decision                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | GitHub repository                | **One fully public repository.** Code, installers and `latest.json` all live there.                                                                                                                                                                                                              |
| 2   | ⌘S / Ctrl+S after the first save | First save always asks for a new file (`Name-edited.pdf`). After that, ⌘S updates that new copy. Choosing the original file needs a separate, explicit confirmation.                                                                                                                             |
| 3   | Languages                        | **English only.** OCR is English only. Documents in other languages still open and display; their text is editable only where a bundled font or the file's own font has every character. Times New Roman must be available (see section 3).                                                      |
| 4   | Minimum OS                       | macOS 14 Sonoma and Windows 10 22H2 x64 (see section 3).                                                                                                                                                                                                                                         |
| 5   | PDFs with a digital signature    | **Open in View mode first.** You can read, search and copy. The first attempt to edit shows a warning that editing breaks the signature, and you choose whether to continue.                                                                                                                     |
| 6   | Replace and delete               | The patch covers the old text. The interface says so the first time and points to Redact for anything sensitive (Phase 6).                                                                                                                                                                       |
| 7   | Toolbar                          | **Keep the approved Blue Pencil layout:** one row of modes and a floating format bar, after comparing it with Preview's second row.                                                                                                                                                              |
| 8   | Saved signatures                 | **Dropped.** Signatures and initials stay in memory while the document is open, and can be placed as often as needed. Nothing is stored on the computer, because the app has no accounts and anyone using it could place a stored signature. For another PDF, upload an image or make a new one. |
| 9   | Sticky notes or comments         | **Comments replace sticky notes (owner's decision).** No author names, which also means no name gets written into shared files, and no replies. Author names may come after launch.                                                                                                              |

### What follows from a public repository

- Personal PDFs never go in the repo. `test-pdfs/private/` is git-ignored, and every fixture must be generated or have a clear licence.
- Commits show an author name and email to anyone, so they use GitHub's private no-reply address.
- The updater's private key stays a GitHub secret, as the spec requires.

### What I need from you before Phase 1

- **Sign in to GitHub:** run `gh auth login` and tell me the account name.

## 2. Tools (Part 6)

`/plugin` isn't available in the desktop app, so I checked the tools this session exposes and the local plugin folders instead.

| Tool                                                                                                                | Status                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend-design`, `playwright`, `pr-review-toolkit`, `code-simplifier`, `/security-review`, `claude-md-management` | Available                                                                                                                                                       |
| `pdf` skill                                                                                                         | Available. pdf-lib fixtures and `qpdf --check` are the fallback.                                                                                                |
| `security-guidance`                                                                                                 | Plugin data folder present. Its warnings only appear once code is being edited.                                                                                 |
| `context7`                                                                                                          | Available since 2026-11-05. Phase 0's version checks used the npm and crates.io registries and package READMEs; use `context7` before each API from Phase 1 on. |
| `typescript-lsp`                                                                                                    | A `typescript-native-lsp` plugin folder exists. Check it works once a TypeScript project exists.                                                                |
| `rust-analyzer-lsp`                                                                                                 | The plugin is missing, though the `rust-analyzer` program is installed. Continuing without the plugin; Rust stays minimal, and `clippy` covers the checks.      |

Installed on this Mac with Homebrew on 2026-11-05: Rust 1.99.1 with both Mac targets, `clippy` and `rustfmt`, `gh`, `qpdf`, and Node 26.13.0 LTS (Vitest doesn't support Node 25).

## 3. Confirmed stack

| Area                | Choice                                                                                    | Version   | Licence          | Latest release     |
| ------------------- | ----------------------------------------------------------------------------------------- | --------- | ---------------- | ------------------ |
| Shell               | `tauri`, `@tauri-apps/cli`, `@tauri-apps/api`                                             | 2.12      | MIT / Apache-2.0 | Oct 2026           |
| Native plugins      | dialog 2.8, fs 2.7, updater 2.14, single-instance 2.5, window-state 2.5, process 2.4      | as listed | MIT / Apache-2.0 | Sep–Oct 2026       |
| UI                  | `vite` 8.3, `@vitejs/plugin-react` 6.2, `react` 19.3                                      | as listed | MIT              | Oct–Nov 2026       |
| Language            | `typescript`                                                                              | **6.0.3** | Apache-2.0       | Current 6.x        |
| Rendering           | `pdfjs-dist`, **legacy build**                                                            | 6.5       | Apache-2.0       | Nov 2026           |
| Editing, saving     | **`@cantoo/pdf-lib`** + **`@cantoo/fontkit`**                                             | 2.11, 2.0 | MIT              | Sep 2026           |
| Drawn signatures    | `signature_pad`                                                                           | 5.1       | MIT              | Jul 2026           |
| Certificate signing | `@signpdf/*` + `node-forge` (used under BSD-3-Clause)                                     | 4.0, 1.4  | MIT, BSD         | Oct–Nov 2026       |
| OCR                 | `tesseract.js` + `@tesseract.js-data/eng`                                                 | 7.0, 1.0  | Apache-2.0, MIT  | Dec 2025, Sep 2023 |
| Tests               | `vitest` 5.1, `@playwright/test` 1.64, `webdriverio` **9.33** + `@wdio/tauri-service` 1.5 | as listed | MIT, Apache-2.0  | Oct–Nov 2026       |
| Linting             | `eslint` 10, `typescript-eslint` 8.72, `prettier` 3.9, `lefthook` 2.2, clippy, rustfmt    | as listed | MIT              | Oct–Nov 2026       |

### Replacements and pins

- **`@cantoo/pdf-lib` rather than `pdf-lib`.** The original's last release was 2022 and it can't encrypt. The fork is maintained, keeps the same API and adds AES-256 encryption and decryption, which Phase 6 needs.
- **`@cantoo/fontkit` rather than `@pdf-lib/fontkit`** (also last released 2022). This is the fork's recommended pairing.
- **TypeScript 6.0.3, not 7.0.2.** `typescript-eslint` only supports versions below 6.1. Move up when it does.
- **`webdriverio` 9, not 10.** `@wdio/tauri-service` requires version 9.
- **Node 26 LTS, pinned in `.nvmrc`.** Vitest excludes Node 25.
- **`pdf.js` legacy build.** The modern build uses very recent browser features, and on macOS the web engine depends on the OS version. The legacy build is safer across OS versions.
- **To check in Phase 6:** `tesseract.js` 7 requires `tesseract.js-core` ^7, but npm's `latest` tag for that package shows 6.1.2. If 7 can't be installed cleanly, I'll pin the newest matching pair.

### Additions to the spec's list

- `window-state` remembers window size and position; `process` restarts the app after an update.
- `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver` 1.5 let tests control the built app on macOS and Windows. The second runs a WebDriver server inside the app, so both are compiled **only in test builds**, and CI fails if they appear in a release build.
- `same-file` and `tempfile`, for the same-file check and safe temporary files when saving.
- Fonts (all open licence): **Liberation Sans, Serif and Mono**, which match the widths of Arial, Times New Roman and Courier New, so replaced text keeps its layout. **Carlito and Caladea** do the same for Calibri and Cambria. Handwriting: **Caveat, Dancing Script, Sacramento, Homemade Apple**. The interface uses **Atkinson Hyperlegible Next**. Their licences ship with the app from Phase 8.
- **Times New Roman can't be bundled:** it's a commercial font, and its licence doesn't allow shipping it inside another app. macOS and Windows both include it, though, so the app uses **the computer's own copy** when the owner picks Times New Roman or a document needs it. Only the characters used are embedded in the saved PDF, so it looks right for anyone who opens it. This Mac's four Times New Roman files all carry the "editable embedding" permission (`fsType` 8). The app checks that flag on each computer before embedding, which still needs testing on Windows. If the font is missing or doesn't allow it, the app uses Liberation Serif, which has identical widths, and says so. This is the one font not bundled, and a small Rust command reads only those named font files.

### Minimum OS

- **macOS 14 Sonoma or later**, universal build. To be tested on a real machine; only the OS versions on CI runners and your Macs can be checked directly.
- **Windows 10 22H2 or Windows 11, x64**, with WebView2 (the installer adds it if missing, which needs internet at install time only).

### Privacy design

- The webview has **no route to the network**: the update check runs in Rust, so the CSP allows only the app's own files and its bridge to Rust.
- CSP: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; img-src 'self' blob: data:; font-src 'self' blob: data:; style-src 'self'; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; form-action 'none'`.
- PDF.js loads its CMaps, standard fonts and WASM locally, and scripts inside PDFs never run, because the app doesn't load the `pdf.js` scripting sandbox.
- Tesseract's default downloads from a CDN, so all its paths are set to bundled files and caching is off.
- A Playwright test fails on **any** non-local request, including during OCR.
- Clicking a web link inside a PDF asks first, then opens your browser. The app itself never fetches it.

## 4. Text editing approach

Editing PDF text isn't like editing a Word document. A PDF stores positioned glyphs, not paragraphs. So the app reconstructs lines from the page, covers the old ones and draws new ones.

1. **Find the text.** PDF.js gives positioned text and the operations used to draw it. The engine groups these into lines and blocks, and records the position, size, colour and font of each. A hover outlines the result.
2. **Choose the font**, in this order:
   1. The file's own font, if it has every glyph needed. Subset fonts often don't, since they only hold the characters originally used.
   2. For Times New Roman, the computer's own copy, if its licence flag allows embedding.
   3. A bundled font with matching widths (for example Arial to Liberation Sans, or Times New Roman to Liberation Serif).
   4. The closest bundled font by style (serif, mono, bold, italic), with a notice.
3. **Cover the original.** Sample the rendered pixels in a ring around the text. A flat colour gets a matching patch.
4. **Draw the new text** on top, in the same position and rotation.
5. **Removing the original glyphs** moved to Phase 6: safe redaction needs the same content-stream rewriting. Until then replaced text stays patched, and the interface says so.

### Decisions while building

- **Embedded fonts are reused only for characters the page visibly draws with them.** A file can label an unused glyph wrongly, and typing that character would paint something else.
- **IRS forms count as digitally signed.** They carry an Adobe usage-rights signature, which editing does break, so they open in View mode like any signed PDF.
- **Quit is a custom menu item,** because the operating system's own one ends the app without asking. macOS can also quit from the Dock or at logout, so `src-tauri/src/quit.rs` answers that request: straight through with nothing unsaved, otherwise it brings the window forward and asks.
- **Saved signatures were dropped (owner's decision).** See decision 8.
- **Annotations are real PDF annotations; whiteout and images go in the page.** Other PDF apps can then edit or remove annotations. Text can go on top of a whiteout, which an annotation wouldn't allow.
- **Whiteout moves what viewers paint on top down into the page first.** Otherwise a see-through field or an existing annotation would show through in the saved file, while looking hidden on screen.
- **Locking answers has its own code rather than the library's `flatten`.** That paints hidden fields, ignores how a drawing fits its box, and removes a field even after failing to paint it. Signature fields stay; a form's own buttons go.
- **Same-named checkboxes with different meanings behave as radio buttons.** They share one value in the file, so only one can be on.
- **A new note stays out of the edit log until it has words.** Leaving one empty then changes nothing about the file. Words are recorded as they're typed, because a shortcut can save without leaving the box.
- **Saved annotations keep what it takes to edit them.** Each carries its drawing's geometry and tags in two keys of our own, which other apps ignore. If another app has moved one since, it's treated as that app's, because what we kept no longer describes it.
- **Anything read from those keys is untrusted.** Every field is validated, and reading stops at a budget charged before decoding, since a small compressed file can expand a long way.
- **Deleting erases rather than unlists.** A save writes every object it knows of, so unlisted words would still be in the file. This matters for comments to students.
- **pdf.js is told to skip a changed saved annotation through its editor's storage.** There's no other way to stop it being drawn. It relies on an internal prefix, which pixel tests would catch moving.
- **Other apps' annotations can have words and tags changed, or be deleted, but not be moved or recoloured.** Their drawings can't be redrawn reliably.
- **Page tools keep every edit editable.** A page arrangement is one edit holding the whole new order and turns. Other edits are restated against the file's own unturned pages, shown on the pages as arranged, and saved on the file's pages before they're arranged. Undo covers it all.
- **pdf.js shows the arrangement directly** through a view of the same open document, with each page's turn added to its viewport. Everything that reads pages (search, forms, comments, text) follows it without changes of its own.
- **Removing pages erases what they held**, including pictures, masks, thumbnails, attachments, form fields and the tag tree, while keeping anything kept pages or the document as a whole still use.
- **Phase 5 was split.** Duplicating, inserting and merging bring a second source of pages, and splitting writes several files, which needs a careful look at write access.
- **A signature over a solid form field moves that field's looks into the page.** Viewers always paint fields last, so nothing can sit on top of a solid one. The field stays and stays fillable, but becomes see-through. Over other annotations, whose order viewers do respect, the signature becomes a stamp annotation.
- **A filled-in field under an edit becomes part of the page, and the app says so.** Leaving it as a field would mean changing it later showed the old text underneath. A form's own buttons stay on top, also with a note.
- **The date stamp starts off,** though the design mockup shows it ticked, so nothing is added that wasn't asked for.
- **Signatures can't go past the page's edge.** A PDF cuts off anything outside its page, so moving, resizing and turning all stay inside it, and the screen always matches the file.
- **A PDF protected against changes opens read-only.** The save library can't write these, so editing would only fail at the end.

### Limits the interface will state

| Situation                               | What happens                                                                                              |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Replaced or deleted text                | The old text is hidden but still in the file, so search and copy can find it. Redact removes it properly. |
| Text over a photo or gradient           | The patch may be visible. A warning shows before you commit.                                              |
| A needed glyph is missing from the font | The closest font is used, with a notice naming both fonts.                                                |
| Type 3 fonts                            | Can't be reused, so a bundled font is substituted, with a notice.                                         |
| Skewed or perspective text              | Read-only, with an explanation. Rotated text is editable.                                                 |
| Arabic, Hebrew, Indic scripts           | Read-only: `pdf-lib` doesn't shape these scripts, so they'd come out wrong.                               |
| Chinese, Japanese, Korean               | Editable only where the file's own font has the glyphs. No bundled CJK font, because of size.             |
| Longer replacement text                 | Wraps within its own block. The rest of the page doesn't reflow.                                          |
| Scanned page                            | No text to edit. The app explains why, and offers OCR once it exists in Phase 6.                          |
| PDF protected against changes           | Read-only, with an explanation. An exact copy can still be saved.                                         |
| Text no available font can draw         | Flagged after the edit, and the save stops with a plain explanation rather than writing blanks.           |

## 5. Signing approach

**Visual signatures (Phase 3)** are images or drawn paths placed on the page. They look signed, but they aren't cryptographic, and the interface says so.

**Certificate signatures (Phase 7):**

|                   | `@signpdf` + `node-forge` in a Worker                                                       | Rust crates behind a Tauri command                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fit with the spec | Keeps Rust minimal; engine stays testable in a browser                                      | Adds a meaningful amount of Rust                                                                                |
| Maintenance       | Both active                                                                                 | `cms`, `rsa`, `rcgen` are active; `p12` hasn't had a release since 2022; `openssl` complicates universal builds |
| Key handling      | In memory in a Worker                                                                       | In memory in Rust, slightly better isolated                                                                     |
| Weak spots        | RSA keys only; needs a `Buffer` polyfill; the placeholder helper expects original `pdf-lib` | More code to own                                                                                                |

**Decision: `@signpdf` + `node-forge`.** The Rust route's advantage is small for a family tool, and it's more to maintain. `@signpdf/placeholder-pdf-lib` is built against the original `pdf-lib`, so I'll test compatibility early in Phase 7 and write a small adapter if needed.

**Limits:**

- Signing is the last step of a save; any later edit invalidates the signature, and the interface says so.
- Self-signed certificates show as "validity unknown" in other readers.
- The time comes from this computer's clock, since timestamp servers would need the network. For the same reason, there are no revocation checks.
- In-app validation can confirm the file hasn't changed since signing, and show the certificate details. It can't confirm who the signer is.
- Certificates with EC keys get a clear error message, because `node-forge` handles RSA only.
- Passwords are never stored. An in-app certificate is stored encrypted with a password you set.

## 6. Edit model

```ts
type EditLog = {
  readonly entries: readonly EditEntry[]; // append-only and immutable
  readonly cursor: number; // entries before this are active
};
type EditEntry = { readonly id: EditId; readonly groupId: GroupId; readonly edit: Edit };
type Edit = AddText | ReplaceText | DeleteText | PlaceSignature | Annotate
  | FillField | PageOp | Redact | DocumentOp | /* ...one variant per feature */;
```

- **Rendering:** PDF.js draws the untouched original, and an overlay draws the document state derived from the active entries.
- **Undo and redo** only move `cursor`. A new edit after an undo discards the entries past `cursor`.
- **Grouping:** a whole drag or typing burst shares a `groupId`, so one undo reverses it all.
- **Addressing:** pages have stable IDs and coordinates are PDF points, so reordering pages doesn't break earlier edits.
- **Saving:** `save(originalBytes, activeEdits, options)` is a pure function in a Worker, with a fixed order: content edits, annotations and forms, page operations, redaction, document tools, compression, metadata, encryption, certificate signing.
- **Safe writes:** the output is reopened and checked in memory, written to a temporary file, then renamed. A failure can't leave a half-written PDF.
- **Preservation:** `pdf-lib` re-saves the whole file, so it can't preserve an existing digital signature. Round-trip tests check forms, annotations, links and bookmarks survive.
- **Unedited copies:** with no active edits, Save a copy writes the original bytes unchanged, so an existing digital signature stays valid.
- **Signed PDFs:** the engine detects signature fields when a file opens. The editor then starts in View mode, and the first edit needs the warning accepted. That choice is held in the session, not in the edit log.

## 7. Folder structure

```text
src/
  engine/      PDF logic only, no React or Tauri
  platform/    The only Tauri callers: interface, Tauri implementation, browser mock
  workers/     pdf.js worker setup; save, signing and OCR workers as those phases add them
  ui/          React components, styles and fonts
src-tauri/     Minimal Rust: atomic saves and the same-file check
assets/        Icon source and bundled document fonts, with licences
design/        Phase 0 prototypes and screenshots
scripts/       Fixture generation, pdf.js assets, the release check
tests/         e2e/ (Playwright), native/ (WebdriverIO), roundtrip/, fixtures/ (files that shouldn't open)
test-pdfs/     Fixtures, SOURCES.md, private/ (git-ignored)
.github/       CI workflows
```

Later phases add folders inside `engine/` and `ui/` as they outgrow one level. File associations and OCR data arrive in Phases 8 and 6.

## 8. Phases

| Phase | Scope                       | Relative size |
| ----- | --------------------------- | ------------- |
| 0     | Plan and design             | S             |
| 1     | Foundation, CI, test PDFs   | M             |
| 2     | Text editing                | **XL**        |
| 3     | Signatures                  | M             |
| 4     | Annotations and forms       | L             |
| 4b    | Organising annotations      | L             |
| 5a    | Page tools in one document  | M             |
| 5b    | Page tools across documents | M             |
| 6     | Document tools              | L             |
| 7     | Certificate signing         | M             |
| 8     | Release                     | L             |

Phase 2 may split if the stretch goal or font matching grows. I'll tell you if it does.

## 9. Top risks

1. **Text-edit fidelity.** Fonts and backgrounds vary widely, so this is the hardest part of the product. Mitigation: a fixed font ladder, stated limits, and visual comparison across `test-pdfs/`.
2. **PDF damage on re-save.** Forms or annotations could be altered. Mitigation: round-trip assertions on every fixture and `qpdf --check`, with the engine kept behind a typed API so the library can be replaced.
3. **Test browsers aren't the real app.** Playwright's WebKit isn't identical to WKWebView, and `@wdio/tauri-service` is young. Mitigation: native tests in CI from Phase 1, plus your manual checklist.
4. **Unsigned installers.** Family members will see security prompts, and macOS requires a trip to System Settings on first launch. Mitigation: clear steps in `FAMILY-GUIDE.md`, and costs for proper signing in `DEPLOY.md`.
5. **Large files.** Memory use and UI freezes. Mitigation: page virtualisation, Workers, transferring bytes rather than copying, and a timed test (page 1 of a 100-page PDF in under 2 seconds).
6. **Single-maintainer fork.** `@cantoo/pdf-lib` depends on a small team. Mitigation: all use stays inside `src/engine/`, and it uses the original API.
7. **Certificate signing compatibility** with the fork. Mitigation: test it first in Phase 7.
