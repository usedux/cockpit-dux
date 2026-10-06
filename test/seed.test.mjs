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
