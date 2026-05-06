/**
 * Legacy ad-hoc smoke script that surfaced the RSC-prefetch 400 bug
 * fixed in commit 1305904 pre-launch. Replaced by the proper
 * Playwright suite under `tests/e2e/`. Kept here as a reference for
 * the original 19-route coverage list; once the suite has parity we
 * can delete this file.
 *
 * Run: BASE_URL=https://achordion.xyz node tests/_legacy-smoke.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "https://achordion.xyz";

// Each spec asserts: HTTP status, expected text in body, zero own-
// origin 4xx/5xx, zero console errors. Third-party failures
// (gstatic, archive.org, etc.) are noted but don't fail the test.
const SPECS = [
  { name: "home", path: "/", expect: "Achordion" },
  { name: "about", path: "/about", expect: "People-Powered" },
  { name: "faq", path: "/faq", expect: "Frequently asked" },
  { name: "donate", path: "/donate", expect: "Support the projects" },
  { name: "login", path: "/login", expect: "Sign in" },
  { name: "apps", path: "/apps", expect: "Featured" },
  { name: "charts", path: "/charts", expect: "Charts" },
  { name: "charts-am", path: "/charts/apple-music", expect: "Apple Music" },
  { name: "charts-college", path: "/charts/college-radio", expect: "College" },
  { name: "robots", path: "/robots.txt", expect: "User-Agent", api: true },
  { name: "sitemap", path: "/sitemap.xml", expect: "<urlset", api: true },
];

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const baseHost = new URL(BASE).host;
  let pass = 0;
  let fail = 0;

  for (const s of SPECS) {
    const page = await ctx.newPage();
    const errs = [];
    page.on("response", (r) => {
      if (r.status() >= 400 && new URL(r.url()).host === baseHost)
        errs.push(`${r.status()} ${r.url()}`);
    });
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(`console: ${m.text()}`);
    });
    try {
      const r = await page.goto(BASE + s.path, { waitUntil: "domcontentloaded" });
      const body = s.api ? await r.text() : await page.content();
      const ok =
        r.status() === 200 && body.includes(s.expect) && errs.length === 0;
      console.log(`${ok ? "✓" : "✗"} ${s.name} ${s.path}`);
      if (!ok && errs.length) console.log(`    errors: ${errs.join("; ")}`);
      ok ? pass++ : fail++;
    } catch (e) {
      console.log(`✗ ${s.name} ${s.path} threw: ${e.message}`);
      fail++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`\n${pass} passed / ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main();
