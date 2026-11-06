import { useEffect, useMemo, useState } from 'react';
import {
  cropToInk,
  inkCoverage,
  removeWhiteBackground,
  type RgbaImage,
} from '../../engine/signatures/image';
import type { Platform } from '../../platform';
import {
  decodeImage,
  explainImageProblem,
  pngObjectUrl,
  pngOf,
  type SignatureBuild,
} from './makeSignature';

// A clean signature is mostly paper, so this much ink means the background probably stayed.
const TOO_MUCH_INK = 0.6;

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
        if (!cancelled) setProblem(explainImageProblem(error));
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
      setSource(await decodeImage(picked.bytes));
      setFileName(picked.name);
    } catch (error) {
      console.error(error);
      setSource(null);
      setFileName(null);
      setProblem(explainImageProblem(error));
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
