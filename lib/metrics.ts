import type postgres from 'postgres';
import { getSql } from './db.ts';
import { SEM_COMPARACAO } from './consulta.ts';
import type {
  LinhaEtapa,
  LinhaVaga,
  Movimentacao,
  PontoSerie,
  Snapshot,
  VagaDetalhe,
} from './types.ts';

/*
  Nota sobre tipos: no Postgres, `count()` e `sum()` devolvem bigint, e o driver
  entrega bigint como STRING para não perder precisão. Por isso toda agregação
  aqui leva `::int` — sem o cast, "978" + 17 daria "97817" em vez de 995.
*/

export interface Comparacao {
  atual: Snapshot | null;
  anterior: Snapshot | null;
}

export async function snapshotPorData(dataRef: string): Promise<Snapshot | null> {
  const sql = getSql();
  const [linha] = await sql<Snapshot[]>`
    select id, data_ref, fonte, arquivo, importado_em, total_linhas
    from snapshot where data_ref = ${dataRef}
  `;
  return linha ?? null;
}

/**
 * Resolve o par a comparar. Sem parâmetros, usa a foto mais recente contra a
 * imediatamente anterior — que é a pergunta "quanto mudou de ontem pra hoje".
 * `dataAnterior === SEM_COMPARACAO` desliga a comparação de propósito.
 */
export async function resolverComparacao(
  dataAtual?: string,
  dataAnterior?: string,
): Promise<Comparacao> {
  const sql = getSql();
  const todos = await sql<Snapshot[]>`
    select id, data_ref, fonte, arquivo, importado_em, total_linhas
    from snapshot order by data_ref desc
  `;

  if (todos.length === 0) return { atual: null, anterior: null };

  const atual = (dataAtual && todos.find((s) => s.data_ref === dataAtual)) || todos[0];

  const anterior =
    dataAnterior === SEM_COMPARACAO
      ? null
      : dataAnterior
        ? (todos.find((s) => s.data_ref === dataAnterior) ?? null)
        : (todos.find((s) => s.data_ref < atual.data_ref) ?? null);

  return { atual, anterior };
}

interface Filtros {
  apenasAtivos?: boolean;
  /** Vazio ou ausente = todas as vagas. */
  vagas?: string[];
}

/** Snapshot inexistente vira -1, que não casa com nenhum id e zera as contagens. */
const NENHUM = -1;

const idAtual = (c: Comparacao) => c.atual?.id ?? NENHUM;
const idAnterior = (c: Comparacao) => c.anterior?.id ?? NENHUM;

/**
 * Condições comuns, montadas como fragmento de SQL. O alias entra no texto
 * porque `r.encerrado` é um caminho de coluna, não um identificador simples que
 * o driver saiba citar sozinho.
 */
function filtroResumo(sql: postgres.Sql, f: Filtros) {
  let frag = sql``;
  if (f.apenasAtivos) frag = sql`${frag} and r.encerrado = 0`;
  if (f.vagas && f.vagas.length > 0) frag = sql`${frag} and r.vaga_codigo in ${sql(f.vagas)}`;
  return frag;
}

function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null; // veio do zero: % não diz nada
  return ((atual - anterior) / anterior) * 100;
}

export interface Resumo {
  totalAtual: number;
  totalAnterior: number;
  delta: number;
  variacao: number | null;
  vagas: number;
  novosCandidatos: number;
  avancaram: number;
  encerraram: number;
  encerradosAtual: number;
}

export async function resumoGeral(comp: Comparacao, filtros: Filtros = {}): Promise<Resumo> {
  const sql = getSql();
  const cond = filtroResumo(sql, filtros);
  const a = idAtual(comp);
  const b = idAnterior(comp);

  const [totais] = await sql<{ atual: number; anterior: number; vagas: number }[]>`
    select
      coalesce(sum(case when r.snapshot_id = ${a} then r.total else 0 end), 0)::int as atual,
      coalesce(sum(case when r.snapshot_id = ${b} then r.total else 0 end), 0)::int as anterior,
      count(distinct case when r.snapshot_id = ${a} then r.vaga_codigo end)::int as vagas
    from resumo_dia r
    where r.snapshot_id in (${a}, ${b}) ${cond}
  `;

  const vagasFiltro =
    filtros.vagas && filtros.vagas.length > 0
      ? sql`and r.vaga_codigo in ${sql(filtros.vagas)}`
      : sql``;

  const [encerrados] = await sql<{ n: number }[]>`
    select coalesce(sum(r.total), 0)::int as n from resumo_dia r
    where r.snapshot_id = ${a} and r.encerrado = 1 ${vagasFiltro}
  `;

  const movs = await movimentacoes(comp, filtros);

  return {
    totalAtual: totais.atual,
    totalAnterior: totais.anterior,
    delta: totais.atual - totais.anterior,
    variacao: variacao(totais.atual, totais.anterior),
    vagas: totais.vagas,
    novosCandidatos: movs.filter((m) => m.tipo === 'novo').length,
    avancaram: movs.filter((m) => m.tipo === 'avancou').length,
    encerraram: movs.filter((m) => m.tipo === 'encerrou').length,
    encerradosAtual: encerrados.n,
  };
}

