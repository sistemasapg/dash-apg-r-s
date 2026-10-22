/************************************************************
 * COLE ISTO no Apps Script da SUA planilha de destino.
 * (Extensões → Apps Script → apaga tudo → cola → Salvar)
 *
 * Ele cria um "endereço" (Web App) que recebe o relatório
 * do robô e escreve na aba ABA_DESTINO.
 *
 * SEGURANÇA: troque o valor de SEGREDO por qualquer frase
 * secreta sua. O MESMO valor vai no config.json do robô.
 ************************************************************/

var SEGREDO = '19f9887888686b55dc1ff2474379927d';
var ABA_DESTINO = 'pipefy_relatorio';
/* O gid da guia, tirado da URL da planilha. Procurar por gid e mais seguro que
   por nome: renomear a aba quebraria a busca por nome, e o gid nunca muda. */
var GID_DESTINO = 1135125070;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.secret !== SEGREDO) {
      return ContentService.createTextOutput('ERRO: segredo invalido');
    }

    var valores = Utilities.parseCsv(body.csv); // matriz linhas x colunas
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = null;
    var abas = ss.getSheets();
    for (var i = 0; i < abas.length; i++) {
      if (abas[i].getSheetId() === GID_DESTINO) { sh = abas[i]; break; }
    }
    if (!sh) sh = ss.getSheetByName(ABA_DESTINO) || ss.insertSheet(ABA_DESTINO);

    sh.clearContents();
    if (valores.length && valores[0].length) {
      sh.getRange(1, 1, valores.length, valores[0].length).setValues(valores);
    }

    // Log simples
    var logSh = ss.getSheetByName('log_relatorio') || ss.insertSheet('log_relatorio');
    if (logSh.getLastRow() === 0) logSh.appendRow(['Quando', 'Linhas']);
    logSh.appendRow([new Date(), valores.length - 1]);

    return ContentService.createTextOutput('OK: ' + (valores.length - 1) + ' linhas');
  } catch (err) {
    return ContentService.createTextOutput('ERRO: ' + err.message);
  }
}

// Opcional: pra testar direto no navegador que o Web App está no ar.
function doGet() {
  return ContentService.createTextOutput('Web App do relatorio Pipefy no ar.');
}
