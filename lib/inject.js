// Aplica os blocos "ao vivo" (<!-- LIVE:chave:secao:start --> … <!-- LIVE:chave:secao:end -->) num HTML.
// Usado no servidor (primeiro carregamento já vem atualizado) e nos testes. O navegador faz o equivalente em public/shim.js.
export function applyLiveBlocks(html, blocks) {
  let out = html;
  for (const [name, content] of Object.entries(blocks || {})) {
    const m = /^([a-z0-9-]+):([a-z-]+)$/.exec(name);
    if (!m) continue;
    const start = `<!-- LIVE:${name}:start -->`, end = `<!-- LIVE:${name}:end -->`;
    const a = out.indexOf(start);
    if (a === -1) continue;
    const b = out.indexOf(end, a);
    if (b === -1) continue;
    out = out.slice(0, a + start.length) + "\n" + content + "\n" + out.slice(b);
  }
  return out;
}
export const liveMarkerNames = (html) => [...html.matchAll(/<!-- LIVE:([a-z0-9-]+:[a-z-]+):start -->/g)].map((m) => m[1]);
