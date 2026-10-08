// Anexos (prints/vídeos dos reports). Produção: Vercel Blob. Local/testes: guardado no próprio store.
import crypto from "node:crypto";
import { store } from "./store.js";

export const MAX_UPLOAD = 4 * 1024 * 1024; // limite do corpo de uma função da Vercel é ~4,5 MB
const ALLOWED = /^(image\/(png|jpe?g|gif|webp)|video\/(mp4|webm|quicktime)|application\/pdf)$/;

export function assertAllowedType(type) {
  if (!ALLOWED.test(type || "")) throw Object.assign(new Error("Tipo de arquivo não permitido (use imagem, vídeo curto ou PDF)."), { status: 415 });
}


// Grava no Vercel Blob. Tenta "public"; se o store foi criado como privado, grava como "private"
// (e o arquivo é entregue pelo próprio cockpit, atrás do login — veja api/blob.js).
async function blobPut(pathname, buf, type, meta) {
  const { put } = await import("@vercel/blob");
  const opts = { contentType: type, addRandomSuffix: true };
  let out;
  try { out = await put(pathname, buf, { ...opts, access: "public" }); meta.access = "public"; }
  catch (e) {
    if (!/private/i.test(String((e && e.message) || e))) throw e;
    out = await put(pathname, buf, { ...opts, access: "private" }); meta.access = "private";
  }
  meta.url = out.url;
  meta.pathname = out.pathname;
}

export async function putAsset({ buf, name = "arquivo", type, by }) {
  assertAllowedType(type);
  if (buf.length > MAX_UPLOAD) throw Object.assign(new Error("Arquivo acima de 4 MB — cole o link (Loom, Drive…) em vez de anexar."), { status: 413 });
  const id = crypto.randomBytes(16).toString("hex");
  const meta = { name: String(name).slice(0, 120), type, size: buf.length, by: by || null, at: new Date().toISOString() };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const safe = meta.name.replace(/[^\w.\-]+/g, "_");
    await blobPut(`cockpit/${id}-${safe}`, buf, type, meta);
  } else if (process.env.VERCEL) {
    throw Object.assign(new Error("Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN)."), { status: 500 });
  } else {
    meta.b64 = buf.toString("base64"); // somente desenvolvimento local
  }
  await store.hset("assets", { [id]: JSON.stringify(meta) });
  return { id, ...meta, b64: undefined };
}

export async function getAsset(id) {
  if (!/^[0-9a-f]{32}$/.test(id || "")) return null;
  const raw = await store.hget("assets", id);
  return raw ? JSON.parse(raw) : null;
}

// Usado só pelo seed: grava um anexo preservando o id antigo (os reports apontam para ele).
export async function putAssetWithId(id, { buf, name, type, by = null }) {
  assertAllowedType(type);
  const meta = { name: String(name || id).slice(0, 120), type, size: buf.length, by, at: new Date().toISOString() };
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    await blobPut(`cockpit/${id}-${meta.name.replace(/[^\w.\-]+/g, "_")}`, buf, type, meta);
  } else if (process.env.VERCEL) {
    throw Object.assign(new Error("Vercel Blob não configurado (BLOB_READ_WRITE_TOKEN)."), { status: 500 });
  } else {
    meta.b64 = buf.toString("base64");
  }
  await store.hset("assets", { [id]: JSON.stringify(meta) });
  return { id, ...meta, b64: undefined };
}
