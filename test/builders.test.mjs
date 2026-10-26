import test from "node:test";
import assert from "node:assert/strict";
import { buildMilestonesBlock, buildNextMilestones, buildBlockers, buildAreas, buildTypes, buildDistro, buildUpdate, buildProjectBlocks, mdToHtml, milestoneState, shortName, scopedIssues } from "../lib/builders.js";
import { BLOCKERS } from "../lib/config.js";
import * as F from "./fixtures.mjs";

test("shortName usa o mapa e cai no primeiro nome", () => {
  assert.equal(shortName("Lucas Albino DUX"), "Lucas A.");
  assert.equal(shortName("Guilherme Zaidan"), "Zaidan");
  assert.equal(shortName("Maria Souza"), "Maria");
  assert.equal(shortName(null), null);
});

test("métricas só consideram tasks de milestones", () => {
  const scope = scopedIssues(F.sacado.issues, F.sacado.milestones);
  assert.ok(scope.length > 0 && scope.length < F.sacado.issues.length);
  const total = (html) => [...html.matchAll(/·\s*(\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  assert.equal(total(buildAreas(F.sacado.issues, F.sacado.milestones)), scope.length);
  assert.equal(total(buildTypes(F.sacado.issues, F.sacado.milestones)), scope.length);
  assert.equal(total(buildDistro(F.sacado.issues, F.sacado.milestones).legend), scope.length);
});

test("milestone sem task em execução nem entrega é 'próximo' e sai do bloco principal", () => {
  const ms = [{ id: "m1", name: "Próximo", progress: 0 }];
  const issues = [{ id: "DUX-1", title: "a", status: "Backlog", labels: [], milestoneId: "m1" }];
  assert.equal(milestoneState(ms[0], issues).next, true);
  assert.match(buildMilestonesBlock(issues, ms), /Nenhum milestone em execução/i);
  assert.match(buildNextMilestones(issues, ms), /Próximo/);
  issues[0].status = "In Progress";
  assert.equal(milestoneState(ms[0], issues).next, false);
  assert.doesNotMatch(buildNextMilestones(issues, ms), /Próximo/);
});

test("blocker só aparece com a task aberta e dentro de milestone", () => {
  const ms = [{ id: "m1", name: "M", progress: 10 }];
  const bl = [{ tag: "interno", issue: "DUX-1", text: "Decisão pendente" }];
  const mk = (status, milestoneId) => [{ id: "DUX-1", title: "t", status, labels: [], milestoneId }];
  assert.match(buildBlockers(mk("In Progress", "m1"), ms, bl).html, /Decisão pendente/);
  assert.doesNotMatch(buildBlockers(mk("Done / In Prod", "m1"), ms, bl).html, /Decisão pendente/);
  assert.doesNotMatch(buildBlockers(mk("In Progress", null), ms, bl).html, /Decisão pendente/);
  assert.equal(buildBlockers([], ms, bl).warnings.length, 1);
});

test("fixtures reais: Decentral esconde DUX-510 (concluída) e DUX-511 (não encontrada)", () => {
  const r = buildBlockers(F.decentral.issues, F.decentral.milestones, BLOCKERS.decentral);
  assert.ok(r.warnings.some((w) => w.startsWith("DUX-510")));
  assert.ok(r.warnings.some((w) => w.startsWith("DUX-511")));
});

test("painel do milestone: macro em cima, execução/teste abertos, faltam entregar e produção recolhidos", () => {
  const html = buildMilestonesBlock(F.sacado.issues, F.sacado.milestones);
  const panel = html.slice(html.indexOf('<div class="ms">'));
  const order = ['class="ms-top"', 'class="ms-bar"', 'class="ms-meta"', 'class="ms-metrics"', 'class="ms-hot"', 'class="ms-cold"'].map((k) => panel.indexOf(k));
  assert.ok(order.every((n) => n > -1) && order.every((n, i) => i === 0 || n > order[i - 1]), "ordem: topo → metas → métricas → em destaque → recolhidos");
  // "execução/revisão" e "teste" ficam abertos; "faltam entregar" e "produção" são <details> fechados
  assert.match(panel, /class="ms-hot">.*class="col progress".*class="col qa"/s);
  assert.match(panel, /<details class="cold done">/);
  assert.doesNotMatch(panel, /<details class="cold[^"]*" open/);
  assert.doesNotMatch(panel, /ms-board/);
  // contadores da barra de status somam as tasks do milestone
  const m = F.sacado.milestones.find((x) => milestoneState(x, F.sacado.issues).tasks.length);
  const tasks = milestoneState(m, F.sacado.issues).tasks;
  const strip = buildMilestonesBlock(F.sacado.issues, [m]);
  const sum = [...strip.matchAll(/<span class="ms-stat"><i[^>]*><\/i><b>(\d+)<\/b>/g)].reduce((a, x) => a + Number(x[1]), 0);
  assert.equal(sum, tasks.length);
  const areas = [...strip.matchAll(/class="chip [a-z]+"[^>]*>[^<]*· (\d+)</g)].reduce((a, x) => a + Number(x[1]), 0);
  assert.equal(areas, tasks.length);
});

test("última atualização do projeto: texto seguro, título, saúde e link; sem atualização mostra aviso", () => {
  assert.match(buildUpdate(null), /Nenhuma atualização/);
  const html = buildUpdate({
    body: "**Update 26/Outubro**\n\n* item <img src=x onerror=alert(1)>\n  * sub com [link](https://linear.app/x?a=1&b=2) e [ruim](javascript:alert(1))\n* **negrito**",
    health: "atRisk", createdAt: "2026-10-26T13:28:51.721Z", url: "https://linear.app/p/activity#u", author: "Lucas Henning",
  });
  assert.match(html, /<span class="upd-title">Update 26\/Outubro<\/span>/);
  assert.match(html, /upd-health risk">Em risco/);
  assert.match(html, /<time datetime="2026-10-26T13:28:51.721Z">26\/10<\/time> · Lucas H\./);
  assert.doesNotMatch(html, /<img|onerror=alert\(1\)>|href="javascript/);
  assert.match(html, /<ul><li>item .*<ul><li>sub com <a href="https:\/\/linear\.app\/x\?a=1&amp;b=2" target="_blank" rel="noopener">link<\/a>/s);
  assert.match(html, /<b>negrito<\/b>/);
  assert.match(html, /<a class="upd-link" href="https:\/\/linear\.app\/p\/activity#u"/);
  // sem título na primeira linha (começa em lista) → "Atualização de DD/MM"
  assert.match(buildUpdate({ body: "* a\n* b", createdAt: "2026-10-05T12:00:00Z" }), /Atualização de 05\/10/);
  assert.equal(mdToHtml(""), "");
});

test("buildProjectBlocks entrega milestones, blockers, próximos milestones e a última atualização", () => {
  const b = buildProjectBlocks({ issues: F.sacado.issues, milestones: F.sacado.milestones, blockers: [], update: { body: "Reunião\n* x", createdAt: "2026-10-05T12:00:00Z" } });
  assert.deepEqual(Object.keys(b).filter((k) => !k.startsWith("_")).sort(), ["blockers", "milestones", "next-milestones", "update"]);
  assert.match(b.update, /Reunião/);
});
