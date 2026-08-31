'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { LinhaVaga } from '@/lib/types';
import { numero } from '@/lib/format';

/**
 * Filtro lateral por vaga. Multi-seleção: nenhuma marcada significa todas,
 * que é o estado natural de quem acabou de abrir o dash.
 */
export function FiltroVagas({
  vagas,
  selecionadas,
  temComparacao,
}: {
  vagas: LinhaVaga[];
  selecionadas: string[];
  temComparacao: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState('');

  const marcadas = useMemo(() => new Set(selecionadas), [selecionadas]);

  const aplicar = (proximas: string[]) => {
    const novos = new URLSearchParams(params.toString());
    if (proximas.length === 0) novos.delete('vagas');
    else novos.set('vagas', proximas.join(','));
    router.push(`${pathname}?${novos.toString()}`);
  };

  const alternar = (codigo: string) => {
    const proximas = marcadas.has(codigo)
      ? selecionadas.filter((c) => c !== codigo)
      : [...selecionadas, codigo];
    aplicar(proximas);
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return vagas;
    return vagas.filter(
      (v) =>
        v.vaga_nome.toLowerCase().includes(termo) || v.vaga_codigo.toLowerCase().includes(termo),
    );
  }, [vagas, busca]);

  return (
    <aside className="rounded-xl border border-borda bg-surface">
      <div className="border-b border-borda p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Vagas</h2>
          {marcadas.size > 0 && (
            <button
              type="button"
              onClick={() => aplicar([])}
              className="text-xs text-ink-2 underline hover:text-ink"
            >
              limpar ({marcadas.size})
            </button>
          )}
        </div>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar vaga..."
          className="mt-3 w-full rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--serie-1)]"
        />
        <p className="mt-2 text-xs text-ink-muted">
          {marcadas.size === 0
            ? `Mostrando todas as ${numero(vagas.length)} vagas.`
            : `Filtrando ${numero(marcadas.size)} de ${numero(vagas.length)}.`}
        </p>
      </div>

      <ul className="max-h-[32rem] overflow-auto p-2">
        {visiveis.map((v) => {
          const ativa = marcadas.has(v.vaga_codigo);
          return (
            <li key={v.vaga_codigo}>
              <label
                className={`flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-sm hover:bg-surface-2 ${
                  ativa ? 'bg-surface-2' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={ativa}
                  onChange={() => alternar(v.vaga_codigo)}
                  className="mt-0.5 size-4 shrink-0 accent-[var(--serie-1)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate" title={v.vaga_nome}>
                    {v.vaga_nome}
                  </span>
                  <span className="num text-xs text-ink-muted">
                    {numero(v.atual)}
                    {temComparacao && v.delta !== 0 && (
                      <span
                        className={
                          v.delta > 0 ? ' text-[var(--alta)]' : ' text-[var(--baixa)]'
                        }
                      >
                        {' '}
                        {v.delta > 0 ? '↑' : '↓'} {v.delta > 0 ? '+' : '−'}
                        {numero(Math.abs(v.delta))}
                      </span>
                    )}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {visiveis.length === 0 && (
          <li className="px-2 py-6 text-center text-sm text-ink-muted">Nenhuma vaga encontrada.</li>
        )}
      </ul>
    </aside>
  );
}
