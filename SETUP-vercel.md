# Cockpit DUX na Vercel — passo a passo

Resultado final: **https://cockpit-dux.vercel.app** com login Google (@wearedux.com), dados no seu próprio banco, novos reports gravados em produção, painel espelhando o Linear por webhook e fechamento semanal toda sexta às 18h (BRT) rodando no servidor.

Tempo estimado: 30–40 minutos. Tudo abaixo é feito em telas web; o único comando de terminal é a importação dos dados antigos (passo 8).

---

## 1. Subir o código para o GitHub

1. Crie um repositório **privado** (ex.: `wearedux/cockpit-dux`).
2. Envie o conteúdo desta pasta para ele (o `.gitignore` já deixa de fora segredos e `node_modules`). Pelo GitHub Desktop ou:
   ```
   git init && git add . && git commit -m "Cockpit DUX" && git branch -M main
   git remote add origin git@github.com:wearedux/cockpit-dux.git && git push -u origin main
   ```

## 2. Criar o projeto na Vercel

1. vercel.com → **Add New… → Project** → importe o repositório.
2. **Project Name: `cockpit-dux`** → o endereço será `cockpit-dux.vercel.app` (se o nome já estiver ocupado, a Vercel sugere outro; depois você pode ajustar em *Settings → Domains*).
3. Framework Preset: **Other**. Não mexa em Build/Output (o `vercel.json` já define). Em *Settings → General → Node.js Version*, escolha **22.x**.
4. Pode clicar em **Deploy** agora (vai abrir, mas ainda sem login/dados — é esperado). Os próximos passos adicionam o que falta.

## 3. Banco (Upstash Redis) e arquivos (Blob)

No projeto → aba **Storage**:

1. **Create Database → Upstash (Redis)** (Marketplace) → plano Free serve → *Connect to project*. Isso cria sozinho `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
2. **Create Database → Blob** → *Connect to project*. Isso cria `BLOB_READ_WRITE_TOKEN` (prints e vídeos dos reports; limite de **4 MB por arquivo** — acima disso a pessoa cola o link do Loom/Drive).

## 4. Login com Google (somente @wearedux.com)

1. console.cloud.google.com → crie (ou escolha) um projeto → **APIs e serviços → Tela de consentimento OAuth** → tipo de usuário **Interno** (só contas do Google Workspace da DUX conseguem entrar).
2. **Credenciais → Criar credenciais → ID do cliente OAuth** → tipo *Aplicativo da Web*.
   - Origem JavaScript autorizada: `https://cockpit-dux.vercel.app`
   - URI de redirecionamento autorizado: `https://cockpit-dux.vercel.app/auth/callback`
3. Guarde o **Client ID** e o **Client secret**.

## 5. Chave e webhook do Linear

1. Linear → **Settings → API → Personal API keys → Create key** (nome: "Cockpit DUX"). Copie a chave (`lin_api_…`) → será `LINEAR_API_KEY`. Ela só precisa de leitura.
2. Linear → **Settings → API → Webhooks → New webhook** (precisa ser admin do workspace):
   - **URL:** `https://cockpit-dux.vercel.app/api/linear-webhook`
   - **Data change events:** marque **Issues**, **Projects** e **Project milestones** (se aparecer, marque também *Project updates* e *Issue labels*).
   - Escolha **todos os times** (ou os times dos projetos do cockpit).
   - Ao salvar, o Linear mostra o **Signing secret** (`lin_wh_…`) → será `LINEAR_WEBHOOK_SECRET`.

## 6. Variáveis de ambiente na Vercel

*Settings → Environment Variables* (marque Production, Preview e Development):

| Nome | Valor |
|---|---|
| `SESSION_SECRET` | texto aleatório com 32+ caracteres (ex.: `openssl rand -base64 32`) |
| `ADMIN_EMAILS` | `lucashenning@wearedux.com` (mais de um: separe por vírgula) |
| `APP_URL` | `https://cockpit-dux.vercel.app` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | do passo 4 |
| `LINEAR_API_KEY` | do passo 5 |
| `LINEAR_WEBHOOK_SECRET` | do passo 5 |
| `CRON_SECRET` | outro texto aleatório (16+ caracteres). A Vercel o envia sozinha nas chamadas de cron |
| `ANTHROPIC_API_KEY` *(opcional)* | se quiser que os "destaques e sugestões" do fechamento sejam redigidos pela IA. Sem ela, o texto sai de um modelo padrão calculado dos números |
| `ANTHROPIC_MODEL` *(opcional)* | só se quiser trocar o modelo (padrão `claude-sonnet-4-5`) |

Depois de salvar: **Deployments → ⋯ no último deploy → Redeploy** (variáveis só valem em deploys novos).

## 7. Primeira sincronização

1. Abra `https://cockpit-dux.vercel.app` → entra no Google → aparece o cockpit (ainda com blocos vazios).
2. Abra em outra aba `https://cockpit-dux.vercel.app/api/refresh` (logado como admin). A resposta mostra os projetos, milestones e eventuais *avisos* (blockers ocultos etc.). Volte ao cockpit: os cards já estão com os dados do Linear.

## 8. Importar o que já existe no Artifact (reports, inovações, Upstream, histórico, prints)

**Caminho mais fácil (sem terminal):** entre no cockpit como admin e abra a aba **Admin**. Na primeira vez, com o banco vazio, a importação roda sozinha e a página recarrega com tudo. Depois disso o cartão **Dados do Artifact** mostra a situação e tem o botão *Importar de novo* (seguro: não duplica nem apaga nada).

Alternativa pelo terminal, no seu computador, dentro da pasta do projeto (precisa de Node 22+):

