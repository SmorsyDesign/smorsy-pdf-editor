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
  note: <path d="M10.5 2.5l3 3-7.5 7.5-3.75.75.75-3.75zM2.5 14.5h11" />,
  marker: <path d="M9.5 2.5l4 4-6 6H3.5v-4zM2.5 14.5h11" />,
  underline: <path d="M4.5 2.5v5a3.5 3.5 0 007 0v-5M3 14h10" />,
  strike: (
    <path d="M2.5 8h11M11 4.5C10.5 3.2 9.4 2.5 8 2.5c-1.8 0-3 1-3 2.5 0 .8.3 1.4 1 2M5 11.5c.5 1.3 1.6 2 3 2 1.8 0 3-1 3-2.5" />
  ),
  pen: <path d="M2.5 13.5c3-1 2-5 4.5-7 2-1.5 5-1 6.5-3" />,
  rect: <path d="M2.5 4h11v8h-11z" />,
  ellipse: <ellipse cx="8" cy="8" rx="5.5" ry="4.5" />,
  arrow: <path d="M3 13L13 3M7 3h6v6" />,
  comment: <path d="M3 13.5V8a5 5 0 0 1 5-5h.5a5 5 0 0 1 0 10zM6 7h5M6 9.5h3.5" />,
  image: (
    <>
      <path d="M2.5 3h11v10h-11zM2.5 11l3-3 2.5 2.5 2-2 3.5 3.5" />
      <circle cx="10.5" cy="6" r="1" />
    </>
  ),
  whiteout: (
    <>
      <path d="M2.5 4h11v8h-11z" />
      <path d="M5 8h6" strokeDasharray="2 2" />
    </>
  ),
  sign: (
    <path d="M2 11.5c2-5 3.5-8 4.75-8 1.75 0-1.25 8 .5 8 1.25 0 1.75-2.75 3-2.75 1 0 .75 2 2 2h1.75M2 14.25h12" />
  ),
  rotr: <path d="M13.5 3v3.5H10M13.2 6.5A5.5 5.5 0 108 13.5" />,
  rotl: <path d="M2.5 3v3.5H6M2.8 6.5A5.5 5.5 0 118 13.5" />,
  pages: <path d="M5.5 4.5v-2h8v9h-2M2.5 4.5h9v9h-9z" />,
  extract: <path d="M3 9.5v4h10v-4M8 2.5v8M5 7.5l3 3 3-3" />,
  check: <path d="M3 8.5l3.5 3.5 6.5-8" />,
  copy: <path d="M5.5 5.5h8v8h-8zM10.5 5.5v-3h-8v8h3" />,
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
