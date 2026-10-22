import { lerCardsDaPlanilha, primeiroValor, type LinhaPlanilha } from './planilha.ts';
import {
  CATEGORIA_DO_PIPEFY,
  COLUNAS,
  DESDE,
  PRECISA_DE_GUPY,
  situacaoDaFase,
  unidadeDoPipefy,
} from '../config/pipefy.ts';
import { REGIONAIS } from '../config/unidades.ts';
import { slaDaCategoria } from '../config/categorias.ts';
import { calcularSla, type Sla } from './uteis.ts';

/**
 * Traduz a planilha do Pipefy para o vocabulário do dash — sem gravar nada.
 *
 * É uma SIMULAÇÃO de propósito: a tela lê a planilha ao vivo e calcula na hora.
 * Enquanto o de-para não estiver confirmado pelo R&S, gravar seria pior do que
 * não gravar — um card classificado errado viraria uma vaga errada no cadastro
 * que o time usa de verdade, e desfazer isso é mais trabalhoso do que não ter
 * feito.
 *
 * Quando os números baterem, o mesmo código vira o sync: troca-se o "devolver
 * para a tela" por "gravar em vaga_pipefy", preservando o vínculo com a Gupy.
 */

export interface VagaSimulada {
  cardId: string;
  /** Montado de cargo + unidade: o título do card é o nome da escola. */
  nome: string;
  cargo: string;
  categoria: string | null;
  /** O que o Pipefy diz, para conferir o de-para na tela. */
  categoriaPipefy: string;
  fase: string;
  situacao: 'aberta' | 'fechada' | 'cancelada';
  regional: string | null;
  escola: string | null;
  abertaEm: string;
  fechadaEm: string | null;
  /** Dias corridos, que é a leitura do gestor. */
  dias: number;
  sla: Sla | null;
  /** A vaga passa pela Gupy, ou é preenchida sem divulgação? */
  vaiParaGupy: boolean;
  formaPreenchimento: string;
}

/**
 * Data de São Paulo a partir do carimbo UTC do Pipefy.
 *
 * `2026-10-09T01:03:14Z` é 08/10 às 22h em Brasília. Cortar os dez primeiros
 * caracteres daria 09/10 — um dia a mais, e o SLA começaria atrasado. São 98
 * cards criados entre 00h e 03h UTC, então não é caso de borda raro.
 */
function dataDeBrasilia(carimbo: string): string {
  const t = (carimbo ?? '').trim();
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return t.slice(0, 10);

  // en-CA devolve YYYY-MM-DD, que é o formato que o resto do dash usa.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d);
}

function diasCorridos(inicio: string, fim: string): number {
  const [a1, m1, d1] = inicio.split('-').map(Number);
  const [a2, m2, d2] = fim.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function hojeEmBrasilia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function cargoDaLinha(linha: LinhaPlanilha): string {
  for (const coluna of COLUNAS.cargos) {
    const v = primeiroValor(linha[coluna]);
    if (v) return v;
  }
  return '';
}

function converter(linha: LinhaPlanilha, hoje: string): VagaSimulada | null {
  const cardId = (linha[COLUNAS.cardId] ?? '').trim();
  const abertaEm = dataDeBrasilia(linha[COLUNAS.criadoEm]);
  if (!cardId || !abertaEm) return null;

  const fase = (linha[COLUNAS.fase] ?? '').trim();
  const situacao = situacaoDaFase(fase);
  const fechadaBruta = dataDeBrasilia(linha[COLUNAS.finalizadoEm]);
  const fechadaEm = fechadaBruta || null;

  const categoriaPipefy = primeiroValor(linha[COLUNAS.categoria]);
  const categoria = CATEGORIA_DO_PIPEFY[categoriaPipefy] ?? null;
  const { regional, escola } = unidadeDoPipefy(primeiroValor(linha[COLUNAS.unidade]), REGIONAIS);

  const cargo = cargoDaLinha(linha);
  const disciplina = primeiroValor(linha[COLUNAS.disciplina]);

  /*
    O título do card é o nome da escola em 209 de 209 cards — usá-lo cru deixaria
    a coluna "Vaga" com o mesmo texto repetido, sem dizer qual é a vaga. O que
    identifica é o cargo; a disciplina separa um professor do outro.

    Jovem Aprendiz e Estagiário não preenchem cargo (232 de 236 cards), e isso é
    o certo: para eles a categoria JÁ é o cargo. Então a categoria entra no lugar
    — "Jovem Aprendiz" diz o que a vaga é; "Vaga sem cargo" não dizia nada.
  */
  const nome =
    [cargo, disciplina].filter(Boolean).join(' · ') ||
    categoriaPipefy ||
    `Card ${cardId}`;

  /*
    Vaga cancelada não é cobrada de prazo: ninguém deixou de cumprir SLA de uma
    vaga que a própria APG tirou do ar.

    Vaga fechada sem data de fechamento é o furo conhecido: ela está numa fase
    de admissão (documentação, exame, benefícios), onde a seleção já acabou mas
    o card ainda não saiu do pipe. Sem a data, medir até hoje inventaria atraso
    que não existe — então fica sem SLA e a tela diz por quê.
  */
  const sla =
    situacao === 'cancelada' || (situacao === 'fechada' && !fechadaEm)
      ? null
      : calcularSla(abertaEm, slaDaCategoria(categoria), fechadaEm, hoje);

  const forma = primeiroValor(linha[COLUNAS.formaPreenchimento]);

  return {
    cardId,
    nome,
    cargo,
    categoria,
    categoriaPipefy,
    fase,
    situacao,
    regional,
    escola,
    abertaEm,
    fechadaEm,
    dias: diasCorridos(abertaEm, fechadaEm ?? hoje),
    sla,
    vaiParaGupy: forma === PRECISA_DE_GUPY,
    formaPreenchimento: forma,
  };
}

export interface ResultadoSimulacao {
  vagas: VagaSimulada[];
  /** Quantos cards a planilha tem no total, antes do recorte. */
  totalNoPipe: number;
  lidoEm: string;
}

/**
 * Lê a planilha e devolve as vagas do recorte, já com SLA calculado.
 *
 * O recorte é "tudo que está aberto hoje, mais o histórico desde `DESDE`".
 * Só por data, 68 vagas abertas antigas sumiriam — e são justamente as mais
 * atrasadas, que são as que alguém deveria estar vendo.
 */
export async function simularPipefy(): Promise<ResultadoSimulacao> {
  const linhas = await lerCardsDaPlanilha();
  const hoje = hojeEmBrasilia();

  const vagas = linhas
    .flatMap((l) => {
      const v = converter(l, hoje);
      return v ? [v] : [];
    })
    .filter((v) => v.situacao === 'aberta' || v.abertaEm >= DESDE)
    .sort((a, b) => {
      // Menos folga de prazo primeiro: é quem precisa de ação hoje.
      const fa = a.sla?.saldo ?? Infinity;
      const fb = b.sla?.saldo ?? Infinity;
      return fa - fb || b.dias - a.dias;
    });

  return { vagas, totalNoPipe: linhas.length, lidoEm: new Date().toISOString() };
}
