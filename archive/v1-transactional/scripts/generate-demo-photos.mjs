// One-time population script — generates illustrative placeholder images
// for the demo listings (NOT real photos of real places — these are fake
// demo businesses, so pulling real stock/venue photography would be both
// a copyright risk and actively misleading). Each listing gets 3 venue-
// style illustrations + 1 "here's where your ad goes" mockup, all plain
// SVG rendered to data URIs — no external downloads, no native image
// dependencies, no upload pipeline needed.
//
// Run once against the live database:
//   node scripts/generate-demo-photos.mjs

import "dotenv/config";
import * as db from "../lib/db.js";

const PALETTES = {
  gym: { wall: "#EDEBE6", wallAlt: "#E3E0D8", grout: "#DAD6CC", accent: "#FF6B35", ink: "#1B2A3D" },
  cafe: { wall: "#E9DDD0", wallAlt: "#DECBB8", grout: "#C9A876", accent: "#FF6B35", ink: "#4A3428" },
  office: { wall: "#E8EEF6", wallAlt: "#DCE6F2", grout: "#B9CBE3", accent: "#2F5D9F", ink: "#1B2A3D" },
  residential: { wall: "#E4EDE4", wallAlt: "#D6E4D6", grout: "#B7CDB9", accent: "#3C6E47", ink: "#1B2A3D" },
};

function svgWrap(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
}

function toDataUri(svg) {
  return "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
}

