import type { Trecho } from './jornada.ts';
import type { Dono } from '../config/etapas-pipefy.ts';

/**
 * O SLA medido por time, e não pela vaga inteira.
 *
 * O modelo antigo somava tudo e comparava com o prazo da categoria. Era
 * verdadeiro e inútil: numa vaga real de 04/09, o R&S levou 4 dias úteis e o
 * DP levou 13, e o painel dizia "13 contra 15, no prazo". Ninguém era cobrado,
 * porque o número não apontava para ninguém.
 *
 * Aqui cada time responde pela sua régua:
 *
 *   R&S — o prazo da CATEGORIA, medido sobre a soma do tempo dele. É um prazo
 *         de entrega: quanto o recrutamento tem para achar e entregar a pessoa.
 *
 *   DP  — o prazo do TIME, medido sobre a soma do tempo dele. São 2 dias úteis
 *         para a admissão inteira, não por etapa. O número vai parecer ruim, e
 *         é para parecer: a mediana medida é de 7 dias úteis contra um ideal de
 *         2, e esconder isso numa média por fase seria esconder o problema que
 *         o indicador existe para mostrar.
 *
 * As duas leituras convivem porque são perguntas diferentes, e as duas áreas
 * acompanham a sua. A forma na tela é a mesma — `usado / prazo` — porque a
 * conta é a mesma: tempo somado contra um limite.
 *
 * As fases que mais consumiram continuam guardadas em `fasesForaDoPrazo`, não
 * para cobrar cada uma, mas para a tela poder dizer ONDE os dias foram quando
 * alguém perguntar.
 */

export interface FaseForaDoPrazo {
  fase: string;
  diasUteis: number;
  prazo: number;
}

export interface SlaDoTime {
  dono: Dono;
  /** Soma dos dias úteis que o time segurou a vaga. */
  diasUteis: number;
  /** Quantas fases do time a vaga visitou. */
  fases: number;
  /**
   * A régua. Para o R&S é o prazo da categoria, e vale para o total; para o
   * DP é o prazo por fase. `null` quando não há prazo acordado.
   */
  prazo: number | null;
  /** O prazo se aplica ao total do time ou a cada fase dele? */
  medida: 'total' | 'por-fase';
  /** Cumpriu? `null` sem prazo. */
  dentroDoPrazo: boolean | null;
  /** Dias úteis de atraso. Zero quando está no prazo. */
  atraso: number;
  /** Só para a medida por fase: quais estouraram, da pior para a menos ruim. */
  fasesForaDoPrazo: FaseForaDoPrazo[];
}

function soma(trechos: Trecho[]): number {
  return trechos.reduce((s, t) => s + t.diasUteis, 0);
}

/**
 * Mede um time numa vaga.
 *
 * `prazo` nulo devolve a leitura sem cobrança — o tempo aparece, a cobrança
 * não. É a diferença entre "levou 7 dias" e "levou 7 dias e deveria ser 2", e
 * inventar a segunda quando ninguém combinou o prazo seria acusar contra uma
 * régua que não existe.
 */
export function medirTime(
  dono: Dono,
  trechos: Trecho[],
  prazo: number | null,
  medida: 'total' | 'por-fase',
): SlaDoTime {
  const doTime = trechos.filter((t) => t.dono === dono);
  const diasUteis = soma(doTime);

  const base: SlaDoTime = {
    dono,
    diasUteis,
    fases: doTime.length,
    prazo,
    medida,
    dentroDoPrazo: null,
    atraso: 0,
    fasesForaDoPrazo: [],
  };

  if (prazo === null || doTime.length === 0) return base;

  if (medida === 'total') {
    /*
      As fases que mais pesaram, da maior para a menor, para a tela explicar
      de onde vieram os dias. Não são "fases fora do prazo" — o prazo é do
      conjunto —, são as que consumiram o tempo.
    */
    const maiores = doTime
      .filter((t) => t.diasUteis > 0)
      .map((t) => ({ fase: t.fase, diasUteis: t.diasUteis, prazo }))
      .sort((a, b) => b.diasUteis - a.diasUteis);

    return {
      ...base,
      dentroDoPrazo: diasUteis <= prazo,
      atraso: Math.max(0, diasUteis - prazo),
      fasesForaDoPrazo: maiores,
    };
  }

  const fora = doTime
    .filter((t) => t.diasUteis > prazo)
    .map((t) => ({ fase: t.fase, diasUteis: t.diasUteis, prazo }))
    .sort((a, b) => b.diasUteis - a.diasUteis);

  return {
    ...base,
    dentroDoPrazo: fora.length === 0,
    // O pior estouro, e não a soma: é ele que diz onde o processo travou.
    atraso: fora.length ? fora[0].diasUteis - prazo : 0,
    fasesForaDoPrazo: fora,
  };
}

export interface SlaPorTime {
  rs: SlaDoTime;
  dp: SlaDoTime;
}

/** As duas leituras de uma vaga, prontas para a tela. */
export function medirVaga(
  trechos: Trecho[],
  prazoDaCategoria: number | null,
  prazoDoDp: number | null,
): SlaPorTime {
  return {
    rs: medirTime('R&S', trechos, prazoDaCategoria, 'total'),
    // Total, e não por fase: os 2 dias são para a admissão inteira.
    dp: medirTime('DP', trechos, prazoDoDp, 'total'),
  };
}

export interface AderenciaDoTime {
  dono: Dono;
  /** Vagas que passaram pelo time e tinham prazo a cumprir. */
  medidas: number;
  dentro: number;
  /** Fração de 0 a 1. `null` quando não há o que medir. */
  aderencia: number | null;
  /** Mediana de dias úteis do time, entre as vagas que passaram por ele. */
  mediana: number;
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Quantas vagas cada time entregou no prazo, no recorte.
 *
 * Nenhuma tela usa isto hoje. Os dois cartões de aderência — "R&S no prazo" e
 * "DP no prazo" — saíram do Dashboard em 22/10/2026: com recorte curto a
 * amostra fica pequena e a porcentagem balança demais (77% e 6% no histórico
 * todo viravam 96% e 48% no mês), o que convida a comemorar ou se assustar com
 * ruído. A aderência por vaga continua visível nos selos de cada linha.
 *
 * Fica aqui, coberta por teste, porque a conta está certa e o cálculo é o
 * mesmo — se a leitura agregada voltar, por período longo ou com amostra
 * mínima, é só chamar.
 */
export function aderenciaPorTime(leituras: SlaPorTime[]): AderenciaDoTime[] {
  return (['rs', 'dp'] as const).map((qual) => {
    const todas = leituras.map((l) => l[qual]).filter((s) => s.fases > 0);
    const comPrazo = todas.filter((s) => s.dentroDoPrazo !== null);
    const dentro = comPrazo.filter((s) => s.dentroDoPrazo).length;

    return {
      dono: qual === 'rs' ? ('R&S' as Dono) : ('DP' as Dono),
      medidas: comPrazo.length,
      dentro,
      aderencia: comPrazo.length === 0 ? null : dentro / comPrazo.length,
      mediana: mediana(todas.map((s) => s.diasUteis)),
    };
  });
}
