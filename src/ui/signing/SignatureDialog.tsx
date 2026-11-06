import { useEffect, useMemo, useRef, useState } from 'react';
import type { Color, SignatureImage } from '../../engine/edits/model';
import type { Platform } from '../../platform';
import { Icon } from '../Icon';
import { DrawTab } from './DrawTab';
import {
  INK_BLACK,
  INK_BLUE,
  SignatureError,
  signatureImageFrom,
  type SignatureBuild,
} from './makeSignature';
import { TypeTab } from './TypeTab';
import { UploadTab } from './UploadTab';
import type { SignatureKind } from './useSigning';

type Tab = 'draw' | 'type' | 'upload';

const TABS: readonly (readonly [Tab, string])[] = [
  ['draw', 'Draw'],
  ['type', 'Type'],
  ['upload', 'Upload'],
];

const SLIP_LABELS: Readonly<Record<Tab, string>> = {
  draw: 'Drawn signature',
  type: 'Typed signature',
  upload: 'Uploaded signature',
};

interface SignatureDialogProps {
  readonly platform: Platform;
  readonly initialKind: SignatureKind;
  readonly onUse: (image: SignatureImage, kind: SignatureKind, label: string) => void;
  readonly onCancel: () => void;
}

export function SignatureDialog({ platform, initialKind, onUse, onCancel }: SignatureDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>('draw');
  const [kind, setKind] = useState(initialKind);
  const [ink, setInk] = useState<Color>(INK_BLUE);
  const [builds, setBuilds] = useState<Readonly<Record<Tab, SignatureBuild | null>>>({
    draw: null,
    type: null,
    upload: null,
  });
  const [working, setWorking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      dialog?.close();
    };
  }, []);

  const cancel = () => {
    // Making a signature takes a moment, and it mustn't turn up after being cancelled.
    cancelled.current = true;
    onCancel();
  };

  // Kept the same between renders, because each tab reports again whenever its handler changes.
  const onBuildChange = useMemo(() => {
    const forTab = (which: Tab) => (next: SignatureBuild | null) => {
      setBuilds((current) => ({ ...current, [which]: next }));
    };
    return { draw: forTab('draw'), type: forTab('type'), upload: forTab('upload') };
  }, []);

  const build = builds[tab];

  const use = async () => {
    if (!build) return;
    setWorking(true);
    setProblem(null);
    try {
      const pixels = await build();
      if (!pixels) {
        setProblem('Nothing could be seen in that signature. Try again.');
        return;
      }
      const image = await signatureImageFrom(pixels, tab === 'upload' ? null : ink);
      if (!cancelled.current) onUse(image, kind, SLIP_LABELS[tab]);
    } catch (error) {
      console.error(error);
      setProblem(
        error instanceof SignatureError
          ? error.message
          : 'That signature couldn’t be made. Try again, or use another way to create it.',
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby="signature-title"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <div className="dialog-head">
        <h2 id="signature-title">
          {initialKind === 'initials' ? 'Create initials' : 'Create a signature'}
        </h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={cancel}>
          <Icon name="close" />
        </button>
      </div>
      <nav className="tabs" aria-label="How to create it">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="tab"
            {...(id === tab ? { 'aria-current': 'page' as const } : {})}
            onClick={() => {
              setTab(id);
              setProblem(null);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="dialog-body">
        {/* All stay mounted, so moving between them doesn't lose what's been drawn or typed. */}
        <div hidden={tab !== 'draw'}>
          <DrawTab ink={ink} onChange={onBuildChange.draw} />
        </div>
        <div hidden={tab !== 'type'}>
          <TypeTab ink={ink} onChange={onBuildChange.type} />
        </div>
        <div hidden={tab !== 'upload'}>
          <UploadTab platform={platform} onChange={onBuildChange.upload} />
        </div>
        <div className="options">
          <fieldset className="choice-group">
            <legend className="opt-label">Use as</legend>
            <div className="choice-row">
              {(['signature', 'initials'] as const).map((value) => (
                <label key={value} className="choice">
                  <input
                    type="radio"
                    name="signature-kind"
                    checked={kind === value}
                    onChange={() => {
                      setKind(value);
                    }}
                  />
                  {value === 'signature' ? 'Signature' : 'Initials'}
                </label>
              ))}
            </div>
          </fieldset>
          {tab !== 'upload' && (
            <fieldset className="choice-group">
              <legend className="opt-label">Ink</legend>
              <div className="choice-row">
                {(
                  [
                    ['Blue', INK_BLUE],
                    ['Black', INK_BLACK],
                  ] as const
                ).map(([label, value]) => (
                  <label key={label} className="choice">
                    <input
                      type="radio"
                      name="signature-ink"
                      checked={ink === value}
                      onChange={() => {
                        setInk(value);
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        {problem && (
          <p className="signature-problem" role="alert">
            {problem}
          </p>
        )}
      </div>
      <div className="dialog-foot">
        <p className="foot-note">
          Kept until you close this PDF, and never stored on this computer.
        </p>
        <div className="foot-actions">
          <button type="button" className="btn" onClick={cancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!build || working}
            onClick={() => {
              void use();
            }}
          >
            {kind === 'initials' ? 'Use initials' : 'Use signature'}
          </button>
        </div>
      </div>
    </dialog>
  );
}
