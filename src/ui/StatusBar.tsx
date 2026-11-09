import type { OsFamily } from '../platform';
import { Icon } from './Icon';
import { shortcutLabel } from './shortcuts';

interface StatusBarProps {
  readonly os: OsFamily;
  readonly page: string;
  readonly hint: string;
  readonly fontsReplaced: number;
  readonly message: string;
  readonly percent: number;
  readonly fitting: boolean;
  readonly onFit: () => void;
  readonly onZoomOut: () => void;
  readonly onZoomIn: () => void;
  /** Pages mode shows every page small, which zooming doesn't apply to. */
  readonly showsZoom?: boolean;
}

export function StatusBar({
  os,
  page,
  hint,
  fontsReplaced,
  message,
  percent,
  fitting,
  onFit,
  onZoomOut,
  onZoomIn,
  showsZoom = true,
}: StatusBarProps) {
  return (
    <footer className="status">
      <div className="status-part">
        <span data-testid="page-indicator">{page}</span>
        <span className="status-hint">{hint}</span>
        {fontsReplaced > 0 && (
          <span className="status-caution">
            <Icon name="warn" />
            {fontsReplaced === 1 ? '1 font replaced' : `${fontsReplaced} fonts replaced`}
          </span>
        )}
      </div>
      <div className="status-part">
        <span role="status">{message}</span>
        {showsZoom && (
          <div className="zoom" role="group" aria-label="Zoom">
            <button
              className="icon-btn"
              aria-label="Fit to width"
              title={`Fit to width (${shortcutLabel(os, '9')})`}
              aria-pressed={fitting}
              onClick={onFit}
            >
              <Icon name="fit" />
            </button>
            <button
              className="icon-btn"
              aria-label="Zoom out"
              title={`Zoom out (${shortcutLabel(os, '-')})`}
              onClick={onZoomOut}
            >
              <Icon name="minus" />
            </button>
            <span className="zoom-value" data-testid="zoom-value" aria-live="polite">
              {percent}%
            </span>
            <button
              className="icon-btn"
              aria-label="Zoom in"
              title={`Zoom in (${shortcutLabel(os, '=')})`}
              onClick={onZoomIn}
            >
              <Icon name="plus" />
            </button>
          </div>
        )}
      </div>
    </footer>
  );
}
