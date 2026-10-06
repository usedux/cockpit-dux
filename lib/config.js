// Configuração dos projetos do Cockpit (ids do Linear) e dos blockers.
// Blockers são julgamento humano (interno x externo), então ficam aqui — mas cada um precisa estar
// ligado a uma task de um milestone; quando a task é concluída, o blocker some sozinho do painel.

export const PROJECTS = {
  "anti-banking": { name: "Anti Banking", linearProjectId: "47c55255-de0a-45c0-9919-04e1f2132355" },
  "anti-sacado": { name: "Anti Sacado", linearProjectId: "37062b7b-23d9-4724-af18-54bbe6b8720d" },
  decentral: { name: "Decentral", linearProjectId: "c070788d-b8fe-4acf-a8c7-b3f137d132ed" },
  "gestao-conhecimento": { name: "Gestão de Conhecimento", linearProjectId: "5a153a70-1873-4a19-8878-b5b7a56de81e" },
};

export const BLOCKERS = {
  "anti-banking": [
    { tag: "externo", issue: "DUX-523", text: "Aguardando resposta da Hiperbanco — testando a API de feedback de abertura de conta." },
  ],
  "anti-sacado": [],
  decentral: [
    { tag: "interno", issue: "DUX-510", text: "Preço da saída antecipada via suporte — decisão pendente com o Lucas." },
    { tag: "interno", issue: "DUX-507", text: "Contrato da pool Hydration (ciclo de 60 dias com votação) — decisão pendente com o Lucas." },
    { tag: "interno", issue: "DUX-511", text: "Plano de lançamento da V3 alinhado com marketing — pendente com o Lucas." },
  ],
  "gestao-conhecimento": [],
};

// Projeto "Upstream - Novos Projetos" (board Kanban da aba admin). Slug = sufixo da URL do projeto no Linear.
export const UPSTREAM = {
  projectSlug: "e6787a72646c",
  projectUrl: "https://linear.app/wearedux/project/upstream-novos-projetos-e6787a72646c",
  labelGroup: "Upstream",
};

export const ADMIN_DEFAULT = "lucashenning@wearedux.com";
export const ALLOWED_DOMAIN = "wearedux.com";
