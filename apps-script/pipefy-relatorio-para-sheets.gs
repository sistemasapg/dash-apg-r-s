/************************************************************
 * ROBÔ PIPEFY → PLANILHA  (100% na nuvem, sem PC ligado)
 *
 * Substitui o robô antigo (Playwright + Agendador do Windows).
 * Usa a API oficial do Pipefy, então NÃO depende de sessão de
 * navegador e NÃO expira sozinho.
 *
 * Como funciona:
 *   1. pede pro Pipefy gerar o export do relatório salvo
 *   2. espera o arquivo ficar pronto (.xlsx)
 *   3. converte pra Google Sheets e copia os valores pra aba destino
 *
 * INSTALAÇÃO: veja NUVEM-LEIA-ME.md
 ************************************************************/

// ---------- CONFIGURAÇÃO ----------
var PIPE_ID = '305884324';
var REPORT_ID = '301121312';   // API-RS-SCRAPING
var ABA_DESTINO = 'pipefy_relatorio';
/* O gid da guia, da URL da planilha. Achar por gid e mais seguro que por nome:
 * renomear a aba na mao quebraria a busca por nome, e o gid nunca muda. */
var GID_DESTINO = 1135125070;
var ABA_LOG = 'log_relatorio';

/* COTA DE API — leia antes de mexer nos números abaixo.
 * O Pipefy conta 1 chamada por requisição GraphQL (query OU mutation), e o
 * teto é MENSAL: Starter 20, Business 500, Enterprise 10.000.
 * O download do arquivo NÃO conta (é HTTPS comum, fora do GraphQL).
 *
 * Consumo por execução:  1 mutation + 1 a MAX_CONSULTAS_POR_EXECUCAO queries.
 * No caso típico são 2 chamadas → ~60/mês rodando 1×/dia.
 *
 * Esperar mais entre as consultas é DE GRAÇA (Utilities.sleep não gasta cota);
 * consultar mais vezes é que custa. Por isso a espera é longa e as consultas
 * são poucas. Ao aumentar MAX_CONSULTAS_POR_EXECUCAO, multiplique por 30 pra
 * ver o impacto no mês antes de salvar. */
var ESPERA_INICIAL_MS = 60 * 1000;        // deixa o Pipefy trabalhar antes da 1ª consulta
var ESPERA_ENTRE_CONSULTAS_MS = 45 * 1000;
var MAX_CONSULTAS_POR_EXECUCAO = 3;

// Se o export não ficar pronto nesse tempo, reagenda e tenta de novo:
var MINUTOS_PARA_RETENTAR = 5;
var MAX_RETENTATIVAS = 3;

var API_URL = 'https://api.pipefy.com/graphql';
var PROP_EXPORT_ID = 'pipefy_export_id';
var PROP_TENTATIVAS = 'pipefy_tentativas';

// ---------- PONTO DE ENTRADA (é isto que o gatilho diário chama) ----------
function atualizarRelatorio() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(PROP_EXPORT_ID);
  props.setProperty(PROP_TENTATIVAS, '0');
  _limparGatilhosTemporarios();

  var exportId = _pedirExport();
  props.setProperty(PROP_EXPORT_ID, String(exportId));
  log('Export solicitado (id ' + exportId + ')');

  _aguardarEGravar(exportId);
}

// ---------- RETOMADA (gatilho temporário, quando o export demora) ----------
function continuarExport() {
  var props = PropertiesService.getScriptProperties();
  var exportId = props.getProperty(PROP_EXPORT_ID);
  _limparGatilhosTemporarios();

  if (!exportId) {
    log('ERRO: retomada sem export pendente.');
    return;
  }

  var tentativas = Number(props.getProperty(PROP_TENTATIVAS) || '0') + 1;
  props.setProperty(PROP_TENTATIVAS, String(tentativas));

  if (tentativas > MAX_RETENTATIVAS) {
    props.deleteProperty(PROP_EXPORT_ID);
    log('ERRO: export não ficou pronto após ' + MAX_RETENTATIVAS + ' tentativas. Abortado.');
    return;
  }

  log('Retomando verificação do export (tentativa ' + tentativas + ')');
  _aguardarEGravar(exportId);
}

