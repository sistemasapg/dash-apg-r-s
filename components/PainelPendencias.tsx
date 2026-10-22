'use client';

import { useMemo, useState } from 'react';
import type { Pendencia, ResumoPorDono } from '@/lib/pendencias';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';
import { urlDoCard } from '@/config/pipefy';
import { StatTile } from './StatTile';

/**
 * O medidor de prazo de uma pendência.
 *
 * A barra é proporcional AO PRAZO DA ETAPA, não ao maior valor da tabela: o
 * traço do fim marca o SLA, e o que passa dele transborda em vermelho. Assim
 * "6 de 2" e "16 de 10" se leem do mesmo jeito, mesmo sendo etapas com prazos
 * diferentes — é a mesma ideia do gráfico de categorias do Dashboard.
 */
function Medidor({ dias, prazo }: { dias: number; prazo: number | null }) {
  if (prazo === null) {
    return (
      <div className="h-1.5 w-full rounded-full bg-surface-2" title="etapa sem prazo acordado" />
    );
  }

  const estourou = dias > prazo;
  // O SLA fica sempre a 70% da trilha, para a parte estourada ter onde aparecer.
  const largura = Math.min((dias / prazo) * 70, 100);

  return (
    <div className="relative h-1.5 w-full rounded-full bg-surface-2">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.max(largura, 2)}%`,
          background: estourou ? 'var(--baixa)' : dias === prazo ? 'var(--atencao)' : 'var(--alta)',
        }}
      />
      {/* O traço do SLA, com folga de 2px para não encostar no preenchimento. */}
      <span
        aria-hidden="true"
        className="absolute inset-y-[-3px] w-[2px] rounded-full bg-ink-muted"
        style={{ left: '70%' }}
      />
    </div>
  );
}

function Situacao({ p }: { p: Pendencia }) {
  if (p.prazo === null) {
    return <span className="text-xs text-ink-muted">prazo a definir</span>;
  }
  const atrasada = p.saldo! < 0;
  const venceHoje = p.saldo === 0;

  return (
    <span
      className={`text-xs font-medium ${
        atrasada ? 'text-[var(--baixa)]' : venceHoje ? 'text-[var(--atencao)]' : 'text-[var(--alta)]'
      }`}
    >
      {/* Ícone + texto: a cor reforça, nunca carrega o significado sozinha. */}
      {atrasada ? `▲ ${numero(-p.saldo!)} de atraso` : venceHoje ? '● vence hoje' : `✓ faltam ${numero(p.saldo!)}`}
    </span>
  );
}

export function PainelPendencias({
  pendencias,
  porDono,
}: {
  pendencias: Pendencia[];
  porDono: ResumoPorDono[];
}) {
  const [dono, setDono] = useState('');
  const [etapa, setEtapa] = useState('');
  const [soAtrasadas, setSoAtrasadas] = useState(false);

  const etapas = useMemo(
    () => [...new Set(pendencias.map((p) => p.etapa))].sort(),
    [pendencias],
  );

  const visiveis = useMemo(
    () =>
      pendencias
        .filter((p) => (dono === '' ? true : p.dono === dono))
        .filter((p) => (etapa === '' ? true : p.etapa === etapa))
        .filter((p) => (!soAtrasadas ? true : p.saldo !== null && p.saldo < 0)),
    [pendencias, dono, etapa, soAtrasadas],
  );

  const temAproximado = visiveis.some((p) => p.precisao === 'limite');

  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <div className="flex flex-col gap-6">
      {/*
        Um cartão por dono — é a resposta à pergunta "com quem está a bola".
        Clicar recorta a lista, porque depois de ver "DP: 6 atrasadas" a próxima
        pergunta é sempre "quais?".
      */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {porDono.map((r) => (
          <StatTile
            key={r.dono}
            rotulo={`Pendências com ${r.dono}`}
            valor={r.total}
            nota={
              r.semPrazo === r.total
                ? `média ${numero(r.mediaDias)} dias úteis · prazo a definir`
                : `${numero(r.atrasadas)} fora do prazo · média ${numero(r.mediaDias)} dias úteis`
            }
            destaque={r.atrasadas > 0}
            aoClicar={() => setDono(dono === r.dono ? '' : r.dono)}
            ativo={dono === r.dono}
            dicaClique={dono === r.dono ? 'mostrando só estas · clique para tirar' : 'clique para filtrar'}
          />
        ))}
      </div>

      <section className="rounded-xl border border-borda bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
          <h2 className="text-sm font-semibold">
            Pendências
            <span className="ml-2 font-normal text-ink-muted">
              {numero(visiveis.length)} de {numero(pendencias.length)}
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <select value={dono} onChange={(e) => setDono(e.target.value)} className={seletor} aria-label="Dono">
              <option value="">Todos os donos</option>
              {porDono.map((r) => (
                <option key={r.dono} value={r.dono}>
                  {r.dono} ({r.total})
                </option>
              ))}
            </select>

            <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className={seletor} aria-label="Etapa">
              <option value="">Todas as etapas</option>
              {etapas.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-borda px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={soAtrasadas}
                onChange={(e) => setSoAtrasadas(e.target.checked)}
                className="accent-[var(--baixa)]"
              />
              Só as atrasadas
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-ink-2">
              <tr className="border-b border-borda">
                <th scope="col" className="px-4 py-2 text-left font-medium">Card</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Vaga</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Regional / escola</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Etapa</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Parada desde</th>
                <th scope="col" className="w-56 px-4 py-2 text-left font-medium">Prazo da etapa</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((p) => (
                <tr key={p.cardId} className="border-b border-borda align-top last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <a
                      href={urlDoCard(p.cardId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Abrir o card ${p.cardId} no Pipefy`}
                      className="num inline-flex items-center gap-1 font-medium text-[var(--marca-azul)] underline-offset-2 hover:underline"
                    >
                      {p.cardId}
                      <span aria-hidden="true" className="text-xs">↗</span>
                    </a>
                  </td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{p.nome}</div>
                    {p.categoria && (
                      <div className="text-xs text-ink-muted">
                        {p.categoria.replace(/^Vagas /, '')}
                      </div>
                    )}
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <div>{rotuloRegional(p.regional) || <span className="text-ink-muted">—</span>}</div>
                    <div className="text-ink-muted">{p.escola ?? 'toda a regional'}</div>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    <div>{p.etapa}</div>
                    <div className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 font-medium text-ink-2">
                      {p.dono}
                    </div>
                  </td>

                  <td className="num px-4 py-3 text-xs whitespace-nowrap">
                    {dataLonga(p.desde)}
                    {p.precisao === 'limite' && (
                      <span
                        className="ml-0.5 text-[var(--atencao)]"
                        title="O card saiu desta etapa e voltou. O relatório guarda só a primeira entrada, então o tempo é um limite superior."
                      >
                        *
                      </span>
                    )}
                    <div className="text-ink-muted">
                      {numero(p.diasUteis)} {p.diasUteis === 1 ? 'dia útil' : 'dias úteis'}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="num flex items-baseline gap-1 text-sm">
                      <span className="font-medium">{numero(p.diasUteis)}</span>
                      <span className="text-ink-muted">
                        de {p.prazo === null ? '—' : numero(p.prazo)} úteis
                      </span>
                    </div>
                    <div className="mt-1.5 max-w-[11rem]">
                      <Medidor dias={p.diasUteis} prazo={p.prazo} />
                    </div>
                    <div className="mt-1">
                      <Situacao p={p} />
                    </div>
                  </td>
                </tr>
              ))}

              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Nenhuma pendência neste recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {temAproximado && (
          <p className="border-t border-borda px-5 py-3 text-xs text-ink-muted">
            <span className="text-[var(--atencao)]">*</span> O card saiu da etapa e voltou. O
            relatório do Pipefy guarda só a primeira entrada e a última saída, então o tempo
            mostrado é um <strong>limite superior</strong> — a passagem atual pode ser mais curta.
          </p>
        )}
      </section>
    </div>
  );
}
