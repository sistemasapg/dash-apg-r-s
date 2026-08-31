'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { LinhaEtapa } from '@/lib/types';
import { numero, comSinal } from '@/lib/format';
import { DESCRICOES } from '@/config/etapas';

/**
 * Barras horizontais por etapa. É escala ordinal (a etapa avança), então a cor
 * escurece conforme o candidato progride — não são categorias independentes.
 *
 * Cada barra é um link: clicar abre a lista de quem está naquela etapa, e
 * clicar de novo na etapa já aberta desfaz o recorte.
 */
export function Funil({
  dados,
  titulo,
  temComparacao = true,
  etapaSelecionada = null,
}: {
  dados: LinhaEtapa[];
  titulo: string;
  temComparacao?: boolean;
  etapaSelecionada?: string | null;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const pathname = usePathname();
  const params = useSearchParams();
  const maximo = Math.max(1, ...dados.map((d) => Math.max(d.atual, d.anterior)));

  const linkDaEtapa = (etapa: string) => {
    const novos = new URLSearchParams(params.toString());
    if (etapa === etapaSelecionada) novos.delete('etapa');
    else novos.set('etapa', etapa);
    const consulta = novos.toString();
    return `${pathname}${consulta ? `?${consulta}` : ''}#candidatos`;
  };

  if (dados.length === 0) {
    return (
      <section className="rounded-xl border border-borda bg-surface p-5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <p className="mt-3 text-sm text-ink-muted">Sem candidatos nesta seleção.</p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <span className="text-xs text-ink-muted">clique numa etapa para ver quem está nela</span>
      </div>

      <ul className="mt-4 flex flex-col gap-1">
        {dados.map((etapa, i) => {
          const cor = `var(--funil-${Math.min(8, i + 1)})`;
          const largura = (etapa.atual / maximo) * 100;
          const larguraAnterior = (etapa.anterior / maximo) * 100;
          const escolhida = etapa.etapa === etapaSelecionada;

          return (
            <li key={etapa.etapa} className="relative">
              <Link
                href={linkDaEtapa(etapa.etapa)}
                scroll
                aria-current={escolhida ? 'true' : undefined}
                className={`grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-surface-2 focus:outline-2 focus:outline-[var(--serie-1)] ${
                  escolhida ? 'bg-surface-2 ring-1 ring-[var(--serie-1)]' : ''
                }`}
                onMouseEnter={() => setAtivo(i)}
                onMouseLeave={() => setAtivo(null)}
              >
                <span
                  className={`truncate text-sm ${escolhida ? 'font-medium text-ink' : 'text-ink-2'}`}
                  title={etapa.etapa}
                >
                  {etapa.etapa}
                </span>

                <span className="relative flex h-6 items-center">
                  {/* Fantasma da foto anterior, para a mudança ficar visível na própria barra. */}
                  {temComparacao && (
                    <span
                      className="absolute left-0 h-6 rounded-r-[4px] border border-dashed border-baseline"
                      style={{ width: `${Math.max(larguraAnterior, 0.4)}%` }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className="relative h-6 rounded-r-[4px]"
                    style={{ width: `${Math.max(largura, 0.4)}%`, background: cor }}
                  />
                </span>

                <span className="num flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{numero(etapa.atual)}</span>
                  {temComparacao && (
                    <span
                      className={
                        etapa.delta > 0
                          ? 'text-xs text-[var(--alta)]'
                          : etapa.delta < 0
                            ? 'text-xs text-[var(--baixa)]'
                            : 'text-xs text-ink-muted'
                      }
                    >
                      {etapa.delta > 0 ? '↑' : etapa.delta < 0 ? '↓' : '→'} {comSinal(etapa.delta)}
                    </span>
                  )}
                </span>
              </Link>

              {ativo === i && (
                <div className="pointer-events-none absolute -top-1 left-[11.5rem] z-10 -translate-y-full rounded-lg border border-borda bg-surface px-3 py-2 text-xs shadow-lg">
                  <div className="font-medium">{etapa.etapa}</div>
                  {DESCRICOES[etapa.etapa] && (
                    <div className="mt-1 max-w-64 text-ink-2">{DESCRICOES[etapa.etapa]}</div>
                  )}
                  <div className="num mt-1 text-ink-2">
                    {temComparacao
                      ? `Agora: ${numero(etapa.atual)} · Antes: ${numero(etapa.anterior)}`
                      : `${numero(etapa.atual)} candidatos`}
                  </div>
                  <div className="mt-1 text-ink-muted">
                    {escolhida ? 'clique para desfazer' : 'clique para ver a lista'}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {temComparacao && (
        <p className="mt-3 text-xs text-ink-muted">
          A barra sólida é a foto atual; o contorno tracejado é a foto de comparação.
        </p>
      )}
    </section>
  );
}
