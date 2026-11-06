import type { OsFamily } from '../platform';
import { Icon, type IconName } from './Icon';
import { shortcutLabel } from './shortcuts';

export type EditorMode = 'select' | 'edit' | 'note' | 'sign';

interface TopBarProps {
  readonly os: OsFamily;
  readonly fileName: string;
  readonly fileState: string;
  readonly mode: EditorMode;
  /** Why changing the document is unavailable, when it is. */
  readonly editBlocked: string | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly saveLabel: string;
  readonly onModeChange: (mode: EditorMode) => void;
  readonly onSearch: () => void;
  readonly onUndo: () => void;
  readonly onRedo: () => void;
  readonly onSave: () => void;
}

const MODES: readonly (readonly [EditorMode, IconName, string])[] = [
  ['select', 'select', 'Select'],
  ['edit', 'text', 'Edit text'],
  ['note', 'note', 'Annotate'],
  ['sign', 'sign', 'Sign'],
];

export function TopBar({
  os,
  fileName,
  fileState,
  mode,
  editBlocked,
  canUndo,
  canRedo,
  saveLabel,
  onModeChange,
  onSearch,
  onUndo,
  onRedo,
  onSave,
}: TopBarProps) {
  const redoShortcut = os === 'win' ? 'Ctrl+Y' : '⇧⌘Z';
  return (
    <header className="bar bar-editor" data-tauri-drag-region>
      <div className="file" data-tauri-drag-region>
        <span className="file-name" data-tauri-drag-region>
          {fileName}
        </span>
        <span className="file-state" data-tauri-drag-region>
          {fileState}
        </span>
      </div>
      <nav className="modes" aria-label="Editor mode">
        {MODES.map(([id, icon, label]) => (
          <button
            key={id}
            type="button"
            className="mode"
            aria-pressed={mode === id}
            disabled={id !== 'select' && editBlocked !== null}
            {...(id !== 'select' && editBlocked !== null ? { title: editBlocked } : {})}
            onClick={() => {
              onModeChange(id);
            }}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      <div className="bar-end">
        <button
          type="button"
          className="icon-btn"
          aria-label="Search"
          title={`Search (${shortcutLabel(os, 'F')})`}
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Undo"
          title={`Undo (${shortcutLabel(os, 'Z')})`}
          disabled={!canUndo}
          onClick={onUndo}
        >
          <Icon name="undo" />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Redo"
          title={`Redo (${redoShortcut})`}
          disabled={!canRedo}
          onClick={onRedo}
        >
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className="btn btn-primary"
          title={`${saveLabel} (${shortcutLabel(os, 'S')})`}
          onClick={onSave}
        >
          {saveLabel}
        </button>
      </div>
    </header>
  );
}
