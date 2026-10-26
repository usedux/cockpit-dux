// Gera app/index.html (e public/favicon.svg) a partir de src/cockpit.html — o mesmo HTML do Artifact do claude.ai,
// adaptado para rodar na Vercel: embrulha com <html>/<head>, liga o /shim.js (db/user/assets/downloads → /api/*),
// zera o histórico embutido (agora vem do servidor) e troca os textos que citavam o claude.ai.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Dados do deploy gravados no HTML na hora do build (a Vercel roda este script a cada deploy).
export function deployInfo(env = process.env) {
  let sha = env.VERCEL_GIT_COMMIT_SHA || "";
  let message = env.VERCEL_GIT_COMMIT_MESSAGE || "";
  if (!sha) { try { sha = execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* sem git */ } }
  if (!message && sha) { try { message = execSync("git log -1 --format=%s", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* sem git */ } }
  return { builtAt: new Date().toISOString(), sha: sha.slice(0, 7), message: String(message).split("\n")[0].slice(0, 140), env: env.VERCEL_ENV || (env.VERCEL ? "vercel" : "local") };
}

export function transform(fragment, { appUrl = "https://cockpit-dux.vercel.app", deploy = deployInfo() } = {}) {
  let s = fragment;
  const must = (label, re, repl) => {
    const before = s;
    s = s.replace(re, repl);
    if (s === before) throw new Error(`build-app: trecho não encontrado (${label}) — o HTML-fonte mudou? Ajuste scripts/build-app.mjs.`);
  };

  // <title> e <link rel=icon> vão para o <head>
  const title = (/<title>([\s\S]*?)<\/title>/.exec(s) || [])[1] || "Cockpit de Projetos DUX";
  s = s.replace(/<title>[\s\S]*?<\/title>\s*/, "");
  const icon = (/<link rel="icon"[^>]*>/.exec(s) || [""])[0];
  s = s.replace(/<link rel="icon"[^>]*>\s*/, "");

  // histórico semanal: o servidor injeta (api/page.js) e o shim atualiza
  must("weekHistoryData", /<script id="weekHistoryData" type="application\/json">[\s\S]*?<\/script>/, '<script id="weekHistoryData" type="application/json">[]</script>');

  // Product Library: na Vercel os links entram pela rota de SSO do Cockpit (/api/sso/product-library) em vez do artifact.
  // O hash do card (#dux-582) vai DENTRO do parâmetro next, codificado: /api/sso/product-library?next=%2F%23dux-582
  const PL_ARTIFACT = "https://claude.ai/artifact/8qicoqcWa8FuthABHjohgE";
  must("link Product Library (nav e Upstream)", new RegExp(`href="${PL_ARTIFACT.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}"`, "g"), 'href="/api/sso/product-library?next=%2F"');
  must("BIBLE_URL", new RegExp(`var BIBLE_URL = '${PL_ARTIFACT.replace(/[.*+?^${}()|[\]\\\/]/g, "\\$&")}';`), "var BIBLE_URL = '/api/sso/product-library?next=';");
  must("link do card Upstream", /var bibUrl = BIBLE_URL \+ \(slug \? '#' \+ slug : ''\);/, "var bibUrl = BIBLE_URL + encodeURIComponent('/' + (slug ? '#' + slug : ''));");

  // textos que só faziam sentido dentro do claude.ai
  must("ARTIFACT_URL", /var ARTIFACT_URL = '[^']*';/, `var ARTIFACT_URL = '${appUrl}';`);
  must("tools-group-sub acesso", /você é admin · Colaborador reporta · Visualização só consulta/, "você é admin · toda conta @wearedux.com entra e reporta");
  must("admin-note", /<p class="admin-note">[\s\S]*?<\/p>/,
    '<p class="admin-note"><b>Como funciona:</b> qualquer pessoa com conta Google <b>@wearedux.com</b> consegue entrar em ' + appUrl.replace(/^https?:\/\//, "") +
    ', ver o painel e reportar ferramentas e inovações — não precisa de convite individual. Quem já entrou aparece na lista abaixo. Edição e exclusão ficam com o admin e com quem fez o próprio report; a lista de admins é a variável <b>ADMIN_EMAILS</b> na Vercel.</p>');
  must("invite hint", /<span class="hint"[^>]*>Depois de enviar, abra o menu Compartilhar[\s\S]*?<\/span>/,
    '<span class="hint" style="font-size:11px; color:var(--ink-faint); display:block; margin-top:8px;">O link abre direto no login com Google; só contas @wearedux.com são aceitas.</span>');
  must("invite text", /Entre no claude\.ai com a sua conta @wearedux\.com\. Lá você consegue/, "Entre com a sua conta Google @wearedux.com. Lá você consegue");
  s = s.replace(/ — abra o cockpit publicado em claude\.ai pra reportar uma (ferramenta|inovação)\./g, ". Recarregue a página e entre com sua conta @wearedux.com.");
  s = s.replace(/Entre no claude\.ai com sua conta @wearedux\.com e abra o cockpit de novo\./g, "Recarregue a página e entre de novo com sua conta @wearedux.com.");
  s = s.replace(/Abra este cockpit publicado em claude\.ai, com uma conta da organização DUX, para ver/g, "Entre com sua conta @wearedux.com para ver");

  // Detalhamento de produtos: o conteúdo NÃO vai no index.html (que qualquer @wearedux.com recebe). Sai num arquivo
  // separado, servido só por /api/roadmap-detail para o admin e para quem ele liberou.
  let detail = "";
  must("rmDetailSource", /<template id="rmDetailSource">([\s\S]*?)<\/template>/, (_m, inner) => { detail = inner.trim(); return '<template id="rmDetailSource"></template>'; });

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
${icon}
<script>window.__DEPLOY__ = ${JSON.stringify(deploy).replace(/</g, "\\u003c")};</script>
<script src="/shim.js"></script>
</head>
<body>
${s}
</body>
</html>
`;
  return { html, icon, title, detail };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(join(root, "src", "cockpit.html"), "utf8");
  const { html, icon, detail } = transform(src, { appUrl: process.env.APP_URL || "https://cockpit-dux.vercel.app" });
  mkdirSync(join(root, "app"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "app", "index.html"), html);
  writeFileSync(join(root, "app", "roadmap-detail.html"), detail);
  const m = /href="data:image\/svg\+xml,([^"]+)"/.exec(icon);
  if (m) writeFileSync(join(root, "public", "favicon.svg"), decodeURIComponent(m[1]));
  console.log(`app/index.html gerado (${(html.length / 1024).toFixed(0)} KB)`);
}
