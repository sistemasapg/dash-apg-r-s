/**
 * As categorias de vaga da APG, o SLA de cada uma e as funções que cabem nela.
 *
 * O SLA é o prazo de fechamento da vaga, em **dias úteis**, contado do dia
 * seguinte à abertura (D+1) até a finalização. É ele que diz se uma vaga está
 * no prazo, vencendo hoje ou atrasada.
 *
 * Mudar um número aqui muda o painel inteiro na hora — não há SLA copiado em
 * outro lugar do código.
 */

export interface Categoria {
  /** Prazo de fechamento em dias úteis, contado a partir de D+1. */
  slaDiasUteis: number;
  /**
   * As funções que essa categoria aceita.
   *
   * Hoje as quatro categorias têm lista, então o formulário mostra um `select`
   * em todas e o servidor recusa função de fora. Lista vazia continua sendo
   * tratada como campo livre — é a saída para uma categoria nova entrar aqui
   * antes de as funções dela serem levantadas, sem travar quem precisa lançar.
   */
  funcoes: string[];
}

export const CATEGORIAS: Record<string, Categoria> = {
  'Vagas Administrativas': {
    slaDiasUteis: 15,
    funcoes: [
      'Auxiliar Adm',
      'Inspetor de Aluno',
      'Merendeira',
      'ASG',
      'PAE',
      'Assistente Social',
      'Nutricionista',
      'Psicólogo',
      'Coordenador Administrativo',
    ],
  },

  'Vagas Professores': {
    slaDiasUteis: 7,
    funcoes: [
      'AEEI',
      'PEDAGOGO(A) SAREH',
      'PROFESSOR(A)',
      'PROFESSOR SALA DE RECURSO',
      'COORDENADOR(A) DE AREA',
      'COORDENADOR(A) DE CURSO',
      'COORDENADOR(A) ESTAGIO',
      'COORDENADOR(A) PEDAGOGICO',
      'PAC',
      'PAEE',
      'PROFESSOR(A) INTERPRETE',
      'SUPORTE TECNICO EDUCACAO PROFISSIONAL',
    ],
  },

  /*
    Estas duas têm uma função só, e é assim mesmo — não é lista pela metade.
    Confirmado com o R&S em 31/08/2026.
  */
  'Vagas Jovem Aprendiz': { slaDiasUteis: 10, funcoes: ['Jovem Aprendiz'] },
  'Vagas Estagiário': { slaDiasUteis: 10, funcoes: ['Tutor'] },
};

export const NOMES_CATEGORIAS = Object.keys(CATEGORIAS);

export function slaDaCategoria(categoria: string | null): number | null {
  if (!categoria) return null;
  return CATEGORIAS[categoria]?.slaDiasUteis ?? null;
}

/**
 * As funções de uma categoria. Devolve lista vazia tanto para categoria sem
 * lista definida quanto para categoria desconhecida — quem chama trata os dois
 * casos igual: campo livre.
 */
export function funcoesDaCategoria(categoria: string | null): string[] {
  if (!categoria) return [];
  return CATEGORIAS[categoria]?.funcoes ?? [];
}
