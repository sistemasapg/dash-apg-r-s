/**
 * Leitura da planilha "R&S _ BASE", onde o Apps Script espelha o pipe do Pipefy
 * todo dia às 6h46 de Brasília.
 *
 * O dash lê o CSV público da aba — sem OAuth, sem conta de serviço, sem token
 * do Google para guardar. A planilha já está compartilhada por link, e isso é
 * requisito: se alguém restringir o compartilhamento, o sync passa a falhar.
 *
 * Por que planilha e não a API do Pipefy direto: o Apps Script já roda há
 * semanas sem falha e é o que o time enxerga e consegue depurar sozinho.
 * Trocá-lo por uma chamada daqui seria substituir algo que funciona por algo
 * equivalente. O `lib/pipefy-api.ts` segue existindo para diagnóstico.
 */

const PLANILHA = process.env.PIPEFY_PLANILHA_ID ?? '1pt8sHmP-VQiP7K-jAXXA0TbeWOG1VT2exKZGecplYjg';

/** A aba `pipefy_cards`. O gid é da aba, não da planilha. */
const ABA = process.env.PIPEFY_PLANILHA_GID ?? '712920160';

/**
 * Cache das abas já lidas, por gid, com validade curta.
 *
 * Quatro telas leem a mesma aba, e cada uma baixava e parseava 2,4 MB de CSV
 * por carregamento — 1,6 segundo em cada visita, repetidos a cada navegação
 * entre telas. O dado muda uma vez por dia, de manhã; relê-lo a cada clique
 * nunca produziu uma informação mais nova, só espera.
 *
 * Dois minutos é curto o bastante para uma carga manual aparecer quase na hora
 * (e `esquecerCache()` resolve o resto), e longo o bastante para cobrir uma
 * sessão de navegação entre as telas.
 */
const VALIDADE_MS = 2 * 60 * 1000;
const cache = new Map<string, { em: number; linhas: LinhaPlanilha[] }>();

export class ErroPlanilha extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErroPlanilha';
  }
}

/**
 * Parser de CSV que respeita aspas.
 *
 * `split('\n')` não serve: 2.253 cards produzem 2.687 linhas de arquivo, porque
 * campos de texto do Pipefy ("Motivo da Substituição", observações) têm quebra
 * de linha dentro. Partir por linha física cortaria esses cards ao meio e o
 * resto da planilha entraria deslocado.
 */
