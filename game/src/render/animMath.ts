export const MOVE_DURATION_MS = 800;
export const WALL_RISE_MS = 250;
export const WALL_BREAK_MS = 300;
export const PLACE_DROP_MS = 300;
export const TURN_BANNER_MS = 900;
export const HOP_HEIGHT = 0.15;

const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

export function easeInOutCubic(t: number): number {
  t = clamp01(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
export function easeOutQuad(t: number): number { t = clamp01(t); return 1 - (1 - t) * (1 - t); }
export function easeOutBack(t: number): number {
  t = clamp01(t);
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/** points: セル座標の折れ線。t∈[0,1] → セル座標位置と跳ね高さ */
export function samplePath(points: { x: number; y: number }[], t: number): { x: number; y: number; hop: number } {
  const L = points.length - 1;
  const s = easeInOutCubic(t) * L;
  const i = Math.min(L - 1, Math.floor(s + 1e-9));
  const f = s - i;
  const a = points[i]!, b = points[i + 1]!;
  const frac = s - Math.floor(s + 1e-9);
  const hop = HOP_HEIGHT * Math.sin(Math.PI * (s >= L ? 0 : frac < 1e-9 ? 0 : frac));
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, hop: Math.abs(hop) < 1e-9 ? 0 : hop };
}