// ---------------- category scene backgrounds ----------------
function gymScene(p, w, h) {
  let bricks = "";
  const rowH = h / 8;
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : w / 12;
    for (let x = -w / 6; x < w; x += w / 6) {
      bricks += `<rect x="${x + offset}" y="${row * rowH}" width="${w / 6 - 4}" height="${rowH - 4}" fill="${row % 2 === 0 ? p.wall : p.wallAlt}" />`;
    }
  }
  return svgWrap(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${p.grout}" />${bricks}
     <rect x="${w * 0.06}" y="${h * 0.72}" width="${w * 0.1}" height="${h * 0.05}" rx="4" fill="${p.ink}" />
     <circle cx="${w * 0.06}" cy="${h * 0.745}" r="${h * 0.05}" fill="${p.ink}" />
     <circle cx="${w * 0.16}" cy="${h * 0.745}" r="${h * 0.05}" fill="${p.ink}" />
     <rect x="0" y="${h * 0.92}" width="${w}" height="${h * 0.08}" fill="${p.ink}" opacity="0.15" />`
  );
}
function cafeScene(p, w, h) {
  return svgWrap(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${p.wall}" />
     <rect x="0" y="0" width="${w}" height="${h * 0.55}" fill="${p.wallAlt}" />
     <rect x="0" y="${h * 0.52}" width="${w}" height="${h * 0.04}" fill="${p.grout}" />
     <rect x="${w * 0.72}" y="${h * 0.62}" width="${w * 0.18}" height="${h * 0.28}" rx="6" fill="#fff" opacity="0.7" />
     <ellipse cx="${w * 0.14}" cy="${h * 0.8}" rx="${w * 0.07}" ry="${h * 0.05}" fill="${p.ink}" opacity="0.85" />
     <rect x="${w * 0.11}" y="${h * 0.68}" width="${w * 0.06}" height="${h * 0.12}" rx="10" fill="${p.ink}" opacity="0.85" />
     <path d="M ${w * 0.17} ${h * 0.68} q ${w * 0.04} 0 ${w * 0.03} ${h * 0.05} q -${w * 0.01} ${h * 0.04} -${w * 0.03} ${h * 0.03}" fill="none" stroke="${p.ink}" stroke-width="3" opacity="0.6" />`
  );
}
function officeScene(p, w, h) {
  let windows = "";
  for (let x = w * 0.05; x < w * 0.95; x += w * 0.12) {
    windows += `<rect x="${x}" y="${h * 0.08}" width="${w * 0.09}" height="${h * 0.35}" rx="2" fill="#fff" opacity="0.55" />`;
  }
  return svgWrap(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${p.wall}" />
     <rect x="0" y="0" width="${w}" height="${h * 0.5}" fill="${p.wallAlt}" />
     ${windows}
     <rect x="${w * 0.1}" y="${h * 0.68}" width="${w * 0.3}" height="${h * 0.05}" rx="3" fill="${p.ink}" opacity="0.8" />
     <rect x="${w * 0.16}" y="${h * 0.52}" width="${w * 0.1}" height="${h * 0.16}" rx="2" fill="${p.ink}" opacity="0.6" />`
  );
}
function residentialScene(p, w, h) {
  let pickets = "";
  for (let x = 0; x < w; x += w / 24) {
    pickets += `<rect x="${x}" y="${h * 0.35}" width="${w / 24 - 3}" height="${h * 0.5}" rx="2" fill="${p.wall}" />`;
  }
  return svgWrap(
    w,
    h,
    `<rect width="${w}" height="${h}" fill="${p.wallAlt}" />
     <rect x="0" y="${h * 0.7}" width="${w}" height="${h * 0.3}" fill="${p.grout}" opacity="0.5" />
     ${pickets}
     <rect x="0" y="${h * 0.32}" width="${w}" height="${h * 0.04}" fill="${p.ink}" opacity="0.4" />
     <rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.04}" fill="${p.ink}" opacity="0.4" />
     <path d="M ${w * 0.72} ${h * 0.15} L ${w * 0.85} ${h * 0.02} L ${w * 0.98} ${h * 0.15} Z" fill="${p.ink}" opacity="0.25" />`
  );
}

const SCENES = { gym: gymScene, cafe: cafeScene, office: officeScene, residential: residentialScene };

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function venuePhoto(category, variant, w = 800, h = 600) {
  const base = PALETTES[category] || PALETTES.gym;
  const p = variant === 1 ? base : { ...base, wall: shade(base.wall, variant === 2 ? -10 : 10), wallAlt: shade(base.wallAlt, variant === 2 ? -10 : 10) };
  const scene = (SCENES[category] || SCENES.gym)(p, w, h);
  return toDataUri(scene);
}

// The "here's where your ad goes" mockup — same wall scene, with a white
// dashed-border placeholder + Frontage wordmark warped... well, not warped
// here (that's the interactive corner-pin tool's job) — just a clean,
// straight-on placement, sized to the listing's real aspect ratio.
function adMockupPhoto(category, sizeW, sizeH, w = 800, h = 600) {
  const p = PALETTES[category] || PALETTES.gym;
  const sceneSvg = (SCENES[category] || SCENES.gym)(p, w, h);
  const sceneInner = sceneSvg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");

  const ratio = sizeW / sizeH;
  let panelW = w * 0.5;
  let panelH = panelW / ratio;
  if (panelH > h * 0.55) {
    panelH = h * 0.55;
    panelW = panelH * ratio;
  }
  const px = (w - panelW) / 2;
  const py = h * 0.32;

  return toDataUri(
    svgWrap(
      w,
      h,
      `${sceneInner}
       <rect x="${px}" y="${py}" width="${panelW}" height="${panelH}" fill="#ffffff" stroke="${p.ink}" stroke-width="3" stroke-dasharray="10 7" />
       <text x="${px + panelW / 2}" y="${py + panelH / 2 - 6}" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="${Math.max(14, panelH * 0.14)}" fill="${p.ink}">FRONTAGE</text>
       <text x="${px + panelW / 2}" y="${py + panelH / 2 + panelH * 0.13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="${Math.max(9, panelH * 0.06)}" fill="#8B9199">Your ad here</text>`
    )
  );
}

const TARGETS = [
  { id: "L-1001", category: "gym" },
  { id: "L-1002", category: "cafe" },
  { id: "L-1003", category: "office" },
  { id: "L-1004", category: "gym" },
  { id: "L-1005", category: "residential" },
  { id: "L-1009", category: "gym" },
  { id: "L-1010", category: "cafe" },
  { id: "L-1011", category: "office" },
  { id: "L-1012", category: "gym" },
  { id: "L-1013", category: "residential" },
];

async function main() {
  for (const t of TARGETS) {
    const listing = await db.getListingById(t.id);
    if (!listing) {
      console.log(`Skipping ${t.id} — not found.`);
      continue;
    }
    const photos = [
      venuePhoto(t.category, 1),
      venuePhoto(t.category, 2),
      venuePhoto(t.category, 3),
      adMockupPhoto(t.category, listing.sizeW, listing.sizeH),
    ];
    await db.updateListing(t.id, { photos });
    console.log(`Updated ${t.id} (${listing.title}) with 4 photos.`);
  }
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
