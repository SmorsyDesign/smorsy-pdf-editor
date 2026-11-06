import { useEffect, useMemo, useState } from 'react';
import {
  cropToInk,
  inkCoverage,
  removeWhiteBackground,
  scaledToFit,
  type RgbaImage,
} from '../../engine/signatures/image';
import type { Platform } from '../../platform';
import { pixelsOf, pngOf } from './makeSignature';

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_PIXELS = 100_000_000;
// Larger than a signature ever prints, and keeps the work quick on a phone photo.
const MAX_SIDE = 2000;
// A clean signature is mostly paper, so this much ink means the background probably stayed.
const TOO_MUCH_INK = 0.6;

const UNREADABLE = 'That file couldn’t be read as an image. Try a PNG or JPEG.';

async function decode(bytes: Uint8Array): Promise<RgbaImage> {
  const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
  try {
    if (bitmap.width * bitmap.height > MAX_PIXELS) {
      throw new Error('That image is too large. Try one under 100 megapixels.');
    }
    const size = scaledToFit(bitmap.width, bitmap.height, MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This computer couldn’t set up a drawing surface.');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    return pixelsOf(canvas);
  } finally {
    bitmap.close();
  }
}

interface UploadTabProps {
  readonly platform: Platform;
  readonly onChange: (build: (() => Promise<RgbaImage | null>) | null) => void;
}

export function UploadTab({ platform, onChange }: UploadTabProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!source) return null;
    return removeWhite ? cropToInk(removeWhiteBackground(source)) : source;
  }, [removeWhite, source]);

  useEffect(() => {
    onChange(result ? () => Promise.resolve(result) : null);
  }, [onChange, result]);

  useEffect(() => {
    if (!result) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    pngOf(result)
      .then((png) => {
        if (cancelled) return;
        url = URL.createObjectURL(new Blob([new Uint8Array(png)], { type: 'image/png' }));
        setPreview(url);
      })
      .catch((error: unknown) => {
        console.error(error);
        setProblem(UNREADABLE);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);

  const choose = async () => {
    try {
      const picked = await platform.chooseImage();
      if (!picked) return;
      if (picked.bytes.length > MAX_FILE_BYTES) {
        setProblem('That image is too large. Try one under 25 MB.');
        return;
      }
      setSource(await decode(picked.bytes));
      setFileName(picked.name);
      setProblem(null);
    } catch (error) {
      console.error(error);
      setSource(null);
      setFileName(null);
      const tooLarge = error instanceof Error && error.message.startsWith('That image');
      setProblem(tooLarge ? error.message : UNREADABLE);
    }
  };

  const nothingLeft = source !== null && result === null;
  const backgroundStayed = removeWhite && result !== null && inkCoverage(result) > TOO_MUCH_INK;

  return (
    <>
      <div className="file-row">
        <span>
          <strong>{fileName ?? 'No image chosen'}</strong>
        </span>
        <button
          type="button"
          className="btn"
          onClick={() => {
            void choose();
          }}
        >
          {fileName ? 'Choose another image' : 'Choose an image'}
        </button>
      </div>
      <div className="pad checker">
        {preview && (
          <img className="pad-image" src={preview} alt="Your signature, as it will be placed" />
        )}
      </div>
      {problem && (
        <p className="signature-problem" role="alert">
          {problem}
        </p>
      )}
      {nothingLeft && (
        <p className="signature-problem" role="alert">
          No ink was found once the white was removed. Try a darker image, or turn off Remove white
          background.
        </p>
      )}
      {backgroundStayed && (
        <p className="foot-note signature-note" role="status">
          The background may not have come out. Check the preview, because it will cover whatever is
          underneath it on the page.
        </p>
      )}
      <div className="options">
        <label className="choice">
          <input
            type="checkbox"
            checked={removeWhite}
            onChange={(event) => {
              setRemoveWhite(event.target.checked);
            }}
          />
          Remove white background
        </label>
      </div>
      <p className="foot-note signature-note">
        Works best with dark ink on plain white paper. The squares show where the page will show
        through.
      </p>
    </>
  );
}
