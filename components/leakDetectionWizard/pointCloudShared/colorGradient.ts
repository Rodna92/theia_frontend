function hexToRgb(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return [h, s, l];
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
}

function rgbToHex(r: number, g: number, b: number): number {
  const to255 = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return (to255(r) << 16) | (to255(g) << 8) | to255(b);
}

// Shades a target's base color across its ordered set of point clouds (e.g.
// 01_src_raw -> 04_final_pose_ref_aligned_camera) — lightest at index 0,
// darkest at the last index — so a target's clouds read as a family in the
// viewer while still being individually distinguishable, instead of
// rendering as identical dots.
export function targetCloudShade(baseColor: number, index: number, count: number): number {
  if (count <= 1) return baseColor;

  const [h, s, l] = rgbToHsl(...hexToRgb(baseColor));
  const minL = Math.max(0.3, l - 0.25);
  const maxL = Math.min(0.8, l + 0.25);
  const t = index / (count - 1);
  const shadedL = maxL - t * (maxL - minL);

  return rgbToHex(...hslToRgb(h, s, shadedL));
}
