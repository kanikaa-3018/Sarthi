type Props = {
  className?: string;
};

export function SarthiMark({ className = "" }: Props) {
  return (
    <svg className={`sarthi-mark ${className}`.trim()} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect className="sarthi-mark-bg" x="4" y="4" width="56" height="56" rx="16" />
      <path
        className="sarthi-mark-shield"
        d="M32 13.5 46 19v12.2c0 9.4-5.8 16.3-14 19.3-8.2-3-14-9.9-14-19.3V19l14-5.5Z"
      />
      <path
        className="sarthi-mark-route"
        d="M39.5 23.5c-2.8-3.2-12.6-3.1-14.2.7-1.5 3.6 2.6 5.4 7.3 6.1 5 .8 8.5 2.6 6.7 6.5-1.9 4.1-11.4 4.3-15.1.7"
      />
      <circle className="sarthi-mark-node start" cx="25.7" cy="24.1" r="3.1" />
      <circle className="sarthi-mark-node end" cx="38.8" cy="37.1" r="3.1" />
      <path className="sarthi-mark-check" d="M25.5 43.1 30 47.3 40.5 34.8" />
    </svg>
  );
}
