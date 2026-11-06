# Test PDFs

Every file here is round-tripped by `npm run test:roundtrip`. Your own files go in `private/`, which is git-ignored: this repository is public.

## Generated

Built by `npm run fixtures` (`scripts/build-fixtures.mjs`). The content is invented.

| File | Covers |
| --- | --- |
| `01-plain-text.pdf` | Plain text across three pages |
| `02-standard-fonts.pdf` | Multiple fonts: Helvetica, Times and Courier |
| `03-subset-embedded.pdf` | Subset-embedded fonts |
| `04-full-embedded.pdf` | Fully embedded fonts |
| `05-non-latin.pdf` | Ukrainian, Russian, Greek and French text |
| `06-rotated-pages.pdf` | Pages rotated 0, 90, 180 and 270 degrees |
| `07-mixed-sizes.pdf` | Letter, A4, landscape, Legal, receipt and A3 pages |
| `08-fillable-form.pdf` | Text, dropdown, radio and checkbox fields |
| `09-scanned-image-only.pdf` | A page that holds an image and no text |
| `10-password-protected.pdf` | AES-256 encryption. Test password: `smorsy-test` |
| `11-annotations-links.pdf` | Highlight, sticky note, web link and internal link |
| `12-bookmarks.pdf` | A three-item outline |
| `13-large-120-pages.pdf` | 120 pages, for performance checks |
| `14-images-and-text.pdf` | A landscape page mixing an image and text |
| `15-coloured-backgrounds.pdf` | Coloured text on flat and gradient backgrounds |
| `20-owner-restricted.pdf` | Opens without a password, but an owner password forbids changes |
| `21-form-filled-field.pdf` | A form field with a solid background, which paints over anything on the page beneath it |
| `19-digitally-signed.pdf` | A signature the app can detect. It doesn't verify, as no test needs that until Phase 7 |

## Real-world

Works of the United States government, which are in the public domain in the US (17 U.S.C. § 105). Downloaded 2026-11-05.

| File | Source |
| --- | --- |
| `16-irs-form-w9.pdf` | IRS Form W-9, https://www.irs.gov/pub/irs-pdf/fw9.pdf |
| `17-irs-form-w4.pdf` | IRS Form W-4, https://www.irs.gov/pub/irs-pdf/fw4.pdf |
| `18-irs-publication-15t.pdf` | IRS Publication 15-T, https://www.irs.gov/pub/irs-pdf/p15t.pdf |

## Fonts used to build these

Liberation fonts 2.1.5, SIL Open Font License, from https://github.com/liberationfonts/liberation-fonts. They're in `assets/fonts/liberation/` with their licence.

## Files that should fail to open

These are in `tests/fixtures/` rather than here, because they can't be round-tripped: `not-a-pdf.pdf`, `empty.pdf`, `truncated.pdf` and `bad-page.pdf`, which opens but has a broken second page.