/** Uma linha por vaga: quanto tinha, quanto tem, e o que isso significa. */
export async function vagasComparadas(
  comp: Comparacao,
  filtros: Filtros = {},
): Promise<LinhaVaga[]> {
  const sql = getSql();
  const cond = filtroResumo(sql, filtros);
  const a = idAtual(comp);
  const b = idAnterior(comp);

  const linhas = await sql<
    { vaga_codigo: string; vaga_nome: string; atual: number; anterior: number }[]
  >`
    select
      r.vaga_codigo,
      coalesce(max(case when r.snapshot_id = ${a} then r.vaga_nome end), max(r.vaga_nome)) as vaga_nome,
      coalesce(sum(case when r.snapshot_id = ${a} then r.total else 0 end), 0)::int as atual,
      coalesce(sum(case when r.snapshot_id = ${b} then r.total else 0 end), 0)::int as anterior
    from resumo_dia r
    where r.snapshot_id in (${a}, ${b}) ${cond}
    group by r.vaga_codigo
  `;

  return linhas
    .map((l) => ({
      vaga_codigo: l.vaga_codigo,
      vaga_nome: l.vaga_nome,
      atual: l.atual,
      anterior: l.anterior,
      delta: l.atual - l.anterior,
      variacao: variacao(l.atual, l.anterior),
    }))
    .sort((x, y) => y.delta - x.delta || y.atual - x.atual);
}

/** O funil: quantos parados em cada etapa e como isso mudou. */
export async function funilPorEtapa(
  comp: Comparacao,
  filtros: Filtros = {},
): Promise<LinhaEtapa[]> {
  const sql = getSql();
  const cond = filtroResumo(sql, filtros);
  const a = idAtual(comp);
  const b = idAnterior(comp);

  const linhas = await sql<
    { etapa: string; ordem: number; atual: number; anterior: number }[]
  >`
    select
      r.etapa,
      min(r.ordem_etapa) as ordem,
      coalesce(sum(case when r.snapshot_id = ${a} then r.total else 0 end), 0)::int as atual,
      coalesce(sum(case when r.snapshot_id = ${b} then r.total else 0 end), 0)::int as anterior
    from resumo_dia r
    where r.snapshot_id in (${a}, ${b}) ${cond}
    group by r.etapa
    order by min(r.ordem_etapa), r.etapa
  `;

  return linhas.map((l) => ({
    etapa: l.etapa,
    ordem: l.ordem,
    atual: l.atual,
    anterior: l.anterior,
    delta: l.atual - l.anterior,
  }));
}

/** Série histórica de todas as fotos guardadas. */
export async function serieHistorica(filtros: Filtros = {}): Promise<PontoSerie[]> {
  const sql = getSql();
  const cond = filtroResumo(sql, filtros);

  const linhas = await sql<PontoSerie[]>`
    select s.data_ref, coalesce(sum(r.total), 0)::int as total
    from snapshot s
    left join resumo_dia r on r.snapshot_id = s.id ${cond}
    group by s.id, s.data_ref
    order by s.data_ref
  `;
  return [...linhas];
}

