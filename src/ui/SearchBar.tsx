import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface SearchBarProps {
  readonly query: string;
  readonly current: number;
  readonly total: number;
  readonly searching: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onStep: (direction: 1 | -1) => void;
  readonly onClose: () => void;
}

export function SearchBar({
  query,
  current,
  total,
  searching,
  onQueryChange,
  onStep,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  let count = '';
  if (query.trim() !== '') {
    if (total > 0) count = `${current + 1} of ${total}`;
    else count = searching ? 'Searching…' : 'No matches';
  }

  return (
    <div
      className="float-bar search-bar"
      role="search"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        aria-label="Search this document"
        value={query}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onStep(event.shiftKey ? -1 : 1);
        }}
      />
      <span className="count" role="status">
        {count}
      </span>
      <button
        type="button"
        className="icon-btn"
        aria-label="Previous match"
        disabled={total === 0}
        onClick={() => {
          onStep(-1);
          inputRef.current?.focus();
        }}
      >
        <Icon name="up" />
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next match"
        disabled={total === 0}
        onClick={() => {
          onStep(1);
          inputRef.current?.focus();
        }}
      >
        <Icon name="down" />
      </button>
      <button type="button" className="icon-btn" aria-label="Close search" onClick={onClose}>
        <Icon name="close" />
      </button>
    </div>
  );
}
