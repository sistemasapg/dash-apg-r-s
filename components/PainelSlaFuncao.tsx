'use client';

import { useMemo, useState } from 'react';
import type { ResumoFuncao, TotalGeral } from '@/lib/sla-funcao';
import { SEM_CARGO } from '@/config/sla-funcao';
import { numero } from '@/lib/format';
import { StatTile } from './StatTile';

/**
 * Onde a aderência deixa de ser aceitável.
 *
 * Não saiu de estatística: é o corte que torna a tabela acionável. Acima de 80%
 * a função cumpre o prazo na maioria larga dos casos; abaixo da metade, o prazo
 * virou ficção e a conversa é outra. O meio é a faixa de atenção. Os números
 * estão escritos na tela para ninguém ter que adivinhar de onde vieram.
 */
const BOM = 0.8;
const RUIM = 0.5;

function corDaAderencia(a: number): string {
  return a >= BOM ? 'var(--alta)' : a >= RUIM ? 'var(--atencao)' : 'var(--baixa)';
}

function porcento(a: number): string {
  return `${Math.round(a * 100)}%`;
}

/**
 * A barra de aderência: quanto das vagas fechadas saiu no prazo.
 *
 * Escala fixa de 0 a 100% — é uma proporção, e proporção não se normaliza pelo
 * maior valor da tabela. O traço marca os 80%.
 */
function BarraAderencia({ aderencia }: { aderencia: number | null }) {
  if (aderencia === null) {
    return <div className="h-1.5 w-full rounded-full bg-surface-2" title="nenhuma vaga fechada" />;
  }

  return (
    <div className="relative h-1.5 w-full rounded-full bg-surface-2">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.max(aderencia * 100, 2)}%`,
          background: corDaAderencia(aderencia),
        }}
      />
      <span
        aria-hidden="true"
        title={`meta de ${porcento(BOM)}`}
        className="absolute inset-y-[-3px] w-[2px] rounded-full bg-ink-muted"
        style={{ left: `${BOM * 100}%` }}
      />
    </div>
  );
}

/**
 * A mediana contra o prazo da função.
 *
 * O prazo fica sempre a 70% da trilha, para o que estoura ter onde aparecer.
 * É o mesmo medidor da tela de Pendências de propósito: duas funções com prazos
 * diferentes — 7 e 15 dias úteis — se leem do mesmo jeito, e "9 de 7" fica
 * visivelmente pior que "9 de 15" sem ninguém precisar fazer a conta.
 */
function MedidorPrazo({ mediana, sla }: { mediana: number | null; sla: number | null }) {
  if (mediana === null || sla === null) {
    return <div className="h-1.5 w-full rounded-full bg-surface-2" />;
  }

  const estourou = mediana > sla;
  const largura = Math.min((mediana / sla) * 70, 100);

  return (
    <div className="relative h-1.5 w-full rounded-full bg-surface-2">
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${Math.max(largura, 2)}%`,
          background: estourou ? 'var(--baixa)' : mediana === sla ? 'var(--atencao)' : 'var(--alta)',
        }}
      />
      <span
        aria-hidden="true"
        title={`prazo de ${sla} dias úteis`}
        className="absolute inset-y-[-3px] w-[2px] rounded-full bg-ink-muted"
        style={{ left: '70%' }}
      />
    </div>
  );
}

/** Ícone + texto: a cor reforça a leitura, nunca a carrega sozinha. */
function Situacao({ aderencia }: { aderencia: number | null }) {
  if (aderencia === null) {
    return <span className="text-xs text-ink-muted">nada fechado ainda</span>;
  }
  const bom = aderencia >= BOM;
  const ruim = aderencia < RUIM;

  return (
    <span
      className="text-xs font-medium"
      style={{ color: corDaAderencia(aderencia) }}
    >
      {ruim ? '▲' : bom ? '✓' : '●'} {porcento(aderencia)} no prazo
    </span>
  );
}

