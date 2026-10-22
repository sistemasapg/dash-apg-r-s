import { getSql } from './db.ts';
import { CATEGORIAS } from '../config/categorias.ts';
import { ETAPAS, etapaConta, type Dono } from '../config/etapas-pipefy.ts';

/**
 * Os prazos de SLA, guardados no banco em vez de escritos no código.
 *
 * Antes viviam em `config/categorias.ts` e `config/etapas-pipefy.ts`. Mudar um
 * número exigia alguém editar o repositório e publicar — aconteceu três vezes
 * só em 21/10/2026, e nenhuma delas era decisão técnica. Prazo é combinação do
 * R&S com as áreas; o código não deveria ser o cartório disso.
 *
 * COMO OS VALORES SE RESOLVEM
 *
 * O banco manda. Onde ele não tem linha, vale o que está no arquivo de
 * configuração — que passa a ser a SEMENTE, o valor com que o sistema nasce, e
 * não mais a verdade corrente. É isso que permite ligar a tela sem precisar
 * migrar nada: no primeiro acesso tudo aparece com os prazos de hoje, e o que
 * for alterado passa a vir do banco.
 */

/** Quanto tempo o mapa vale antes de ser relido. */
const VALIDADE_MS = 60 * 1000;

/**
 * Os três tipos de prazo que o sistema reconhece.
 *
 * `categoria` é a régua do **R&S**: quanto tempo o recrutamento tem para
 * entregar a vaga, por categoria de cargo. Medida sobre o tempo que foi do
 * R&S, não sobre o total.
 *
 * `time` é a régua do **DP**: quanto tempo ele tem em CADA fase sua. Um número
 * só para o time inteiro, e não um por fase — o DP tem sete fases, e manter
 * sete números seria pedir sete decisões para medir uma coisa só.
 *
 * `etapa` permite exceção: uma fase específica com prazo diferente do time
 * dela. Existe para quando alguém precisar, e hoje não está exposta na tela.
 */
export type Escopo = 'categoria' | 'etapa' | 'time';

export interface Prazo {
  escopo: Escopo;
  chave: string;
  /** `null` = sem prazo acordado. Diferente de zero. */
  diasUteis: number | null;
  observacao: string | null;
  atualizadoEm: string | null;
  atualizadoPor: string | null;
  /** O valor veio do banco, ou ainda é o que estava no código? */
  daSemente: boolean;
}

interface Linha {
  escopo: string;
  chave: string;
  dias_uteis: number | null;
  observacao: string | null;
  atualizado_em: string;
  atualizado_por: string | null;
}

let cache: { em: number; mapa: Map<string, number | null> } | null = null;

const id = (escopo: Escopo, chave: string) => `${escopo}:${chave}`;

/**
 * Carrega os prazos do banco para a memória.
 *
 * Precisa ser chamado antes de `prazoDaCategoria` e `prazoDaEtapa`, que são
 * síncronas de propósito: elas são usadas em laços sobre milhares de vagas e em
 * componentes de tela, onde um `await` por chamada seria caro e contagioso.
 *
 * Se o banco estiver fora do ar, o mapa fica vazio e tudo cai na semente. É o
 * comportamento que se quer: o dash continua medindo com os prazos de ontem em
 * vez de parar de medir.
 */
export async function carregarPrazos(): Promise<void> {
  if (cache && Date.now() - cache.em < VALIDADE_MS) return;

  try {
    const sql = getSql();
    const linhas = await sql<Linha[]>`select escopo, chave, dias_uteis from prazo`;
    cache = {
      em: Date.now(),
      mapa: new Map(linhas.map((l) => [id(l.escopo as Escopo, l.chave), l.dias_uteis])),
    };
  } catch {
    // Sem banco, a semente responde — e a tela de prazos avisa que não leu.
    cache = { em: Date.now(), mapa: new Map() };
  }
}

/** Esquece o que está em memória. Chamado depois de salvar. */
export function esquecerPrazos(): void {
  cache = null;
}

function resolver(escopo: Escopo, chave: string, semente: number | null): number | null {
  const mapa = cache?.mapa;
  if (!mapa) return semente;
  return mapa.has(id(escopo, chave)) ? (mapa.get(id(escopo, chave)) ?? null) : semente;
}

/** O prazo para fechar uma vaga desta categoria, em dias úteis. */
export function prazoDaCategoria(categoria: string | null): number | null {
  if (!categoria) return null;
  return resolver('categoria', categoria, CATEGORIAS[categoria]?.slaDiasUteis ?? null);
}

/** O prazo para sair desta etapa, em dias úteis. */
export function prazoDaEtapa(etapa: string): number | null {
  return resolver('etapa', etapa, ETAPAS[etapa]?.slaDiasUteis ?? null);
}

/**
 * Quantos dias úteis o DP tem em cada fase sua.
 *
 * A semente é 2, acordada com o R&S em 20/10/2026. Vale por FASE: o DP tem
 * sete, e cobrar 2 dias do conjunto reprovaria quatro em cada cinco vagas —
 * medido em 21/10/2026, dava 18% no prazo. Por fase, o número aponta onde o
 * processo trava em vez de só dizer que travou.
 */
export const PRAZO_DP_SEMENTE = 2;

export function prazoDoDp(): number | null {
  return resolver('time', 'DP', PRAZO_DP_SEMENTE);
}

