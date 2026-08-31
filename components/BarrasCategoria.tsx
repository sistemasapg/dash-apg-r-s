'use client';

import type { LinhaCategoria } from '@/lib/analise-sla';
import { numero } from '@/lib/format';

/**
 * Quantas vagas abertas há em cada categoria.
 *
 * Clicar numa barra recorta o resto da tela para aquela categoria — a pergunta
 * "quantas administrativas eu tenho?" quase sempre é seguida de "quais são?", e
 * o clique é a resposta mais curta para a segunda.
 */
export function BarrasCategoria({
  linhas,
  selecionada,
  aoSelecionar,
}: {
  linhas: LinhaCategoria[];
  selecionada: string;
  aoSelecionar: (categoria: string) => void;
}) {
  const maximo = Math.max(1, ...linhas.map((l) => l.abertas));
  const total = linhas.reduce((s, l) => s + l.abertas, 0);

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Vagas em aberto por categoria</h2>
        <span className="text-xs text-ink-muted">
          {selecionada ? 'clique de novo para tirar o recorte' : 'clique para ver as vagas'}
        </span>
      </div>

      {total === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Nenhuma vaga aberta neste recorte.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {linhas.map((l) => {
            const ativa = selecionada === l.categoria;
            return (
              <li key={l.categoria}>
                <button
                  type="button"
                  onClick={() => aoSelecionar(ativa ? '' : l.categoria)}
                  aria-pressed={ativa}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    ativa ? 'bg-surface-2' : 'hover:bg-surface-2'
                  }`}
                >
                  <span className="w-40 shrink-0 truncate text-sm">
                    {l.categoria.replace(/^Vagas /, '')}
                    {l.sla !== null && (
                      <span className="ml-1 text-xs text-ink-muted">SLA {l.sla}</span>
                    )}
                  </span>

                  <span className="flex h-6 flex-1 items-center">
                    <span
                      className="h-6 rounded-r-[4px]"
                      style={{
                        width: `${Math.max((l.abertas / maximo) * 100, 2)}%`,
                        // Categoria com vaga estourada fica avermelhada: o volume
                        // sozinho não distingue carteira grande de carteira em apuros.
                        background: l.foraDoPrazo > 0 ? 'var(--baixa)' : 'var(--serie-1)',
                        opacity: ativa || !selecionada ? 1 : 0.4,
                      }}
                    />
                  </span>

                  <span className="num w-24 shrink-0 text-right text-sm">
                    <span className="font-medium">{numero(l.abertas)}</span>
                    {l.foraDoPrazo > 0 && (
                      <span className="ml-1 text-xs text-[var(--baixa)]">
                        {numero(l.foraDoPrazo)} fora
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
