import { useEffect, useRef, useState } from 'react';
import { boundsOfAnnotation, type Annotation } from '../../engine/edits/annotations';
import type { PageSize } from '../../engine/zoom';
import { commentCardPlace } from './AnnotationArt';
import type { Annotating } from './useAnnotating';

interface CommentCardProps {
  readonly comment: Extract<Annotation, { kind: 'comment' }>;
  readonly annotating: Annotating;
  readonly scale: number;
  readonly page: PageSize;
}

export function CommentCard({ comment, annotating, scale, page }: CommentCardProps) {
  // Mounted once per opening, so all the typing in one visit is one undo.
  const [typing] = useState(() => `comment-${crypto.randomUUID()}`);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // Another app's comment can have no words to begin with, and just looking at it shouldn't delete it.
  const [wasEmpty] = useState(() => comment.saved !== undefined && comment.text.trim() === '');

  // Ready to type straight away. Leaving the box is also what closes the card.
  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      className="comment-card"
      data-testid="comment-card"
      style={commentCardPlace(boundsOfAnnotation(comment), scale, page)}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      <textarea
        ref={fieldRef}
        aria-label="Comment"
        placeholder="Write a comment"
        defaultValue={comment.text}
        rows={4}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            const empty = event.currentTarget.value.trim() === '' && !wasEmpty;
            event.currentTarget.blur();
            // An empty comment has gone by now, and removing it has already moved focus on.
            if (!empty) annotating.focus(comment.id);
          }
        }}
        // As it's typed rather than on leaving, because a shortcut can save without leaving the box.
        onChange={(event) => {
          annotating.change({ ...comment, text: event.target.value }, typing);
        }}
        onBlur={(event) => {
          // A comment with nothing in it would just be a stray mark on the page.
          // Part of the same undo as the typing, so undoing can't bring back one with no words.
          // Focus only needs rescuing when it isn't already on its way somewhere else.
          if (event.target.value.trim() === '' && !wasEmpty) {
            annotating.remove(comment.id, { group: typing, focusPages: !event.relatedTarget });
          }
          annotating.closeComment();
        }}
      />
    </div>
  );
}
