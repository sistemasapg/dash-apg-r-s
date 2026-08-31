'use client';

import type { LinhaCategoria } from '@/lib/analise-sla';
import { numero } from '@/lib/format';

/**
 * Quantos dias, em média, as vagas abertas de cada categoria já consumiram —
 * lidos contra o prazo da própria categoria.
 *
 * O truque do desenho: o marcador do SLA fica SEMPRE na mesma posição da
 * barra, e é o comprimento da barra que varia. Assim 9 dias de 15 (folga) e
 * 9 dias de 7 (estouro) aparecem visualmente diferentes, embora o número seja o
 * mesmo — que é exatamente a leitura correta e a que uma barra em escala
 * comum de dias esconderia.
 */

/** Onde o marcador do prazo fica, em % da largura da trilha. */
const POSICAO_SLA = 62;

export function MediaVsSla({ linhas }: { linhas: LinhaCategoria[] }) {
  const comPrazo = linhas.filter((l) => l.sla !== null && l.mediaUteis !== null);

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Tempo médio das vagas abertas × prazo</h2>
        <span className="text-xs text-ink-muted">
          em dias úteis · o traço vertical é o SLA
        </span>
      </div>

      {comPrazo.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">
          Nenhuma vaga aberta com categoria neste recorte — sem categoria não há prazo a medir.
        </p>
      ) : (
        <ul className="mt-5 flex flex-col gap-5">
          {comPrazo.map((l) => {
            const media = l.mediaUteis!;
            const sla = l.sla!;
            const estourou = media > sla;
            // A barra cresce proporcionalmente ao prazo, com o marcador fixo.
            const largura = Math.min((media / sla) * POSICAO_SLA, 100);

            return (
              <li key={l.categoria}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium">
                    {l.categoria.replace(/^Vagas /, '')}
                    <span className="ml-2 text-xs font-normal text-ink-muted">
                      {numero(l.abertas)} aberta{l.abertas === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="num text-xs">
                    <span className={estourou ? 'font-medium text-[var(--baixa)]' : 'font-medium'}>
                      {numero(media)} dias
                    </span>
                    <span className="text-ink-muted"> · prazo {numero(sla)}</span>
                    {l.mediaUteisFechadas !== null && (
                      <span className="text-ink-muted">
                        {' '}
                        · fechadas levaram {numero(l.mediaUteisFechadas)}
                      </span>
                    )}
                  </span>
                </div>

                <div className="relative mt-1.5 h-6 rounded bg-surface-2">
                  <div
                    className="h-6 rounded"
                    style={{
                      width: `${Math.max(largura, 2)}%`,
                      background: estourou ? 'var(--baixa)' : 'var(--serie-1)',
                    }}
                  />
                  {/*
                    O marcador do prazo. Sempre no mesmo lugar, em toda linha —
                    é isso que torna as categorias comparáveis. Sem rótulo
                    escrito: ele esbarrava no texto da linha, e o número do
                    prazo já está logo acima.
                  */}
                  <div
                    aria-hidden="true"
                    className="absolute inset-y-0 w-0.5 bg-ink"
                    style={{ left: `${POSICAO_SLA}%` }}
                  />
                </div>

                {l.foraDoPrazo > 0 && (
                  <p className="mt-1 text-xs text-[var(--baixa)]">
                    {numero(l.foraDoPrazo)} vaga{l.foraDoPrazo === 1 ? '' : 's'} já passou
                    {l.foraDoPrazo === 1 ? '' : 'ram'} do prazo
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-5 text-xs text-ink-muted">
        A barra é proporcional ao prazo da categoria, e o traço marca o SLA — por isso 9 dias
        aparecem curtos numa administrativa (prazo 15) e longos numa de professor (prazo 7). Em
        dias corridos a leitura é outra: veja a coluna na aba Vagas R&amp;S.
      </p>
    </section>
  );
}
