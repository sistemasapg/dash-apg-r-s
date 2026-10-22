/** Pendências: um cartão por dono e a lista do que está parado. */
import { PainelEsqueleto } from '@/components/Esqueleto';

export default function Carregando() {
  return <PainelEsqueleto cartoes={3} filtros={false} colunas={6} />;
}
