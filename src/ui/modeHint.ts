import { isMarkupTool, type Annotating } from './annotating/useAnnotating';
import type { Signing } from './signing/useSigning';
import type { EditorMode } from './TopBar';

function annotateHint({ tool, moving }: Annotating, pageIsScan: boolean): string {
  if (isMarkupTool(tool)) {
    return pageIsScan
      ? 'This page is a scan with no text to mark. Use the pen or a shape instead'
      : 'Drag across text to mark it, or Tab to a line';
  }
  if (tool === 'pen') return 'Drag on the page to draw. Drawing needs a pointer';
  if (tool === 'note') return 'Click where the note goes';
  if (tool) return 'Drag on the page, or click for a standard size';
  if (moving) return 'Click where it goes on the page';
  return 'Pick a tool, or click something on the page to change it';
}

/** What the status bar says to do next. */
export function modeHint(
  mode: EditorMode,
  annotating: Annotating,
  signing: Signing,
  pageIsScan: boolean,
): string {
  if (mode === 'edit') return 'Click a line to edit it, or click an empty area to add text';
  if (mode === 'select') return 'Drag across text to select it';
  if (mode === 'note') return annotateHint(annotating, pageIsScan);
  if (signing.picked || signing.moving) return 'Click where it goes on the page';
  if (signing.selected) return 'Drag the corners to resize, or the top handle to rotate';
  return 'Create a signature to place it';
}
