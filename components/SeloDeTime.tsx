'use client';

import type { SlaDoTime, SlaPorTime } from '@/lib/sla-time';
import { numero } from '@/lib/format';
import { Amostra } from './Jornada';

/**
 * O SLA de um time, num selo que se lê sem parar para interpretar.
 *
 * A forma é sempre a mesma — ponto do time, nome, `usado / prazo`, e um ícone
 * de situação. Repetida em todas as telas, ela deixa de precisar de legenda: o
 * olho aprende o padrão uma vez.
 *
 *   ● R&S   4d / 15   ✓      entregou dentro do prazo da categoria
 *   ● R&S   9d / 7    ▲ 2    dois dias úteis além do prazo
 *   ● DP    1d / 2    ✓      a admissão saiu rápido
 *   ● DP   13d / 2    ▲ 11   a admissão levou onze dias além
 *
 * O ícone nunca aparece sozinho: quem não distingue vermelho de verde lê o ▲
 * e o número ao lado do mesmo jeito.
 */
function Selo({ sla, compacto = false }: { sla: SlaDoTime; compacto?: boolean }) {
  if (sla.fases === 0) return null;

  const cor =
    sla.dentroDoPrazo === null
      ? 'text-ink-muted'
      : sla.dentroDoPrazo
        ? 'text-[var(--alta)]'
        : 'text-[var(--baixa)]';

  /*
    Mesma forma para os dois, porque voltou a ser a mesma conta: dias somados
    contra um limite. `9d / 7` se lê direto — usou 9 de 7.
  */
  const medida = `${numero(sla.diasUteis)}d / ${sla.prazo === null ? '—' : numero(sla.prazo)}`;

  /*
    A seta com o número de dias passados do prazo.

    Ela chegou a virar "✕ 2 a mais" quando foi lida como variação — mas o
    problema era outro: o selo comparava a soma das fases do DP com o limite de
    uma fase só, e nenhum símbolo salva um número errado. Com a conta certa, a
    seta volta a se ler como se espera, e é mais curta.
  */
  const situacao =
    sla.dentroDoPrazo === null
      ? 'sem prazo'
      : sla.dentroDoPrazo
        ? '✓'
        : `▲ ${numero(sla.atraso)}`;

  const ondeFoi = sla.fasesForaDoPrazo
    .slice(0, 3)
    .map((f) => `${f.fase} (${f.diasUteis})`)
    .join(', ');

  const titulo =
    sla.prazo === null
      ? `${sla.dono}: ${sla.diasUteis} dias úteis, sem prazo acordado`
      : `${sla.dono}: ${sla.diasUteis} dias úteis somados em ${sla.fases} ${sla.fases === 1 ? 'fase' : 'fases'}, ` +
        `contra um prazo de ${sla.prazo}` +
        (ondeFoi ? ` — onde o tempo foi: ${ondeFoi}` : '');

  return (
    <span className="num inline-flex items-center gap-1 whitespace-nowrap text-xs" title={titulo}>
      <Amostra dono={sla.dono} />
      {!compacto && <span className="text-ink-2">{sla.dono}</span>}
      <span className="font-medium tabular-nums">{medida}</span>
      <span className={`font-medium ${cor}`}>{situacao}</span>
    </span>
  );
}

/**
 * As duas leituras lado a lado.
 *
 * Sempre nesta ordem — R&S e depois DP — porque é a ordem do processo. Trocar
 * conforme qual estourou faria o olho procurar a cada linha.
 */
export function SelosDeTime({
  sla,
  compacto = false,
}: {
  sla: SlaPorTime;
  compacto?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <Selo sla={sla.rs} compacto={compacto} />
      <Selo sla={sla.dp} compacto={compacto} />
    </div>
  );
}

/**
 * A explicação das duas réguas, para o rodapé da tela.
 *
 * Fica junto dos selos porque a pergunta "por que o DP é 2 e o R&S é 15?"
 * aparece na primeira vez que alguém olha, e a resposta não cabe num tooltip.
 */
export function LegendaDosTimes({ prazoDp }: { prazoDp: number | null }) {
  return (
    <p className="text-xs text-ink-muted">
      <strong>Duas réguas, uma para cada área.</strong> O{' '}
      <span className="inline-flex items-center gap-1 align-middle">
        <Amostra dono="R&S" /> R&amp;S
      </span>{' '}
      é medido pelo <strong>prazo da categoria</strong> sobre o tempo total dele — é prazo de
      entrega. O{' '}
      <span className="inline-flex items-center gap-1 align-middle">
        <Amostra dono="DP" /> DP
      </span>{' '}
      é medido pelo <strong>tempo somado das fases dele</strong>, com{' '}
      {prazoDp === null
        ? 'o prazo ainda não acordado'
        : `${numero(prazoDp)} dias úteis para a admissão inteira`}
      . Os dois se leem igual: <strong>dias usados / prazo</strong>. Passe o mouse para ver em
      quais fases o tempo foi.
    </p>
  );
}
