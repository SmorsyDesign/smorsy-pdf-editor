import { useEffect, useState } from 'react';
import type { PdfDocument } from '../../engine/document';
import type { ExistingNote } from '../../engine/notes';
import type { PageSize } from '../../engine/zoom';
import { Icon } from '../Icon';
import { noteCardPlace } from './AnnotationArt';

interface ExistingNotesProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
}

/** Notes saved in the file earlier. The page shows only a pin, so this lets people read them. */
export function ExistingNotes({ document, pageNumber, page, scale }: ExistingNotesProps) {
  const [notes, setNotes] = useState<readonly ExistingNote[]>([]);
  const [problem, setProblem] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    document.existingNotes(pageNumber).then(
      (found) => {
        if (current) setNotes(found);
      },
      () => {
        if (current) setProblem(true);
      },
    );
    return () => {
      current = false;
    };
  }, [document, pageNumber]);

  if (problem) {
    return (
      <p className="note-problem" role="status">
        The notes on this page couldn’t be read.
      </p>
    );
  }
  return notes.map((note) => {
    const isOpen = openId === note.id;
    return (
      <span key={note.id}>
        <button
          type="button"
          className="note-read"
          aria-label={isOpen ? 'Close note' : 'Read note'}
          aria-expanded={isOpen}
          style={{
            left: note.rect.x * scale,
            top: note.rect.y * scale,
            width: Math.max(24, note.rect.width * scale),
            height: Math.max(24, note.rect.height * scale),
          }}
          onClick={(event) => {
            event.stopPropagation();
            // Safari doesn't focus a clicked button, and Esc closes the note from here.
            event.currentTarget.focus({ preventScroll: true });
            setOpenId(isOpen ? null : note.id);
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && isOpen) {
              event.stopPropagation();
              setOpenId(null);
            }
          }}
        >
          {/* The file's own pin is already on the page, and could be any shape. */}
          <Icon name="pin" />
        </button>
        {isOpen && (
          <div
            className="note-card is-reading"
            role="note"
            style={noteCardPlace(note.rect, scale, page)}
          >
            {note.author && <strong>{note.author}</strong>}
            <p>{note.text}</p>
          </div>
        )}
      </span>
    );
  });
}
