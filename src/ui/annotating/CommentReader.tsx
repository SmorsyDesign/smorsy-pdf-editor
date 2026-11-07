import { useEffect, useState } from 'react';
import type { PdfDocument } from '../../engine/document';
import { boundsOfAnnotation, type Annotation } from '../../engine/edits/annotations';
import type { Rect } from '../../engine/edits/model';
import type { ExistingNote } from '../../engine/notes';
import type { PageSize } from '../../engine/zoom';
import { commentCardPlace } from './AnnotationArt';

interface Readable {
  readonly id: string;
  readonly rect: Rect;
  readonly text: string;
  readonly author: string;
}

interface CommentReaderProps {
  readonly document: PdfDocument;
  readonly pageNumber: number;
  readonly page: PageSize;
  readonly scale: number;
  /** What's known about this page's comments, including changes not saved yet. */
  readonly comments: readonly Annotation[];
  /** Saved ones that have been deleted or replaced. */
  readonly hidden: readonly string[];
}

/** Lets people read comments outside Annotate mode, since the page itself shows only a pin. */
export function CommentReader({
  document,
  pageNumber,
  page,
  scale,
  comments,
  hidden,
}: CommentReaderProps) {
  const [notes, setNotes] = useState<readonly ExistingNote[]>([]);
  const [problem, setProblem] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Read separately from the rest, because this also works on a file too protected to edit.
  useEffect(() => {
    let current = true;
    document.existingNotes(pageNumber).then(
      (found) => {
        if (current) setNotes(found);
      },
      (error: unknown) => {
        console.error(error);
        if (current) setProblem(true);
      },
    );
    return () => {
      current = false;
    };
  }, [document, pageNumber]);

  if (problem) {
    return (
      <p className="comment-problem" role="status">
        The comments on this page couldn’t be read.
      </p>
    );
  }

  const known: readonly Readable[] = comments.flatMap((comment) =>
    comment.kind === 'comment'
      ? [
          {
            id: comment.id,
            rect: boundsOfAnnotation(comment),
            text: comment.text,
            author: notes.find((note) => note.id === comment.saved?.ref)?.author ?? '',
          },
        ]
      : [],
  );
  const refs = new Set(comments.map((comment) => comment.saved?.ref));
  const readable = [
    ...known,
    ...notes.filter((note) => !refs.has(note.id) && !hidden.includes(note.id)),
  ];

  return readable.map((comment) => {
    const isOpen = openId === comment.id;
    return (
      <span key={comment.id}>
        <button
          type="button"
          className="comment-read"
          aria-label={isOpen ? 'Close comment' : 'Read comment'}
          aria-expanded={isOpen}
          style={{
            left: comment.rect.x * scale,
            top: comment.rect.y * scale,
            width: Math.max(24, comment.rect.width * scale),
            height: Math.max(24, comment.rect.height * scale),
          }}
          onClick={(event) => {
            event.stopPropagation();
            // Safari doesn't focus a clicked button, and Esc closes the comment from here.
            event.currentTarget.focus({ preventScroll: true });
            setOpenId(isOpen ? null : comment.id);
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
        />
        {isOpen && (
          <div
            className="comment-card is-reading"
            role="note"
            style={commentCardPlace(comment.rect, scale, page)}
          >
            {comment.author && <strong>{comment.author}</strong>}
            <p>{comment.text}</p>
          </div>
        )}
      </span>
    );
  });
}
