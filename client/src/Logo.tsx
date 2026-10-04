// A generic HR-operations mark - no real company name or logo anywhere
// in this public repo (same reasoning as CLAUDE.md's "the Company" and
// the redacted policy PDFs). A simple rounded badge with a people glyph,
// in a neutral orange/coral palette echoing the reference layout's look
// without reproducing its actual branding.

export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="HR Chat Agent"
    >
      <rect width="40" height="40" rx="10" fill="url(#logo-gradient)" />
      {/* two overlapping people - a generic "people ops" glyph */}
      <circle cx="16" cy="16" r="5" fill="white" fillOpacity="0.95" />
      <path
        d="M7 30c0-5 4-8 9-8s9 3 9 8"
        stroke="white"
        strokeOpacity="0.95"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="26" cy="14" r="4" fill="white" fillOpacity="0.6" />
      <path
        d="M20 27c.6-3.6 3.4-6 7-6s6.4 2.4 7 6"
        stroke="white"
        strokeOpacity="0.6"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="40" y2="40">
          <stop offset="0" stopColor="#f5811f" />
          <stop offset="1" stopColor="#e8505b" />
        </linearGradient>
      </defs>
    </svg>
  );
}
