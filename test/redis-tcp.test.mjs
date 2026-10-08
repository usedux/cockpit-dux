// Conexão TCP com um Redis de verdade (o que a Vercel injeta como REDIS_URL). Roda só se houver redis-server na máquina.
import test from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

const has = spawnSync("redis-server", ["--version"]).status === 0;

test("store fala com Redis via REDIS_URL (TCP): coleções, contadores, travas e hashes", { skip: !has && "redis-server não instalado" }, async () => {
  const port = 16400 + Math.floor(Math.random() * 500);
  const srv = spawn("redis-server", ["--port", String(port), "--save", "", "--appendonly", "no"], { stdio: "ignore" });
  try {
    await new Promise((r) => setTimeout(r, 600));
    delete process.env.KV_REST_API_URL; delete process.env.UPSTASH_REDIS_REST_URL;
    process.env.REDIS_URL = `redis://127.0.0.1:${port}`;
    const { store, col, storageStatus, usingMemory } = await import("../lib/store.js");
    assert.equal(usingMemory(), false);
    assert.equal(storageStatus().kind, "redis-tcp");
    await col.set("reports", "a", { nome: "Ferramenta A", n: 1 });
    await col.set("reports", "b", { nome: "Ferramenta B" });
    assert.equal(await col.version("reports"), 2);
    const list = await col.list("reports");
    assert.deepEqual(list.map((x) => x.id).sort(), ["a", "b"]);
    assert.equal((await col.get("reports", "a")).nome, "Ferramenta A");
    await col.del("reports", "b");
    assert.equal((await col.list("reports")).length, 1);
    assert.equal(await store.lock("trava", 30), true);
    assert.equal(await store.lock("trava", 30), false);
    await store.set("k", "v"); assert.equal(await store.get("k"), "v");
    assert.equal(await store.get("nao-existe"), null);
    await store.hset("live", { x: "1", y: "2" });
    assert.deepEqual(await store.hgetall("live"), { x: "1", y: "2" });
    assert.equal(await store.hget("live", "y"), "2");
    assert.deepEqual(await store.hgetall("vazio"), {});
  } finally {
    delete process.env.REDIS_URL;
    srv.kill();
    setTimeout(() => process.exit(0), 200).unref();
  }
});
