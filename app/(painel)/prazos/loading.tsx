/** Prazos: duas listas editáveis, uma por escopo. */
import { CabecalhoEsqueleto, TabelaEsqueleto } from '@/components/Esqueleto';

export default function Carregando() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6" aria-busy="true">
      <span className="sr-only">Carregando os prazos…</span>
      <CabecalhoEsqueleto />
      <TabelaEsqueleto linhas={5} colunas={3} />
      <TabelaEsqueleto linhas={6} colunas={3} />
    </div>
  );
}
