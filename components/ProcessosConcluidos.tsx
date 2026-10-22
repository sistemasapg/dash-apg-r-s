'use client';

import { useState } from 'react';
import type { ResumoConcluidos } from '@/lib/jornada';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';
import { urlDoCard } from '@/config/pipefy';
import { StatTile } from './StatTile';

/** Quantas linhas aparecem antes de "mostrar todos" — são mais de mil concluídos. */
const INICIAL = 20;

const dias = (n: number | null) => (n === null ? '—' : numero(n));

/**
 * As vagas que já terminaram, fora da lista de pendências.
 *
 * Aqui não há bola com ninguém: o que interessa é quanto tempo o processo
 * levou, da criação do card até a conclusão, e quanto disso foi de cada time.
 */
export function ProcessosConcluidos({ resumo }: { resumo: ResumoConcluidos }) {
  const [todos, setTodos] = useState(false);
  const { concluidos } = resumo;
  const visiveis = todos ? concluidos : concluidos.slice(0, INICIAL);

  if (concluidos.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Processos concluídos</h2>
        <p className="mt-0.5 text-sm text-ink-2">
          Vagas em Processo Seletivo Concluído saem da lista de pendências. Aqui fica o SLA que
          cada uma teve, em dias úteis, da criação do card até a conclusão.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          rotulo="Concluídos"
          valor={concluidos.length}
          nota={`${numero(resumo.ultimos30)} nos últimos 30 dias`}
        />
        <StatTile
          rotulo="SLA total (mediana)"
          valor={resumo.medianaSla ?? 0}
          nota="dias úteis, da criação à conclusão"
        />
        <StatTile
          rotulo="Com o R&S (mediana)"
          valor={resumo.medianaRs ?? 0}
          nota="dias úteis nas etapas de seleção"
        />
        <StatTile
          rotulo="Com o DP (mediana)"
          valor={resumo.medianaDp ?? 0}
          nota="dias úteis nas etapas de admissão"
        />
      </div>

      <div className="rounded-xl border border-borda bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-sm">
            <thead className="text-ink-2">
              <tr className="border-b border-borda">
                <th scope="col" className="px-4 py-2 text-left font-medium">Card</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Vaga</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Regional / escola</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Criado</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Concluído</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">SLA total</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">R&amp;S</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">DP</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((c) => (
                <tr key={c.cardId} className="border-b border-borda align-top last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={urlDoCard(c.cardId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Abrir o card ${c.cardId} no Pipefy`}
                      className="num inline-flex items-center gap-1 font-medium text-[var(--marca-azul)] underline-offset-2 hover:underline"
                    >
                      {c.cardId}
                      <span aria-hidden="true" className="text-xs">↗</span>
                    </a>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{c.nome}</div>
                    {c.categoria && (
                      <div className="text-xs text-ink-muted">{c.categoria.replace(/^Vagas /, '')}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div>{rotuloRegional(c.regional) || <span className="text-ink-muted">—</span>}</div>
                    <div className="text-ink-muted">{c.escola ?? 'toda a regional'}</div>
                  </td>
                  <td className="num px-4 py-3 text-xs whitespace-nowrap">{dataLonga(c.criadoEm)}</td>
                  <td className="num px-4 py-3 text-xs whitespace-nowrap">{dataLonga(c.concluidoEm)}</td>
                  <td className="num px-4 py-3 text-right whitespace-nowrap">
                    <span className="font-medium">{numero(c.slaDiasUteis)}</span>
                    <span className="text-xs text-ink-muted"> úteis</span>
                  </td>
                  <td className="num px-4 py-3 text-right text-ink-2">{dias(c.rs)}</td>
                  <td className="num px-4 py-3 text-right text-ink-2">{dias(c.dp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {concluidos.length > INICIAL && (
          <div className="border-t border-borda px-5 py-3">
            <button
              type="button"
              onClick={() => setTodos(!todos)}
              className="text-sm font-medium text-[var(--marca-azul)] hover:underline"
            >
              {todos ? `Mostrar só os ${INICIAL} mais recentes` : `Mostrar todos os ${numero(concluidos.length)}`}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
