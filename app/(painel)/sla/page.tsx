import { redirect } from 'next/navigation';

/**
 * O painel de SLA virou a tela inicial.
 *
 * Esta rota fica de pé só para não quebrar link salvo ou favorito de quem
 * conheceu o dash quando o SLA era uma aba à parte. Se um dia o Dashboard
 * ganhar conteúdo próprio e o SLA voltar a ser uma tela separada, é aqui que
 * ele volta a morar.
 */
export default function Pagina() {
  redirect('/');
}
