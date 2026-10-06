// Gera app/index.html (e public/favicon.svg) a partir de src/cockpit.html — o mesmo HTML do Artifact do claude.ai,
// adaptado para rodar na Vercel: embrulha com <html>/<head>, liga o /shim.js (db/user/assets/downloads → /api/*),
// zera o histórico embutido (agora vem do servidor) e troca os textos que citavam o claude.ai.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function transform(fragment, { appUrl = "https://cockpit-dux.vercel.app" } = {}) {
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

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${title}</title>
${icon}
<script src="/shim.js"></script>
</head>
<body>
${s}
</body>
</html>
`;
  return { html, icon, title };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const src = readFileSync(join(root, "src", "cockpit.html"), "utf8");
  const { html, icon } = transform(src, { appUrl: process.env.APP_URL || "https://cockpit-dux.vercel.app" });
  mkdirSync(join(root, "app"), { recursive: true });
  mkdirSync(join(root, "public"), { recursive: true });
  writeFileSync(join(root, "app", "index.html"), html);
  const m = /href="data:image\/svg\+xml,([^"]+)"/.exec(icon);
  if (m) writeFileSync(join(root, "public", "favicon.svg"), decodeURIComponent(m[1]));
  console.log(`app/index.html gerado (${(html.length / 1024).toFixed(0)} KB)`);
}