function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let entreAspas = false;

  // O BOM que o Google às vezes manda estragaria o nome da primeira coluna.
  const t = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];

    if (entreAspas) {
      if (c === '"') {
        // Aspas duplicadas ("") são uma aspa literal dentro do campo.
        if (t[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          entreAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') entreAspas = true;
    else if (c === ',') {
      linha.push(campo);
      campo = '';
    } else if (c === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }

  // A última linha costuma vir sem quebra no fim.
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  return linhas;
}

/** De qual aba ler, e qual coluna prova que é a aba certa. */
export interface OpcoesLeitura {
  gid?: string;
  colunaChave?: string;
}

/** Uma linha da planilha, acessível pelo NOME da coluna. */
export type LinhaPlanilha = Record<string, string>;

/**
 * Baixa a aba e devolve as linhas indexadas por nome de coluna.
 *
 * Nome, e nunca posição: o Apps Script escreve uma coluna por campo do Pipefy,
 * em ordem alfabética. Um campo novo no formulário desloca todas as colunas à
 * direita dele — e um leitor por posição passaria a ler categoria no lugar de
 * cargo, sem erro nenhum, só com o dado errado.
 */
export async function lerCardsDaPlanilha(opcoes: OpcoesLeitura = {}): Promise<LinhaPlanilha[]> {
  /*
    A planilha tem duas abas úteis, com vocabulários diferentes: `pipefy_cards`
    chama a identidade de `card_id`, e o relatório exportado chama de `Código`.
    Por isso a coluna-chave é parâmetro — ela serve para confirmar que a aba
    lida é a esperada, e sem isso um gid errado passaria batido.
  */
  const gid = opcoes.gid ?? ABA;
  const chave = opcoes.colunaChave ?? 'card_id';

  const emCache = cache.get(gid);
  if (emCache && Date.now() - emCache.em < VALIDADE_MS) return emCache.linhas;

  const url = `https://docs.google.com/spreadsheets/d/${PLANILHA}/export?format=csv&gid=${gid}`;

  let resposta: Response;
  try {
    resposta = await fetch(url, { cache: 'no-store', redirect: 'follow' });
  } catch (erro) {
    throw new ErroPlanilha(`Falha de rede ao baixar a planilha: ${(erro as Error).message}`);
  }

  if (!resposta.ok) {
    const dica =
      resposta.status === 404
        ? ' — confira o ID da planilha e o gid da aba.'
        : ' — a planilha precisa estar compartilhada como "qualquer pessoa com o link pode ver".';
    throw new ErroPlanilha(`O Google respondeu ${resposta.status} ao baixar a planilha${dica}`);
  }

  const texto = await resposta.text();

  /*
    Sem compartilhamento, o Google responde 200 com uma página de login em HTML.
    Sem esta checagem o parser leria o HTML como CSV e devolveria lixo — e um
    sync feito em cima disso apagaria o cadastro achando que o pipe esvaziou.
  */
  if (texto.trimStart().startsWith('<')) {
    throw new ErroPlanilha(
      'O Google devolveu HTML em vez de CSV: a planilha deixou de ser pública. ' +
        'Compartilhe como "qualquer pessoa com o link pode ver".',
    );
  }

  const linhas = lerCsv(texto);
  if (linhas.length < 2) throw new ErroPlanilha('A planilha veio vazia.');

  const cabecalho = linhas[0].map((c) => c.trim());
  if (!cabecalho.includes(chave)) {
    throw new ErroPlanilha(
      `A aba ${gid} não tem a coluna "${chave}". ` +
        `Colunas lidas: ${cabecalho.slice(0, 5).join(', ')}...`,
    );
  }

  const cards = linhas.slice(1).flatMap((valores) => {
    // Linha sem a coluna-chave é resto de célula vazia no fim da planilha.
    const id = (valores[cabecalho.indexOf(chave)] ?? '').trim();
    if (!id) return [];

    const linha: LinhaPlanilha = {};
    cabecalho.forEach((nome, i) => {
      linha[nome] = (valores[i] ?? '').trim();
    });
    return [linha];
  });

  cache.set(gid, { em: Date.now(), linhas: cards });
  return cards;
}

/** Descarta o cache — use depois de mandar uma carga nova para a planilha. */
export function esquecerCache(): void {
  cache.clear();
}

/** Quantas horas de idade o dado pode ter antes de a tela avisar. */
const HORAS_ATE_AVISAR = 30;

export interface IdadeDoRelatorio {
  /** Quando o robô escreveu na planilha pela última vez. */
  carregadoEm: string | null;
  horas: number | null;
  /** Passou do tolerado — a tela deve avisar. */
  velho: boolean;
  /** Não deu para ler o log. Sem isso, não há como afirmar nada. */
  desconhecido: boolean;
}

/**
 * Há quanto tempo o relatório foi carregado — não lido.
 *
 * A distinção é o ponto. As telas mostravam "lido em 22/10 às 01h", que é a
 * hora em que o DASH leu a planilha, e isso é sempre agora. Se o robô parar, a
 * tela continua dizendo "lido agora" enquanto serve dado de semanas atrás: uma
 * falha silenciosa, do tipo que ninguém percebe até tomar uma decisão errada.
 *
 * A aba `log_relatorio` guarda uma linha por carga. É dela que sai a idade de
 * verdade.
 *
 * 30 horas de tolerância, e não 24: a rodada é diária, então a janela precisa
 * caber um atraso normal sem gritar. Um dia pulado passa das 30.
 */
export async function idadeDoRelatorio(): Promise<IdadeDoRelatorio> {
  const url =
    `https://docs.google.com/spreadsheets/d/${PLANILHA}` +
    `/gviz/tq?tqx=out:csv&sheet=log_relatorio`;

  try {
    const resposta = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    if (!resposta.ok) throw new Error(String(resposta.status));

    const linhas = (await resposta.text()).trim().split('\n');
    const ultima = linhas.at(-1) ?? '';
    const quando = ultima.match(/^"(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})"/);
    if (!quando) throw new Error('log sem data reconhecível');

    const [, d, m, a, h, min, s] = quando;
    // O log grava no fuso de Brasília; -03:00 o torna comparável com agora.
    const carregado = new Date(`${a}-${m}-${d}T${h}:${min}:${s}-03:00`);
    const horas = (Date.now() - carregado.getTime()) / 3_600_000;

    return {
      carregadoEm: carregado.toISOString(),
      horas,
      velho: horas > HORAS_ATE_AVISAR,
      desconhecido: false,
    };
  } catch {
    /*
      Sem o log não dá para afirmar que o dado está velho — nem que está novo.
      Devolve `desconhecido` para a tela poder dizer isso em vez de inventar.
    */
    return { carregadoEm: null, horas: null, velho: false, desconhecido: true };
  }
}

/**
 * Campos de lista do Pipefy chegam como JSON: `["SÃO JOSE DOS PINHAIS"]`.
 * Devolve o primeiro valor, ou o texto cru quando não for JSON.
 */
export function primeiroValor(bruto: string | undefined): string {
  const v = (bruto ?? '').trim();
  if (!v) return '';
  try {
    const arr = JSON.parse(v) as unknown;
    if (Array.isArray(arr)) return String(arr[0] ?? '').trim();
  } catch {
    /* não era JSON: segue com o texto cru */
  }
  return v;
}
