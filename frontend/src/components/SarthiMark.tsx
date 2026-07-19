type Props = {
  className?: string;
};

export function SarthiMark({ className = "" }: Props) {
  return (
    <svg className={`sarthi-mark ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect className="sarthi-mark-bg" x="4" y="4" width="56" height="56" rx="16" />
      <path
        className="sarthi-mark-hand left"
        d="M14.5 38.5c4.6-1.2 8.5-.1 11.6 3.2l3.4 3.6c1.4 1.5 3.8 1.5 5.2 0l3.3-3.5c3.1-3.3 7-4.4 11.5-3.3"
      />
      <path
        className="sarthi-mark-hand right"
        d="M17 44.5c3.5 3.8 8.3 6 15 6s11.5-2.2 15-6"
      />
      <path
        className="sarthi-mark-shield"
        d="M32 14.5 43 19v9.6c0 7.2-4.5 12.3-11 14.7-6.5-2.4-11-7.5-11-14.7V19l11-4.5Z"
      />
      <path className="sarthi-mark-check" d="M27 29.6 30.5 33l7-8.4" />
      <circle className="sarthi-mark-proof-dot" cx="22.6" cy="36.8" r="2.6" />
      <circle className="sarthi-mark-proof-dot" cx="41.4" cy="36.8" r="2.6" />
    </svg>
  );
}
