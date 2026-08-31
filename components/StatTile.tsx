import { numero } from '@/lib/format';
import { Delta } from './Delta';

export function StatTile({
  rotulo,
  valor,
  delta,
  variacao,
  nota,
  sufixo,
  destaque = false,
  aoClicar,
  ativo = false,
  dicaClique,
}: {
  rotulo: string;
  valor: number;
  delta?: number;
  variacao?: number | null;
  nota?: string;
  /** Unidade colada no número, como % — em vez de virar poluição no rótulo. */
  sufixo?: string;
  destaque?: boolean;
  /**
   * Quando o número representa um conjunto de vagas, clicar mostra quais são.
   * Sem isto o cartão é só um número, e o caminho até a lista é adivinhação.
   */
  aoClicar?: () => void;
  ativo?: boolean;
  /**
   * O que o clique faz, na linha de baixo do cartão.
   *
   * É um texto e não um automático porque nem todo cartão clicável filtra:
   * "Vagas em aberto" leva à lista inteira, "Fora do prazo" recorta. Prometer
   * "clique para tirar" num cartão que não tira nada foi exatamente o defeito
   * que este parâmetro corrige.
   */
  dicaClique?: string;
}) {
  const conteudo = (
    <>
      <div className="text-sm text-ink-2">{rotulo}</div>
      <div className={`num mt-2 font-semibold tracking-tight ${destaque ? 'text-5xl' : 'text-3xl'}`}>
        {numero(valor)}
        {sufixo && <span className="ml-0.5 text-2xl font-normal text-ink-2">{sufixo}</span>}
      </div>
      <div className="mt-2 min-h-5">
        {delta !== undefined && <Delta valor={delta} variacao={variacao} />}
      </div>
      {nota && <div className="mt-1 text-xs text-ink-muted">{nota}</div>}
    </>
  );

  const base = 'rounded-xl border bg-surface p-5';

  if (!aoClicar) {
    return <div className={`${base} border-borda`}>{conteudo}</div>;
  }

  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={`${base} w-full text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)] ${
        // A borda marca a seleção sem trocar o fundo: o cartão continua legível
        // e não compete com os outros três ao lado.
        ativo ? 'border-[var(--marca-azul)]' : 'border-borda'
      }`}
    >
      {conteudo}
      <span className="mt-2 block text-xs text-[var(--marca-azul)]">
        {dicaClique ?? 'clique para ver as vagas'}
      </span>
    </button>
  );
}
