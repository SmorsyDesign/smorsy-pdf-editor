interface ImageSize {
  readonly width: number;
  readonly height: number;
}

const startsWith = (bytes: Uint8Array, prefix: readonly number[], at = 0) =>
  prefix.every((value, index) => bytes[at + index] === value);

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF = ascii('RIFF');
const WEBP = ascii('WEBP');

function jpegSize(view: DataView): ImageSize | null {
  let at = 2;
  while (at + 9 <= view.byteLength) {
    if (view.getUint8(at) !== 0xff) return null;
    const marker = view.getUint8(at + 1);
    // Padding between sections.
    if (marker === 0xff) {
      at += 1;
      continue;
    }
    // Frame headers hold the size. These other three share the range but are something else.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) };
    at += 2 + view.getUint16(at + 2);
  }
  return null;
}

function webpSize(bytes: Uint8Array, view: DataView): ImageSize | null {
  if (bytes.length < 30) return null;
  if (startsWith(bytes, ascii('VP8X'), 12)) {
    const read24 = (at: number) =>
      view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
    return { width: read24(24) + 1, height: read24(27) + 1 };
  }
  if (startsWith(bytes, ascii('VP8L'), 12)) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (startsWith(bytes, ascii('VP8 '), 12)) {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  return null;
}

/**
 * Reads an image's size from its header. A tiny file can decode to gigabytes of pixels, so this
 * has to happen before decoding. Anything unrecognised gives null, and isn't decoded at all.
 */
export function imageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (startsWith(bytes, PNG)) {
    return bytes.length < 24 ? null : { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (startsWith(bytes, [0xff, 0xd8])) return jpegSize(view);
  if (startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8)) return webpSize(bytes, view);
  return null;
}