// ---------- NÚCLEO ----------
function _aguardarEGravar(exportId) {
  var url = _esperarArquivo(exportId);

  if (!url) {
    // Ainda gerando: agenda uma retomada e encerra esta execução limpa.
    ScriptApp.newTrigger('continuarExport')
      .timeBased()
      .after(MINUTOS_PARA_RETENTAR * 60 * 1000)
      .create();
    log('Export ainda gerando — nova verificação em ' + MINUTOS_PARA_RETENTAR + ' min.');
    return;
  }

  var linhas = _gravarNaPlanilha(url);
  PropertiesService.getScriptProperties().deleteProperty(PROP_EXPORT_ID);
  log('OK: ' + linhas + ' linhas gravadas');
  _registrarLog(linhas);
}

/** Dispara a geração do export e devolve o id. */
function _pedirExport() {
  var q = 'mutation { exportPipeReport(input: {pipeId: ' + PIPE_ID +
          ', pipeReportId: ' + REPORT_ID + '}) { pipeReportExport { id state } } }';
  var d = _graphql(q);
  var exp = d.exportPipeReport && d.exportPipeReport.pipeReportExport;
  if (!exp || !exp.id) throw new Error('Pipefy não devolveu id de export: ' + JSON.stringify(d));
  return exp.id;
}

/**
 * Consulta o export até ficar pronto, gastando o mínimo de chamadas possível.
 * Devolve a URL do arquivo, ou null se ainda estiver gerando.
 */
function _esperarArquivo(exportId) {
  // Espera antes da PRIMEIRA consulta: sleep é grátis, consulta não é.
  Utilities.sleep(ESPERA_INICIAL_MS);

  for (var i = 0; i < MAX_CONSULTAS_POR_EXECUCAO; i++) {
    if (i > 0) Utilities.sleep(ESPERA_ENTRE_CONSULTAS_MS);

    var q = 'query { pipeReportExport(id: ' + exportId + ') { state fileURL } }';
    var exp = _graphql(q).pipeReportExport;
    var estado = String(exp && exp.state || '').toLowerCase();

    if (estado === 'done' && exp.fileURL) return exp.fileURL;
    if (estado === 'failed' || estado === 'error') {
      throw new Error('O Pipefy falhou ao gerar o export (state=' + estado + ').');
    }
  }
  return null; // ainda gerando
}

/** Baixa o .xlsx, converte pra Sheets e copia os valores pra aba destino.
 *  Este download é HTTPS direto no arquivo — NÃO gasta cota de API do Pipefy. */
