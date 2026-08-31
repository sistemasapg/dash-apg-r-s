import postgres from 'postgres';
import type { LinhaNormalizada, Snapshot, VagaSnapshot } from './types.ts';

/**
 * Conexão com o Postgres do Supabase.
 *
 * O dev server do Next recarrega os módulos a cada alteração e o Vercel reusa o
 * mesmo processo entre requisições; sem esse cache global abriríamos um pool
 * novo a cada vez e esgotaríamos as conexões do banco.
 */
const cache = globalThis as unknown as { __dashRsSql?: postgres.Sql };

/**
 * Schema onde as tabelas do dash moram. Permite conviver com outros sistemas no
 * mesmo projeto do Supabase sem misturar tabela com tabela.
 */
export const ESQUEMA = (process.env.DATABASE_SCHEMA ?? 'public').replace(/[^a-zA-Z0-9_]/g, '');

export function getSql(): postgres.Sql {
  if (cache.__dashRsSql) return cache.__dashRsSql;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      'DATABASE_URL não configurada. Copie a connection string do Supabase ' +
        '(Project Settings > Database > Connection pooling) para o .env.local.',
    );
  }

  const sql = postgres(url, {
    // Enviado no handshake da conexão, o que sobrevive ao pooler em modo
    // transação — diferente de um `SET search_path` avulso, que valeria só
    // até a transação seguinte trocar de conexão física.
    connection: { search_path: ESQUEMA },
    /*
      O pooler do Supabase (porta 6543) trabalha em modo transação e não
      sustenta prepared statements nomeados entre requisições. Sem isso a
      segunda chamada quebra com "prepared statement already exists".
    */
    prepare: false,
    ssl: 'require',
    // Funções serverless são muitas e curtas: pool pequeno por instância.
    max: 3,
    idle_timeout: 20,
    connect_timeout: 15,
    // Sem isso, cada "create table if not exists" despeja um NOTICE enorme no
    // console e afoga a saída útil dos scripts.
    onnotice: () => {},
  });

  cache.__dashRsSql = sql;
  return sql;
}

/** Dias de detalhe por candidato que ficam guardados. Antes disso, só agregado. */
export const DIAS_DETALHE = Number(process.env.DASH_DIAS_DETALHE ?? 45);

