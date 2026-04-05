export function formatMoneySyp(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0 ل.س';
  return `${Math.round(n).toLocaleString('ar-SY')} ل.س`;
}

export function formatArea(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '-';
  return `${Math.round(n).toLocaleString('ar-SY')} م²`;
}

export function formatPct(value: unknown, digits = 1): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(digits)}%`;
}