function _gravarNaPlanilha(fileUrl) {
  var resp = UrlFetchApp.fetch(fileUrl, { muteHttpExceptions: true, followRedirects: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Download do arquivo falhou (HTTP ' + resp.getResponseCode() + ').');
  }

  // O Apps Script não lê .xlsx direto: converte pra uma planilha temporária.
  var blob = resp.getBlob().setName('pipefy-temp.xlsx');
  var temp = Drive.Files.create(
    { name: 'pipefy-temp-' + Utilities.getUuid(), mimeType: MimeType.GOOGLE_SHEETS },
    blob,
    { supportsAllDrives: true }
  );

  try {
    var origem = SpreadsheetApp.openById(temp.id).getSheets()[0];
    var valores = origem.getDataRange().getDisplayValues();
    if (!valores.length || !valores[0].length) throw new Error('Relatório veio vazio.');

    var destino = _prepararAba(valores.length, valores[0].length);
    destino.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
    SpreadsheetApp.flush();
    return valores.length - 1; // desconta o cabeçalho
  } finally {
    // Não deixa lixo no Drive, mesmo se a gravação falhar.
    try { DriveApp.getFileById(temp.id).setTrashed(true); } catch (e) {}
  }
}

/** Garante que a aba existe e cabe a matriz inteira (o relatório tem ~139 colunas). */
function _prepararAba(linhas, colunas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  /* Pelo gid primeiro: e o identificador que nao muda quando alguem renomeia a
     aba. O nome e so plano B, e criar e o ultimo recurso. */
  var sh = null;
  var abas = ss.getSheets();
  for (var i = 0; i < abas.length; i++) {
    if (abas[i].getSheetId() === GID_DESTINO) { sh = abas[i]; break; }
  }
  if (!sh) sh = ss.getSheetByName(ABA_DESTINO) || ss.insertSheet(ABA_DESTINO);
  sh.clearContents();

  if (sh.getMaxRows() < linhas) sh.insertRowsAfter(sh.getMaxRows(), linhas - sh.getMaxRows());
  if (sh.getMaxColumns() < colunas) sh.insertColumnsAfter(sh.getMaxColumns(), colunas - sh.getMaxColumns());
  return sh;
}

// ---------- APOIO ----------

/** Chamadas gastas nesta execução (o Pipefy conta 1 por requisição GraphQL). */
var _chamadas = 0;

function _graphql(query) {
  _chamadas++;
  _acumularNoMes(); // conta ANTES de enviar: rodada que falha também gastou cota
  var token = _obterToken();

  var resp = UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query: query }),
    muteHttpExceptions: true,
  });

  var codigo = resp.getResponseCode();
  var texto = resp.getContentText();

  if (codigo === 401 || codigo === 403) {
    // Mostra o que o Pipefy disse — a mensagem dele diz se é token inválido,
    // token de outra organização, ou falta de permissão de admin.
    throw new Error('Token rejeitado pelo Pipefy (HTTP ' + codigo + '). ' +
                    'Resposta: ' + texto.slice(0, 300));
  }
  if (codigo === 429) {
    throw new Error('Limite da API do Pipefy atingido (50 exports por pipe a cada 24h).');
  }
  if (codigo !== 200) throw new Error('Pipefy respondeu HTTP ' + codigo + ': ' + texto.slice(0, 300));

  var json = JSON.parse(texto);
  if (json.errors && json.errors.length) {
    throw new Error('Pipefy: ' + json.errors.map(function (e) { return e.message; }).join(' | '));
  }
  return json.data;
}

/**
 * Devolve um token de acesso válido, escolhendo o método pelas propriedades:
 *
 *   Service Account (recomendado) — se PIPEFY_CLIENT_ID/SECRET/TOKEN_URL existirem.
 *     Troca as credenciais por um token que expira; renova sozinho quando vence.
 *   PAT (legado) — se só PIPEFY_TOKEN existir.
 *     O Pipefy marcou os Personal Access Tokens como descontinuados; funciona
 *     hoje, mas pode ser desligado sem aviso. Migre quando puder.
 */
function _obterToken() {
  var p = PropertiesService.getScriptProperties();
  if (p.getProperty('PIPEFY_CLIENT_ID') && p.getProperty('PIPEFY_CLIENT_SECRET')) {
    return _tokenDeServiceAccount();
  }
  return _lerToken();
}

/**
 * Fluxo OAuth2 client_credentials. Guarda o token até pouco antes de vencer,
 * pra não pedir um novo a cada execução.
 */
