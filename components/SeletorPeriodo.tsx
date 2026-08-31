'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { Snapshot } from '@/lib/types';
import { SEM_COMPARACAO } from '@/lib/consulta';
import { dataLonga, diaDaSemana } from '@/lib/format';

/** Escolhe qual foto é o "hoje" e contra qual foto ela é comparada. */
export function SeletorPeriodo({
  snapshots,
  atual,
  anterior,
  apenasAtivos,
}: {
  snapshots: Snapshot[];
  atual: string | null;
  anterior: string | null;
  apenasAtivos: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const navegar = (chave: string, valor: string | null) => {
    const novos = new URLSearchParams(params.toString());
    if (valor === null || valor === '') novos.delete(chave);
    else novos.set(chave, valor);
    router.push(`${pathname}?${novos.toString()}`);
  };

  const rotulo = (s: Snapshot) => `${dataLonga(s.data_ref)} (${diaDaSemana(s.data_ref)})`;
  const estilo =
    'rounded-lg border border-borda bg-surface px-3 py-2 text-sm text-ink focus:outline-2 focus:outline-[var(--serie-1)]';

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Foto atual</span>
        <select
          className={estilo}
          value={atual ?? ''}
          onChange={(e) => navegar('data', e.target.value)}
        >
          {snapshots.map((s) => (
            <option key={s.data_ref} value={s.data_ref}>
              {rotulo(s)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-ink-muted">Comparar com</span>
        <select
          className={estilo}
          value={anterior ?? SEM_COMPARACAO}
          onChange={(e) => navegar('comparar', e.target.value)}
        >
          {/*
            O valor precisa ser um sentinela, e não vazio: string vazia removia o
            parâmetro da URL, e a ausência dele significa "escolha a anterior
            automaticamente" — a comparação voltava e a opção parecia travada.
          */}
          <option value={SEM_COMPARACAO}>— sem comparação —</option>
          {snapshots
            .filter((s) => !atual || s.data_ref < atual)
            .map((s) => (
              <option key={s.data_ref} value={s.data_ref}>
                {rotulo(s)}
              </option>
            ))}
        </select>
      </label>

      <label className="flex items-center gap-2 pb-2.5 text-sm text-ink-2">
        <input
          type="checkbox"
          checked={apenasAtivos}
          onChange={(e) => navegar('ativos', e.target.checked ? '1' : null)}
          className="size-4 accent-[var(--serie-1)]"
        />
        Só candidatos ativos
      </label>
    </div>
  );
}
