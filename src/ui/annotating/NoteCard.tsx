import { useState } from 'react';
import { boundsOfAnnotation, type Annotation } from '../../engine/edits/annotations';
import type { PageSize } from '../../engine/zoom';
import { noteColor, noteCardPlace } from './AnnotationArt';
import type { Annotating } from './useAnnotating';

interface NoteCardProps {
  readonly note: Extract<Annotation, { kind: 'note' }>;
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
}

export function NoteCard({ note, annotating, scale, page }: NoteCardProps) {
  // Mounted once per opening, so all the typing in one visit is one undo.
  const [typing] = useState(() => `note-${crypto.randomUUID()}`);
  return (
    <div
      className="note-card"
      data-testid="note-card"
      style={{
        ...noteCardPlace(boundsOfAnnotation(note), scale, page),
        background: noteColor(note.color),
      }}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <textarea
        aria-label="Note"
        // A note is opened to be typed in, so it should be ready straight away.
        ref={(field) => {
          if (field && !note.text) field.focus();
        }}
        defaultValue={note.text}
        rows={4}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            const empty = event.currentTarget.value.trim() === '';
            event.currentTarget.blur();
            // An empty note has gone by now, and removing it has already moved focus on.
            if (!empty) annotating.focus(note.id);
          }
        }}
        // As it's typed rather than on leaving, because a shortcut can save without leaving the box.
        onChange={(event) => {
          annotating.change({ ...note, text: event.target.value }, typing);
        }}
        onBlur={(event) => {
          // A note with nothing in it would just be a stray mark on the page.
          // Part of the same undo as the typing, so undoing can't bring back a note with no words.
          // Focus only needs rescuing when it isn't already on its way somewhere else.
          if (event.target.value.trim() === '') {
            annotating.remove(note.id, { group: typing, focusPages: !event.relatedTarget });
          }
          annotating.closeNote();
        }}
      />
    </div>
  );
}
