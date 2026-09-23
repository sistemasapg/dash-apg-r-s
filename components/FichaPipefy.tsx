import Link from 'next/link';
import type { VagaPipefy } from '@/lib/types';
import { dataLonga, numero } from '@/lib/format';
import { slaDaCategoria } from '@/config/categorias';
import { calcularSla, type SituacaoSla } from '@/lib/uteis';
import { rotuloRegional } from '@/config/unidades';

function corSla(situacao: SituacaoSla): string {
  switch (situacao) {
    case 'atrasada':
    case 'estourado':
      return 'text-[var(--baixa)]';
    case 'vence-hoje':
      return 'text-[var(--atencao)]';
    case 'cumprido':
      return 'text-[var(--alta)]';
    default:
      return '';
  }
}

/** Dias entre duas datas ISO, sem cair na armadilha de fuso. */
function diasEntre(inicioISO: string, fimISO: string): number {
  const [a1, m1, d1] = inicioISO.split('-').map(Number);
  const [a2, m2, d2] = fimISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

const ROTULO_SITUACAO: Record<string, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
};

/**
 * Os cards do R&S que esta publicação da Gupy atende.
 *
 * A Gupy publica por CIDADE e o R&S abre um card por UNIDADE, então uma
 * publicação costuma servir a várias escolas ao mesmo tempo — e os candidatos
 * dela são um pool que elas dividem. É uma tabela, e não uma ficha de campos,
 * porque o normal aqui é ter mais de uma linha.
 */
export function FichaPipefy({ cards, hoje }: { cards: VagaPipefy[]; hoje: string }) {
  const abertos = cards.filter((c) => c.situacao === 'aberta').length;

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda p-5">
        <div>
          <h2 className="text-sm font-semibold">
            {cards.length === 1 ? 'A vaga no R&S' : `${numero(cards.length)} vagas no R&S`}
          </h2>
          {cards.length > 1 && (
            <p className="mt-0.5 text-xs text-ink-muted">
              Esta publicação é por cidade e atende {numero(cards.length)} unidades
              {abertos > 0 && ` (${numero(abertos)} ainda em aberto)`}. Os candidatos
              abaixo são um pool compartilhado entre elas.
            </p>
          )}
        </div>
        <Link href="/pipefy" className="text-xs text-ink-2 underline-offset-2 hover:underline">
          ver todas as vagas do R&amp;S
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-4 py-2 text-left font-medium">Card</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Regional / escola</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Categoria</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Aberta em</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Prazo (SLA)</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((vaga) => {
              const aberta = vaga.situacao === 'aberta';
              const dias = diasEntre(vaga.aberta_em, vaga.fechada_em ?? hoje);

              // Vaga cancelada não é cobrada de prazo: ninguém deixou de cumprir
              // SLA de uma vaga que a própria APG tirou do ar.
              const sla =
                vaga.situacao === 'cancelada'
                  ? null
                  : calcularSla(
                      vaga.aberta_em,
                      slaDaCategoria(vaga.categoria),
                      aberta ? null : vaga.fechada_em,
                      hoje,
                    );

              return (
                <tr key={vaga.card_id} className="border-b border-borda last:border-0 align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{vaga.titulo}</div>
                    <div className="num text-xs text-ink-muted">card {vaga.card_id}</div>
                    {vaga.observacao && (
                      <div className="mt-1 max-w-[20rem] text-xs text-ink-2">{vaga.observacao}</div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <div>{rotuloRegional(vaga.regional) || <span className="text-ink-muted">—</span>}</div>
                    <div className="text-ink-muted">{vaga.unidade ?? 'toda a regional'}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {vaga.categoria ? (
                      <>
                        <div>{vaga.categoria.replace(/^Vagas /, '')}</div>
                        {vaga.funcao && <div className="text-ink-muted">{vaga.funcao}</div>}
                      </>
                    ) : (
                      <span className="text-[var(--atencao)]">sem categoria</span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-xs whitespace-nowrap">
                    {dataLonga(vaga.aberta_em)}
                    <div className="text-ink-muted">
                      {numero(dias)} dias corridos · {ROTULO_SITUACAO[vaga.situacao]}
                    </div>
                    {vaga.fechada_em && (
                      <div className="text-ink-muted">em {dataLonga(vaga.fechada_em)}</div>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                    {sla ? (
                      <span className={corSla(sla.situacao)}>
                        <span className="font-medium">
                          {numero(sla.decorridos)} / {numero(sla.prazo)}
                        </span>
                        <div className="text-xs">
                          {sla.saldo < 0
                            ? `${numero(-sla.saldo)} de atraso`
                            : sla.saldo === 0
                              ? 'vence hoje'
                              : `faltam ${numero(sla.saldo)}`}
                        </div>
                      </span>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {vaga.situacao === 'cancelada' ? 'cancelada' : 'sem prazo'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