/** Dias entre duas datas ISO, sem cair na armadilha de fuso. */
function diasEntre(inicioISO: string, fimISO: string): number {
  const [a1, m1, d1] = inicioISO.split('-').map(Number);
  const [a2, m2, d2] = fimISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

/** Os dados da própria vaga na foto selecionada. */
export async function detalheVaga(
  comp: Comparacao,
  vagaCodigo: string,
): Promise<VagaDetalhe | null> {
  if (!comp.atual) return null;
  const sql = getSql();

  const [vaga] = await sql<VagaDetalhe[]>`
    select vaga_codigo, vaga_nome, status, unidade, departamento, funcao,
           tipo, posicoes, criada_em
    from vaga_dia
    where snapshot_id = ${comp.atual.id} and vaga_codigo = ${vagaCodigo}
    limit 1
  `;

  if (!vaga) return null;

  return {
    ...vaga,
    // Contado até a data da FOTO, não até hoje: assim uma foto de março
    // continua dizendo quantos dias a vaga tinha naquele março.
    diasAberta: vaga.criada_em ? diasEntre(vaga.criada_em, comp.atual.data_ref) : null,
  };
}

export interface CandidatoLinha {
  chave: string;
  candidato_nome: string | null;
  candidato_email: string | null;
  vaga_codigo: string;
  vaga_nome: string;
  etapa: string;
  ordem_etapa: number;
  status: string | null;
  origem: string | null;
  aplicou_em: string | null;
  atualizado_em: string | null;
  encerrado: number;
  /** Dias parado na etapa atual. Null quando não há como saber. */
  diasNaEtapa: number | null;
  /**
   * De onde veio o número: 'historico' é o dia em que o dash viu o candidato
   * mudar de etapa (exato); 'gupy' é a última alteração registrada na Gupy
   * (aproximado, porque qualquer edição da candidatura atualiza essa data).
   */
  origemDoTempo: 'historico' | 'gupy' | null;
}

type CandidatoBruto = Omit<CandidatoLinha, 'diasNaEtapa' | 'origemDoTempo'>;

/**
 * Lista nominal dos candidatos na foto selecionada. Aceita recorte por vaga e
 * por etapa — é o que sustenta o clique numa barra do funil.
 */
export async function listarCandidatos(
  comp: Comparacao,
  filtros: Filtros & { etapa?: string | null } = {},
): Promise<CandidatoLinha[]> {
  if (!comp.atual) return [];
  const sql = getSql();

  let cond = sql``;
  if (filtros.apenasAtivos) cond = sql`${cond} and c.encerrado = 0`;
  if (filtros.vagas && filtros.vagas.length > 0) {
    cond = sql`${cond} and c.vaga_codigo in ${sql(filtros.vagas)}`;
  }
  // Casa com a etapa do FUNIL, porque é nela que a pessoa clicou: pedir
  // "Reprovado" tem de trazer quem foi reprovado em qualquer etapa.
  if (filtros.etapa) {
    cond = sql`${cond} and coalesce(c.etapa_funil, c.etapa) = ${filtros.etapa}`;
  }

  const linhas = await sql<CandidatoBruto[]>`
    select c.chave, c.candidato_nome, c.candidato_email, c.vaga_codigo, c.vaga_nome,
           c.etapa, c.ordem_etapa, c.status, c.origem, c.aplicou_em,
           c.atualizado_em, c.encerrado
    from candidatura c
    where c.snapshot_id = ${comp.atual.id} ${cond}
    order by c.ordem_etapa desc, c.candidato_nome
  `;

  const mudancas = await ultimaMudancaDeEtapa(comp.atual);
  const dataDaFoto = comp.atual.data_ref;

  return linhas.map((l) => {
    // O histórico é a fonte exata: se o dash viu o candidato em outra etapa em
    // alguma foto anterior, sabemos o dia em que ele entrou na etapa atual.
    const mudouEm = mudancas.get(l.chave);
    if (mudouEm) {
      return { ...l, diasNaEtapa: diasEntre(mudouEm, dataDaFoto), origemDoTempo: 'historico' };
    }
    // Sem histórico suficiente, a última alteração na Gupy é a melhor pista.
    if (l.atualizado_em) {
      return {
        ...l,
        diasNaEtapa: diasEntre(l.atualizado_em, dataDaFoto),
        origemDoTempo: 'gupy',
      };
    }
    return { ...l, diasNaEtapa: null, origemDoTempo: null };
  });
}

/**
 * Para cada candidato, a data mais recente em que ele apareceu numa etapa
 * DIFERENTE da atual. É o momento em que ele entrou na etapa onde está hoje.
 */
async function ultimaMudancaDeEtapa(atual: Snapshot): Promise<Map<string, string>> {
  const sql = getSql();
  const linhas = await sql<{ chave: string; mudou_em: string }[]>`
    select a.chave, max(s.data_ref) as mudou_em
    from candidatura a
    join candidatura b on b.chave = a.chave and b.etapa <> a.etapa
    join snapshot s on s.id = b.snapshot_id and s.data_ref < ${atual.data_ref}
    where a.snapshot_id = ${atual.id}
    group by a.chave
  `;
  return new Map(linhas.map((l) => [l.chave, l.mudou_em]));
}

/**
 * Quem entrou, quem andou no funil e quem saiu entre as duas fotos.
 * É aqui que o dash deixa de ser "número subiu" e vira "isso aconteceu".
 */
export async function movimentacoes(
  comp: Comparacao,
  filtros: Filtros = {},
): Promise<Movimentacao[]> {
  if (!comp.atual) return [];
  const sql = getSql();
  const a = comp.atual.id;
  const b = idAnterior(comp);

  const vagas = filtros.vagas ?? [];
  const filtroA = vagas.length > 0 ? sql`and a.vaga_codigo in ${sql(vagas)}` : sql``;
  const filtroB = vagas.length > 0 ? sql`and b.vaga_codigo in ${sql(vagas)}` : sql``;

  const atuais = await sql<
    {
      chave: string;
      candidato_nome: string | null;
      vaga_codigo: string;
      vaga_nome: string;
      para: string;
      ordem_para: number;
      encerrado_agora: number;
      de: string | null;
      ordem_de: number | null;
      encerrado_antes: number | null;
    }[]
  >`
    select a.chave, a.candidato_nome, a.vaga_codigo, a.vaga_nome,
           a.etapa as para, a.ordem_etapa as ordem_para, a.encerrado as encerrado_agora,
           b.etapa as de,   b.ordem_etapa as ordem_de,   b.encerrado as encerrado_antes
    from candidatura a
    left join candidatura b on b.snapshot_id = ${b} and b.chave = a.chave
    where a.snapshot_id = ${a} ${filtroA}
  `;

  const saidas = comp.anterior
    ? await sql<
        {
          chave: string;
          candidato_nome: string | null;
          vaga_codigo: string;
          vaga_nome: string;
          de: string;
        }[]
      >`
        select b.chave, b.candidato_nome, b.vaga_codigo, b.vaga_nome, b.etapa as de
        from candidatura b
        left join candidatura a on a.snapshot_id = ${a} and a.chave = b.chave
        where b.snapshot_id = ${b} and a.id is null ${filtroB}
      `
    : [];

  const saida: Movimentacao[] = [];

  for (const l of atuais) {
    const base = {
      chave: l.chave,
      candidato_nome: l.candidato_nome,
      vaga_codigo: l.vaga_codigo,
      vaga_nome: l.vaga_nome,
    };

    // Sem foto anterior não dá para dizer que alguém é novo — seria o cadastro inteiro.
    if (l.de === null) {
      if (comp.anterior) saida.push({ ...base, tipo: 'novo', de: null, para: l.para });
      continue;
    }

    // Sair do funil (reprovado, desistente, contratado) sobe a ordem da etapa,
    // mas não é "avançou" — precisa ser contado à parte.
    if (l.encerrado_agora === 1 && l.encerrado_antes === 0) {
      saida.push({ ...base, tipo: 'encerrou', de: l.de, para: l.para });
    } else if (l.ordem_para > (l.ordem_de ?? 0)) {
      saida.push({ ...base, tipo: 'avancou', de: l.de, para: l.para });
    } else if (l.ordem_para < (l.ordem_de ?? 0)) {
      saida.push({ ...base, tipo: 'voltou', de: l.de, para: l.para });
    }
  }

  for (const l of saidas) {
    saida.push({
      chave: l.chave,
      candidato_nome: l.candidato_nome,
      vaga_codigo: l.vaga_codigo,
      vaga_nome: l.vaga_nome,
      tipo: 'saiu',
      de: l.de,
      para: null,
    });
  }

  return saida;
}

/**
 * As movimentações nominais dependem do detalhe por candidato, que a compactação
 * remove depois de alguns meses. Aqui a tela descobre se ainda dá para mostrar.
 */
export async function temDetalhe(snapshot: Snapshot | null): Promise<boolean> {
  if (!snapshot) return false;
  const sql = getSql();
  const linhas = await sql`
    select 1 from candidatura where snapshot_id = ${snapshot.id} limit 1
  `;
  return linhas.length > 0;
}

export async function nomeDaVaga(comp: Comparacao, vagaCodigo: string): Promise<string> {
  const sql = getSql();
  const [linha] = await sql<{ vaga_nome: string }[]>`
    select vaga_nome from resumo_dia
    where vaga_codigo = ${vagaCodigo}
      and snapshot_id in (${idAtual(comp)}, ${idAnterior(comp)})
    order by snapshot_id desc limit 1
  `;
  return linha?.vaga_nome ?? vagaCodigo;
}
