'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { LinhaVaga } from '@/lib/types';
import { numero, percentual, comSinal } from '@/lib/format';

type Coluna = 'vaga_nome' | 'atual' | 'anterior' | 'delta';

export function TabelaVagas({
  linhas,
  consulta,
  temComparacao,
}: {
  linhas: LinhaVaga[];
  consulta: string;
  temComparacao: boolean;
}) {
  const [busca, setBusca] = useState('');
  // Sem foto de comparação, ordenar por variação não significa nada.
  const [ordem, setOrdem] = useState<Coluna>(temComparacao ? 'delta' : 'atual');
  const [crescente, setCrescente] = useState(false);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = termo
      ? linhas.filter(
          (l) =>
            l.vaga_nome.toLowerCase().includes(termo) ||
            l.vaga_codigo.toLowerCase().includes(termo),
        )
      : linhas;

    return [...filtradas].sort((a, b) => {
      const va = a[ordem];
      const vb = b[ordem];
      if (typeof va === 'string' && typeof vb === 'string') {
        const texto = va.localeCompare(vb, 'pt-BR');
        return crescente ? texto : -texto;
      }
      // Vaga sem número de posições vai sempre para o fim, nos dois sentidos.
      if (va === null) return 1;
      if (vb === null) return -1;
      const comparacao = Number(va) - Number(vb);
      return crescente ? comparacao : -comparacao;
    });
  }, [linhas, busca, ordem, crescente]);

  const maximo = Math.max(1, ...linhas.map((l) => l.atual));

  const ordenarPor = (coluna: Coluna) => {
    if (coluna === ordem) setCrescente((c) => !c);
    else {
      setOrdem(coluna);
      setCrescente(coluna === 'vaga_nome');
    }
  };

  const Cabecalho = ({ coluna, texto, alinhamento = 'right' }: { coluna: Coluna; texto: string; alinhamento?: 'left' | 'right' }) => (
    <th
      scope="col"
      className={`px-3 py-2 font-medium ${alinhamento === 'left' ? 'text-left' : 'text-right'}`}
    >
      <button
        type="button"
        onClick={() => ordenarPor(coluna)}
        className="inline-flex items-center gap-1 hover:text-ink"
      >
        {texto}
        <span aria-hidden="true" className="text-ink-muted">
          {ordem === coluna ? (crescente ? '↑' : '↓') : ''}
        </span>
      </button>
    </th>
  );

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">Candidatos por vaga</h2>
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Filtrar vaga..."
          className="rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--serie-1)]"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <Cabecalho coluna="vaga_nome" texto="Vaga" alinhamento="left" />
              <Cabecalho coluna="atual" texto={temComparacao ? 'Agora' : 'Candidatos'} />
              {temComparacao && <Cabecalho coluna="anterior" texto="Antes" />}
              {temComparacao && <Cabecalho coluna="delta" texto="Variação" />}
              <th scope="col" className="w-40 px-3 py-2 text-left font-medium">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.vaga_codigo} className="border-b border-borda last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2.5">
                  <Link
                    href={`/vagas/${encodeURIComponent(l.vaga_codigo)}${consulta}`}
                    className="font-medium hover:underline"
                  >
                    {l.vaga_nome}
                  </Link>
                  <div className="text-xs text-ink-muted">{l.vaga_codigo}</div>
                </td>
                <td className="num px-3 py-2.5 text-right font-medium">{numero(l.atual)}</td>
                {temComparacao && (
                  <td className="num px-3 py-2.5 text-right text-ink-2">{numero(l.anterior)}</td>
                )}
                {temComparacao && (
                  <td className="num px-3 py-2.5 text-right">
                    <span
                      className={
                        l.delta > 0
                          ? 'text-[var(--alta)]'
                          : l.delta < 0
                            ? 'text-[var(--baixa)]'
                            : 'text-ink-muted'
                      }
                    >
                      {l.delta > 0 ? '↑' : l.delta < 0 ? '↓' : '→'} {comSinal(l.delta)}
                    </span>
                    <span className="ml-1 text-xs text-ink-muted">{percentual(l.variacao)}</span>
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <span className="flex h-4 items-center" title={`${numero(l.atual)} candidatos`}>
                    <span
                      className="h-4 rounded-r-[4px] bg-serie-1"
                      style={{ width: `${Math.max((l.atual / maximo) * 100, 1)}%` }}
                    />
                  </span>
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={temComparacao ? 5 : 3} className="px-3 py-8 text-center text-ink-muted">
                  Nenhuma vaga encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
