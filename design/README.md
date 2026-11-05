# Design

**Chosen direction: Blue Pencil.** Waiting for the owner's approval of the full screen set (`SPEC.md` Part 4, Step 3).

Start with the gallery: [`direction-a-blue-pencil/screens/index.html`](direction-a-blue-pencil/screens/index.html). Every screen is clickable, and modes, tabs and recent files link to each other. Pages follow your system's light or dark setting. The document, names and figures are invented.

## Files

| Path | What it is |
| --- | --- |
| `direction-a-blue-pencil/screens/` | The 14 screens, with Mac labels |
| `direction-a-blue-pencil/screens/win/` | The same screens with Ctrl labels, and placeholders for the title and menu bars Windows draws itself |
| `direction-a-blue-pencil/index.html` | The Step 2 main window, kept up to date |
| `direction-a-blue-pencil/tokens.css` | Design tokens that carry into the build |
| `direction-a-blue-pencil/styles.css`, `screens.css` | Component styles |
| `direction-a-blue-pencil/parts.mjs`, `build-screens.mjs` | Prototype generator. To rebuild: `node design/direction-a-blue-pencil/build-screens.mjs` |
| `screenshots/blue-pencil/` | Every screen at 1280, 1440 and 1024 px in light and dark, plus 1280 light for Windows |
| `direction-b-highlighter/`, `screenshots/a-*`, `screenshots/b-*` | The Step 2 comparison, kept for reference |

## Screens

| Group | Screens |
| --- | --- |
| Start | Start |
| Editor modes | Select (with search), Edit text, Annotate, Sign, Pages |
| Signature dialog | Draw, Type, Upload |
| Forms | Form filling |
| Notices and errors | Font substitution, Update prompt, Can't open file, Can't save |

## Design decisions

- **Marks on the page.** Margin ticks mean the same everywhere: pale for editable, solid blue for changed, amber for a substituted font.
- **The paper never changes.** PDF pages stay as they'd print in dark mode, and so do marks on them. The start screen's sheet is interface, so it follows the theme.
- **Form filling is part of Select.** There's no separate form mode: fields work as soon as a form opens, and a panel shows what's left.
- **Plain words for technical ideas.** "Flatten" appears as "Lock answers when saving", and a patch is described as "covered, not removed".
- **Updates never interrupt.** With unsaved changes the prompt offers "Install when I quit". With none, the same card will offer "Install and restart".
- **Document tools live in the native Document menu**, including OCR, redaction, passwords and certificate signing. Their screens get designed when their phases start, as `SPEC.md` Part 6 asks.

## Checks

Measured in Chromium, on every screen at 1280, 1440 and 1024 px in light and dark, plus the Windows versions in light at 1280 and 1024 px:

| Check | Result |
| --- | --- |
| Lowest text contrast (AA needs 4.5:1) | 5.5:1 |
| Targets under 24 px | None |
| Fractional font sizes or line heights | None |
| Spacing off the 4 px scale | None (1 px borders aside) |
| Page overflow, cut-off dialogs, colliding bars | None |
| Keyboard reach with Tab (6 sampled screens) | Every control or radio group |
| Files loaded from outside the machine | None |

## Not covered yet

- Rendered in Chromium only. WebKit, which the Mac app uses, comes with the build's test suite.
- The contrast check covers text, not icons or borders. Pale margin ticks are deliberately faint, because hovering a line outlines it and shows the same thing. That needs checking against WCAG's 3:1 rule for meaningful graphics in Phase 2.
- Dialogs don't trap keyboard focus, and the buttons don't do anything: that needs code, which comes with the build.
- The Windows title and menu bars are placeholders. Only the real app can show how they look.
- Icon strokes are 1.5 px, a vector detail outside the whole-pixel layout rule. They need checking on standard-density Windows displays.
- Not in the Step 3 list, so not drawn yet: the scanned-page explanation (Phase 2), the password prompt and the Document menu tools (Phase 6), and certificate signing (Phase 7).
