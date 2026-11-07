import { PDFHexString, PDFString, pdfDocEncodingDecode, type PDFObject } from '@cantoo/pdf-lib';

// Short enough that the library's decoding, which takes its letters as arguments, can't overflow.
const CHUNK = 8_192;

export const isPdfText = (value: PDFObject | undefined): value is PDFString | PDFHexString =>
  value instanceof PDFString || value instanceof PDFHexString;

/** Reads text as PDFs store it. The library's own way fails on long text. */
export function readPdfText(value: PDFObject | undefined): string {
  if (!isPdfText(value)) return '';
  const bytes = value.asBytes();
  const [first, second, third] = bytes;
  if (first === 0xfe && second === 0xff)
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  if (first === 0xff && second === 0xfe)
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (first === 0xef && second === 0xbb && third === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  let text = '';
  for (let start = 0; start < bytes.length; start += CHUNK) {
    text += pdfDocEncodingDecode(bytes.subarray(start, start + CHUNK));
  }
  return text;
}