/** Cria o esquema. Idempotente — pode rodar quantas vezes quiser. */
export async function migrar(): Promise<void> {
  const sql = getSql();

  /*
    Precisa existir antes de qualquer CREATE TABLE: se o schema do search_path
    não existe, o Postgres não reclama — ele silenciosamente cria as tabelas no
    primeiro schema que encontrar, e o dash acabaria escrevendo no lugar errado.
  */
  await sql`create schema if not exists ${sql(ESQUEMA)}`;

  await sql`
    create table if not exists snapshot (
      id            serial primary key,
      data_ref      text not null unique,
      fonte         text not null default 'api',
      arquivo       text,
      importado_em  text not null,
      total_linhas  integer not null default 0
    )
  `;

  await sql`
    create table if not exists candidatura (
      id              bigserial primary key,
      snapshot_id     integer not null references snapshot(id) on delete cascade,
      chave           text not null,
      vaga_codigo     text not null,
      vaga_nome       text not null,
      etapa           text not null,
      etapa_funil     text,
      ordem_etapa     integer not null default 80,
      status          text,
      candidato_nome  text,
      candidato_email text,
      origem          text,
      recrutador      text,
      aplicou_em      text,
      atualizado_em   text,
      encerrado       smallint not null default 0
    )
  `;

  await sql`create index if not exists idx_cand_snapshot on candidatura (snapshot_id)`;
  await sql`create index if not exists idx_cand_vaga on candidatura (snapshot_id, vaga_codigo)`;
  await sql`create index if not exists idx_cand_chave on candidatura (snapshot_id, chave)`;
  await sql`create index if not exists idx_cand_chave_etapa on candidatura (chave, etapa)`;

  /*
    Contagens agregadas por dia/vaga/etapa. É o que sustenta os totais, o funil
    e a série histórica — algumas dezenas de linhas por dia, contra centenas ou
    milhares da tabela candidatura. Guardado para sempre, mesmo após compactar.

    A coluna `etapa` guarda a etapa do FUNIL: reprovados, desistentes e
    contratados vêm agrupados nas próprias fases, não na etapa em que estavam.
  */
  await sql`
    create table if not exists resumo_dia (
      snapshot_id  integer not null references snapshot(id) on delete cascade,
      data_ref     text not null,
      vaga_codigo  text not null,
      vaga_nome    text not null,
      etapa        text not null,
      ordem_etapa  integer not null,
      encerrado    smallint not null,
      total        integer not null
    )
  `;

  await sql`create index if not exists idx_resumo_snapshot on resumo_dia (snapshot_id)`;
  await sql`create index if not exists idx_resumo_vaga on resumo_dia (snapshot_id, vaga_codigo)`;

  /* A vaga em si no dia da foto: status, unidade, quando foi aberta. */
  await sql`
    create table if not exists vaga_dia (
      snapshot_id   integer not null references snapshot(id) on delete cascade,
      data_ref      text not null,
      vaga_codigo   text not null,
      vaga_nome     text not null,
      status        text,
      unidade       text,
      departamento  text,
      funcao        text,
      tipo          text,
      posicoes      integer,
      criada_em     text
    )
  `;

  await sql`create index if not exists idx_vagadia_snapshot on vaga_dia (snapshot_id)`;
  await sql`create index if not exists idx_vagadia_codigo on vaga_dia (snapshot_id, vaga_codigo)`;

  /*
    As vagas que o R&S abre no Pipefy, lançadas à mão nesta tela.

    Esta tabela é a única do dash que NÃO nasce de um snapshot: ela guarda
    trabalho digitado por gente, e por isso não tem `snapshot_id` nem entra no
    cascade que apaga uma foto. Apagar as fotos da Gupy não pode levar junto o
    cadastro que o time construiu.

    O vínculo com a Gupy é uma coluna solta (`vaga_codigo`), sem chave
    estrangeira de propósito: a vaga pode ser cadastrada no Pipefy antes de
    existir na Gupy, e continua valendo depois que a vaga sai do ar por lá.
  */
  await sql`
    create table if not exists vaga_pipefy (
      id             serial primary key,
      card_id        text not null unique,
      titulo         text not null,
      regional       text,
      unidade        text,
      aberta_em      text not null,
      fechada_em     text,
      situacao       text not null default 'aberta',
      vaga_codigo    text,
      observacao     text,
      criada_em      text not null,
      atualizada_em  text not null
    )
  `;

  /*
    Categoria e função chegaram depois da tabela existir, com vaga já cadastrada.
    Por isso entram como ALTER aditivo e aceitam nulo: a linha antiga não tem
    como saber sua categoria, e recusá-la agora apagaria trabalho do time. O
    formulário passa a exigir os campos daqui para frente, e a tela marca as
    vagas sem categoria — que é o convite para alguém completá-las.

    A categoria é o que define o SLA (`config/categorias.ts`); sem ela o dash
    não tem prazo a cobrar, e mostra a vaga sem SLA em vez de inventar um.
  */
  await sql`alter table vaga_pipefy add column if not exists categoria text`;
  await sql`alter table vaga_pipefy add column if not exists funcao text`;

  /*
    Um card corresponde a no máximo uma vaga da Gupy, e uma vaga da Gupy a no
    máximo um card. Índice parcial porque `null` (ainda sem vínculo) precisa
    poder se repetir — um `unique` comum já permitiria isso, mas o parcial deixa
    a intenção explícita e não indexa as linhas sem vínculo.
  */
  await sql`
    create unique index if not exists idx_pipefy_vaga
    on vaga_pipefy (vaga_codigo) where vaga_codigo is not null
  `;

  await sql`
    create table if not exists controle (
      chave text primary key,
      valor text not null
    )
  `;
}

export function hoje(): string {
  // Data local, não UTC: às 21h de Brasília o UTC já virou o dia seguinte.
  const agora = new Date();
  const off = agora.getTimezoneOffset() * 60000;
  return new Date(agora.getTime() - off).toISOString().slice(0, 10);
}

/** Colunas de candidatura na ordem usada na inserção em lote. */
const COLUNAS_CANDIDATURA = [
  'snapshot_id',
  'chave',
  'vaga_codigo',
  'vaga_nome',
  'etapa',
  'etapa_funil',
  'ordem_etapa',
  'status',
  'candidato_nome',
  'candidato_email',
  'origem',
  'recrutador',
  'aplicou_em',
  'atualizado_em',
  'encerrado',
] as const;

/*
  O Postgres aceita no máximo 65535 parâmetros por comando. Com 15 colunas por
  linha, mil linhas por lote deixa margem de sobra e mantém cada INSERT rápido.
*/
const LINHAS_POR_LOTE = 1000;

/**
 * Grava a foto de um dia. Reimportar a mesma data substitui a anterior — assim
 * rodar o sync duas vezes no mesmo dia não duplica nada.
 */
