// Smoke test against a running site — no login needed, changes nothing.
//
//   node scripts/smoke.mjs                          # http://localhost:3000
//   BASE_URL=https://frontage.world node scripts/smoke.mjs
//
// Staging behind SITE_PASSCODE: also set GATE_PASSCODE so the test can get in.

const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
let cookie = "";
let failures = 0;

function ok(cond, label, detail = "") {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function get(path, opts = {}) {
  const res = await fetch(BASE + path, { redirect: "manual", headers: { cookie, ...(opts.headers || {}) } });
  const text = opts.noBody ? "" : await res.text();
  return { status: res.status, headers: res.headers, text };
}

async function main() {
  console.log(`Smoke testing ${BASE}`);
  if (process.env.GATE_PASSCODE) {
    const r = await fetch(BASE + "/gate", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `passcode=${encodeURIComponent(process.env.GATE_PASSCODE)}` });
    cookie = (r.headers.get("set-cookie") || "").split(";")[0];
    ok(Boolean(cookie), "passed the passcode gate");
  }

  const health = await get("/healthz");
  ok(health.status === 200 && health.text.trim() === "ok", "/healthz is ok (database reachable)", `status ${health.status}`);

  const pages = ["/", "/about", "/how-it-works", "/pricing-guide", "/safety", "/terms", "/privacy", "/contact", "/sell/welcome", "/onboarding", "/forgot-password", "/robots.txt", "/sitemap.xml", "/style.css", "/client.js", "/favicon.svg", "/og-default.png"];
  for (const p of pages) {
    const r = await get(p, { noBody: /\.(png|svg)$/.test(p) });
    ok(r.status === 200, `GET ${p} → 200`, `got ${r.status}`);
    if (r.text && r.text.includes("password123")) ok(false, `${p} contains no demo password`);
  }

  const home = await get("/");
  ok(/<meta property="og:image"/.test(home.text), "home has social preview tags");
  ok(home.headers.get("x-content-type-options") === "nosniff", "security headers present");

  const retired = { "/book/L-1001": "/listing/L-1001", "/plan": "/account/messages", "/contractor/login": "/", "/terms/buyer": "/terms", "/investors": "/about" };
  for (const [from, to] of Object.entries(retired)) {
    const r = await get(from, { noBody: true });
    ok(r.status === 301 && r.headers.get("location") === to, `${from} → 301 ${to}`, `got ${r.status} ${r.headers.get("location") || ""}`);
  }

  const missing = await get("/listing/L-does-not-exist");
  ok(missing.status === 404, "unknown listing → 404", `got ${missing.status}`);

  const gated = await get("/account/messages", { noBody: true });
  ok(gated.status === 302 && String(gated.headers.get("location")).startsWith("/onboarding"), "inbox requires login");

  const evil = await get("/onboarding?next=https://evil.example");
  ok(!evil.text.includes('value="https://evil.example"'), "login ignores off-site ?next");

  const map = await get("/api/listings/map");
  let listings = [];
  try {
    listings = JSON.parse(map.text).listings;
  } catch {}
  ok(map.status === 200 && Array.isArray(listings), `map JSON ok (${listings.length} listings)`);
  if (listings[0]) {
    const l = await get(`/listing/${listings[0].id}`);
    ok(l.status === 200, `listing ${listings[0].id} → 200`);
    ok(/<meta property="og:image" content="https?:\/\//.test(l.text), "listing has an absolute og:image");
    const img = /<meta property="og:image" content="([^"]+)"/.exec(l.text);
    if (img) {
      const r = await fetch(img[1], { method: "HEAD" }).catch(() => null);
      ok(r && r.ok, "listing preview image loads", r ? `status ${r.status}` : "fetch failed");
    }
  }

  const csrf = await fetch(BASE + "/api/contact", { method: "POST", redirect: "manual", headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded", cookie }, body: "name=x&email=x@x.co&message=x" });
  ok(csrf.status === 403, "cross-site POST is blocked", `got ${csrf.status}`);

  console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
  process.exitCode = failures ? 1 : 0;
}

main().catch((err) => {
  console.error("Smoke test crashed:", err.message);
  process.exitCode = 1;
});
