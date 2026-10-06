// Armazenamento: Upstash Redis (via REST — sem dependências) ou memória, só para testes locais.
// Na Vercel: Marketplace → Upstash Redis injeta KV_REST_API_URL / KV_REST_API_TOKEN automaticamente.

const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_ = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export const usingMemory = () => !URL_();

const mem = { kv: new Map(), hash: new Map(), exp: new Map() };

function memAlive(key) {
  const e = mem.exp.get(key);
  if (e && e < Date.now()) { mem.kv.delete(key); mem.hash.delete(key); mem.exp.delete(key); return false; }
  return true;
}

async function rest(cmds) {
  const res = await fetch(`${URL_()}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN_()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
  const out = await res.json();
  return out.map((o) => { if (o.error) throw new Error(`Redis: ${o.error}`); return o.result; });
}
const one = async (...cmd) => (await rest([cmd]))[0];

export const store = {
  async get(key) {
    if (usingMemory()) { memAlive(key); const v = mem.kv.get(key); return v === undefined ? null : v; }
    return one("GET", key);
  },
  async set(key, val) {
    if (usingMemory()) { mem.kv.set(key, String(val)); return "OK"; }
    return one("SET", key, String(val));
  },
  // SET NX EX — usado como trava (retorna true se conseguiu)
  async lock(key, seconds) {
    if (usingMemory()) { if (memAlive(key) && mem.kv.has(key)) return false; mem.kv.set(key, "1"); mem.exp.set(key, Date.now() + seconds * 1000); return true; }
    return (await one("SET", key, "1", "NX", "EX", String(seconds))) === "OK";
  },
  async del(key) {
    if (usingMemory()) { mem.kv.delete(key); mem.hash.delete(key); return 1; }
    return one("DEL", key);
  },
  async incr(key) {
    if (usingMemory()) { const n = Number(mem.kv.get(key) || 0) + 1; mem.kv.set(key, String(n)); return n; }
    return one("INCR", key);
  },
  async hget(key, field) {
    if (usingMemory()) { const h = mem.hash.get(key); return h && h.has(field) ? h.get(field) : null; }
    return one("HGET", key, field);
  },
  async hset(key, obj) {
    const entries = Object.entries(obj);
    if (!entries.length) return 0;
    if (usingMemory()) { const h = mem.hash.get(key) || new Map(); for (const [f, v] of entries) h.set(f, String(v)); mem.hash.set(key, h); return entries.length; }
    return one("HSET", key, ...entries.flatMap(([f, v]) => [f, String(v)]));
  },
  async hdel(key, ...fields) {
    if (!fields.length) return 0;
    if (usingMemory()) { const h = mem.hash.get(key); let n = 0; if (h) for (const f of fields) if (h.delete(f)) n++; return n; }
    return one("HDEL", key, ...fields);
  },
  async hgetall(key) {
    if (usingMemory()) { const h = mem.hash.get(key); return h ? Object.fromEntries(h) : {}; }
    const flat = (await one("HGETALL", key)) || [];
    const out = {};
    for (let i = 0; i < flat.length; i += 2) out[flat[i]] = flat[i + 1];
    return out;
  },
  _reset() { mem.kv.clear(); mem.hash.clear(); mem.exp.clear(); },
};

// ----- Coleções (documentos JSON em hashes) -----
export const col = {
  async list(name) {
    const raw = await store.hgetall(`col:${name}`);
    return Object.entries(raw).map(([id, v]) => ({ id, data: JSON.parse(v) }));
  },
  async get(name, id) {
    const v = await store.hget(`col:${name}`, id);
    return v ? JSON.parse(v) : null;
  },
  async set(name, id, data) {
    await store.hset(`col:${name}`, { [id]: JSON.stringify(data) });
    return store.incr(`ver:${name}`);
  },
  async del(name, id) {
    await store.hdel(`col:${name}`, id);
    return store.incr(`ver:${name}`);
  },
  async version(name) { return Number((await store.get(`ver:${name}`)) || 0); },
};
