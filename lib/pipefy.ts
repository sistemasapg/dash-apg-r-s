import { getSql } from './db.ts';
import { slaDaCategoria } from '../config/categorias.ts';
import { calcularSla, type Sla } from './uteis.ts';
import type { VagaPipefy, VagaPipefyComNumeros } from './types.ts';
import type { Comparacao } from './metrics.ts';

/**
 * As vagas abertas no Pipefy, lançadas à mão pelo R&S.
 *
 * Este arquivo é o lado "vaga" do dash; `metrics.ts` é o lado "candidato". A
 * ponte entre os dois é `vaga_codigo`: o código da vaga na Gupy, escolhido pelo
 * time numa lista quando ele amarra o card à publicação.
 */

export const SITUACOES = ['aberta', 'fechada', 'cancelada'] as const;
export type Situacao = (typeof SITUACOES)[number];

/** Dias entre duas datas ISO, sem cair na armadilha de fuso. */
function diasEntre(inicioISO: string, fimISO: string): number {
  const [a1, m1, d1] = inicioISO.split('-').map(Number);
  const [a2, m2, d2] = fimISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function hojeLocal(): string {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

export async function listarVagasPipefy(): Promise<VagaPipefy[]> {
  const sql = getSql();
  const linhas = await sql<VagaPipefy[]>`
    select id, card_id, titulo, categoria, funcao, regional, unidade, aberta_em,
           fechada_em, situacao, vaga_codigo, observacao, criada_em, atualizada_em
    from vaga_pipefy
    order by aberta_em desc, id desc
  `;
  return [...linhas];
}

/**
 * Os cards do R&S que apontam para uma vaga da Gupy.
 *
 * Devolve lista, e não um só: a publicação é por cidade e os cards são por
 * unidade, então "Professor de Matemática | Curitiba" costuma atender várias
 * escolas ao mesmo tempo. Mostrar só o primeiro esconderia as demais.
 *
 * Abertas primeiro, e entre elas a mais antiga no topo — é a ordem de quem
 * precisa de atenção.
 */
export async function cardsPipefyPorCodigoGupy(
  vagaCodigo: string,
): Promise<VagaPipefy[]> {
  const sql = getSql();
  const linhas = await sql<VagaPipefy[]>`
    select id, card_id, titulo, categoria, funcao, regional, unidade, aberta_em,
           fechada_em, situacao, vaga_codigo, observacao, criada_em, atualizada_em
    from vaga_pipefy
    where vaga_codigo = ${vagaCodigo}
    order by (situacao <> 'aberta'), aberta_em, id
  `;
  return [...linhas];
}

export interface EntradaVagaPipefy {
  card_id: string;
  titulo: string;
  categoria: string | null;
  funcao: string | null;
  regional: string | null;
  unidade: string | null;
  aberta_em: string;
  fechada_em: string | null;
  situacao: Situacao;
  vaga_codigo: string | null;
  observacao: string | null;
}

/**
 * Grava a vaga. Reenviar o mesmo `card_id` atualiza a linha existente em vez de
 * recusar: o time lança o card cedo, com o que sabe, e volta depois para
 * amarrar a vaga da Gupy e fechar. Recusar o segundo envio transformaria o
 * fluxo normal do R&S num erro.
 */
export async function salvarVagaPipefy(entrada: EntradaVagaPipefy): Promise<void> {
  const sql = getSql();
  const agora = new Date().toISOString();

  await sql`
    insert into vaga_pipefy
      (card_id, titulo, categoria, funcao, regional, unidade, aberta_em, fechada_em,
       situacao, vaga_codigo, observacao, criada_em, atualizada_em)
    values
      (${entrada.card_id}, ${entrada.titulo}, ${entrada.categoria}, ${entrada.funcao},
       ${entrada.regional}, ${entrada.unidade},
       ${entrada.aberta_em}, ${entrada.fechada_em}, ${entrada.situacao},
       ${entrada.vaga_codigo}, ${entrada.observacao}, ${agora}, ${agora})
    on conflict (card_id) do update set
      titulo        = excluded.titulo,
      categoria     = excluded.categoria,
      funcao        = excluded.funcao,
      regional      = excluded.regional,
      unidade       = excluded.unidade,
      aberta_em     = excluded.aberta_em,
      fechada_em    = excluded.fechada_em,
      situacao      = excluded.situacao,
      vaga_codigo   = excluded.vaga_codigo,
      observacao    = excluded.observacao,
      atualizada_em = excluded.atualizada_em
  `;
}

export async function apagarVagaPipefy(cardId: string): Promise<void> {
  const sql = getSql();
  await sql`delete from vaga_pipefy where card_id = ${cardId}`;
}

/** Snapshot inexistente vira -1, que não casa com nenhum id e zera as contagens. */
const NENHUM = -1;

/**
 * As vagas do Pipefy com os números da Gupy grudados: quantos candidatos a vaga
 * vinculada tem hoje, quantos tinha na foto anterior e quantos já encerraram.
 *
 * O join é `left`: vaga sem vínculo continua na lista, com os números em branco
 * — é justamente a lista que o R&S precisa ver para ir amarrando.
 */
export async function vagasPipefyComNumeros(
  comp: Comparacao,
): Promise<VagaPipefyComNumeros[]> {
  const sql = getSql();
  const a = comp.atual?.id ?? NENHUM;
  const b = comp.anterior?.id ?? NENHUM;

  const linhas = await sql<
    (VagaPipefy & {
      gupy_nome: string | null;
      candidatos: number | null;
      candidatos_antes: number | null;
      encerrados: number | null;
    })[]
  >`
    select p.id, p.card_id, p.titulo, p.categoria, p.funcao, p.regional, p.unidade, p.aberta_em,
           p.fechada_em, p.situacao, p.vaga_codigo, p.observacao,
           p.criada_em, p.atualizada_em,
           g.vaga_nome        as gupy_nome,
           g.atual            as candidatos,
           g.anterior         as candidatos_antes,
           g.encerrados       as encerrados
    from vaga_pipefy p
    left join (
      select r.vaga_codigo,
             max(case when r.snapshot_id = ${a} then r.vaga_nome end) as vaga_nome,
             coalesce(sum(case when r.snapshot_id = ${a} then r.total else 0 end), 0)::int as atual,
             coalesce(sum(case when r.snapshot_id = ${b} then r.total else 0 end), 0)::int as anterior,
             coalesce(sum(case when r.snapshot_id = ${a} and r.encerrado = 1
                               then r.total else 0 end), 0)::int as encerrados
      from resumo_dia r
      where r.snapshot_id in (${a}, ${b})
      group by r.vaga_codigo
    ) g on g.vaga_codigo = p.vaga_codigo
    order by p.situacao, p.aberta_em, p.id
  `;

  const hoje = hojeLocal();

  return linhas.map((l) => ({
    id: l.id,
    card_id: l.card_id,
    titulo: l.titulo,
    categoria: l.categoria,
    funcao: l.funcao,
    regional: l.regional,
    unidade: l.unidade,
    aberta_em: l.aberta_em,
    fechada_em: l.fechada_em,
    situacao: l.situacao,
    vaga_codigo: l.vaga_codigo,
    observacao: l.observacao,
    criada_em: l.criada_em,
    atualizada_em: l.atualizada_em,
    /*
      Vaga aberta conta até hoje; vaga fechada congela no dia do fechamento.
      Sem esse congelamento, uma vaga fechada em março continuaria "engordando"
      e a média de tempo de preenchimento subiria sozinha todo dia.
    */
    dias: diasEntre(l.aberta_em, l.fechada_em ?? hoje),
    /*
      O SLA anda em dias ÚTEIS e a coluna "dias" em dias corridos — os dois
      convivem de propósito. O corrido responde "há quanto tempo essa vaga está
      na rua", que é o que o gestor pergunta; o útil responde "o R&S estourou o
      prazo?", que é o que o SLA cobra. Um mesmo número não serve para as duas.

      Vaga cancelada não é julgada: ninguém deixou de cumprir prazo de uma vaga
      que a própria APG tirou do ar.
    */
    sla:
      l.situacao === 'cancelada'
        ? null
        : calcularSla(
            l.aberta_em,
            slaDaCategoria(l.categoria),
            l.situacao === 'aberta' ? null : l.fechada_em,
            hoje,
          ),
    gupy_nome: l.gupy_nome,
    candidatos: l.vaga_codigo ? (l.candidatos ?? 0) : null,
    candidatosAntes: l.vaga_codigo ? (l.candidatos_antes ?? 0) : null,
    encerrados: l.vaga_codigo ? (l.encerrados ?? 0) : null,
  }));
}
