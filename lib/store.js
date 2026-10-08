// Armazenamento: Upstash Redis (via REST — sem dependências) ou memória, só para testes locais.
// Na Vercel: Marketplace → Upstash Redis injeta KV_REST_API_URL / KV_REST_API_TOKEN automaticamente.

// Aceita os nomes padrão e também os que a Vercel gera quando a integração é conectada com um prefixo
// (ex.: STORAGE_KV_REST_API_URL, UPSTASH_REDIS_REST_URL, MEU_PREFIXO_REDIS_REST_URL).
function pickEnv(exact, suffixes) {
  for (const k of exact) if (process.env[k]) return process.env[k];
  for (const [k, v] of Object.entries(process.env)) if (v && suffixes.some((x) => k.endsWith(x))) return v;
  return undefined;
}
const URL_ = () => pickEnv(["KV_REST_API_URL", "UPSTASH_REDIS_REST_URL"], ["_KV_REST_API_URL", "_REDIS_REST_URL"]);
const TOKEN_ = () => pickEnv(["KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN"], ["_KV_REST_API_TOKEN", "_REDIS_REST_TOKEN"]);

// Redis "de verdade" (TCP): é o que a Vercel injeta ao conectar um banco Redis pelo Marketplace (REDIS_URL, ou com prefixo).
// Tolera o valor colado com o comando inteiro ("redis-cli -u redis://..."), aspas ou espaços ao redor.
export function normalizeRedisUrl(raw) {
  if (!raw) return raw;
  const m = String(raw).match(/rediss?:\/\/[^\s"'`]+/i);
  return m ? m[0] : String(raw).trim().replace(/^["'`]+|["'`]+$/g, "");
}
const TCP_ = () => normalizeRedisUrl(pickEnv(["REDIS_URL"], ["_REDIS_URL"]));

export const usingMemory = () => !URL_() && !TCP_();

// Na Vercel cada função roda em instâncias separadas: guardar em memória "parece" funcionar numa chamada
// e some na outra (foi exatamente o que deixou as listas vazias). Em produção sem Redis, falha alto e claro.
export const STORAGE_HELP = "Banco de dados (Redis) não está conectado a este projeto da Vercel. Em Storage → conecte um banco Redis ao projeto (Production) — ou cadastre REDIS_URL em Settings → Environment Variables — e faça Redeploy.";
export function storageStatus() {
  if (!usingMemory()) return { kind: URL_() ? "redis-rest" : "redis-tcp", ok: true };
  if (process.env.VERCEL) return { kind: "memory", ok: false, error: STORAGE_HELP };
  return { kind: "memory", ok: true };
}
function guard() {
  if (usingMemory() && process.env.VERCEL) throw Object.assign(new Error(STORAGE_HELP), { status: 503 });
}

const mem = { kv: new Map(), hash: new Map(), exp: new Map() };

function memAlive(key) {
  const e = mem.exp.get(key);
  if (e && e < Date.now()) { mem.kv.delete(key); mem.hash.delete(key); mem.exp.delete(key); return false; }
  return true;
}

// Descreve o "formato" de uma URL sem revelar usuário/senha (para diagnóstico).
export function urlShape(u) {
  const v = String(u == null ? "" : u);
  const scheme = (v.match(/^[a-z]{3,6}:\/\//i) || [""])[0];
  const host = (v.match(/@([^@/?#\s:]+)(:(\d*))?[^@]*$/) || [])[1];
  const port = (v.match(/@[^@/?#\s:]+:(\d*)/) || [])[1];
  return [
    "comprimento=" + v.length,
    "início=" + (scheme || "(sem redis:// ou rediss://)"),
    "arrobas=" + (v.match(/@/g) || []).length,
    "espaços=" + (/\s/.test(v) ? "sim" : "não"),
    "aspas=" + (/["'`]/.test(v) ? "sim" : "não"),
    "host=" + (host ? host.replace(/^(.{4}).*(\..{3,})$/, "$1…$2") : "(não encontrado)"),
    "porta=" + (port || "(não encontrada)"),
  ].join(", ");
}

// Conexão TCP (node-redis), reaproveitada entre chamadas da mesma instância.
let tcp;
async function tcpClient() {
  if (!tcp) {
    tcp = (async () => {
      const { createClient } = await import("redis");
      const url = TCP_();
      try { new URL(url); } catch { throw Object.assign(new Error("REDIS_URL inválida. O formato é redis://usuario:senha@host:porta (ou rediss:// se o banco usa TLS) — só a URL, sem aspas e sem o comando redis-cli. Corrija em Settings → Environment Variables e faça Redeploy. Diagnóstico (sem segredos): " + urlShape(url)), { status: 503 }); }
      const c = createClient({ url, socket: { connectTimeout: 8000, reconnectStrategy: (n) => (n > 2 ? new Error("Redis indisponível") : 200 * n) } });
      c.on("error", () => {});
      try { await c.connect(); }
      catch (e) { throw Object.assign(new Error("Não foi possível conectar ao Redis (" + String((e && e.message) || e).replace(/\/\/[^@\s]*@/g, "//***@") + "). Confira host, porta, senha, TLS (rediss://) e a liberação de IPs no painel do Redis."), { status: 503 }); }
      return c;
    })();
    tcp.catch(() => { tcp = undefined; });
  }
  return tcp;
}
async function tcpRun(cmds) {
  const c = await tcpClient();
  const out = [];
  for (const cmd of cmds) out.push(await c.sendCommand(cmd.map(String)));
  return out;
}

async function rest(cmds) {
  if (!URL_() && TCP_()) return tcpRun(cmds);
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
    guard();
    if (usingMemory()) { memAlive(key); const v = mem.kv.get(key); return v === undefined ? null : v; }
    return one("GET", key);
  },
  async set(key, val) {
    guard();
    if (usingMemory()) { mem.kv.set(key, String(val)); return "OK"; }
    return one("SET", key, String(val));
  },
  // SET NX EX — usado como trava (retorna true se conseguiu)
  async lock(key, seconds) {
    guard();
    if (usingMemory()) { if (memAlive(key) && mem.kv.has(key)) return false; mem.kv.set(key, "1"); mem.exp.set(key, Date.now() + seconds * 1000); return true; }
    return (await one("SET", key, "1", "NX", "EX", String(seconds))) === "OK";
  },
  async del(key) {
    guard();
    if (usingMemory()) { mem.kv.delete(key); mem.hash.delete(key); return 1; }
    return one("DEL", key);
  },
  async incr(key) {
    guard();
    if (usingMemory()) { const n = Number(mem.kv.get(key) || 0) + 1; mem.kv.set(key, String(n)); return n; }
    return one("INCR", key);
  },
  async hget(key, field) {
    guard();
    if (usingMemory()) { const h = mem.hash.get(key); return h && h.has(field) ? h.get(field) : null; }
    return one("HGET", key, field);
  },
  async hset(key, obj) {
    guard();
    const entries = Object.entries(obj);
    if (!entries.length) return 0;
    if (usingMemory()) { const h = mem.hash.get(key) || new Map(); for (const [f, v] of entries) h.set(f, String(v)); mem.hash.set(key, h); return entries.length; }
    return one("HSET", key, ...entries.flatMap(([f, v]) => [f, String(v)]));
  },
  async hdel(key, ...fields) {
    guard();
    if (!fields.length) return 0;
    if (usingMemory()) { const h = mem.hash.get(key); let n = 0; if (h) for (const f of fields) if (h.delete(f)) n++; return n; }
    return one("HDEL", key, ...fields);
  },
  async hgetall(key) {
    guard();
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
