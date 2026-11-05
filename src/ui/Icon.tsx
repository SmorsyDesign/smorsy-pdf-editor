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
  fit: <path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5" />,
} as const;

type IconName = keyof typeof PATHS;

export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