function _tokenDeServiceAccount() {
  var p = PropertiesService.getScriptProperties();
  var agora = Date.now();

  // Reaproveita o token em cache enquanto faltar mais de 5 min pro vencimento.
  var cache = p.getProperty('sa_token');
  var vence = Number(p.getProperty('sa_token_vence') || '0');
  if (cache && vence - agora > 5 * 60 * 1000) return cache;

  var url = p.getProperty('PIPEFY_TOKEN_URL');
  if (!url) {
    throw new Error('Falta PIPEFY_TOKEN_URL (o "token endpoint" que o Pipefy mostrou ' +
                    'ao criar o Service Account).');
  }

  var resp = UrlFetchApp.fetch(url, {
    method: 'post',
    payload: {
      grant_type: 'client_credentials',
      client_id: p.getProperty('PIPEFY_CLIENT_ID'),
      client_secret: p.getProperty('PIPEFY_CLIENT_SECRET'),
    },
    muteHttpExceptions: true,
  });

  if (resp.getResponseCode() !== 200) {
    throw new Error('Service Account recusado (HTTP ' + resp.getResponseCode() + '): ' +
                    resp.getContentText().slice(0, 300));
  }

  var dados = JSON.parse(resp.getContentText());
  if (!dados.access_token) {
    throw new Error('Resposta sem access_token: ' + resp.getContentText().slice(0, 300));
  }

  p.setProperty('sa_token', dados.access_token);
  p.setProperty('sa_token_vence', String(agora + (Number(dados.expires_in) || 3600) * 1000));
  return dados.access_token;
}

/**
 * Lê o PAT e limpa os erros de cópia mais comuns: espaços/quebras de linha nas
 * pontas, aspas, e o prefixo "Bearer " (que o código já adiciona — colar de novo
 * vira "Bearer Bearer ..." e o Pipefy devolve 401).
 */
function _lerToken() {
  var bruto = PropertiesService.getScriptProperties().getProperty('PIPEFY_TOKEN');
  if (!bruto) {
    throw new Error('Falta credencial: configure PIPEFY_CLIENT_ID + PIPEFY_CLIENT_SECRET + ' +
                    'PIPEFY_TOKEN_URL (Service Account), ou PIPEFY_TOKEN (PAT, legado).');
  }
  return String(bruto)
    .replace(/^\s+|\s+$/g, '')
    .replace(/^["']|["']$/g, '')
    .replace(/^Bearer\s+/i, '')
    .replace(/\s/g, '');   // token não tem espaço no meio; se tiver, veio quebrado
}

/**
 * Diagnóstico do token — NÃO imprime o token, só o formato dele.
 * Use quando levar 401.
 */
function conferirToken() {
  var bruto = PropertiesService.getScriptProperties().getProperty('PIPEFY_TOKEN');
  if (!bruto) {
    log('❌ Propriedade PIPEFY_TOKEN não existe. Confira o nome (maiúsculas).');
    return;
  }

  var limpo = _lerToken();
  log('Tamanho salvo: ' + bruto.length + ' | depois da limpeza: ' + limpo.length);
  log('Começa com: ' + limpo.slice(0, 6) + '…  Termina com: …' + limpo.slice(-6));

  if (bruto.length !== limpo.length) {
    log('⚠️  Havia sujeira (espaço, aspas ou "Bearer") — o código já ignora isso.');
  }
  // Token do Pipefy é um JWT: três blocos separados por ponto.
  if (limpo.split('.').length !== 3) {
    log('❌ Não parece um token completo do Pipefy (deveria ter 3 partes separadas por ".").');
    log('   Provavelmente a cópia veio cortada. Gere um token novo e cole inteiro.');
  } else if (limpo.length < 200) {
    log('⚠️  Formato ok, mas curto pro padrão do Pipefy — pode estar truncado.');
  } else {
    log('✅ Formato do token parece correto.');
    log('   Se ainda der 401: o token foi revogado, ou seu usuário não é admin da organização.');
  }
}

/**
 * Abre o miolo do token (JWT) e mostra quem emitiu, quando foi criado e quando
 * expira. NÃO gasta chamada de API — o JWT é decodificado aqui mesmo.
 * Use quando o Pipefy responder "invalid_token".
 */
function decodificarToken() {
  var partes = _lerToken().split('.');
  if (partes.length !== 3) {
    log('❌ Não é um JWT válido — token veio cortado.');
    return;
  }

  var dados;
  try {
    var bytes = Utilities.base64DecodeWebSafe(partes[1]);
    dados = JSON.parse(Utilities.newBlob(bytes).getDataAsString());
  } catch (e) {
    log('❌ Não consegui ler o conteúdo do token: ' + e.message);
    return;
  }

  log('Emissor (iss): ' + (dados.iss || '—'));
  log('Aplicação (aud): ' + (dados.aud || '—'));
  log('Organização (orgId): ' + (dados.orgId || dados.organization_id || '—'));

  if (dados.iat) log('Criado em: ' + new Date(dados.iat * 1000).toISOString());

  if (dados.exp) {
    var expira = new Date(dados.exp * 1000);
    var vencido = expira < new Date();
    log((vencido ? '❌ EXPIROU em: ' : '✅ Expira em: ') + expira.toISOString());
    if (vencido) log('   → É essa a causa do invalid_token. Gere um token novo.');
  } else {
    log('✅ Sem data de expiração (é o esperado num token de acesso pessoal).');
  }
}

/**
 * Diagnóstico de autenticação: faz UMA chamada mínima e mostra a resposta crua
 * do Pipefy, sem os tratamentos de erro por cima. Use quando o 401 não fizer
 * sentido — a mensagem do servidor diz a causa real.
 * Custo: 1 chamada de API.
 */
function diagnosticarAuth() {
  var p = PropertiesService.getScriptProperties();
  var viaSA = !!(p.getProperty('PIPEFY_CLIENT_ID') && p.getProperty('PIPEFY_CLIENT_SECRET'));
  log('Método: ' + (viaSA ? 'Service Account (recomendado)' : 'PAT (legado, descontinuado)'));

  var token = _obterToken();

  var resp = UrlFetchApp.fetch(API_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ query: '{ me { name email } }' }),
    muteHttpExceptions: true,
  });

  log('HTTP ' + resp.getResponseCode());
  log('Resposta: ' + resp.getContentText().slice(0, 500));

  if (resp.getResponseCode() === 200) {
    log('✅ O token autentica. Se testarConexao falhar, o problema é acesso AO PIPE ' +
        PIPE_ID + ', não o token.');
  }
}

