// Fixtures: dados reais do Linear (06/10/2026) em formato normalizado.
// tupla: [id, title, status, assignee, labels, milestoneId|null, completedAt|null]
const SAC = "3d10d969-f786-478e-ac8b-4d6113eff382";
const DEC = "4710851e-7c2d-4313-8c94-b3676bd46a4b";
const ABK = "b509ffa0-550b-4014-9d82-1d7453329bb8";
const C = (statuses) => statuses;
const mk = (rows) => rows.map(([id, title, status, assignee, labels, milestoneId, completedAt]) => ({
  id, title, status, assignee, labels, milestoneId, completedAt: completedAt || null,
}));

export const sacado = {
  milestones: [{ id: SAC, name: "Piloto Risco Sacado- Cliente 1", progress: 67.19, targetDate: "2026-09-28" }],
  issues: mk([
    ["DUX-499","Atualização do Figma com a jornada mais recente","Done / In Prod","Lucas Henning",["Feature"],SAC,"2026-10-01T20:28:47.571Z"],
    ["DUX-572","Mapear fluxo operacional do Risco Sacado (cadastro de fornecedor até operação no dia a dia)","In Progress","Lucas Albino DUX",["Nova Funcionalidade","Operação"],SAC],
    ["DUX-558","Permitir que fornecedor edite cadastro de e-mail","Done / In Prod","Guilherme Zaidan",["Nova Funcionalidade","Operação"],SAC,"2026-10-05T14:44:33.292Z"],
    ["DUX-555","Adicionar ícone de inbox/notificação de mudança de etapa para o fornecedor","In Review","Guilherme Zaidan",["Nova Funcionalidade","Operação"],SAC],
    ["DUX-554","Dar visibilidade ao fornecedor sobre pendências","Done / In Prod","Guilherme Zaidan",["Melhoria","Operação"],SAC,"2026-10-05T14:42:42.053Z"],
    ["DUX-527","Revisar remetente das réguas de comunicação","In Progress","Lucas Henning",["Operação"],SAC],
    ["DUX-570","Estrutura de política de privacidade, termos de uso e cookies validada","In Progress","Thiago Tiburcio",["Jurídico","Nova Funcionalidade"],SAC],
    ["DUX-503","Revisão do manual do produto (HTML) para o cliente","In Review","Felipe Tiburcio",["Feature"],SAC],
    ["DUX-465","Separar ambientes de produção e QA/desenvolvimento","In Progress","Guilherme Zaidan",["Feature"],SAC],
    ["DUX-571","Ata 01/ Outubro","In Review",null,[],null],
    ["DUX-578","Pensar numa estrutura de Suporte / Atendimento (Nuvem Cloud) / Registro de Tickets","Backlog","Lucas Albino DUX",["Melhoria","Operação"],null],
    ["DUX-577","Compartilhar documentação de entregas dos processos da base","Backlog","Thiago Tiburcio",["Melhoria","Operação"],null],
    ["DUX-576","Guideline para definição de limites e taxas (Limite Global, Por Produto Sacado e Cedente)","Backlog","Thiago Tiburcio",["Melhoria","Operação","Comercial"],null],
    ["DUX-575","Definir SLA de Análise da Base para Clientes","Backlog","Thiago Tiburcio",["Melhoria","Operação"],null],
    ["DUX-574","Criação de um Kanban de prospects no Portal, na etapa anterior ao cadastro do Parceiro na base","Backlog","Guilherme Zaidan",["Melhoria","Operação"],null],
    ["DUX-500","Configurar suporte comercial via WhatsApp - Risco Sacado","In Review","Luma Americano",["Feature"],SAC],
    ["DUX-557","Migrar para versão de QA","Canceled","Guilherme Zaidan",["Melhoria","Operação"],SAC],
    ["DUX-569","Checklist final de segurança","Backlog","André @ DUX",["Nova Funcionalidade","Operação"],null],
    ["DUX-497","Pendências de Lançamento MVP","Canceled",null,[],null],
    ["DUX-532","Associação do Fornecedor com o Parceiro por CNPJ","Priorized",null,["Melhoria"],null],
    ["DUX-504","AWS para upload de documentação","Product Refinement","André @ DUX",["Feature"],null],
    ["DUX-463","Implementação da régua de comunicação transacional - Email (Risco Sacado)","Done / In Prod","Guilherme Zaidan",["Feature"],SAC,"2026-09-25T14:11:21.697Z"],
    ["DUX-556","Melhorar visão do parceiro para gestão de operações","Done / In Prod","Guilherme Zaidan",["Melhoria","Operação"],SAC,"2026-09-28T18:39:49.949Z"],
    ["DUX-559","Criar visão do parceiro controle","Done / In Prod","Guilherme Zaidan",["Nova Funcionalidade","Operação"],SAC,"2026-09-28T18:40:36.511Z"],
    ["DUX-549","Product Review - 25/Setembro","Backlog",null,[],null],
    ["DUX-560","Inserir comprovante da execução anexado ao e-mail","Backlog","Guilherme Zaidan",["Nova Funcionalidade","Operação"],null],
    ["DUX-561","Permitir mesmo e-mail de responsável do parceiro para diferentes parceiros","Backlog","Guilherme Zaidan",["Melhoria","Operação"],null],
    ["DUX-566","Criar visão unificada do parceiro (considerando grupos)","Backlog","Guilherme Zaidan",["Nova Funcionalidade","Operação"],null],
    ["DUX-567","Possibilitar antecipação parcial da nota","Backlog","Guilherme Zaidan",["Nova Funcionalidade","Operação"],null],
    ["DUX-568","Automatizar respostas rápidas de reprovada","Backlog","Guilherme Zaidan",["Nova Funcionalidade","Operação"],null],
    ["DUX-505","Definir prazo de assinatura do contrato - D4Sign","Done / In Prod","Lucas Henning",["Feature"],SAC,"2026-09-23T21:23:38.738Z"],
    ["DUX-464","Ajustar o fluxo de cadastro para ser feito em duas etapas","QA - In Test","Guilherme Zaidan",["Feature"],null,"2026-09-23T21:23:05.714Z"],
    ["DUX-501","Liberar suporte@sejaanti.com.br para Luma","Done / In Prod","Guilherme Zaidan",["Feature"],SAC,"2026-09-23T21:22:51.045Z"],
    ["DUX-462","Concepção da régua de comunicação transacional - Email (Risco Sacado)","Done / In Prod","Lucas Henning",["Feature"],SAC,"2026-09-23T21:22:08.190Z"],
  ]),
};