```
npm install
npx vercel link            # escolha o projeto cockpit-dux
npx vercel env pull .env.local
npm run seed -- --dry      # só mostra o que será importado
npm run seed               # importa de verdade (pode rodar de novo: não duplica)
```

Importa: 15 reports, 10 inovações, 3 cards do Upstream, 2 semanas de histórico e 19 dos 20 prints (um print foi bloqueado na exportação — reenvie-o editando o report).

**Quem reportou o quê:** os registros antigos têm o identificador antigo do claude.ai. Abra `seed/legacy-people.json`, preencha o e-mail @wearedux.com de cada pessoa (a Lucas Albino já está identificada) e rode `npm run seed` de novo — o report passa a ser "da pessoa" (ela poderá editar). Ids sem e-mail aparecem como "Equipe DUX"; você pode ajustar o nome exibido na aba admin (campo *Reportado por*).

## 9. Conferir tudo (checklist de 5 minutos)

- [ ] Abrir o cockpit em janela anônima → manda para o login; entrar com e-mail fora da DUX → recusado.
- [ ] Mudar o status de uma task no Linear → em até ~10 s o card muda na tela aberta, sem recarregar. (Se não mudar: Linear → Webhooks → o webhook → *Recent deliveries* mostra o erro.)
- [ ] Aba **Levantamento → Ferramentas reportadas → + Reportar Ferramenta**: enviar um teste com print; abrir a bolinha e ver o print. Depois apague pela aba admin.
- [ ] `https://cockpit-dux.vercel.app/api/closing?dry=1` (logado como admin) → mostra o fechamento da semana **sem gravar**. O de verdade é gravado sozinho na sexta, 18h.
- [ ] Vercel → **Settings → Cron Jobs** lista `/api/closing` (sexta 21:00 UTC = 18:00 BRT) e `/api/refresh` (diário, rede de segurança caso algum webhook falhe).

## 10. Desligar o agendamento antigo

Só depois da **primeira sexta** em que o fechamento rodar na Vercel e aparecer no histórico: desative o agendamento antigo no Claude (o "fechamento semanal" que roda a partir da sua conta). Enquanto isso, deixe os dois — o histórico não duplica semanas já fechadas.

---

## Como funciona (resumo)

- **Linear → cockpit:** o webhook chama `/api/linear-webhook` (assinatura HMAC conferida), que relê os 4 projetos e regrava os blocos. A tela consulta `/api/live` a cada ~8 s (resposta mínima quando nada mudou). Sem webhook funcionando, o cron diário corrige.
- **Reports e inovações:** `/api/db` (Redis). Qualquer @wearedux.com cria; edita/apaga só quem reportou ou admin; autor e data são carimbados pelo servidor.
- **Fechamento:** `/api/closing` (cron). Calcula só com tasks de milestones; é idempotente (não refaz semana já fechada); guarda em `history`.
- **Acesso:** o HTML só é entregue com cookie de sessão válido (assinado, 7 dias). Domínio verificado no servidor.

## Limites e pontos de atenção

- **Cron no plano Hobby:** só roda 1x por dia e com precisão de hora (o job de sexta pode rodar entre 18:00 e 18:59 BRT). No plano **Pro**, o horário é exato. Confira os limites atuais em vercel.com/docs/cron-jobs/usage-and-pricing.
- **Campos do Linear:** a leitura (progresso do milestone, histórico de raias do Upstream) segue a documentação pública e foi testada com dados simulados, não contra o workspace real. No primeiro `/api/refresh`, confira os `warnings` e os percentuais dos milestones. Se o progresso vier entre 0 e 1 em vez de 0–100, defina `LINEAR_PROGRESS_SCALE=fraction`.
- **Blockers** são julgamento seu e ficam em `lib/config.js` (cada um ligado a uma task de milestone; some sozinho quando a task é concluída). Hoje DUX-510 (concluída) e DUX-511 (não encontrada no Linear) aparecem como avisos e ficam ocultos.
- **Anexos:** até 4 MB por arquivo.

## Rodar localmente / testes

```
npm install
npm test                    # 26 testes (regras, permissões, webhook, fechamento, importação)
node test/e2e.mjs           # teste ponta a ponta no navegador (precisa do Playwright)
DEV_AUTH_EMAIL=lucashenning@wearedux.com MOCK_LINEAR=1 npm run dev   # http://localhost:3000 com dados de exemplo
```

Para alterar a página: edite `src/cockpit.html` (é o mesmo HTML do Artifact) e faça deploy; `scripts/build-app.mjs` gera `app/index.html` automaticamente no build.

## Se as listas aparecem vazias (ferramentas, inovações, pessoas, histórico)

Quase sempre é o banco não conectado. A Vercel roda cada requisição numa instância diferente: sem o Upstash Redis, nada que é gravado numa chamada aparece na seguinte. O app agora avisa isso em vermelho (faixa no topo e no cartão "Dados do Artifact" da aba Admin). Solução: **Storage → conecte um banco Redis ao projeto (marque Production, Preview e Development) → Redeploy**. Servem tanto o Upstash (variáveis `KV_REST_API_URL`/`KV_REST_API_TOKEN`) quanto um Redis comum, como o Redis Cloud (variável `REDIS_URL`, no formato `redis://usuario:senha@host:porta`). Se o banco foi criado fora da Vercel, cadastre `REDIS_URL` à mão em Settings → Environment Variables (nunca no repositório). Nomes com prefixo (ex.: `STORAGE_REDIS_URL`) também são aceitos. Depois do Redeploy, a importação dos dados do Artifact roda sozinha ao abrir a aba Admin.
