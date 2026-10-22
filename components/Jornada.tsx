'use client';

import type { Trecho } from '@/lib/jornada';
import type { Dono } from '@/config/etapas-pipefy';
import { dataLonga, numero } from '@/lib/format';

/**
 * As peças da jornada de um card, compartilhadas entre as telas que a mostram.
 *
 * Vivem aqui, e não dentro de uma das telas, porque duas cópias do mapa de cor
 * divergem na primeira vez que alguém mexe numa — e o leitor que olha as duas
 * telas lado a lado veria o mesmo time em cores diferentes, sem jeito de saber
 * qual está certa.
 */

/**
 * A cor de cada time.
 *
 * R&S e DP têm tom próprio porque são identidades; tudo o que não é de nenhum
 * dos dois compartilha o cinza, porque é a mesma informação ("não é tempo de
 * time") vinda de origens diferentes. Os tons passaram nos seis checks de
 * contraste e daltonismo — veja `app/globals.css`.
 */
export const COR: Record<Dono, string> = {
  'R&S': 'var(--time-rs)',
  DP: 'var(--time-dp)',
  Regional: 'var(--time-outro)',
  Fim: 'var(--time-outro)',
  'A mapear': 'var(--time-outro)',
};

/** O cinza é compartilhado, então a hachura é o que separa os três. */
export const TEXTURA: Partial<Record<Dono, string>> = {
  Fim: 'repeating-linear-gradient(135deg, transparent 0 3px, rgba(255,255,255,.45) 3px 5px)',
  'A mapear': 'repeating-linear-gradient(45deg, transparent 0 3px, rgba(255,255,255,.45) 3px 5px)',
};

/**
 * Como o time é chamado na tela.
 *
 * `Fim` não vira "fase final": ele cobre tanto as fases terminais (Processo
 * Seletivo Concluído, Vaga Cancelada) quanto as paradas — "Vaga Aberta
 * aguardando seleção" é a maior delas, e chamá-la de final diria que a vaga
 * acabou, quando ela só está parada sem ninguém agindo. O que as duas têm em
 * comum é não haver responsável, e é isso que o rótulo diz.
 */
export function rotuloDono(dono: Dono): string {
  return dono === 'A mapear' ? 'sem dono' : dono === 'Fim' ? 'sem responsável' : dono;
}

export function Amostra({ dono, titulo }: { dono: Dono; titulo?: string }) {
  return (
    <span
      aria-hidden="true"
      title={titulo}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
      style={{ background: COR[dono], backgroundImage: TEXTURA[dono] }}
    />
  );
}

