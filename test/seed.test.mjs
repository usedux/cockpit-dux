import test from "node:test";
import assert from "node:assert/strict";
import "./helpers.mjs";
import { store, col } from "../lib/store.js";
import { runSeed } from "../scripts/seed.mjs";
import { getAsset } from "../lib/assets.js";

test("seed importa tudo, preserva ids dos anexos e é idempotente", async () => {
  store._reset();
  const out = await runSeed({ log: () => {} });
  assert.deepEqual({ r: out.reports, i: out.innovations, u: out.upstream, a: out.assets, h: out.history }, { r: 15, i: 10, u: 3, a: 19, h: 2 });
  const reports = await col.list("reports");
  assert.equal(reports.length, 15);
  const withPrint = reports.find((r) => (r.data.prints || []).length);
  const asset = await getAsset(withPrint.data.prints[0].id);
  assert.ok(asset && asset.type === "image/png");
  const again = await runSeed({ log: () => {} });
  assert.equal(again.history, 0);
  assert.equal((await col.list("reports")).length, 15);
  assert.equal(JSON.parse(await store.get("history")).length, 2);
});

test("reimportar/atualizar o código NÃO perde nem sobrescreve nada: edições do admin e registros novos da equipe ficam", async () => {
  store._reset();
  await runSeed({ log: () => {} });
  const [first] = await col.list("reports");
  await col.set("reports", first.id, { ...first.data, descritivo: "TEXTO EDITADO PELO ADMIN", reportadoPor: "Fulana" });
  await col.set("reports", "r_novo_da_equipe", { nome: "Ferramenta nova", submittedById: "u_abc", submittedAt: "2026-10-08T10:00:00Z" });
  await col.set("innovations", "i_nova", { titulo: "Inovação nova", submittedById: "u_abc" });
  await col.del("innovations", Object.keys((await import("../lib/seed-data.js")).default.innovations)[0]); // admin apagou uma
  const again = await runSeed({ log: () => {} });
  assert.equal(again.reports, 0);
  assert.equal(again.kept.reports, 15);
  assert.equal((await col.get("reports", first.id)).descritivo, "TEXTO EDITADO PELO ADMIN");
  assert.equal((await col.get("reports", first.id)).reportadoPor, "Fulana");
  assert.equal((await col.get("reports", "r_novo_da_equipe")).nome, "Ferramenta nova");
  assert.equal((await col.get("innovations", "i_nova")).titulo, "Inovação nova");
  assert.equal(again.innovations, 1); // só a apagada volta (é o botão manual; o automático nunca roda com o banco já preenchido)
});
