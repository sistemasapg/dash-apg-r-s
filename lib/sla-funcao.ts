import { lerCardsDaPlanilha, primeiroValor, type LinhaPlanilha } from './planilha.ts';
import { carregarPrazos, prazoDaCategoria } from './prazos.ts';
import { CATEGORIA_DO_PIPEFY, DESDE, unidadeDoPipefy } from '../config/pipefy.ts';
import { REGIONAIS } from '../config/unidades.ts';
import {
  MINIMO_PARA_CONFIAR,
  SEM_CARGO,
  slaDaFuncao,
  temPrazoProprio,
} from '../config/sla-funcao.ts';
import { diasUteisEntre, hojeEmBrasilia, soAData } from './uteis.ts';

/**
 * SLA por função: quanto cada cargo demora para fechar, contra o prazo dele.
 *
 * Mede a régua que já está escrita em `config/categorias.ts` — dias úteis de
 * `Criado em` até `Finalizado em`, na contagem D+1 — e não inventa uma segunda.
 * O que muda em relação ao painel de SLA da aba "Vagas R&S" é só o eixo: lá o
 * recorte é regional, unidade e categoria; aqui é a função.
 *
 * A função vem do cargo escrito no card, no vocabulário do Pipefy. A categoria
 * vem do campo "Categoria do Cargo:" do próprio Pipefy, e não da lista de
 * funções do dash — o Pipefy já classifica PAEE, Pedagogo SAREH e os
 * Coordenadores como Técnico Pedagógico, então ler dele evita refazer à mão uma
 * classificação que já existe.
 */

const GID = process.env.PIPEFY_RELATORIO_GID ?? '1135125070';
const CHAVE = 'Código';

/** Os três campos onde o Pipefy guarda o cargo, um por tipo de vaga. */
const COLUNAS_DE_CARGO = ['Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:'];

// Reexportado do config para a tela poder importá-lo sem puxar o banco junto.
export { SEM_CARGO } from '../config/sla-funcao.ts';

export interface VagaMedida {
  cardId: string;
  funcao: string;
  categoria: string | null;
  regional: string | null;
  escola: string | null;
  criadoEm: string;
  /** Vazio quando a vaga ainda está aberta. */
  finalizadoEm: string;
  /** Dias úteis de `criadoEm` até o fim — ou até hoje, se está aberta. */
  diasUteis: number;
  fechada: boolean;
}

export interface ResumoFuncao {
  funcao: string;
  /** A categoria da função. `null` se os cards dela divergem entre categorias. */
  categoria: string | null;
  /** Quando os cards da mesma função vêm classificados em categorias diferentes. */
  categoriasEmConflito: string[];
  /** O prazo em vigor, em dias úteis. `null` sem régua combinada. */
  sla: number | null;
  /** O prazo é exceção da função, em vez de herdado da categoria? */
  prazoProprio: boolean;

  /** Vagas fechadas no recorte — é com elas que se mede desempenho. */
  fechadas: number;
  /** Mediana de dias úteis das fechadas. `null` sem nenhuma fechada. */
  medianaFechadas: number | null;
  /** A pior das fechadas. */
  piorFechada: number | null;
  /** Quantas fecharam dentro do prazo. `null` sem prazo. */
  dentroDoPrazo: number | null;
  /** Fração de 0 a 1 das fechadas dentro do prazo. `null` sem prazo ou sem fechadas. */
  aderencia: number | null;

  /** Vagas ainda abertas no recorte. */
  abertas: number;
  /** Abertas que já passaram do prazo. `null` sem prazo. */
  abertasAtrasadas: number | null;
  /** A aberta que está há mais tempo na rua. */
  piorAberta: number | null;

  /** Total de cards da função no recorte. */
  total: number;
  /**
   * A leitura tem base estreita: poucas vagas fechadas para a mediana sustentar
   * uma decisão. O número aparece de todo jeito, marcado.
   */
  baseEstreita: boolean;
}

