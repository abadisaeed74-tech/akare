/**
 * Backend uses naive UTC datetimes; JSON often serializes without "Z".
 * `Date.parse("2026-01-01T12:00:00")` is treated as *local* in browsers → ~3h skew vs Riyadh.
 */
export function parseBackendUtcMs(iso: string | undefined | null): number {
  if (iso == null) return NaN;
  let s = String(iso).trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) {
    s = s.replace(' ', 'T');
  }
  if (/Z|[+-]\d{2}:?\d{2}$/.test(s)) {
    return Date.parse(s);
  }
  return Date.parse(`${s}Z`);
}

/** Latest instant among API date strings (UTC-naive safe). */
export function maxUtcIso(...candidates: (string | undefined | null)[]): string {
  let best = '';
  let bestMs = -Infinity;
  for (const c of candidates) {
    if (c == null || String(c).trim() === '') continue;
    const raw = String(c).trim();
    const ms = parseBackendUtcMs(raw);
    if (!Number.isFinite(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = raw;
    }
  }
  return best;
}

/** Short Arabic relative time for activity columns. */
export function formatRelativeActivityAr(iso: string | undefined | null): string {
  const ms = parseBackendUtcMs(iso);
  if (!Number.isFinite(ms)) return '—';
  let diffMs = Date.now() - ms;
  if (diffMs < 0) diffMs = 0;

  const mins = Math.floor(diffMs / (1000 * 60));
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} دقيقة`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `منذ ${days} يوم`;

  const months = Math.floor(days / 30);
  if (months < 12) return `منذ ${months} شهراً`;

  const years = Math.floor(days / 365);
  return `منذ ${years} سنة`;
}
