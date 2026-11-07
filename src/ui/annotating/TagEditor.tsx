import { useRef, useState, type KeyboardEvent } from 'react';
import { MAX_TAGS, MAX_TAG_LENGTH, cleanTags } from '../../engine/edits/saved-data';
import { Icon } from '../Icon';

interface TagEditorProps {
  readonly tags: readonly string[];
  /** Every tag in use, so the same ones are easy to reuse rather than retype. */
  readonly offers: readonly string[];
  readonly onChange: (tags: readonly string[]) => void;
}

/** Sits inside the selected row, so it's clear which annotation the tags are for. */
export function TagEditor({ tags, offers, onChange }: TagEditorProps) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const isFull = tags.length >= MAX_TAGS;

  const add = (tag: string) => {
    const next = cleanTags([...tags, tag]);
    if (next.length !== tags.length) onChange(next);
    setTyped('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      add(typed);
    } else if (event.key === 'Backspace' && typed === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  const unused = isFull
    ? []
    : offers.filter((offer) => !tags.some((tag) => tag.toLowerCase() === offer.toLowerCase()));
  return (
    <li className="tag-editor">
      <div className="tag-editing">
        {tags.map((tag) => (
          <span key={tag} className="tag is-removable">
            {tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => {
                onChange(tags.filter((one) => one !== tag));
                // The button's just gone, so focus needs somewhere to go.
                inputRef.current?.focus();
              }}
            >
              <Icon name="close" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          readOnly={isFull}
          className="tag-input"
          type="text"
          aria-label="Add a tag"
          placeholder={isFull ? `${String(MAX_TAGS)} tags is the most` : 'Add a tag'}
          maxLength={MAX_TAG_LENGTH}
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value);
          }}
          onKeyDown={onKeyDown}
          // Typed and then clicked away from is still meant.
          onBlur={() => {
            if (typed.trim() !== '') add(typed);
          }}
        />
      </div>
      {unused.length > 0 && (
        <div className="tag-offers">
          <span className="kbd tag-offers-label">Used in this document</span>
          {unused.map((offer) => (
            <button
              key={offer}
              type="button"
              className="tag-btn"
              onClick={() => {
                add(offer);
                inputRef.current?.focus();
              }}
            >
              {offer}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