/**
 * Lista os pipes que este token enxerga, com os IDs.
 * Serve pra confirmar se o PIPE_ID configurado está na organização do token.
 * Custo: 1 chamada de API.
 */
function listarMeusPipes() {
  var d = _graphql('{ organizations { id name pipes { id name } } }');
  (d.organizations || []).forEach(function (org) {
    log('Organização ' + org.id + ' — ' + org.name);
    (org.pipes || []).forEach(function (p) {
      log('   pipe ' + p.id + ' — ' + p.name + (p.id == PIPE_ID ? '   <== o que queremos' : ''));
    });
  });
}

/**
 * Investiga por que o relatório mostra mais cards numa fase do que o pipe.
 * Pergunta ao Pipefy o estado real de alguns cards — em especial se estão
 * ARQUIVADOS, coisa que a exportação do relatório não informa em coluna nenhuma.
 *
 * Como usar: cole abaixo alguns "Código" tirados da aba Relatorio Pipefy que
 * estejam na fase suspeita. Custo: 1 chamada de API.
 */
var CARDS_PARA_INVESTIGAR = [
  '1314509408',
  '1310140190',
  '1290666299',
  '1290835544',
  '1246361647',
];

function investigarCards() {
  function montar(comArchived) {
    return '{ ' + CARDS_PARA_INVESTIGAR.map(function (id, i) {
      return 'c' + i + ': card(id: ' + id + ') { id title done ' +
             (comArchived ? 'archived ' : '') + 'current_phase { name } }';
    }).join(' ') + ' }';
  }

  // "archived" não está documentado; se o schema não tiver, refaz sem ele.
  var d;
  try {
    d = _graphql(montar(true));
  } catch (e) {
    if (!/archived/i.test(e.message)) throw e;
    log('(campo "archived" não existe no schema — consultando sem ele)');
    d = _graphql(montar(false));
  }

  var arquivados = 0;
  Object.keys(d).forEach(function (k) {
    var c = d[k];
    if (!c) { log('card não encontrado (' + k + ')'); return; }
    if (c.archived) arquivados++;
    log([
      c.id,
      'arquivado=' + c.archived,
      'done=' + c.done,
      'fase=' + (c.current_phase && c.current_phase.name),
      String(c.title).slice(0, 30),
    ].join('  |  '));
  });

  log('---');
  if (arquivados) {
    log('➡️  ' + arquivados + ' de ' + CARDS_PARA_INVESTIGAR.length + ' estão ARQUIVADOS.');
    log('   É a causa da diferença: o pipe esconde arquivados, o relatório não.');
    log('   Correção: no Pipefy, edite o relatório e exclua os cards arquivados.');
  } else {
    log('➡️  Nenhum arquivado. A diferença tem outra causa — veja os campos acima.');
  }
}