function cargoDa(linha: LinhaPlanilha): string {
  for (const c of COLUNAS_DE_CARGO) {
    const v = primeiroValor(linha[c]);
    if (v) return v;
  }
  return '';
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function medir(linha: LinhaPlanilha, hoje: string): VagaMedida | null {
  const criadoEm = soAData(linha['Criado em']);
  if (!criadoEm) return null;

  const finalizadoEm = soAData(linha['Finalizado em']);
  const categoriaPipefy = primeiroValor(linha['Categoria do Cargo:']);
  const { regional, escola } = unidadeDoPipefy(
    primeiroValor(linha['Unidade da APG onde a vaga será aberta']),
    REGIONAIS,
  );

  return {
    cardId: (linha[CHAVE] ?? '').trim(),
    funcao: cargoDa(linha) || SEM_CARGO,
    categoria: CATEGORIA_DO_PIPEFY[categoriaPipefy] ?? null,
    regional,
    escola,
    criadoEm,
    finalizadoEm,
    diasUteis: diasUteisEntre(criadoEm, finalizadoEm || hoje),
    fechada: Boolean(finalizadoEm),
  };
}

export interface ResultadoSlaFuncao {
  resumos: ResumoFuncao[];
  vagas: VagaMedida[];
  /** Data de corte do recorte. */
  desde: string;
  /** Cards no relatório, antes do corte por data. */
  totalNoPipe: number;
  lidoEm: string;
}

/**
 * O desempenho de cada função, da que mais estoura o prazo para a que menos.
 *
 * Recorta por `DESDE` (`config/pipefy.ts`) pela mesma razão que o resto do
 * painel: antes dessa data o pipe era usado de outro jeito, e misturar os dois
 * períodos produziria médias que não descrevem nenhum dos dois.
 *
 * Ordena por ADERÊNCIA, não por volume: a função que fecha 1 de 4 no prazo é o
 * que precisa de decisão, mesmo tendo poucos cards. Quem não tem nenhuma vaga
 * fechada vai para o fim, porque sobre ela ainda não há o que concluir.
 */
export async function lerSlaPorFuncao(): Promise<ResultadoSlaFuncao> {
  // Os prazos vêm do banco; sem isto as telas cairiam na semente do código.
  await carregarPrazos();
  const linhas = await lerCardsDaPlanilha({ gid: GID, colunaChave: CHAVE });
  const hoje = hojeEmBrasilia();

  const vagas = linhas
    .flatMap((l) => {
      const v = medir(l, hoje);
      return v ? [v] : [];
    })
    .filter((v) => v.criadoEm >= DESDE);

  const grupos = new Map<string, VagaMedida[]>();
  for (const v of vagas) {
    const atual = grupos.get(v.funcao);
    if (atual) atual.push(v);
    else grupos.set(v.funcao, [v]);
  }

  const resumos = [...grupos.entries()].map(([funcao, lista]) => {
    /*
      A mesma função pode vir classificada em categorias diferentes entre cards
      — PSICÓLOGO e NUTRICIONISTA já apareceram em duas. Nesse caso não há um
      prazo único a aplicar, e a tela precisa mostrar o conflito em vez de
      escolher uma delas no silêncio.
    */
    const categorias = [...new Set(lista.map((v) => v.categoria).filter(Boolean))] as string[];
    const categoria = categorias.length === 1 ? categorias[0] : null;
    const sla = slaDaFuncao(funcao, categoria, prazoDaCategoria);

    const fechadas = lista.filter((v) => v.fechada).map((v) => v.diasUteis);
    const abertas = lista.filter((v) => !v.fechada).map((v) => v.diasUteis);

    const dentroDoPrazo = sla === null ? null : fechadas.filter((d) => d <= sla).length;

    return {
      funcao,
      categoria,
      categoriasEmConflito: categorias.length > 1 ? categorias.sort() : [],
      sla,
      prazoProprio: temPrazoProprio(funcao),

      fechadas: fechadas.length,
      medianaFechadas: mediana(fechadas),
      piorFechada: fechadas.length ? Math.max(...fechadas) : null,
      dentroDoPrazo,
      aderencia:
        dentroDoPrazo === null || fechadas.length === 0 ? null : dentroDoPrazo / fechadas.length,

      abertas: abertas.length,
      abertasAtrasadas: sla === null ? null : abertas.filter((d) => d > sla).length,
      piorAberta: abertas.length ? Math.max(...abertas) : null,

      total: lista.length,
      baseEstreita: fechadas.length > 0 && fechadas.length < MINIMO_PARA_CONFIAR,
    } satisfies ResumoFuncao;
  });

  resumos.sort((a, b) => {
    // Sem fechadas não há aderência a comparar; essas vão para o fim.
    const aa = a.aderencia ?? Infinity;
    const ba = b.aderencia ?? Infinity;
    return aa - ba || b.total - a.total || a.funcao.localeCompare(b.funcao, 'pt-BR');
  });

  return { resumos, vagas, desde: DESDE, totalNoPipe: linhas.length, lidoEm: new Date().toISOString() };
}

export interface TotalGeral {
  funcoes: number;
  cards: number;
  fechadas: number;
  abertas: number;
  /** Fechadas dentro do prazo, somando só as funções que têm prazo. */
  dentroDoPrazo: number;
  /** Fechadas que tinham prazo a cumprir — o denominador da aderência. */
  comPrazo: number;
  aderencia: number | null;
  abertasAtrasadas: number;
}

/** O número de cima: aderência geral no recorte. */
export function totalizar(resumos: ResumoFuncao[]): TotalGeral {
  let dentroDoPrazo = 0;
  let comPrazo = 0;
  let fechadas = 0;
  let abertas = 0;
  let abertasAtrasadas = 0;
  let cards = 0;

  for (const r of resumos) {
    cards += r.total;
    fechadas += r.fechadas;
    abertas += r.abertas;
    if (r.dentroDoPrazo !== null) {
      dentroDoPrazo += r.dentroDoPrazo;
      comPrazo += r.fechadas;
    }
    abertasAtrasadas += r.abertasAtrasadas ?? 0;
  }

  return {
    funcoes: resumos.length,
    cards,
    fechadas,
    abertas,
    dentroDoPrazo,
    comPrazo,
    aderencia: comPrazo === 0 ? null : dentroDoPrazo / comPrazo,
    abertasAtrasadas,
  };
}
