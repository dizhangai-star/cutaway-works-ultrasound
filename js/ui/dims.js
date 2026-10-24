// Drafting marks on a 2D overlay (generic): dimension lines with arrowheads and extension lines, centre lines.
// Coordinates in overlay px; `s` = plate scale (fonts and offsets are in plate px).

export function dim(c, a, b, { off = 12, text, s = 1, color, font = 'IBM Plex Mono', side = 1, ext = true, bg }) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L * side, ny = dx / L * side, o = off * s;
  const A = [a[0] + nx * o, a[1] + ny * o], B = [b[0] + nx * o, b[1] + ny * o];
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 0.7 * s;
  if (ext) {
    c.beginPath();
    c.moveTo(a[0] + nx * 2 * s, a[1] + ny * 2 * s); c.lineTo(A[0] + nx * 3 * s, A[1] + ny * 3 * s);
    c.moveTo(b[0] + nx * 2 * s, b[1] + ny * 2 * s); c.lineTo(B[0] + nx * 3 * s, B[1] + ny * 3 * s);
    c.stroke();
  }
  c.beginPath(); c.moveTo(...A); c.lineTo(...B); c.stroke();
  const ux = dx / L, uy = dy / L, h = 5 * s, w = 1.8 * s;
  for (const [P, d] of [[A, 1], [B, -1]]) {
    c.beginPath(); c.moveTo(P[0], P[1]); c.lineTo(P[0] + ux * h * d + nx * w, P[1] + uy * h * d + ny * w); c.lineTo(P[0] + ux * h * d - nx * w, P[1] + uy * h * d - ny * w); c.fill();
  }
  if (text) {
    c.save(); c.translate((A[0] + B[0]) / 2 + nx * 5 * s, (A[1] + B[1]) / 2 + ny * 5 * s);
    let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI;
    c.rotate(ang); c.font = `500 ${9 * s}px "${font}", monospace`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const tw = c.measureText(text).width;
    if (bg) { c.fillStyle = bg; c.fillRect(-tw / 2 - 2 * s, -6 * s, tw + 4 * s, 12 * s); c.fillStyle = color; }
    c.fillText(text, 0, 0); c.restore();
  }
}

export function centre(c, a, b, { s = 1, color }) {
  c.save(); c.strokeStyle = color; c.lineWidth = 0.6 * s; c.setLineDash([10 * s, 2.5 * s, 2 * s, 2.5 * s]);
  c.beginPath(); c.moveTo(...a); c.lineTo(...b); c.stroke(); c.restore();
}

export function label(c, text, x, y, { s = 1, color, size = 8.5, weight = 600, align = 'left', family = '"Barlow Condensed", "Noto Sans SC", sans-serif' }) {
  c.font = `${weight} ${size * s}px ${family}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = 'alphabetic'; c.fillText(text, x, y);
}