export const bancking = {
  milestones: [{ id: ABK, name: "Abertura da Primeira Conta", progress: 0, targetDate: null }],
  issues: mk([
    ["DUX-523","Testar API de feedback de abertura de conta (Hiperbanco)","Backlog",null,["Feature"],ABK],
    ["DUX-444","Concepção da Régua de comunicação Transacional - Email","Product Refinement","Lucas Henning",["Feature"],null],
    ["DUX-454","Ajustar ícone do aplicativo","Done / In Prod","Lucas Henning",["Improvement"],null,"2026-09-18T12:24:49.437Z"],
    ["DUX-450","Criação de painel de controle","Product Refinement","André @ DUX",["Feature"],null],
    ["DUX-461","Alterações contratuais deve ser opcional (hoje trava o envio do cadastro)","Backlog",null,["app","core"],null],
    ["DUX-460","Integração do app à esteira de trabalho do portal (operação)","Product Refinement","Lucas Henning",["Improvement"],null],
    ["DUX-459","Crash ao clicar em \"Ver status\" após envio dos dados do representante legal","Priorized","André @ DUX",["Bug"],null],
    ["DUX-458","Habilitar edição de dados da empresa no perfil","Priorized","André @ DUX",["Feature"],null],
    ["DUX-457","Integrar liveness via webview no APP","Ready To Dev","André @ DUX",["Bug"],null],
    ["DUX-456","Revisão do fluxo de envio de dados da empresa","Product Refinement","Lucas Henning",["Bug"],null],
    ["DUX-452","Concepção e validação na tela de extrato","Product Refinement","Lucas Henning",["Feature"],null],
    ["DUX-446","Configuração da ferramenta de tracking","Backlog","Lucas Henning",["Feature"],null],
    ["DUX-447","Mapeamento das telas e eventos de tracking","Backlog","Lucas Henning",["Feature"],null],
    ["DUX-453","Implementação da tela de extrato","Product Refinement","Lucas Henning",["Feature"],null],
    ["DUX-455","Inclusão do fluxo \"esqueci minha senha\" e persistência de login","Priorized","André @ DUX",["Feature"],null],
    ["DUX-451","Ajustes no fluxo de envio de documento","Ready To Dev","André @ DUX",["Bug"],null],
    ["DUX-449","Ajustes na tela de cadastro de senha","Ready To Dev","André @ DUX",["Bug"],null],
    ["DUX-448","Implementar os eventos de tracking do aplicativo","Backlog","André @ DUX",["Feature"],null],
    ["DUX-445","Régua de comunicação - Email: implementação prática dos disparos","Backlog","André @ DUX",["Feature"],null],
    ["DUX-439","Captura por câmera no upload do RG (hoje só galeria de fotos)","Backlog",null,["app"],null],
    ["DUX-436","Push \"conta criada\" com deep link para a tela Minha conta","Backlog",null,["core"],null],
    ["DUX-435","Push notifications reais (FCM em produção + integração no app)","Backlog",null,["app","core"],null],
  ]),
};