export function LegendaJornada({ times }: { times: Dono[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
      {times.map((d) => (
        <li key={d} className="flex items-center gap-1.5">
          <Amostra dono={d} />
          {rotuloDono(d)}
        </li>
      ))}
    </ul>
  );
}

export interface DicaJornada {
  texto: string;
  detalhe: string;
  x: number;
  y: number;
}

/**
 * A barra de uma vaga: um pedaço por fase, na ordem em que aconteceram.
 *
 * Por fase e não por time somado, porque a alternância importa — uma vaga que
 * foi do R&S ao DP e voltou conta uma história diferente de uma que foi direto.
 * Fases seguidas do mesmo time encostam e se leem como um bloco só, e o vão de
 * 2px entre pedaços mantém a fronteira visível.
 *
 * `escala` é o total que corresponde à largura cheia. Passar a mesma escala
 * para todas as linhas de uma tabela faz as barras serem comparáveis entre si;
 * passar o total da própria vaga faz cada barra usar a largura toda, que serve
 * quando a linha é lida sozinha.
 */
export function BarraJornada({
  trechos,
  escala,
  altura = 'h-3',
  aoApontar,
  aoSair,
}: {
  trechos: Trecho[];
  escala: number;
  altura?: string;
  aoApontar?: (d: DicaJornada) => void;
  aoSair?: () => void;
}) {
  // Fases de duração zero existem (entrou e saiu no mesmo dia) e não ganham
  // largura: inventar um mínimo visível infla um tempo que não foi gasto.
  const visiveis = trechos.filter((t) => t.diasUteis > 0);

  if (visiveis.length === 0) {
    return (
      <div className={`flex ${altura} items-center`}>
        <span className="text-xs text-ink-muted">tudo no mesmo dia</span>
      </div>
    );
  }

  return (
    <div className={`flex ${altura} w-full items-stretch gap-[2px]`}>
      {visiveis.map((t, i) => {
        const titulo = `${t.fase} · ${rotuloDono(t.dono)} · ${numero(t.diasUteis)} ${t.diasUteis === 1 ? 'dia útil' : 'dias úteis'}`;
        return (
          <div
            key={`${t.fase}-${i}`}
            title={aoApontar ? undefined : titulo}
            onMouseEnter={
              aoApontar &&
              ((e) =>
                aoApontar({
                  texto: `${t.fase} · ${rotuloDono(t.dono)}`,
                  detalhe: `${numero(t.diasUteis)} ${t.diasUteis === 1 ? 'dia útil' : 'dias úteis'} · ${dataLonga(t.inicio)} → ${t.atual ? 'agora' : dataLonga(t.fim)}`,
                  x: e.clientX,
                  y: e.clientY,
                }))
            }
            onMouseLeave={aoSair}
            /* Arredondar só as pontas: o miolo encosta, as extremidades fecham. */
            className={`min-w-[3px] ${i === 0 ? 'rounded-l' : ''} ${i === visiveis.length - 1 ? 'rounded-r' : ''} ${t.atual ? 'ring-1 ring-ink-muted ring-inset' : ''}`}
            style={{
              width: `${(t.diasUteis / escala) * 100}%`,
              background: COR[t.dono],
              backgroundImage: TEXTURA[t.dono],
            }}
          />
        );
      })}
    </div>
  );
}

/** Soma os dias úteis por time, na ordem em que o processo acontece. */
export function somarTrechos(trechos: Trecho[]): { dono: Dono; diasUteis: number }[] {
  const ordem: Dono[] = ['R&S', 'DP', 'Regional', 'A mapear', 'Fim'];
  const mapa = new Map<Dono, number>();
  for (const t of trechos) mapa.set(t.dono, (mapa.get(t.dono) ?? 0) + t.diasUteis);
  return ordem.filter((d) => mapa.has(d)).map((d) => ({ dono: d, diasUteis: mapa.get(d) as number }));
}

/** Os números ao lado da barra — a barra dá a forma, estes dão a medida. */
export function NumerosPorTime({ trechos }: { trechos: Trecho[] }) {
  const totais = somarTrechos(trechos).filter(
    (t) => t.dono === 'R&S' || t.dono === 'DP' || (t.dono === 'A mapear' && t.diasUteis > 0),
  );

  if (totais.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
      {totais.map((t) => (
        <span key={t.dono} className="num flex items-center gap-1 whitespace-nowrap">
          <Amostra dono={t.dono} />
          <span className="text-ink-2">{rotuloDono(t.dono)}</span>
          <span className="font-medium">{numero(t.diasUteis)}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * A jornada aberta, como linha do tempo.
 *
 * Era uma tabela de cinco colunas, e lida assim a jornada não parecia uma
 * jornada: eram cinco listas paralelas que o olho tinha que recombinar. Aqui o
 * trilho à esquerda faz o trabalho — a ordem é visível, o ponto maior diz onde
 * o card está, e a cor de cada ponto diz de quem era o tempo.
 */
export function DetalheJornada({ trechos }: { trechos: Trecho[] }) {
  const maior = Math.max(1, ...trechos.map((t) => t.diasUteis));

  return (
    <ol className="flex flex-col">
      {trechos.map((t, i) => {
        const ultimo = i === trechos.length - 1;
        return (
          <li key={`${t.fase}-${i}`} className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3">
            {/* O trilho: ponto da fase e a linha que leva à seguinte. */}
            <div className="flex flex-col items-center">
              <span
                className={`mt-1.5 shrink-0 rounded-full ${t.atual ? 'size-3' : 'size-2'}`}
                style={{
                  background: COR[t.dono],
                  backgroundImage: TEXTURA[t.dono],
                  /*
                    O anel da fase atual sai de `box-shadow`, e não do utilitário
                    `ring`: este depende de uma variável interna do Tailwind que
                    não se define por style inline de forma confiável.
                  */
                  boxShadow: t.atual ? '0 0 0 3px color-mix(in srgb, var(--ink-muted) 45%, transparent)' : undefined,
                }}
              />
              {!ultimo && <span className="w-px flex-1 bg-borda" aria-hidden="true" />}
            </div>

            <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-0.5 ${ultimo ? 'pb-0' : 'pb-4'}`}>
              <span className={`text-sm ${t.atual ? 'font-semibold' : 'font-medium'}`}>
                {t.fase}
              </span>

              <span className="text-xs text-ink-2">{rotuloDono(t.dono)}</span>

              {t.atual && (
                <span className="rounded-full border border-[var(--marca-azul)] px-1.5 py-px text-[0.65rem] font-medium text-[var(--marca-azul)]">
                  está aqui
                </span>
              )}
              {!t.conta && <span className="text-xs text-ink-muted">não cobrado</span>}

              <span className="num ml-auto text-xs whitespace-nowrap text-ink-muted">
                {dataLonga(t.inicio)} → {t.atual ? 'agora' : dataLonga(t.fim)}
              </span>

              {/* A barra repete o número, e é o que deixa o pico saltar na leitura. */}
              <div className="flex w-full items-center gap-2">
                <div className="h-1.5 max-w-[16rem] flex-1 rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max((t.diasUteis / maior) * 100, 1.5)}%`,
                      background: COR[t.dono],
                      backgroundImage: TEXTURA[t.dono],
                    }}
                  />
                </div>
                <span className="num shrink-0 text-xs tabular-nums">
                  {numero(t.diasUteis)}{' '}
                  <span className="text-ink-muted">
                    {t.diasUteis === 1 ? 'dia útil' : 'dias úteis'}
                  </span>
                </span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
