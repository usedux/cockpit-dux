import test from "node:test";
import assert from "node:assert/strict";
import { buildMilestonesBlock, buildNextMilestones, buildBlockers, buildAreas, buildTypes, buildDistro, milestoneState, shortName, scopedIssues } from "../lib/builders.js";
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