/** Remove gatilhos temporários de retomada (evita acúmulo — o limite é 20). */
function _limparGatilhosTemporarios() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'continuarExport') ScriptApp.deleteTrigger(t);
  });
}

/** Registra a rodada na aba Log, incluindo o gasto de cota do mês.
 *  A coluna "Chamadas no mês" existe porque o Pipefy não mostra esse consumo
 *  em lugar nenhum — e o teto (Business: 500/mês) é fácil de estourar sem ver. */
function _registrarLog(linhas) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(ABA_LOG) || ss.insertSheet(ABA_LOG);
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Quando', 'Linhas', 'Chamadas nesta rodada', 'Chamadas no mês']);
  }
  sh.appendRow([new Date(), linhas, _chamadas, _totalDoMes()]);
}

/** Soma +1 no contador do mês corrente; zera sozinho quando vira o mês. */
function _acumularNoMes() {
  var props = PropertiesService.getScriptProperties();
  var agora = new Date();
  var mes = agora.getFullYear() + '-' + (agora.getMonth() + 1);

  var total = props.getProperty('pipefy_mes') === mes
    ? Number(props.getProperty('pipefy_chamadas_mes') || '0') + 1
    : 1; // virou o mês: recomeça a contagem

  props.setProperty('pipefy_mes', mes);
  props.setProperty('pipefy_chamadas_mes', String(total));
}

function _totalDoMes() {
  return Number(PropertiesService.getScriptProperties()
    .getProperty('pipefy_chamadas_mes') || '0');
}

/** Quanto já gastei de cota neste mês? Rode quando quiser conferir (não gasta cota). */
function verConsumoDoMes() {
  var props = PropertiesService.getScriptProperties();
  log('Mês ' + (props.getProperty('pipefy_mes') || '—') + ': ' +
      _totalDoMes() + ' chamadas de API usadas.');
}

function log(m) {
  console.log(new Date().toISOString() + '  ' + m);
}

// ---------- INSTALAÇÃO (rode UMA vez, pelo menu do editor) ----------

/** Cria o gatilho diário das 9h. Rode uma vez e esqueça. */
function instalarGatilhoDiario() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'atualizarRelatorio') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('atualizarRelatorio').timeBased().atHour(9).everyDays(1).create();
  log('Gatilho diário das 9h instalado.');
}

/** Teste rápido: confirma que o token funciona e lista os relatórios do pipe. */
function testarConexao() {
  var d = _graphql('query { pipe(id: ' + PIPE_ID + ') { name reports { id name } } }');
  log('Pipe: ' + d.pipe.name);
  d.pipe.reports.forEach(function (r) {
    log('  relatório ' + r.id + ' — ' + r.name + (r.id == REPORT_ID ? '   <== em uso' : ''));
  });
}
