// Plano de padronização (Admin): com os dados importados do Artifact, o ranking e as ondas aparecem corretamente.
// Uso: node test/e2e-plan.mjs [captura.png]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const env = await boot();
await runSeed({ log: () => {} });
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const [n, v] = cookie.split("=");
await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(env.base + "/", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#adminTabBtn:not([hidden])");
await page.click("#adminTabBtn");
await page.waitForFunction(() => document.querySelectorAll("#adminPlanBody .std-tier").length > 5, null, { timeout: 15000 });
const data = await page.evaluate(() => ({
  kpis: [...document.querySelectorAll("#adminPlanBody .std-kpi")].map((k) => k.querySelector(".n").textContent + " " + k.querySelector(".l").textContent),
  rows: [...document.querySelectorAll("#adminPlanBody tbody tr")].map((r) => [r.children[0].textContent, r.querySelector(".tool-name").childNodes[0].textContent, r.querySelector(".std-tier").textContent]),
  phases: [...document.querySelectorAll("#adminPlanBody .std-phase")].map((p) => p.querySelector("h4").textContent + ": " + [...p.querySelectorAll("li")].map((l) => l.textContent).join(", ")),
}));
console.log(JSON.stringify(data, null, 1));
assert.equal(data.rows.length, 15);
assert.ok(data.rows.slice(0, 4).every((r) => /P0/.test(r[2])), "as 4 primeiras (uso diário, local) são P0");
assert.ok(data.rows.some((r) => r[1] === "Notion" && /Terceiro/.test(r[2])), "Notion é terceiro");
assert.ok(data.rows.some((r) => r[1] === "MCP de Dados da DUX" && /No ambiente comum/.test(r[2])));
assert.ok(!data.rows.some((r) => /Gestão de cobranças/.test(r[1]) && !/P0/.test(r[2])));
const el = page.locator("#adminPlanBox");
await el.scrollIntoViewIfNeeded();
await el.screenshot({ path: process.argv[2] || "/tmp/plan.png" });
assert.deepEqual(errors, []);
await browser.close(); await env.close?.();
console.log("plano de padronização OK");
process.exit(0);
