// Sub-aba "Ferramentas do repositório": repositórios do GitHub x ferramentas reportadas (ao vivo).
// Uso: node test/e2e-repos.mjs [pasta-de-capturas]
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { boot } from "./helpers.mjs";
import { runSeed } from "../scripts/seed.mjs";

const { chromium } = createRequire(process.env.PW_MODULES || "/home/claude/.npm-global/lib/node_modules/")("playwright");
const out = process.argv[2] || "/tmp";
const env = await boot();
await runSeed({ log: () => {} });
const cookie = await env.cookieFor("lucashenning@wearedux.com", "Lucas Henning");
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || "/opt/pw-browsers/chromium" });
const [n, v] = cookie.split("=");
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light" });
await ctx.addCookies([{ name: n, value: decodeURIComponent(v), url: env.base }]);
await ctx.route((u) => !/^(127\.0\.0\.1|localhost)$/.test(u.hostname), (r) => r.abort());
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(env.base + "/#repositorio", { waitUntil: "domcontentloaded" });
await page.waitForSelector("#subpanel-repos:not([hidden]) .rp-kpis", { timeout: 15000 });
const kpis = await page.$$eval("#repoBody .rp-kpi", (els) => els.map((e) => [e.querySelector(".n").textContent, e.querySelector(".l").textContent]));
console.log(JSON.stringify(kpis));
assert.equal(kpis[0][0], "97");
const reported = await page.$$eval("#repoBody details:first-of-type tbody tr .rp-repo a", (a) => a.map((x) => x.textContent).sort());
assert.deepEqual(reported, ["anti-backoffice", "dux-data-core", "dux-data-mcp", "dux-map", "dux-tool-registry", "llm-router"]);
assert.equal(kpis[1][0], "6");
assert.equal(kpis[4][0], "9", "9 reports sem repositório na lista");
assert.equal(Number(kpis[2][0]) + Number(kpis[3][0]) + 6, 97);
const orphanRows = await page.$$eval("#repoBody table:last-of-type tbody tr", (r) => r.map((x) => x.textContent));
assert.ok(orphanRows.some((t) => /Gerador de Propostas e Contratos.*Sim, sem link/.test(t)));
assert.ok(orphanRows.some((t) => /Notion.*Não está no GitHub/.test(t)));
assert.match(await page.locator("#subtabCountRepos").textContent(), /97/);
await page.locator("#subpanel-repos").screenshot({ path: `${out}/repos-light.png` });
assert.deepEqual(errors, []);
await browser.close(); await env.close?.();
console.log("e2e-repos ok");
process.exit(0);
