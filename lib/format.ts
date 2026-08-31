const numeroBR = new Intl.NumberFormat('pt-BR');

export function numero(valor: number): string {
  return numeroBR.format(valor);
}

export function comSinal(valor: number): string {
  if (valor === 0) return '0';
  return `${valor > 0 ? '+' : '−'}${numeroBR.format(Math.abs(valor))}`;
}

export function percentual(valor: number | null): string {
  if (valor === null) return '—';
  const abs = Math.abs(valor);
  const casas = abs < 10 && abs > 0 ? 1 : 0;
  const texto = valor.toFixed(casas).replace('.', ',');
  return `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${texto.replace('-', '')}%`;
}

/** 2026-08-14 -> 14/08 */
export function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

/** 2026-08-14 -> 14/08/2026 */
export function dataLonga(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** ISO completo -> "14/08/2026 às 17:23" */
export function dataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} às ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function diaDaSemana(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return DIAS[new Date(ano, mes - 1, dia).getDay()];
}
