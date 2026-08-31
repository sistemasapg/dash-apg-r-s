'use client';

import { useEffect, useRef, useState } from 'react';
import type { PontoSerie } from '@/lib/types';
import { dataCurta, dataLonga, numero } from '@/lib/format';

const ALTURA = 240;
const MARGEM = { topo: 16, direita: 16, base: 28, esquerda: 44 };

/** Arredonda para 1, 2 ou 5 vezes uma potência de dez. */
function passoBonito(bruto: number): number {
  const potencia = 10 ** Math.floor(Math.log10(Math.max(bruto, 1)));
  const normalizado = bruto / potencia;
  const escolhido = normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 5 ? 5 : 10;
  return escolhido * potencia;
}

/**
 * Linha única com crosshair. SVG na mão em vez de biblioteca: são poucas linhas,
 * o bundle não cresce e as cores saem dos mesmos tokens do resto do dash.
 */
export function SerieHistorica({ dados, titulo }: { dados: PontoSerie[]; titulo: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(720);
  const [ativo, setAtivo] = useState<number | null>(null);

  useEffect(() => {
    const alvo = container.current;
    if (!alvo) return;
    const observador = new ResizeObserver(([entrada]) => {
      setLargura(Math.max(320, entrada.contentRect.width));
    });
    observador.observe(alvo);
    return () => observador.disconnect();
  }, []);

  if (dados.length < 2) {
    return (
      <section className="rounded-xl border border-borda bg-surface p-5">
        <h2 className="text-sm font-semibold">{titulo}</h2>
        <p className="mt-3 text-sm text-ink-muted">
          A série aparece a partir da segunda foto guardada.
        </p>
      </section>
    );
  }

  const larguraPlot = largura - MARGEM.esquerda - MARGEM.direita;
  const alturaPlot = ALTURA - MARGEM.topo - MARGEM.base;

  const maximo = Math.max(...dados.map((d) => d.total));
  const minimo = Math.min(...dados.map((d) => d.total));

  // Eixo em números redondos: 250/300/350 se lê muito melhor que 253/345/438.
  const amplitude = Math.max(1, maximo - minimo);
  let passo = passoBonito(amplitude / 3);
  let base = Math.max(0, Math.floor((minimo - amplitude * 0.1) / passo) * passo);
  let topo = Math.ceil((maximo + amplitude * 0.1) / passo) * passo;
  while ((topo - base) / passo > 6) {
    passo = passoBonito(passo * 1.5);
    base = Math.max(0, Math.floor(base / passo) * passo);
    topo = Math.ceil(topo / passo) * passo;
  }

  const x = (i: number) => MARGEM.esquerda + (i / (dados.length - 1)) * larguraPlot;
  const y = (v: number) => MARGEM.topo + (1 - (v - base) / Math.max(1, topo - base)) * alturaPlot;

  const caminho = dados.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(d.total)}`).join(' ');

  const marcas: number[] = [];
  for (let valor = base; valor <= topo + passo / 1000; valor += passo) marcas.push(valor);

  const aoMover = (evento: React.MouseEvent<SVGSVGElement>) => {
    const caixa = evento.currentTarget.getBoundingClientRect();
    const posicao = evento.clientX - caixa.left - MARGEM.esquerda;
    const indice = Math.round((posicao / larguraPlot) * (dados.length - 1));
    setAtivo(Math.min(dados.length - 1, Math.max(0, indice)));
  };

  const ponto = ativo !== null ? dados[ativo] : null;

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <h2 className="text-sm font-semibold">{titulo}</h2>

      <div ref={container} className="relative mt-3">
        <svg
          width={largura}
          height={ALTURA}
          role="img"
          aria-label={`${titulo}: de ${dataLonga(dados[0].data_ref)} a ${dataLonga(dados[dados.length - 1].data_ref)}`}
          onMouseMove={aoMover}
          onMouseLeave={() => setAtivo(null)}
        >
          {marcas.map((marca) => (
            <g key={marca}>
              <line
                x1={MARGEM.esquerda}
                x2={largura - MARGEM.direita}
                y1={y(marca)}
                y2={y(marca)}
                stroke="var(--grid)"
                strokeWidth={1}
              />
              <text
                x={MARGEM.esquerda - 8}
                y={y(marca) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--ink-muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {numero(marca)}
              </text>
            </g>
          ))}

          {dados.map((d, i) => {
            // Em séries longas, rotular todo dia vira ruído.
            const passo = Math.ceil(dados.length / 8);
            if (i % passo !== 0 && i !== dados.length - 1) return null;
            return (
              <text
                key={d.data_ref}
                x={x(i)}
                y={ALTURA - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--ink-muted)"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {dataCurta(d.data_ref)}
              </text>
            );
          })}

          <path d={caminho} fill="none" stroke="var(--serie-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {ativo !== null && ponto && (
            <g>
              <line
                x1={x(ativo)}
                x2={x(ativo)}
                y1={MARGEM.topo}
                y2={ALTURA - MARGEM.base}
                stroke="var(--baseline)"
                strokeWidth={1}
              />
              <circle
                cx={x(ativo)}
                cy={y(ponto.total)}
                r={5}
                fill="var(--serie-1)"
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </g>
          )}
        </svg>

        {ponto && (
          <div
            className="pointer-events-none absolute top-2 rounded-lg border border-borda bg-surface px-3 py-2 text-xs shadow-lg"
            style={{
              left: Math.min(Math.max(x(ativo ?? 0) - 60, 0), Math.max(0, largura - 140)),
            }}
          >
            <div className="font-medium">{dataLonga(ponto.data_ref)}</div>
            <div className="num mt-0.5 text-ink-2">{numero(ponto.total)} candidatos</div>
          </div>
        )}
      </div>
    </section>
  );
}
