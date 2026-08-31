import { ehFeriado } from '../config/feriados.ts';

/**
 * Contas em dias úteis, que é como o SLA das vagas é medido.
 *
 * Tudo aqui trabalha em UTC de propósito. Uma data ISO como "2026-08-30" não
 * tem hora nem fuso; passá-la por `new Date('2026-08-30')` no horário de
 * Brasília devolveria 29/08 às 21h, e a vaga apareceria aberta um dia antes do
 * que está escrito.
 */

const DIA = 86_400_000;

function paraUTC(iso: string): number {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return Date.UTC(ano, mes - 1, dia);
}

function paraISO(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function ehDiaUtil(dataISO: string): boolean {
  const diaDaSemana = new Date(paraUTC(dataISO)).getUTCDay();
  if (diaDaSemana === 0 || diaDaSemana === 6) return false;
  return !ehFeriado(dataISO);
}

/**
 * Dias úteis decorridos entre a abertura e uma data de referência, na
 * contagem **D+1**: o dia da abertura não conta, o relógio começa no próximo
 * dia útil.
 *
 * Abrir numa sexta e olhar na sexta seguinte dá 5, não 7 — foram cinco dias em
 * que alguém pôde trabalhar na vaga.
 *
 * Referência anterior à abertura devolve 0, e não um número negativo: uma vaga
 * ainda não aberta não está consumindo prazo.
 */
export function diasUteisEntre(aberturaISO: string, referenciaISO: string): number {
  const inicio = paraUTC(aberturaISO);
  const fim = paraUTC(referenciaISO);
  if (fim <= inicio) return 0;

  let contagem = 0;
  // Começa no dia SEGUINTE à abertura: é o D+1.
  for (let ms = inicio + DIA; ms <= fim; ms += DIA) {
    if (ehDiaUtil(paraISO(ms))) contagem += 1;
  }
  return contagem;
}

/**
 * A data em que o prazo vence: o N-ésimo dia útil depois da abertura.
 *
 * SLA de 7 para uma vaga aberta numa segunda-feira sem feriado cai na terça da
 * semana seguinte — o dia em que a vaga PODE ser fechada ainda no prazo.
 */
export function prazoFinal(aberturaISO: string, slaDiasUteis: number): string {
  let ms = paraUTC(aberturaISO);
  let restantes = slaDiasUteis;

  // Trava de segurança: um SLA absurdo não pode virar laço infinito.
  const limite = ms + 3650 * DIA;

  while (restantes > 0 && ms < limite) {
    ms += DIA;
    if (ehDiaUtil(paraISO(ms))) restantes -= 1;
  }
  return paraISO(ms);
}

export type SituacaoSla = 'no-prazo' | 'vence-hoje' | 'atrasada' | 'cumprido' | 'estourado';

export interface Sla {
  /** Prazo da categoria, em dias úteis. */
  prazo: number;
  /** Dias úteis já consumidos, na contagem D+1. */
  decorridos: number;
  /** Positivo = ainda há folga; negativo = dias úteis de atraso. */
  saldo: number;
  /** Data em que o prazo vence (ou venceu). */
  vencimento: string;
  situacao: SituacaoSla;
}

/**
 * O estado do SLA de uma vaga.
 *
 * Vaga fechada é julgada contra a data de fechamento e recebe um veredito
 * definitivo (`cumprido` / `estourado`). Vaga aberta é julgada contra hoje e
 * ainda pode mudar de lado — daí os rótulos separados: "atrasada" é um chamado
 * à ação, "estourado" é um fato para relatório.
 */
export function calcularSla(
  aberturaISO: string,
  slaDiasUteis: number | null,
  fechamentoISO: string | null,
  hojeISO: string,
): Sla | null {
  if (slaDiasUteis === null) return null;

  const referencia = fechamentoISO ?? hojeISO;
  const decorridos = diasUteisEntre(aberturaISO, referencia);
  const saldo = slaDiasUteis - decorridos;
  const vencimento = prazoFinal(aberturaISO, slaDiasUteis);

  const situacao: SituacaoSla = fechamentoISO
    ? saldo >= 0
      ? 'cumprido'
      : 'estourado'
    : saldo < 0
      ? 'atrasada'
      : saldo === 0
        ? 'vence-hoje'
        : 'no-prazo';

  return { prazo: slaDiasUteis, decorridos, saldo, vencimento, situacao };
}
