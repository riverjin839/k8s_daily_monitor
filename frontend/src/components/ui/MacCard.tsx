/**
 * macOS-style window card with traffic-light dots.
 * Matches the weather-app reference design:
 *  - Light gray background  →  near-white card  →  subtle shadow
 *  - Red / Yellow / Green dots at top-left
 *  - Centered uppercase section title
 *  - Thin divider between header and body
 */
import type { ReactNode } from 'react';

interface MacCardProps {
  /** Section title shown centred in the card header (uppercase) */
  title?: string;
  children: ReactNode;
  /** Extra Tailwind classes applied to the body wrapper */
  className?: string;
  /** Extra Tailwind classes applied to the root element */
  rootClassName?: string;
  /** Padding applied to the body area (default p-5) */
  bodyPadding?: string;
}

export function MacCard({
  title,
  children,
  className = '',
  rootClassName = '',
  bodyPadding = 'p-5',
}: MacCardProps) {
  return (
    <div
      className={`bg-card rounded-2xl border border-border overflow-hidden mac-shadow ${rootClassName}`}
    >
      {/* ── Traffic-light header ─────────────────────────────────────── */}
      <div className="flex items-center px-4 py-3 gap-2">
        {/* Dots */}
        <div className="flex items-center gap-[6px] flex-shrink-0">
          <span
            className="w-[13px] h-[13px] rounded-full"
            style={{ background: 'var(--mac-red)' }}
          />
          <span
            className="w-[13px] h-[13px] rounded-full"
            style={{ background: 'var(--mac-yellow)' }}
          />
          <span
            className="w-[13px] h-[13px] rounded-full"
            style={{ background: 'var(--mac-green)' }}
          />
        </div>
        {/* Centred title — offset by dot width so it appears truly centred */}
        {title && (
          <span className="flex-1 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground select-none pr-8">
            {title}
          </span>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────────────── */}
      <div className="h-px bg-border/60" />

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className={`${bodyPadding} ${className}`}>{children}</div>
    </div>
  );
}
