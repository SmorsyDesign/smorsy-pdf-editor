import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import type { Color } from '../../engine/edits/model';
import { cropToInk, type RgbaImage } from '../../engine/signatures/image';
import { cssInk, pixelsOf } from './makeSignature';

interface DrawTabProps {
  readonly ink: Color;
  readonly onChange: (build: (() => Promise<RgbaImage | null>) | null) => void;
}

// Drawn well above screen resolution, so the signature stays sharp when printed.
const MIN_RESOLUTION = 3;

export function DrawTab({ ink, onChange }: DrawTabProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [strokes, setStrokes] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let pad: SignaturePad;
    try {
      pad = new SignaturePad(canvas, {
        minWidth: 1,
        maxWidth: 3,
        backgroundColor: 'rgba(0,0,0,0)',
      });
    } catch (error) {
      console.error(error);
      setFailed(true);
      return;
    }
    padRef.current = pad;
    const count = () => {
      setStrokes(pad.toData().length);
    };
    pad.addEventListener('endStroke', count);
    // Sized once it's really on screen: a dialog's contents have no size until it has opened.
    const fit = () => {
      if (canvas.offsetWidth === 0) return;
      const ratio = Math.max(window.devicePixelRatio, MIN_RESOLUTION);
      const strokes = pad.toData();
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext('2d')?.scale(ratio, ratio);
      if (strokes.length > 0) pad.fromData(strokes);
      else pad.clear();
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      pad.removeEventListener('endStroke', count);
      pad.off();
      padRef.current = null;
    };
  }, []);

  // A colour change repaints what's already drawn, so the choice can be made at any point.
  const color = cssInk(ink);
  useEffect(() => {
    const pad = padRef.current;
    if (!pad) return;
    pad.penColor = color;
    const data = pad.toData();
    if (data.length > 0) pad.fromData(data.map((stroke) => ({ ...stroke, penColor: color })));
  }, [color]);

  useEffect(() => {
    const canvas = canvasRef.current;
    onChange(strokes > 0 && canvas ? () => Promise.resolve(cropToInk(pixelsOf(canvas), 4)) : null);
  }, [onChange, strokes]);

  const undoStroke = () => {
    const pad = padRef.current;
    if (!pad) return;
    const data = pad.toData();
    data.pop();
    if (data.length > 0) pad.fromData(data);
    else pad.clear();
    setStrokes(data.length);
  };

  const clear = () => {
    padRef.current?.clear();
    setStrokes(0);
  };

  return (
    <>
      <div className="pad">
        <span className="pad-line" />
        <span className="pad-hint">
          Sign above the line with your mouse or trackpad. Using a keyboard? Choose Type.
        </span>
        <canvas ref={canvasRef} data-testid="signature-pad" aria-label="Draw your signature here" />
      </div>
      {failed && (
        <p className="signature-problem" role="alert">
          Drawing couldn’t start on this computer. Choose Type or Upload instead.
        </p>
      )}
      <div className="pad-tools">
        <div>
          <button type="button" className="btn" disabled={strokes === 0} onClick={undoStroke}>
            Undo stroke
          </button>
          <button type="button" className="btn" disabled={strokes === 0} onClick={clear}>
            Clear
          </button>
        </div>
      </div>
    </>
  );
}
