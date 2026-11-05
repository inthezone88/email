export const money = (n: number) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
export const pct = (n: number | null | undefined, d = 1) =>
  n !== null && n !== undefined && isFinite(n) ? (n * 100).toFixed(d) + "%" : "—";
export const n0 = (n: number) => n.toLocaleString("en-US");
export const dash = (v: number | null | undefined, f: (n: number) => string) =>
  v === null || v === undefined || !isFinite(v) ? "—" : f(v);

export function relTime(iso: string | null | undefined): string {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}
