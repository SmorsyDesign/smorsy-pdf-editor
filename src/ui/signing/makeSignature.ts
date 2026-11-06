import type { Color, SignatureImage } from '../../engine/edits/model';
import { cropToInk, scaledToFit, type RgbaImage } from '../../engine/signatures/image';
import { imageSize } from '../../engine/signatures/imageSize';
import { FileTooLarge, ReadFailure } from '../../platform';
import { loadWithinTime } from '../fontLoading';

export const INK_BLUE: Color = { r: 28 / 255, g: 42 / 255, b: 90 / 255 };
export const INK_BLACK: Color = { r: 0, g: 0, b: 0 };

/** Makes the picture from what a tab has so far. Resolves to null if there's no ink in it. */
export type SignatureBuild = () => Promise<RgbaImage | null>;

/** A failure with a message written for the person, safe to show as it is. */
export class SignatureError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SignatureError';
  }
}

export const cssInk = ({ r, g, b }: Color) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new SignatureError('This computer couldn’t set up a drawing surface.');
  return context;
}

export function pixelsOf(canvas: HTMLCanvasElement): RgbaImage {
  const { data } = contextOf(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

/** Encodes pixels as a new PNG, which also leaves behind any metadata an upload came with. */
export async function pngOf({ width, height, data }: RgbaImage): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  contextOf(canvas).putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (!blob) throw new SignatureError('This signature couldn’t be turned into an image.');
  return new Uint8Array(await blob.arrayBuffer());
}

export function pngObjectUrl(png: Uint8Array): string {
  return URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }));
}

export async function signatureImageFrom(
  pixels: RgbaImage,
  ink: Color | null,
): Promise<SignatureImage> {
  return {
    id: crypto.randomUUID(),
    png: await pngOf(pixels),
    width: pixels.width,
    height: pixels.height,
    ink,
  };
}

const MAX_PIXELS = 100_000_000;
// Larger than anything here ever prints, and keeps the work quick on a phone photo.
const MAX_SIDE = 2000;
const UNREADABLE = 'That file couldn’t be read as an image. Try a PNG, JPEG or WebP.';
const TOO_MANY_PIXELS = 'That image is too large. Try one under 100 megapixels.';

export async function decodeImage(bytes: Uint8Array): Promise<RgbaImage> {
  // Checked from the header, because a tiny file can decode to gigabytes of pixels.
  const size = imageSize(bytes);
  if (!size) throw new SignatureError(UNREADABLE);
  if (size.width * size.height > MAX_PIXELS) throw new SignatureError(TOO_MANY_PIXELS);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  } catch (error) {
    throw new SignatureError(UNREADABLE, { cause: error });
  }
  try {
    const fitted = scaledToFit(bitmap.width, bitmap.height, MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    contextOf(canvas).drawImage(bitmap, 0, 0, fitted.width, fitted.height);
    return pixelsOf(canvas);
  } finally {
    bitmap.close();
  }
}

export function explainImageProblem(error: unknown): string {
  if (error instanceof SignatureError) return error.message;
  if (error instanceof FileTooLarge) return 'That image is too large. Try one under 25 MB.';
  if (error instanceof ReadFailure) {
    return 'That file couldn’t be read from your computer. Check that it still exists.';
  }
  return UNREADABLE;
}

const TYPED_SIZE = 96;
const STYLE_FAILED =
  'This handwriting style didn’t load. Try another style, or draw or upload one.';

/** Draws a name large and trims it, so it stays sharp when it's enlarged on the page. */
export async function typedPixels(
  name: string,
  font: { readonly family: string; readonly weight: number },
  ink: Color,
): Promise<RgbaImage | null> {
  const css = `${font.weight} ${TYPED_SIZE}px "${font.family}"`;
  let faces: readonly FontFace[];
  try {
    faces = await loadWithinTime(css, name);
  } catch (error) {
    throw new SignatureError(STYLE_FAILED, { cause: error });
  }
  // With no face loaded the canvas would quietly draw in a system font instead.
  if (faces.length === 0) throw new SignatureError(STYLE_FAILED);
  const canvas = document.createElement('canvas');
  const context = contextOf(canvas);
  context.font = css;
  // Handwriting swoops well past its measured width, so there's plenty of room to crop back from.
  canvas.width = Math.ceil(context.measureText(name).width) + TYPED_SIZE * 2;
  canvas.height = TYPED_SIZE * 3;
  context.font = css;
  context.fillStyle = cssInk(ink);
  context.fillText(name, TYPED_SIZE, TYPED_SIZE * 2);
  return cropToInk(pixelsOf(canvas));
}
