/**
 * Pipefy → Google Sheets: espelho diário do pipe de R&S.
 *
 * Roda dentro da planilha "R&S _ BASE" (Extensões > Apps Script). Lê todos os
 * cards do pipe pela API GraphQL e reescreve a aba `pipefy_cards` inteira: uma
 * linha por card, uma coluna por campo. O dash lê dessa aba pelo NOME da
 * coluna, nunca pela posição — campo novo no Pipefy vira coluna nova sem
 * quebrar nada.
 *
 * Instalação (uma vez):
 *   1. Configurações do projeto > Propriedades do script: PIPEFY_TOKEN = <token>
 *   2. Rodar `configurar` — cria o gatilho diário e protege a aba de dados.
 *
 * O token fica nas propriedades do script, nunca neste arquivo: quem tem acesso
 * de leitura ao código não leva o token junto.
 */

const PIPE_ID = '305884324';
const ENDPOINT = 'https://api.pipefy.com/graphql';
const ABA_DADOS = 'pipefy_cards';
const ABA_STATUS = 'status_sync';

/** A API pagina em no máximo 50 por chamada. */
const POR_PAGINA = 50;

/** Trava contra cursor que nunca acaba: 200 × 50 = 10 mil cards. */
const MAX_PAGINAS = 200;

/** Hora do gatilho diário (fuso de São Paulo). Antes do sync do dash, às 7h30. */
const HORA_DO_SYNC = 6;

/** Uma célula do Sheets aceita no máximo 50 mil caracteres. */
const LIMITE_CELULA = 50000;

/**
 * Campos com dado pessoal (cadastro de candidato e de colaborador) que não
 * alimentam nenhum número do dash. Ficam fora da planilha para ela poder ser
 * compartilhada sem expor ninguém. Para trazer um deles, tire-o da lista.
 *
 * O CPF do colaborador substituído entra de propósito — pedido do R&S. Por
 * causa dele, a planilha não deve ser compartilhada fora do time.
 */
const CAMPOS_EXCLUIDOS = [
  'Preencha aqui os dados do candidato',
  'Preencha aqui os dados do indicado',
  'Preencha aqui os dados da indicação',
  'Cadastro do Colaborador a ser substituído:',
  'Cadastro do Colaborador que irá preencher a vaga',
  'Documento comprobatório da ausência',
  'Documento comprobatório da ausência futura',
];

const COLUNAS_FIXAS = [
  'card_id',
  'titulo',
  'fase_atual',
  'criado_em',
  'finalizado_em',
  'prazo',
  'atrasado',
];

/** Menu na planilha, para atualizar sem abrir o editor. */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Pipefy')
    .addItem('Atualizar agora', 'sincronizarPipefy')
    .addToUi();
}

/** Roda uma vez: gatilho diário + aba de dados protegida. */
function configurar() {
  for (const g of ScriptApp.getProjectTriggers()) {
    if (g.getHandlerFunction() === 'sincronizarPipefy') ScriptApp.deleteTrigger(g);
  }
  ScriptApp.newTrigger('sincronizarPipefy')
    .timeBased()
    .everyDays(1)
    .atHour(HORA_DO_SYNC)
    .inTimezone('America/Sao_Paulo')
    .create();

  /*
    A aba de dados é do script. Se alguém renomeia uma coluna ou ordena as
    linhas ali, o dash passa a ler errado sem nenhum erro aparecer — por isso
    só o dono edita. Anotações do time vão em outra aba.
  */
  const aba = obterAba_(ABA_DADOS);
  for (const p of aba.getProtections(SpreadsheetApp.ProtectionType.SHEET)) p.remove();
  const protecao = aba.protect().setDescription('Escrita só pelo script do Pipefy');
  protecao.removeEditors(protecao.getEditors());
  if (protecao.canDomainEdit()) protecao.setDomainEdit(false);

  sincronizarPipefy();
}

function sincronizarPipefy() {
  const trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) return; // outra execução em andamento

  const inicio = Date.now();
  try {
    const cards = buscarTodosOsCards_();

    /*
      Zero cards com resposta "OK" é quase sempre problema de permissão do
      token, não um pipe vazio. Apagar a aba nesse caso faria o dash concluir
      que todas as vagas sumiram.
    */
    if (cards.length === 0) {
      throw new Error('O Pipefy devolveu 0 cards. A aba não foi alterada.');
    }

    escreverCards_(cards);
    registrarStatus_('OK', cards.length, inicio, '');
  } catch (erro) {
    registrarStatus_('ERRO', '', inicio, erro.message);
    avisarPorEmail_(erro);
    throw erro;
  } finally {
    trava.releaseLock();
  }
}

function buscarTodosOsCards_() {
  const todos = [];
  let cursor = null;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const after = cursor ? `, after: "${cursor}"` : '';
    const dados = consultar_(`{
      allCards(pipeId: ${PIPE_ID}, first: ${POR_PAGINA}${after}) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id
          title
          createdAt
          finished_at
          due_date
          late
          current_phase { name }
          fields { name value }
        } }
      }
    }`);

    for (const e of dados.allCards.edges) todos.push(e.node);
    if (!dados.allCards.pageInfo.hasNextPage) break;
    cursor = dados.allCards.pageInfo.endCursor;
  }

  return todos;
}

