'use client';

import { useMemo, useState } from 'react';
import type { Movimentacao } from '@/lib/types';
import { numero } from '@/lib/format';

const ROTULOS: Record<Movimentacao['tipo'], { texto: string; simbolo: string; cor: string }> = {
  novo: { texto: 'Entrou', simbolo: '＋', cor: 'text-[var(--serie-1)]' },
  avancou: { texto: 'Avançou', simbolo: '↑', cor: 'text-[var(--alta)]' },
  voltou: { texto: 'Voltou', simbolo: '↓', cor: 'text-[var(--atencao)]' },
  encerrou: { texto: 'Saiu do funil', simbolo: '■', cor: 'text-ink-2' },
  saiu: { texto: 'Sumiu da base', simbolo: '×', cor: 'text-[var(--baixa)]' },
};

const ORDEM: Movimentacao['tipo'][] = ['avancou', 'novo', 'voltou', 'encerrou', 'saiu'];

/**
 * O "o que aconteceu" por trás do número. Sem isso, o dash só diz que subiu 12;
 * com isso, diz quais 12.
 */
export function ListaMovimentacoes({
  movimentacoes,
  mostrarVaga = true,
  semDetalhe = false,
}: {
  movimentacoes: Movimentacao[];
  mostrarVaga?: boolean;
  semDetalhe?: boolean;
}) {
  const [tipo, setTipo] = useState<Movimentacao['tipo'] | 'todos'>('todos');

  if (semDetalhe) {
    return (
      <section className="rounded-xl border border-borda bg-surface p-5">
        <h2 className="text-sm font-semibold">Movimentações</h2>
        <p className="mt-3 text-sm text-ink-muted">
          Uma das fotos selecionadas é antiga demais: o detalhe por candidato foi
          compactado para o banco não crescer sem limite. Os totais e o funil dessas
          datas continuam corretos — só a lista nominal de quem se moveu não existe mais.
        </p>
      </section>
    );
  }

  const contagens = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const m of movimentacoes) mapa.set(m.tipo, (mapa.get(m.tipo) ?? 0) + 1);
    return mapa;
  }, [movimentacoes]);

  const visiveis = useMemo(() => {
    const lista = tipo === 'todos' ? movimentacoes : movimentacoes.filter((m) => m.tipo === tipo);
    return [...lista].sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo));
  }, [movimentacoes, tipo]);

  if (movimentacoes.length === 0) {
    return (
      <section className="rounded-xl border border-borda bg-surface p-5">
        <h2 className="text-sm font-semibold">Movimentações</h2>
        <p className="mt-3 text-sm text-ink-muted">
          Nada mudou entre as duas fotos — ou só existe uma foto guardada.
        </p>
      </section>
    );
  }

  const botao = (valor: Movimentacao['tipo'] | 'todos', texto: string, quantidade: number) => (
    <button
      key={valor}
      type="button"
      onClick={() => setTipo(valor)}
      className={`rounded-lg border px-3 py-1.5 text-xs ${
        tipo === valor
          ? 'border-[var(--serie-1)] bg-surface-2 font-medium text-ink'
          : 'border-borda text-ink-2 hover:text-ink'
      }`}
    >
      {texto} <span className="num text-ink-muted">({numero(quantidade)})</span>
    </button>
  );

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">Movimentações entre as duas fotos</h2>
        <div className="flex flex-wrap gap-2">
          {botao('todos', 'Tudo', movimentacoes.length)}
          {ORDEM.filter((t) => contagens.get(t)).map((t) =>
            botao(t, ROTULOS[t].texto, contagens.get(t) ?? 0),
          )}
        </div>
      </div>

      <div className="max-h-[28rem] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Candidato
              </th>
              {mostrarVaga && (
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Vaga
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-left font-medium">
                O que houve
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                Etapa
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((m) => {
              const r = ROTULOS[m.tipo];
              return (
                <tr key={`${m.chave}-${m.tipo}`} className="border-b border-borda last:border-0">
                  <td className="px-3 py-2">{m.candidato_nome ?? '—'}</td>
                  {mostrarVaga && <td className="px-3 py-2 text-ink-2">{m.vaga_nome}</td>}
                  <td className={`px-3 py-2 font-medium ${r.cor}`}>
                    <span aria-hidden="true">{r.simbolo}</span> {r.texto}
                  </td>
                  <td className="px-3 py-2 text-ink-2">
                    {m.de && m.para ? `${m.de} → ${m.para}` : (m.para ?? m.de ?? '—')}
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
