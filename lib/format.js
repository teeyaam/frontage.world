export function money(n) {
  const num = Number(n) || 0;
  return `$${num.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatMm(mm) {
  return mm >= 1000 ? `${(mm / 1000).toFixed(1)}m` : `${mm}mm`;
}

export function formatDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export function addMonthsIso(iso, months) {
  const d = new Date(iso);
  d.setMonth(d.getMonth() + months);
  return d.toISOString();
}

// Returns null when the lease hasn't started yet (the install hasn't
// happened, so the lease clock hasn't started — see booking.leaseStartDate).
export function leaseEndIso(startIso, termMonths) {
  if (!startIso) return null;
  return addMonthsIso(startIso, termMonths);
}

export function daysUntil(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function svgSpaceDiagram(sizeW, sizeH, { big = false } = {}) {
  const vbW = 300;
  const vbH = big ? 220 : 170;
  const maxW = vbW - 80;
  const maxH = vbH - 60;
  const ratio = sizeW / sizeH;
  let rectW = maxW;
  let rectH = rectW / ratio;
  if (rectH > maxH) {
    rectH = maxH;
    rectW = rectH * ratio;
  }
  const rectX = (vbW - rectW) / 2 + 10;
  const rectY = (vbH - rectH) / 2;
  return `<svg viewBox="0 0 ${vbW} ${vbH}" style="width:100%;height:100%">
    <rect x="${rectX}" y="${rectY}" width="${rectW}" height="${rectH}" fill="#FFFFFF" stroke="#FF6B35" stroke-width="2" stroke-dasharray="6 4" rx="2" />
    <g stroke="#1B2A3D" stroke-width="1">
      <line x1="${rectX}" y1="${rectY - 12}" x2="${rectX}" y2="${rectY - 18}" />
      <line x1="${rectX + rectW}" y1="${rectY - 12}" x2="${rectX + rectW}" y2="${rectY - 18}" />
      <line x1="${rectX}" y1="${rectY - 15}" x2="${rectX + rectW}" y2="${rectY - 15}" />
    </g>
    <text x="${rectX + rectW / 2}" y="${rectY - 20}" text-anchor="middle" font-size="${big ? 12 : 10}" font-family="'IBM Plex Mono', monospace" fill="#1B2A3D" font-weight="600">${formatMm(sizeW)}</text>
    <g stroke="#1B2A3D" stroke-width="1">
      <line x1="${rectX + rectW + 12}" y1="${rectY}" x2="${rectX + rectW + 18}" y2="${rectY}" />
      <line x1="${rectX + rectW + 12}" y1="${rectY + rectH}" x2="${rectX + rectW + 18}" y2="${rectY + rectH}" />
      <line x1="${rectX + rectW + 15}" y1="${rectY}" x2="${rectX + rectW + 15}" y2="${rectY + rectH}" />
    </g>
    <text x="${rectX + rectW + 22}" y="${rectY + rectH / 2}" text-anchor="start" font-size="${big ? 12 : 10}" font-family="'IBM Plex Mono', monospace" fill="#1B2A3D" font-weight="600" transform="rotate(90 ${rectX + rectW + 22} ${rectY + rectH / 2})">${formatMm(sizeH)}</text>
  </svg>`;
}

// Estimated printing + install + uninstall cost a contractor will charge for
// a space of this size. Shared by the booking-page cost-awareness panel and
// the job order created once a booking is signed, so the two numbers always
// agree until a contractor sends a real quote.
export function estimateJobFee(sizeW, sizeH) {
  const areaM2 = (sizeW * sizeH) / 1_000_000;
  return Math.round(300 + areaM2 * 40);
}

// Heuristic daily-impressions estimate, used only when a seller leaves the
// "estimated eyes" field blank on listing creation. Not a real measurement —
// just a reasonable-looking default derived from category and space size.
const EYES_BASE_BY_CATEGORY = { gym: 80, cafe: 300, office: 150, studio: 100, retail: 400, residential: 250 };
export function estimateEyes({ category, sizeW, sizeH }) {
  const base = EYES_BASE_BY_CATEGORY[category] || 150;
  const areaM2 = (sizeW * sizeH) / 1_000_000;
  const sizeMultiplier = Math.min(3, 1 + areaM2 / 6);
  return Math.round((base * sizeMultiplier) / 10) * 10;
}

// Semi-circular meter in the same inline-SVG / IBM Plex Mono style as
// svgSpaceDiagram, so it reads as part of the same design system.
export function svgEyesGauge(value, { big = false } = {}) {
  const size = big ? 120 : 76;
  const cx = size / 2;
  const cy = size / 2 + 6;
  const r = size / 2 - 10;
  const scaleMax = 1000;
  const pct = Math.max(0, Math.min(1, (Number(value) || 0) / scaleMax));
  const startAngle = Math.PI; // left
  const endAngle = Math.PI - pct * Math.PI; // sweeps toward right as pct grows
  const arcPoint = (angle) => `${cx + r * Math.cos(angle)},${cy - r * Math.sin(angle)}`;
  const bgPath = `M ${arcPoint(Math.PI)} A ${r} ${r} 0 0 1 ${arcPoint(0)}`;
  const fgPath = pct > 0 ? `M ${arcPoint(startAngle)} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${arcPoint(endAngle)}` : "";
  const label = value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${value}`;
  return `<svg viewBox="0 0 ${size} ${size - 14}" style="width:${size}px;height:${size - 14}px">
    <path d="${bgPath}" fill="none" stroke="#DAD6CC" stroke-width="6" stroke-linecap="round" />
    ${fgPath ? `<path d="${fgPath}" fill="none" stroke="#FF6B35" stroke-width="6" stroke-linecap="round" />` : ""}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="${big ? 15 : 12}" font-family="'IBM Plex Mono', monospace" fill="#1B2A3D" font-weight="600">${label}</text>
    <text x="${cx}" y="${cy + (big ? 12 : 10)}" text-anchor="middle" font-size="${big ? 9 : 7}" font-family="'IBM Plex Mono', monospace" fill="#8B9199">eyes/day est.</text>
  </svg>`;
}

export const STAGE_LABELS = {
  broadcast: "Awaiting a contractor",
  new: "Contractor assigned",
  site_confirmed: "Site confirmed",
  quote_sent: "Quote sent",
  quote_accepted: "Quote accepted",
  scheduled: "Install scheduled",
  installed: "Installed",
};
export const STAGES = ["broadcast", "new", "site_confirmed", "quote_sent", "quote_accepted", "scheduled", "installed"];
