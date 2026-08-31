export type ParamsBrutos = Record<string, string | string[] | undefined>;

/**
 * Valor de `comparar` que significa "não compare com nada".
 *
 * Precisa ser explícito: a ausência do parâmetro quer dizer "escolha a foto
 * anterior automaticamente", que é o comportamento padrão ao abrir o dash. Sem
 * esse sentinela, escolher "sem comparação" apenas removia o parâmetro e o
 * automático trazia a comparação de volta — a opção ficava inclicável.
 */
export const SEM_COMPARACAO = 'nenhum';

export interface Filtro {
  data: string | undefined;
  comparar: string | undefined;
  apenasAtivos: boolean;
  /** Vazio = todas as vagas. */
  vagas: string[];
  /** Etapa do funil escolhida no clique. Vazio = todas. */
  etapa: string | undefined;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerFiltro(params: ParamsBrutos): Filtro {
  const vagas = primeiro(params.vagas);
  return {
    data: primeiro(params.data),
    comparar: primeiro(params.comparar),
    apenasAtivos: primeiro(params.ativos) === '1',
    vagas: vagas ? vagas.split(',').filter(Boolean) : [],
    etapa: primeiro(params.etapa) || undefined,
  };
}

/** Reconstrói a query string para os links internos manterem a seleção. */
export function queryDoFiltro(filtro: Filtro, sobrescrever: Partial<Filtro> = {}): string {
  const f = { ...filtro, ...sobrescrever };
  const p = new URLSearchParams();
  if (f.data) p.set('data', f.data);
  if (f.comparar) p.set('comparar', f.comparar);
  if (f.apenasAtivos) p.set('ativos', '1');
  if (f.vagas.length > 0) p.set('vagas', f.vagas.join(','));
  if (f.etapa) p.set('etapa', f.etapa);
  const texto = p.toString();
  return texto ? `?${texto}` : '';
}