function consultar_(query) {
  const token = PropertiesService.getScriptProperties().getProperty('PIPEFY_TOKEN');
  if (!token) {
    throw new Error(
      'PIPEFY_TOKEN não configurado. Em Configurações do projeto > Propriedades do script.',
    );
  }

  for (let tentativa = 1; ; tentativa++) {
    let resposta;
    try {
      resposta = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: `Bearer ${token.trim()}` },
        payload: JSON.stringify({ query }),
        muteHttpExceptions: true,
      });
    } catch (erro) {
      if (tentativa <= 4) {
        Utilities.sleep(500 * 2 ** tentativa);
        continue;
      }
      throw new Error(`Falha de rede ao chamar o Pipefy: ${erro.message}`);
    }

    const status = resposta.getResponseCode();
    if ((status === 429 || status >= 500) && tentativa <= 5) {
      Utilities.sleep(Math.min(30000, 1000 * 2 ** tentativa));
      continue;
    }

    const texto = resposta.getContentText();
    if (status !== 200) {
      const dica = status === 401 ? ' — token inválido ou expirado' : '';
      throw new Error(`Pipefy respondeu ${status}${dica}: ${texto.slice(0, 300)}`);
    }

    // O GraphQL responde 200 mesmo quando a consulta falha; o erro vem no corpo.
    const corpo = JSON.parse(texto);
    if (corpo.errors && corpo.errors.length) {
      throw new Error(`Pipefy recusou a consulta: ${corpo.errors.map((e) => e.message).join('; ')}`);
    }
    if (!corpo.data) throw new Error('Pipefy respondeu sem dados.');
    return corpo.data;
  }
}

function escreverCards_(cards) {
  const excluidos = new Set(CAMPOS_EXCLUIDOS.map(normalizar_));

  // Colunas de campo em ordem alfabética: estável de um dia para o outro.
  const nomesCampos = new Map(); // normalizado → nome como aparece no Pipefy
  for (const card of cards) {
    for (const f of card.fields || []) {
      const chave = normalizar_(f.name);
      if (!excluidos.has(chave) && !nomesCampos.has(chave)) nomesCampos.set(chave, f.name.trim());
    }
  }
  const chaves = [...nomesCampos.keys()].sort((a, b) =>
    nomesCampos.get(a).localeCompare(nomesCampos.get(b), 'pt'),
  );

  const cabecalho = [...COLUNAS_FIXAS, ...chaves.map((c) => nomesCampos.get(c))];
  const linhas = cards.map((card) => {
    const valores = new Map();
    for (const f of card.fields || []) valores.set(normalizar_(f.name), f.value);
    return [
      card.id,
      card.title || '',
      (card.current_phase && card.current_phase.name) || '',
      card.createdAt || '',
      card.finished_at || '',
      card.due_date || '',
      card.late === null || card.late === undefined ? '' : String(card.late),
      ...chaves.map((c) => legivel_(valores.get(c))),
    ].map((v) => String(v).slice(0, LIMITE_CELULA));
  });

  const aba = obterAba_(ABA_DADOS);
  const tabela = [cabecalho, ...linhas];

  aba.clearContents();
  /*
    Tudo como texto puro. Sem isso o Sheets "ajuda": converte data ISO para o
    fuso da planilha, tira zero à esquerda de código e transforma "1/2" em data.
  */
  const intervalo = aba.getRange(1, 1, tabela.length, cabecalho.length);
  intervalo.setNumberFormat('@');
  intervalo.setValues(tabela);
  aba.setFrozenRows(1);
}

/** Campo de lista vem do Pipefy como texto JSON: `["A","B"]` vira `A | B`. */
function legivel_(valor) {
  if (valor === null || valor === undefined) return '';
  const texto = String(valor).trim();
  if (texto.startsWith('[') && texto.endsWith(']')) {
    try {
      const lista = JSON.parse(texto);
      if (Array.isArray(lista)) return lista.map((x) => String(x).trim()).join(' | ');
    } catch (e) {
      // não era JSON; segue como texto
    }
  }
  return texto;
}

function normalizar_(nome) {
  return String(nome || '').trim().toLowerCase();
}

function obterAba_(nome) {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  return planilha.getSheetByName(nome) || planilha.insertSheet(nome);
}

/** Uma linha por execução. O dash usa a última para dizer "dados de X atrás". */
function registrarStatus_(resultado, cards, inicio, mensagem) {
  const aba = obterAba_(ABA_STATUS);
  if (aba.getLastRow() === 0) {
    aba.appendRow(['executado_em', 'resultado', 'cards', 'segundos', 'mensagem']);
    aba.setFrozenRows(1);
  }
  aba.appendRow([
    new Date().toISOString(),
    resultado,
    cards,
    ((Date.now() - inicio) / 1000).toFixed(1),
    mensagem,
  ]);
}

function avisarPorEmail_(erro) {
  try {
    const planilha = SpreadsheetApp.getActiveSpreadsheet();
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      'Falha na atualização Pipefy → Sheets',
      `A atualização da planilha "${planilha.getName()}" falhou e os dados ` +
        `continuam os da última execução bem-sucedida.\n\n` +
        `Erro: ${erro.message}\n\n${planilha.getUrl()}`,
    );
  } catch (e) {
    // sem cota de e-mail: o erro já ficou registrado na aba de status
  }
}
