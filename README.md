# Cockpit DUX

Painel dos projetos (espelho do Linear em tempo real), levantamento de ferramentas/inovações e fechamento semanal.
Instruções de publicação: **[SETUP-vercel.md](SETUP-vercel.md)**.

- `src/cockpit.html` — a página (fonte única)
- `api/` — funções da Vercel (login, banco, webhook do Linear, fechamento, uploads)
- `lib/` — regras (builders do Linear, fechamento, auth, store)
- `public/shim.js` — liga a página às funções `/api/*`
- `scripts/` — build da página e importação dos dados antigos
- `test/` — testes automatizados
