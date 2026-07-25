function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function clamp255(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Darkens (negative percent) or lightens (positive percent) a hex color. */
export function shade(hex: string, percent: number): string {
  const [r, g, b] = hexToRgb(hex);
  const amt = (percent / 100) * 255;
  const toHex = (c: number) => clamp255(c + amt).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** A translucent version of a hex color, for soft backgrounds/highlights over any theme. */
export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
