/**
 * Os dias que não contam no SLA, além de sábado e domingo.
 *
 * Um SLA de 7 dias úteis atravessa feriado com facilidade: ignorá-los faria o
 * dash acusar atraso numa vaga que ninguém teve como trabalhar. Por isso os
 * feriados entram na conta.
 *
 * Aqui estão os NACIONAIS. Feriado municipal ou estadual (aniversário da
 * cidade, Dia do Paraná) muda de unidade para unidade e não está contemplado —
 * acrescente em `FERIADOS_EXTRAS` conforme o R&S confirmar quais valem.
 */

/** Feriados nacionais de data fixa, como MM-DD. */
const FIXOS = [
  '01-01', // Confraternização Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independência
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamação da República
  '11-20', // Consciência Negra (nacional desde 2024)
  '12-25', // Natal
];

/**
 * Datas extras que não contam como dia útil, no formato YYYY-MM-DD.
 *
 * É aqui que entram feriado municipal, ponto facultativo que a APG concede e
 * recesso de fim de ano. Exemplo:
 *
 *     '2026-12-24', '2026-12-31',
 */
export const FERIADOS_EXTRAS: string[] = [];

/**
 * Carnaval e Corpus Christi não são feriados nacionais por lei — são pontos
 * facultativos. Na prática ninguém trabalha, e um SLA que os conta como dia
 * útil cobra do R&S um dia que ele não teve. Deixe `false` se a APG opera
 * normalmente nessas datas.
 */
const CONTAR_PONTOS_FACULTATIVOS = true;

/**
 * Domingo de Páscoa do ano, pelo algoritmo de Meeus/Jones/Butcher.
 * Dele saem Carnaval, Sexta-feira Santa e Corpus Christi.
 */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia));
}

function iso(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function somarDias(data: Date, dias: number): Date {
  return new Date(data.getTime() + dias * 86_400_000);
}

/*
  O conjunto de cada ano é calculado uma vez e guardado: o cálculo de dias úteis
  percorre dia a dia, e recomputar a Páscoa em cada passo seria desperdício puro.
*/
const cache = new Map<number, Set<string>>();

export function feriadosDoAno(ano: number): Set<string> {
  const guardado = cache.get(ano);
  if (guardado) return guardado;

  const datas = new Set<string>(FIXOS.map((md) => `${ano}-${md}`));

  const domingoDePascoa = pascoa(ano);
  datas.add(iso(somarDias(domingoDePascoa, -2))); // Sexta-feira Santa

  if (CONTAR_PONTOS_FACULTATIVOS) {
    datas.add(iso(somarDias(domingoDePascoa, -48))); // Carnaval (segunda)
    datas.add(iso(somarDias(domingoDePascoa, -47))); // Carnaval (terça)
    datas.add(iso(somarDias(domingoDePascoa, 60))); // Corpus Christi
  }

  for (const extra of FERIADOS_EXTRAS) {
    if (extra.startsWith(`${ano}-`)) datas.add(extra);
  }

  cache.set(ano, datas);
  return datas;
}

export function ehFeriado(dataISO: string): boolean {
  return feriadosDoAno(Number(dataISO.slice(0, 4))).has(dataISO);
}