/**
 * O prazo que vale para uma fase, resolvendo a hierarquia.
 *
 * Exceção da fase primeiro, prazo do time depois. O R&S fica de fora porque a
 * régua dele não é por fase: é o prazo da categoria sobre o tempo total dele.
 */
export function prazoDaFase(fase: string, dono: Dono): number | null {
  const excecao = cache?.mapa.get(id('etapa', fase));
  if (excecao !== undefined) return excecao;
  const daConfig = ETAPAS[fase]?.slaDiasUteis;
  if (daConfig !== null && daConfig !== undefined) return daConfig;
  return dono === 'DP' ? prazoDoDp() : null;
}

/**
 * Os prazos de etapa num objeto simples, para mandar ao navegador.
 *
 * Existe porque as contas de gargalo rodam no cliente, e o cliente não pode
 * importar nada que chegue ao driver do Postgres — bastou `lib/gargalos.ts`
 * importar este arquivo para o bundle tentar resolver `net` e a página inteira
 * quebrar. O servidor resolve os prazos e manda o resultado; é dado, não
 * dependência.
 *
 * Chame depois de `carregarPrazos()`, senão sai só a semente.
 */
export function mapaDeEtapas(): Record<string, number | null> {
  const saida: Record<string, number | null> = {};
  for (const etapa of Object.keys(ETAPAS)) saida[etapa] = prazoDaEtapa(etapa);
  return saida;
}

/* ------------------------------------------------------------------------ */
/* Para a tela de edição                                                      */
/* ------------------------------------------------------------------------ */

export interface ListaDePrazos {
  categorias: Prazo[];
  /** O prazo do DP por fase. Um só, para o time inteiro. */
  dp: Prazo;
  etapas: (Prazo & { dono: Dono })[];
  /** O banco respondeu? Quando não, a tela mostra os valores do código. */
  leuDoBanco: boolean;
}

/**
 * Tudo o que a tela de prazos precisa, já casado com a semente.
 *
 * Lista as categorias e as etapas que EXISTEM no sistema, não as que estão no
 * banco: uma etapa nova no Pipefy precisa aparecer aqui para alguém poder lhe
 * dar prazo, e ela nunca teria linha gravada.
 */
export async function lerPrazos(): Promise<ListaDePrazos> {
  let gravados = new Map<string, Linha>();
  let leuDoBanco = true;

  try {
    const sql = getSql();
    const linhas = await sql<Linha[]>`
      select escopo, chave, dias_uteis, observacao, atualizado_em, atualizado_por from prazo
    `;
    gravados = new Map(linhas.map((l) => [id(l.escopo as Escopo, l.chave), l]));
  } catch {
    leuDoBanco = false;
  }

  const montar = (escopo: Escopo, chave: string, semente: number | null): Prazo => {
    const g = gravados.get(id(escopo, chave));
    return {
      escopo,
      chave,
      diasUteis: g ? g.dias_uteis : semente,
      observacao: g?.observacao ?? null,
      atualizadoEm: g?.atualizado_em ?? null,
      atualizadoPor: g?.atualizado_por ?? null,
      daSemente: !g,
    };
  };

  const categorias = Object.entries(CATEGORIAS)
    .map(([nome, c]) => montar('categoria', nome, c.slaDiasUteis))
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'));

  /*
    Só as etapas com responsável. Cobrar prazo de "Vaga Cancelada" ou da
    aprovação do diretor regional não faz sentido — ninguém está esperando
    nada ali, e oferecer o campo convidaria a preenchê-lo.
  */
  const etapas = Object.entries(ETAPAS)
    .filter(([nome]) => etapaConta(nome))
    .map(([nome, e]) => ({ ...montar('etapa', nome, e.slaDiasUteis), dono: e.dono }))
    .sort((a, b) => a.dono.localeCompare(b.dono) || a.chave.localeCompare(b.chave, 'pt-BR'));

  return { categorias, dp: montar('time', 'DP', PRAZO_DP_SEMENTE), etapas, leuDoBanco };
}

/**
 * Grava um prazo. `diasUteis` nulo significa "sem prazo acordado".
 *
 * Guarda quem mudou e quando, porque prazo é combinação entre áreas: daqui a
 * três meses alguém vai perguntar de onde saiu o número, e a resposta precisa
 * estar ao lado dele.
 */
export async function salvarPrazo(entrada: {
  escopo: Escopo;
  chave: string;
  diasUteis: number | null;
  observacao: string | null;
  por: string | null;
}): Promise<void> {
  const sql = getSql();
  await sql`
    insert into prazo (escopo, chave, dias_uteis, observacao, atualizado_em, atualizado_por)
    values (
      ${entrada.escopo}, ${entrada.chave}, ${entrada.diasUteis},
      ${entrada.observacao}, ${new Date().toISOString()}, ${entrada.por}
    )
    on conflict (escopo, chave) do update set
      dias_uteis     = excluded.dias_uteis,
      observacao     = excluded.observacao,
      atualizado_em  = excluded.atualizado_em,
      atualizado_por = excluded.atualizado_por
  `;
  esquecerPrazos();
}

/** Devolve o prazo ao valor que está no código. */
export async function restaurarPrazo(escopo: Escopo, chave: string): Promise<void> {
  const sql = getSql();
  await sql`delete from prazo where escopo = ${escopo} and chave = ${chave}`;
  esquecerPrazos();
}
