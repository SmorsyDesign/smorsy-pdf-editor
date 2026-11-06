import { describe, expect, it } from 'vitest';
import { testPng } from '../../../tests/helpers/test-png';
import { imageSize } from './imageSize';

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0));

describe('imageSize', () => {
  it('reads a PNG', () => {
    expect(imageSize(testPng(40, 20))).toEqual({ width: 40, height: 20 });
  });

  it('reads a JPEG, stepping over the sections before the size', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
    const frame = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03];
    const bytes = new Uint8Array([0xff, 0xd8, ...app0, ...frame]);
    expect(imageSize(bytes)).toEqual({ width: 600, height: 300 });
  });

  it('isn’t fooled by the sections that look like a JPEG size', () => {
    const huffman = [0xff, 0xc4, 0x00, 0x04, 0x7f, 0x7f];
    const frame = [0xff, 0xc2, 0x00, 0x11, 0x08, 0x00, 0x0a, 0x00, 0x14, 0x03];
    const bytes = new Uint8Array([0xff, 0xd8, ...huffman, ...frame]);
    expect(imageSize(bytes)).toEqual({ width: 20, height: 10 });
  });

  const webp = (chunk: string, body: readonly number[]) => {
    const bytes = new Uint8Array(40);
    bytes.set(ascii('RIFF'), 0);
    bytes.set(ascii('WEBP'), 8);
    bytes.set(ascii(chunk), 12);
    bytes.set(body, 20);
    return bytes;
  };

  it('reads each kind of WebP', () => {
    // Extended: 24-bit sizes, stored as one less.
    expect(imageSize(webp('VP8X', [0, 0, 0, 0, 99, 0, 0, 49, 0, 0]))).toEqual({
      width: 100,
      height: 50,
    });
    // Lossless: 14 bits each, packed together, stored as one less.
    const lossless = 99 | (49 << 14);
    expect(
      imageSize(
        webp('VP8L', [
          0,
          lossless & 255,
          (lossless >> 8) & 255,
          (lossless >> 16) & 255,
          (lossless >> 24) & 255,
        ]),
      ),
    ).toEqual({ width: 100, height: 50 });
    // Lossy: 14-bit sizes after the frame tag.
    expect(imageSize(webp('VP8 ', [0, 0, 0, 0, 0, 0, 100, 0, 50, 0]))).toEqual({
      width: 100,
      height: 50,
    });
  });

  it('gives nothing for what it doesn’t recognise, or what’s been cut short', () => {
    expect(imageSize(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(imageSize(new Uint8Array())).toBeNull();
    expect(imageSize(testPng(40, 20).subarray(0, 12))).toBeNull();
    expect(imageSize(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBeNull();
    expect(imageSize(webp('XXXX', []))).toBeNull();
  });
});
