'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Jornada, TotalDoTime, Trecho } from '@/lib/jornada';
import type { Dono } from '@/config/etapas-pipefy';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';
import { urlDoCard } from '@/config/pipefy';
import {
  Amostra,
  BarraJornada,
  COR,
  DetalheJornada,
  LegendaJornada,
  NumerosPorTime,
  rotuloDono,
  TEXTURA,
  type DicaJornada,
} from './Jornada';

export function JornadaVagas({
  jornadas,
  porTime,
}: {
  jornadas: Jornada[];
  porTime: TotalDoTime[];
}) {
  const [dono, setDono] = useState('');
  const [regional, setRegional] = useState('');
  const [aberta, setAberta] = useState<string | null>(null);
  const [dica, setDica] = useState<DicaJornada | null>(null);

  const regionais = useMemo(
    () => [...new Set(jornadas.map((j) => j.regional).filter(Boolean))].sort() as string[],
    [jornadas],
  );

  const visiveis = useMemo(
    () =>
      jornadas
        .filter((j) => (dono === '' ? true : j.donoAtual === dono))
        .filter((j) => (regional === '' ? true : j.regional === regional)),
    [jornadas, dono, regional],
  );

  /*
    A escala vem do recorte visível, não do conjunto todo: filtrar por regional
    e continuar com a régua da maior vaga do pipe deixaria todas as barras
    minúsculas. Mínimo de 1 para não dividir por zero.
  */
  const escala = useMemo(() => Math.max(1, ...visiveis.map((j) => j.totalNaBarra)), [visiveis]);

  const times = useMemo(() => porTime.map((t) => t.dono), [porTime]);
  const totalGeral = porTime.reduce((s, t) => s + t.diasUteis, 0);
  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <div className="flex flex-col gap-6">
      {/*
        O agregado primeiro: de todo o tempo que as vagas abertas já consumiram,
        quanto é de cada time. É a resposta que a tela de pendências não dá, e
        por isso vem antes da lista.
      */}
      <section className="rounded-xl border border-borda bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">Para onde o tempo foi</h2>
          <span className="num text-xs text-ink-muted">
            {numero(totalGeral)} dias úteis somados em {numero(jornadas.length)} vagas abertas
          </span>
        </div>

        <div className="mt-4 flex h-5 w-full items-stretch gap-[2px]">
          {porTime.map((t) => (
            <div
              key={t.dono}
              title={`${t.dono}: ${numero(t.diasUteis)} dias úteis`}
              className="first:rounded-l last:rounded-r"
              style={{
                width: `${(t.diasUteis / Math.max(totalGeral, 1)) * 100}%`,
                background: COR[t.dono],
                backgroundImage: TEXTURA[t.dono],
              }}
            />
          ))}
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          {porTime.map((t) => (
            <div key={t.dono}>
              <dt className="flex items-center gap-1.5 text-xs text-ink-2">
                <Amostra dono={t.dono} />
                {t.dono === 'A mapear' ? 'Sem dono definido' : t.dono}
              </dt>
              <dd className="num mt-0.5">
                <span className="text-xl font-semibold tabular-nums">{numero(t.diasUteis)}</span>
                <span className="ml-1 text-xs text-ink-muted">dias úteis</span>
                <div className="text-xs text-ink-muted">
                  {numero(t.vagas)} vagas passaram · média {numero(t.mediaDias)} ·{' '}
                  {numero(t.agora)} com ele agora
                </div>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-xl border border-borda bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
          <div>
            <h2 className="text-sm font-semibold">
              Jornada por vaga
              <span className="ml-2 font-normal text-ink-muted">
                {numero(visiveis.length)} de {numero(jornadas.length)}
              </span>
            </h2>
            <div className="mt-1.5">
              <LegendaJornada times={times} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={dono}
              onChange={(e) => setDono(e.target.value)}
              className={seletor}
              aria-label="Com quem está agora"
            >
              <option value="">Com qualquer time</option>
              {porTime
                .filter((t) => t.agora > 0)
                .map((t) => (
                  <option key={t.dono} value={t.dono}>
                    Agora com {t.dono === 'A mapear' ? 'fase sem dono' : t.dono} ({t.agora})
                  </option>
                ))}
            </select>

            <select
              value={regional}
              onChange={(e) => setRegional(e.target.value)}
              className={seletor}
              aria-label="Regional"
            >
              <option value="">Todas as regionais</option>
              {regionais.map((r) => (
                <option key={r} value={r}>
                  {rotuloRegional(r) || r}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-ink-2">
              <tr className="border-b border-borda">
                <th scope="col" className="px-4 py-2 text-left font-medium">Card</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Vaga</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Agora com</th>
                <th scope="col" className="min-w-[20rem] px-4 py-2 text-left font-medium">
                  Jornada em dias úteis
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((j) => {
                const expandida = aberta === j.cardId;
                return (
                  <Fragment key={j.cardId}>
                    <tr className="border-b border-borda align-top hover:bg-surface-2">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <a
                          href={urlDoCard(j.cardId)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Abrir o card ${j.cardId} no Pipefy`}
                          className="num inline-flex items-center gap-1 font-medium text-[var(--marca-azul)] underline-offset-2 hover:underline"
                        >
                          {j.cardId}
                          <span aria-hidden="true" className="text-xs">↗</span>
                        </a>
                        <div className="num mt-0.5 text-xs text-ink-muted">
                          desde {dataLonga(j.criadoEm)}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="font-medium">{j.nome}</div>
                        <div className="text-xs text-ink-muted">
                          {rotuloRegional(j.regional) || '—'}
                          {j.escola ? ` · ${j.escola}` : ''}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-xs">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 font-medium">
                          <Amostra dono={j.donoAtual} />
                          {j.donoAtual === 'A mapear' ? 'sem dono' : j.donoAtual}
                        </span>
                        <div className="mt-1 text-ink-muted">{j.faseAtual}</div>
                      </td>

                      <td className="px-4 py-3">
                        <BarraJornada
                          trechos={j.trechos}
                          escala={escala}
                          aoApontar={setDica}
                          aoSair={() => setDica(null)}
                        />
                        <div className="mt-2">
                          <NumerosPorTime trechos={j.trechos} />
                        </div>
                        <button
                          type="button"
                          onClick={() => setAberta(expandida ? null : j.cardId)}
                          aria-expanded={expandida}
                          className="mt-1.5 text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                        >
                          {expandida ? '▴ esconder as fases' : `▾ ver as ${j.trechos.length} fases`}
                        </button>
                      </td>

                      <td className="num px-4 py-3 text-right whitespace-nowrap">
                        <div className="font-semibold tabular-nums">{numero(j.totalCobrado)}</div>
                        <div className="text-xs text-ink-muted">
                          de time
                          {j.sobreposto && (
                            <span
                              className="ml-0.5 text-[var(--atencao)]"
                              title="O card passou duas vezes por alguma fase. O relatório guarda só a primeira entrada e a última saída, então a soma é um limite superior."
                            >
                              *
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-ink-muted">
                          {numero(j.totalDecorrido)} corridos no pipe
                        </div>
                      </td>
                    </tr>

                    {expandida && (
                      <tr className="border-b border-borda bg-surface-2">
                        <td colSpan={5} className="px-4 py-3">
                          <DetalheJornada trechos={j.trechos} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-muted">
                    Nenhuma vaga neste recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {visiveis.some((j) => j.sobreposto) && (
          <p className="border-t border-borda px-5 py-3 text-xs text-ink-muted">
            <span className="text-[var(--atencao)]">*</span> O card passou duas vezes pela mesma
            fase. O relatório do Pipefy guarda só a primeira entrada e a última saída de cada uma,
            e entre as duas o card esteve em outro lugar — então a soma dos trechos é um{' '}
            <strong>limite superior</strong>. São {numero(visiveis.filter((j) => j.sobreposto).length)}{' '}
            de {numero(visiveis.length)} vagas no recorte.
          </p>
        )}
      </section>

      {/*
        A dica segue o cursor em posição fixa, fora do fluxo da tabela: dentro
        de uma célula com overflow-x ela seria cortada na borda da rolagem.
      */}
      {dica && (
        <div
          role="status"
          className="pointer-events-none fixed z-50 max-w-xs rounded-lg border border-borda bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(dica.x + 12, 1200), top: dica.y + 12 }}
        >
          <div className="font-medium">{dica.texto}</div>
          <div className="num mt-0.5 text-ink-2">{dica.detalhe}</div>
        </div>
      )}
    </div>
  );
}
