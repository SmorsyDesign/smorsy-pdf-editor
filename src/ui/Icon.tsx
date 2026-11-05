const PATHS = {
  plus: <path d="M8 3v10M3 8h10" />,
  minus: <path d="M3 8h10" />,
  lock: <path d="M3.5 7.5h9v6h-9zM5.5 7.5v-2a2.5 2.5 0 015 0v2" />,
  error: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.75v4M8 11.25h0" />
    </>
  ),
  warn: <path d="M8 2.5l6 11H2zM8 6.5v3.5M8 12h0" />,
  info: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 7.5v3.5M8 5h0" />
    </>
  ),
  fit: <path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5" />,
  select: <path d="M3.5 2.5l9 5-4 1-2 4z" />,
  text: <path d="M3 4V2.75h10V4M8 2.75v10.5M6 13.25h4" />,
  undo: <path d="M5.5 3l-3 3 3 3M2.5 6h7a4 4 0 010 8h-3" />,
  redo: <path d="M10.5 3l3 3-3 3M13.5 6h-7a4 4 0 000 8h3" />,
  search: (
    <>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3" />
    </>
  ),
  up: <path d="M4 10l4-4 4 4" />,
  down: <path d="M4 6l4 4 4-4" />,
  close: <path d="M4 4l8 8M12 4l-8 8" />,
  left: <path d="M2.5 4h11M2.5 8h7M2.5 12h9" />,
  center: <path d="M2.5 4h11M4.5 8h7M3.5 12h9" />,
  right: <path d="M2.5 4h11M6.5 8h7M4.5 12h9" />,
  trash: <path d="M2.5 4.5h11M6 4.5v-2h4v2M4 4.5l.75 9h6.5l.75-9" />,
  move: (
    <path d="M8 2v12M2 8h12M8 2L6 4M8 2l2 2M8 14l-2-2M8 14l2-2M2 8l2-2M2 8l2 2M14 8l-2-2M14 8l-2 2" />
  ),
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
