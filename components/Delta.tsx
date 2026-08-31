import { comSinal, percentual } from '@/lib/format';

/**
 * Variação entre duas fotos. A seta e o sinal carregam o significado; a cor
 * apenas reforça, para quem não distingue verde de vermelho continuar lendo.
 */
export function Delta({
  valor,
  variacao,
  tamanho = 'md',
}: {
  valor: number;
  variacao?: number | null;
  tamanho?: 'sm' | 'md';
}) {
  const cor =
    valor > 0 ? 'text-[var(--alta)]' : valor < 0 ? 'text-[var(--baixa)]' : 'text-ink-muted';
  const seta = valor > 0 ? '↑' : valor < 0 ? '↓' : '→';
  const classe = tamanho === 'sm' ? 'text-xs' : 'text-sm';

  return (
    <span className={`num inline-flex items-baseline gap-1 font-medium ${cor} ${classe}`}>
      <span aria-hidden="true">{seta}</span>
      <span>{comSinal(valor)}</span>
      {variacao !== undefined && (
        <span className="text-ink-muted">({percentual(variacao)})</span>
      )}
    </span>
  );
}