export async function salvarSnapshot(params: {
  dataRef: string;
  fonte: 'api' | 'demo';
  arquivo?: string | null;
  linhas: LinhaNormalizada[];
  vagas?: VagaSnapshot[];
}): Promise<{ snapshotId: number; substituiu: boolean }> {
  const sql = getSql();
  const { dataRef, fonte, arquivo = null, linhas, vagas = [] } = params;

  return sql.begin(async (tx) => {
    const anteriores = await tx<{ id: number }[]>`
      select id from snapshot where data_ref = ${dataRef}
    `;
    const substituiu = anteriores.length > 0;

    // O cascade cuida de candidatura, resumo_dia e vaga_dia.
    if (substituiu) {
      await tx`delete from snapshot where data_ref = ${dataRef}`;
    }

    const [criado] = await tx<{ id: number }[]>`
      insert into snapshot (data_ref, fonte, arquivo, importado_em, total_linhas)
      values (${dataRef}, ${fonte}, ${arquivo}, ${new Date().toISOString()}, ${linhas.length})
      returning id
    `;
    const snapshotId = criado.id;

    for (let i = 0; i < linhas.length; i += LINHAS_POR_LOTE) {
      const lote = linhas.slice(i, i + LINHAS_POR_LOTE).map((l) => ({
        snapshot_id: snapshotId,
        chave: l.chave,
        vaga_codigo: l.vaga_codigo,
        vaga_nome: l.vaga_nome,
        etapa: l.etapa,
        etapa_funil: l.etapa_funil,
        ordem_etapa: l.ordem_etapa,
        status: l.status,
        candidato_nome: l.candidato_nome,
        candidato_email: l.candidato_email,
        origem: l.origem,
        recrutador: l.recrutador,
        aplicou_em: l.aplicou_em,
        atualizado_em: l.atualizado_em,
        encerrado: l.encerrado,
      }));

      await tx`insert into candidatura ${tx(lote, ...COLUNAS_CANDIDATURA)}`;
    }

    await tx`
      insert into resumo_dia
        (snapshot_id, data_ref, vaga_codigo, vaga_nome, etapa, ordem_etapa, encerrado, total)
      select snapshot_id,
             ${dataRef},
             vaga_codigo,
             min(vaga_nome),
             coalesce(etapa_funil, etapa),
             min(ordem_etapa),
             encerrado,
             count(*)
      from candidatura
      where snapshot_id = ${snapshotId}
      group by snapshot_id, vaga_codigo, coalesce(etapa_funil, etapa), encerrado
    `;

    if (vagas.length > 0) {
      const lote = vagas.map((v) => ({
        snapshot_id: snapshotId,
        data_ref: dataRef,
        vaga_codigo: v.vaga_codigo,
        vaga_nome: v.vaga_nome,
        status: v.status,
        unidade: v.unidade,
        departamento: v.departamento,
        funcao: v.funcao,
        tipo: v.tipo,
        posicoes: v.posicoes,
        criada_em: v.criada_em,
      }));
      await tx`insert into vaga_dia ${tx(lote)}`;
    }

    return { snapshotId, substituiu };
  });
}

export async function listarSnapshots(): Promise<Snapshot[]> {
  const sql = getSql();
  const linhas = await sql<Snapshot[]>`
    select id, data_ref, fonte, arquivo, importado_em, total_linhas
    from snapshot
    order by data_ref desc
  `;
  return [...linhas];
}

/**
 * Joga fora o detalhe por candidato das fotos antigas, mantendo as contagens.
 *
 * Sem isso o banco cresce sem limite. As telas de total, funil e histórico
 * continuam funcionando para sempre porque leem `resumo_dia`; só as
 * movimentações nominais deixam de existir além da janela.
 */
export async function compactar(
  diasParaManter = DIAS_DETALHE,
): Promise<{ snapshotsCompactados: number; linhasRemovidas: number }> {
  const sql = getSql();

  const limite = new Date();
  limite.setDate(limite.getDate() - diasParaManter);
  const corte = new Date(limite.getTime() - limite.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

  return sql.begin(async (tx) => {
    const alvos = await tx<{ id: number }[]>`
      select s.id from snapshot s
      where s.data_ref < ${corte}
        and exists (select 1 from candidatura c where c.snapshot_id = s.id)
    `;

    if (alvos.length === 0) return { snapshotsCompactados: 0, linhasRemovidas: 0 };

    const ids = alvos.map((a) => a.id);
    const removidas = await tx`delete from candidatura where snapshot_id in ${tx(ids)}`;

    await tx`
      insert into controle (chave, valor) values ('detalhe_desde', ${corte})
      on conflict (chave) do update set valor = excluded.valor
    `;

    return { snapshotsCompactados: alvos.length, linhasRemovidas: removidas.count };
  });
}

/** Primeira data que ainda tem detalhe por candidato (para as movimentações). */
export async function detalheDesde(): Promise<string | null> {
  const sql = getSql();
  const [linha] = await sql<{ data: string | null }[]>`
    select min(s.data_ref) as data from snapshot s
    where exists (select 1 from candidatura c where c.snapshot_id = s.id)
  `;
  return linha?.data ?? null;
}

export async function apagarSnapshot(dataRef: string): Promise<void> {
  const sql = getSql();
  await sql`delete from snapshot where data_ref = ${dataRef}`;
}
