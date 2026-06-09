type LogoProps = {
  size?: number;
  className?: string;
};

/**
 * Full House brand mark — the same artwork as app/icon.svg, inlined so it
 * renders crisply at any size with no extra network request. Self-contained
 * (no shared <defs> ids) so multiple instances on one page never collide.
 */
export function Logo({ size = 28, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Full House logo"
      className={className}
    >
      {/* Background */}
      <rect width="512" height="512" rx="112" fill="#111827" />
      {/* Back card (muted spade), rotated behind */}
      <g transform="rotate(-14 256 300)">
        <rect x="150" y="150" width="180" height="252" rx="22" fill="#e5e7eb" />
        <path
          d="M240 214c-22 24-44 40-44 64a22 22 0 0 0 35 18c-3 12-9 20-19 26h56c-10-6-16-14-19-26a22 22 0 0 0 35-18c0-24-22-40-44-64z"
          fill="#9ca3af"
        />
      </g>
      {/* Front card (clover/club), rotated in front */}
      <g transform="rotate(11 256 300)">
        <rect x="182" y="132" width="184" height="258" rx="22" fill="#ffffff" />
        {/* Club / clover */}
        <g fill="#111827">
          <circle cx="274" cy="206" r="30" />
          <circle cx="240" cy="246" r="30" />
          <circle cx="308" cy="246" r="30" />
          <path d="M274 250c-4 30-12 46-24 64h48c-12-18-20-34-24-64z" />
        </g>
        {/* Corner indices (rounded "FH") */}
        <g
          fill="none"
          stroke="#111827"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g transform="translate(202 150) scale(0.85)">
            <path d="M3 3 V29" />
            <path d="M3 3 H19" />
            <path d="M3 16 H15" />
            <path d="M31 3 V29" />
            <path d="M49 3 V29" />
            <path d="M31 16 H49" />
          </g>
          <g transform="translate(346 372) scale(0.85) rotate(180)">
            <path d="M3 3 V29" />
            <path d="M3 3 H19" />
            <path d="M3 16 H15" />
            <path d="M31 3 V29" />
            <path d="M49 3 V29" />
            <path d="M31 16 H49" />
          </g>
        </g>
      </g>
    </svg>
  );
}
