import type { Color, SignatureImage } from '../../engine/edits/model';
import { cropToInk, type RgbaImage } from '../../engine/signatures/image';

export const INK_BLUE: Color = { r: 28 / 255, g: 42 / 255, b: 90 / 255 };
export const INK_BLACK: Color = { r: 0, g: 0, b: 0 };

export const cssInk = ({ r, g, b }: Color) =>
  `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

function contextOf(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This computer couldn’t set up a drawing surface.');
  return context;
}

export function pixelsOf(canvas: HTMLCanvasElement): RgbaImage {
  const { data } = contextOf(canvas).getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

/** Encodes pixels as a new PNG, which also leaves behind any metadata an upload came with. */
export function pngOf({ width, height, data }: RgbaImage): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  contextOf(canvas).putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        blob.arrayBuffer().then((buffer) => {
          resolve(new Uint8Array(buffer));
        }, reject);
      } else {
        reject(new Error('This signature couldn’t be turned into an image.'));
      }
    }, 'image/png');
  });
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

const TYPED_SIZE = 96;

/** Draws a name large and trims it, so it stays sharp when it's enlarged on the page. */
export async function typedPixels(
  name: string,
  font: { readonly family: string; readonly weight: number },
  ink: Color,
): Promise<RgbaImage | null> {
  const css = `${font.weight} ${TYPED_SIZE}px "${font.family}"`;
  await document.fonts.load(css, name);
  const canvas = document.createElement('canvas');
  const context = contextOf(canvas);
  context.font = css;
  // Handwriting swoops well past its measured width, so there's plenty of room to crop back from.
  canvas.width = Math.ceil(context.measureText(name).width) + TYPED_SIZE * 2;
  canvas.height = TYPED_SIZE * 3;
  context.font = css;
  context.fillStyle = cssInk(ink);
  context.textBaseline = 'alphabetic';
  context.fillText(name, TYPED_SIZE, TYPED_SIZE * 2);
  return cropToInk(pixelsOf(canvas));
}
