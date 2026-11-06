import { useEffect, useMemo, useState } from 'react';
import {
  cropToInk,
  inkCoverage,
  removeWhiteBackground,
  scaledToFit,
  type RgbaImage,
} from '../../engine/signatures/image';
import { imageSize } from '../../engine/signatures/imageSize';
import { FileTooLarge, ReadFailure, type Platform } from '../../platform';
import {
  contextOf,
  pixelsOf,
  pngObjectUrl,
  pngOf,
  SignatureError,
  type SignatureBuild,
} from './makeSignature';

const MAX_PIXELS = 100_000_000;
// Larger than a signature ever prints, and keeps the work quick on a phone photo.
const MAX_SIDE = 2000;
// A clean signature is mostly paper, so this much ink means the background probably stayed.
const TOO_MUCH_INK = 0.6;

const UNREADABLE = 'That file couldn’t be read as an image. Try a PNG, JPEG or WebP.';
const TOO_MANY_PIXELS = 'That image is too large. Try one under 100 megapixels.';

async function decode(bytes: Uint8Array): Promise<RgbaImage> {
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

function explain(error: unknown): string {
  if (error instanceof SignatureError) return error.message;
  if (error instanceof FileTooLarge) return 'That image is too large. Try one under 25 MB.';
  if (error instanceof ReadFailure) {
    return 'That file couldn’t be read from your computer. Check that it still exists.';
  }
  return UNREADABLE;
}

interface UploadTabProps {
  readonly platform: Platform;
  readonly onChange: (build: SignatureBuild | null) => void;
}

export function UploadTab({ platform, onChange }: UploadTabProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [source, setSource] = useState<RgbaImage | null>(null);
  const [removeWhite, setRemoveWhite] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const result = useMemo(
    () => source && cropToInk(removeWhite ? removeWhiteBackground(source) : source),
    [removeWhite, source],
  );

  useEffect(() => {
    onChange(result ? () => Promise.resolve(result) : null);
  }, [onChange, result]);

  useEffect(() => {
    setPreview(null);
    if (!result) return;
    let cancelled = false;
    let url: string | null = null;
    pngOf(result)
      .then((png) => {
        if (cancelled) return;
        url = pngObjectUrl(png);
        setPreview(url);
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) setProblem(explain(error));
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
      // Whatever came before is gone, so a rejected file can't leave an old image ready to use.
      setSource(null);
      setFileName(null);
      setProblem(null);
      setSource(await decode(picked.bytes));
      setFileName(picked.name);
    } catch (error) {
      console.error(error);
      setSource(null);
      setFileName(null);
      setProblem(explain(error));
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
          No ink was found in this image. Check it’s the right file, or turn off Remove white
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