export const decentral = {
  milestones: [{ id: DEC, name: "Liberação V3 - Decentral", progress: 25, targetDate: null }],
  issues: mk([
    ["DUX-522","Idealizar promoção para grupos fechados e indicações (MGM)","Priorized","JP",["Marketing"],null],
    ["DUX-498","Alinhamento","Done / In Prod",null,[],null,"2026-10-05T18:00:54.634Z"],
    ["DUX-507","Contrato novo Hydration","Priorized","Hyago Bitencourt | DUX",["Decentral"],DEC],
    ["DUX-512","Dados de controle financeiro da V3 por chain e consolidado","Priorized","Hyago Bitencourt | DUX",["Decentral"],DEC],
    ["DUX-510","Preço definido para a saída via suporte","Done / In Prod","Lucas Albino DUX",["Decentral"],DEC,"2026-10-05T17:57:34.173Z"],
    ["DUX-579","Contratação Sumsub","Backlog","Lucas Albino DUX",[],null],
    ["DUX-513","Relatório Fact Finance atualizado para o modelo V3","In Progress","Hyago Bitencourt | DUX",["Decentral"],DEC],
    ["DUX-518","Issues Financeiro","Done / In Prod","Lucas Albino DUX",["Financeiro"],DEC,"2026-10-05T17:52:55.705Z"],
    ["DUX-516","Issues MKT","Done / In Prod","Hyago Bitencourt | DUX",["Feature"],DEC,"2026-10-05T17:52:46.306Z"],
    ["DUX-552","Definir calendário com as datas de lançamento do Decentral","Done / In Prod","Lucas Albino DUX",["Operação","Feature"],null,"2026-10-05T17:51:59.195Z"],
    ["DUX-529","Revisão dos termos de uso e aporte","In Progress","Lucas Albino DUX",[],DEC],
    ["DUX-517","Benchmark de Melhoria de Design e Experiência","Ready To Dev","Lucas Albino DUX",["Feature"],DEC],
    ["DUX-525","Criar documentação/tutorial de como funciona a movimentação financeira","Ready To Dev","Hyago Bitencourt | DUX",["Financeiro"],DEC],
    ["DUX-524","Criar painel de controle para acompanhar o desembolso","In Progress","Lucas Albino DUX",["Financeiro"],DEC],
    ["DUX-526","Formalizar acordo com LP para recompra de Principal","In Progress","Lucas Albino DUX",["Financeiro"],DEC],
    ["DUX-551","Criação de Board de Migração de V2 para V3","Ready To Dev","Hyago Bitencourt | DUX",[],DEC],
    ["DUX-506","Estimativa de esforço da migração legada (v2 → v3)","Done / In Prod","Hyago Bitencourt | DUX",["Decentral"],DEC,"2026-10-05T17:25:36.477Z"],
    ["DUX-520","Estruturar comunicação para clientes da plataforma legacy (V2 → V3)","Product Refinement","JP",["Marketing"],DEC],
    ["DUX-519","Atualizar site público da Decentral (usedecentral.com)","Product Refinement","JP",["Marketing"],DEC],
    ["DUX-509","Script de migração legada + ajustes na aplicação","In Progress","Hyago Bitencourt | DUX",["Decentral"],DEC],
    ["DUX-521","Idealizar reuniões (AMA/Live) para grupos e indicações","Ready To Dev","JP",["Marketing"],DEC],
    ["DUX-528","Rever experiência tela de transações para adicionar status, e botão retry de cada linha","Backlog","Hyago Bitencourt | DUX",["Improvement"],DEC],
    ["DUX-515","Corrigir falhas intermitentes na aprovação do depósito","Backlog","Hyago Bitencourt | DUX",["Decentral","Bug"],DEC],
    ["DUX-508","Revisão geral de UI/UX da aplicação","Backlog","Lucas Henning",["Decentral","Improvement"],DEC],
    ["DUX-514","Bloquear código de indicação próprio ou inválido","Backlog","Hyago Bitencourt | DUX",["Decentral","Bug"],DEC],
  ]),
};

export const gestao = {
  milestones: [
    { id: "245ecde1-8396-4afc-a870-9e207caab8d2", name: "Liberação do MCP", progress: 0, targetDate: null },
    { id: "62a2a337-aa24-4989-b78c-eed430808386", name: "Sistematização do CGO", progress: 0, targetDate: null },
  ],
  issues: mk([["DUX-573","Test","Backlog",null,[],null]]),
};