export function PainelSlaFuncao({
  resumos,
  total,
}: {
  resumos: ResumoFuncao[];
  total: TotalGeral;
}) {
  const [categoria, setCategoria] = useState('');
  const [soEstouram, setSoEstouram] = useState(false);

  const categorias = useMemo(
    () => [...new Set(resumos.map((r) => r.categoria).filter(Boolean))].sort() as string[],
    [resumos],
  );

  const visiveis = useMemo(
    () =>
      resumos
        .filter((r) => (categoria === '' ? true : r.categoria === categoria))
        .filter((r) =>
          !soEstouram
            ? true
            : // "Estoura" é qualquer das duas evidências: a mediana passou do
              // prazo, ou há vaga aberta já atrasada.
              (r.medianaFechadas !== null && r.sla !== null && r.medianaFechadas > r.sla) ||
              (r.abertasAtrasadas ?? 0) > 0,
        ),
    [resumos, categoria, soEstouram],
  );

  const temBaseEstreita = visiveis.some((r) => r.baseEstreita);
  const temConflito = visiveis.some((r) => r.categoriasEmConflito.length > 0);

  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          rotulo="Aderência ao prazo"
          valor={total.aderencia === null ? '—' : porcento(total.aderencia)}
          nota={`${numero(total.dentroDoPrazo)} de ${numero(total.comPrazo)} vagas fechadas no prazo`}
          destaque={total.aderencia !== null && total.aderencia < RUIM}
        />
        <StatTile
          rotulo="Funções medidas"
          valor={total.funcoes}
          nota={`${numero(total.cards)} vagas no recorte`}
        />
        <StatTile
          rotulo="Vagas fechadas"
          valor={total.fechadas}
          nota="é com elas que se mede o prazo"
        />
        <StatTile
          rotulo="Abertas fora do prazo"
          valor={total.abertasAtrasadas}
          nota={`de ${numero(total.abertas)} ainda abertas`}
          destaque={total.abertasAtrasadas > 0}
        />
      </div>

      <section className="rounded-xl border border-borda bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
          <h2 className="text-sm font-semibold">
            Por função
            <span className="ml-2 font-normal text-ink-muted">
              {numero(visiveis.length)} de {numero(resumos.length)}
            </span>
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className={seletor}
              aria-label="Categoria"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/^Vagas /, '')}
                </option>
              ))}
            </select>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-borda px-3 py-1.5 text-sm">
              <input
                type="checkbox"
                checked={soEstouram}
                onChange={(e) => setSoEstouram(e.target.checked)}
                className="accent-[var(--baixa)]"
              />
              Só as que estouram
            </label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[62rem] text-sm">
            <thead className="sticky top-0 z-10 bg-surface text-ink-2">
              <tr className="border-b border-borda">
                <th scope="col" className="px-4 py-2 text-left font-medium">Função</th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Categoria</th>
                <th scope="col" className="px-4 py-2 text-right font-medium">Prazo</th>
                <th scope="col" className="w-52 px-4 py-2 text-left font-medium">
                  Mediana das fechadas
                </th>
                <th scope="col" className="w-48 px-4 py-2 text-left font-medium">
                  Fecharam no prazo
                </th>
                <th scope="col" className="px-4 py-2 text-left font-medium">Abertas</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((r) => (
                <tr key={r.funcao} className="border-b border-borda align-top last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.funcao === SEM_CARGO ? (
                        <span className="text-ink-muted">{r.funcao}</span>
                      ) : (
                        r.funcao
                      )}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {numero(r.total)} {r.total === 1 ? 'vaga' : 'vagas'}
                      {r.baseEstreita && (
                        <span
                          className="ml-0.5 text-[var(--atencao)]"
                          title="Poucas vagas fechadas: a mediana ainda não sustenta uma decisão de prazo."
                        >
                          {' '}*
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-xs">
                    {r.categoriasEmConflito.length > 0 ? (
                      <span className="text-[var(--atencao)]" title="Os cards desta função vêm classificados em mais de uma categoria no Pipefy, então não há um prazo único a aplicar.">
                        ▲ {r.categoriasEmConflito.map((c) => c.replace(/^Vagas /, '')).join(' + ')}
                      </span>
                    ) : (
                      (r.categoria?.replace(/^Vagas /, '') ?? (
                        <span className="text-ink-muted">—</span>
                      ))
                    )}
                  </td>

                  <td className="num px-4 py-3 text-right whitespace-nowrap">
                    {r.sla === null ? (
                      <span className="text-xs text-ink-muted">a definir</span>
                    ) : (
                      <>
                        <span className="font-medium tabular-nums">{numero(r.sla)}</span>
                        <div className="text-xs text-ink-muted">
                          úteis
                          {r.prazoProprio && (
                            <span title="Prazo próprio desta função, definido em config/sla-funcao.ts">
                              {' '}· próprio
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {r.medianaFechadas === null ? (
                      <span className="text-xs text-ink-muted">—</span>
                    ) : (
                      <>
                        <div className="num flex items-baseline gap-1">
                          <span className="font-medium tabular-nums">
                            {numero(r.medianaFechadas)}
                          </span>
                          <span className="text-xs text-ink-muted">
                            de {r.sla === null ? '—' : numero(r.sla)} úteis
                          </span>
                        </div>
                        <div className="mt-1.5 max-w-[10rem]">
                          <MedidorPrazo mediana={r.medianaFechadas} sla={r.sla} />
                        </div>
                        <div className="num mt-1 text-xs text-ink-muted">
                          pior caso {numero(r.piorFechada ?? 0)}
                        </div>
                      </>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="num text-xs">
                      {r.dentroDoPrazo === null ? (
                        <span className="text-ink-muted">sem prazo a cumprir</span>
                      ) : (
                        <>
                          <span className="font-medium">{numero(r.dentroDoPrazo)}</span>
                          <span className="text-ink-muted"> de {numero(r.fechadas)}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1.5 max-w-[9rem]">
                      <BarraAderencia aderencia={r.aderencia} />
                    </div>
                    <div className="mt-1">
                      <Situacao aderencia={r.aderencia} />
                    </div>
                  </td>

                  <td className="num px-4 py-3 text-xs whitespace-nowrap">
                    <div className="font-medium">{numero(r.abertas)}</div>
                    {r.abertas > 0 && (
                      <div className="text-ink-muted">
                        {r.abertasAtrasadas === null ? (
                          'sem prazo'
                        ) : r.abertasAtrasadas > 0 ? (
                          <span className="text-[var(--baixa)]">
                            ▲ {numero(r.abertasAtrasadas)} fora do prazo
                          </span>
                        ) : (
                          '✓ todas no prazo'
                        )}
                        <div>há {numero(r.piorAberta ?? 0)} úteis na pior</div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
                    Nenhuma função neste recorte.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(temBaseEstreita || temConflito) && (
          <div className="flex flex-col gap-1.5 border-t border-borda px-5 py-3 text-xs text-ink-muted">
            {temBaseEstreita && (
              <p>
                <span className="text-[var(--atencao)]">*</span> Menos de 5 vagas fechadas. A
                mediana aparece, mas com duas ou três vagas um caso atípico move o número inteiro —
                não é base para mudar um prazo.
              </p>
            )}
            {temConflito && (
              <p>
                <span className="text-[var(--atencao)]">▲</span> Função classificada em mais de uma
                categoria no Pipefy. Enquanto for assim não há um prazo único a aplicar, e a linha
                fica sem cobrança. Resolver é escolher uma categoria no Pipefy.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
