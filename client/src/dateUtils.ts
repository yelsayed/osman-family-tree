/**
 * Helpers for working with ISO date strings (YYYY-MM-DD) used in FamilyNode.
 * Robust to legacy data where born/died could be a 4-digit year (number or string).
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_RE = /^\d{4}$/;

/** Parse a date-ish value into { y, m, d } or null. m and d may be undefined for year-only data. */
export function parseDateish(value: unknown): { y: number; m?: number; d?: number } | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { y: value };
  }
  if (typeof value === 'string') {
    const iso = value.match(ISO_RE);
    if (iso) return { y: +iso[1], m: +iso[2], d: +iso[3] };
    if (YEAR_RE.test(value)) return { y: +value };
  }
  return null;
}

/** Extract just the year from a date-ish value. */
export function yearOf(value: unknown): number | null {
  const p = parseDateish(value);
  return p ? p.y : null;
}

/** Coerce any date-ish value into the canonical YYYY-MM-DD string (or empty). */
export function toIsoDate(value: unknown): string {
  const p = parseDateish(value);
  if (!p) return '';
  const m = p.m ?? 1;
  const d = p.d ?? 1;
  return `${String(p.y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Format for compact display under node name: "1965" or "1965-03-15 – 2010-08-22". */
export function formatRange(born: unknown, died: unknown): string | null {
  const b = parseDateish(born);
  const dz = parseDateish(died);
  const part = (p: { y: number; m?: number; d?: number } | null): string | null => {
    if (!p) return null;
    if (p.m == null) return String(p.y);
    return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d ?? 1).padStart(2, '0')}`;
  };
  const bs = part(b);
  const ds = part(dz);
  if (!bs && !ds) return null;
  if (bs && ds) return `${bs} – ${ds}`;
  return bs ?? ds;
}

/** Calculate age in whole years. Uses current date if died is null. */
export function ageYears(born: unknown, died: unknown): number | null {
  const b = parseDateish(born);
  if (!b) return null;
  const dz = parseDateish(died);
  if (dz) {
    let age = dz.y - b.y;
    if (b.m != null && dz.m != null) {
      if (dz.m < b.m || (dz.m === b.m && (dz.d ?? 1) < (b.d ?? 1))) age--;
    }
    return age;
  }
  const now = new Date();
  let age = now.getFullYear() - b.y;
  if (b.m != null) {
    const cm = now.getMonth() + 1;
    const cd = now.getDate();
    if (cm < b.m || (cm === b.m && cd < (b.d ?? 1))) age--;
  }
  return age;
}

/** Heuristic for the deceased styling: dead, or born before 1950. */
export function isDeceased(born: unknown, died: unknown): boolean {
  if (parseDateish(died)) return true;
  const b = parseDateish(born);
  return b != null && b.y < 1950;
}
