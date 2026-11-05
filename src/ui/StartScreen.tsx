import type { OsFamily } from '../platform';
import { Icon } from './Icon';
import type { OpenProblem } from './messages';
import { shortcutLabel } from './shortcuts';

interface StartScreenProps {
  readonly os: OsFamily;
  readonly busy: boolean;
  readonly failure: { readonly fileName: string; readonly problem: OpenProblem } | null;
  readonly onChooseFile: () => void;
}

export function StartScreen({ os, busy, failure, onChooseFile }: StartScreenProps) {
  return (
    <div className="window" data-os={os}>
      <header className="bar" data-tauri-drag-region>
        <span className="app-name" data-tauri-drag-region>
          Smorsy PDF Editor
        </span>
      </header>
      <main className="start-stage">
        {failure ? (
          <section className="start-sheet" role="alert">
            <div className="start-error">
              <Icon name="error" className="err-icon" />
              <h1>{failure.fileName} can’t be opened</h1>
            </div>
            <p>{failure.problem.reason}</p>
            <p>{failure.problem.advice}</p>
            <div className="start-actions">
              <button className="btn btn-primary" onClick={onChooseFile}>
                Choose another file
              </button>
            </div>
            <details>
              <summary>Technical details</summary>
              {failure.problem.technical}
            </details>
            <div className="start-foot">
              <Icon name="lock" />
              <span>Nothing was changed. This file hasn’t left your computer.</span>
            </div>
          </section>
        ) : (
          <section className="start-sheet" aria-label="Open a PDF">
            <h1 className="tick">Open a PDF</h1>
            <p className="tick">Choose a file from your computer to get started.</p>
            <div className="start-actions">
              <button className="btn btn-primary" disabled={busy} onClick={onChooseFile}>
                {busy ? 'Opening…' : 'Choose a file'}
              </button>
              <span className="kbd">{shortcutLabel(os, 'O')}</span>
            </div>
            <div className="start-foot">
              <Icon name="lock" />
              <span>Your files stay on this computer. Nothing is uploaded.</span>
            </div>
          </section>
        )}
      </main>
      <footer className="status">
        <span>Works offline</span>
      </footer>
    </div>
  );
}
