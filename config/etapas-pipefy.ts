/**
 * Quem é dono de cada etapa do pipe, e em quantos dias úteis ela deve sair.
 *
 * É um modelo diferente do SLA da vaga: em vez de cobrar o tempo inteiro de um
 * time só, cada etapa responde pelo seu pedaço. O R&S responde pela seleção; o
 * DP, pela admissão. Um card parado há 10 dias em documentação é problema do
 * DP, e o painel precisa dizer isso em vez de somar tudo contra o R&S.
 *
 * Donos levantados com o R&S em 19/10/2026.
 */

export type Dono = 'R&S' | 'DP' | 'Regional' | 'Fim' | 'A mapear';

export interface Etapa {
  dono: Dono;
  /**
   * Prazo em dias ÚTEIS para sair da etapa.
   *
   * `null` = ainda não acordado com a área. A etapa aparece, com o tempo
   * parado, mas sem cobrança — melhor do que inventar uma régua.
   */
  slaDiasUteis: number | null;
}

/**
 * Donos que NÃO entram na conta de tempo cobrado.
 *
 * `Regional` é a aprovação do diretor — não é trabalho de R&S nem de DP, e
 * somá-lo a qualquer um dos dois cobraria de quem não decidiu. `Fim` são as
 * fases terminais, onde o processo acabou e não há mais o que correr.
 */
export const DONOS_SEM_COBRANCA: Dono[] = ['Regional', 'Fim', 'A mapear'];

export const ETAPAS: Record<string, Etapa> = {
  /* --- R&S: da triagem até entregar o candidato ao DP --- */
  'Triagem de Candidatos': { dono: 'R&S', slaDiasUteis: null },
  'Análise de P&C': { dono: 'R&S', slaDiasUteis: null },
  Prova: { dono: 'R&S', slaDiasUteis: null },
  'Aula Teste': { dono: 'R&S', slaDiasUteis: null },

  /*
    Estas duas eram do DP até 21/10/2026, quando o R&S corrigiu: quem persegue
    o candidato para juntar a documentação é o recrutamento, não o pessoal.
    O DP só entra quando os papéis chegam.

    O prazo de 2 dias úteis da documentação continua valendo — ele é da etapa,
    não do time, e foi acordado antes desta correção de dono.
  */
  'Pronto para Admissão': { dono: 'R&S', slaDiasUteis: null },
  /*
    Os 2 dias úteis que viviam aqui eram, na verdade, a régua do DP — e esta
    fase é do R&S desde 21/10/2026. O prazo saiu da fase e virou prazo do TIME,
    em `lib/prazos.ts`: o DP tem 2 dias úteis em cada fase sua, e o R&S é
    medido pelo prazo da categoria sobre o tempo total dele.
  */
  'Aguardando envio da documentação': { dono: 'R&S', slaDiasUteis: null },

  /*
    "Iniciado" é o começo da seleção, não o fim de nada — estava como fase
    final por engano meu, ao lado de "Concluído", por causa da semelhança dos
    nomes. Corrigido com o R&S em 21/10/2026.
  */
  'Processo Seletivo Iniciado': { dono: 'R&S', slaDiasUteis: null },

  /* --- DP: do exame admissional ao cadastro --- */
  'Aguardando o Exame Admissional': { dono: 'DP', slaDiasUteis: null },
  'Atualizar  ou Cadastrar no Domínio': { dono: 'DP', slaDiasUteis: null },
  'Lançamento do Pagamento de Benefícios': { dono: 'DP', slaDiasUteis: null },
  'Aprovação do Pagamento de Benefícios': { dono: 'DP', slaDiasUteis: null },
  'Documentação Enviada (Estagiário)': { dono: 'DP', slaDiasUteis: null },
  'Mobilidade Interna': { dono: 'DP', slaDiasUteis: null },
  'Apto para início das atividades': { dono: 'DP', slaDiasUteis: null },

  /* --- Fora da conta --- */
  'Aprovação do Diretor Regional': { dono: 'Regional', slaDiasUteis: null },

  /*
    Fases "mortas": sem responsável, ninguém age sobre o card ali. Não entram na
    lista de pendências. Vaga Aberta aguardando seleção e Vaga Cancelada foram
    definidas assim com o R&S em 19/10/2026.
  */
  'Vaga Aberta aguardando seleção': { dono: 'Fim', slaDiasUteis: null },
  'Processo Seletivo Concluído': { dono: 'Fim', slaDiasUteis: null },
  'Vaga Cancelada': { dono: 'Fim', slaDiasUteis: null },
  Arquivada: { dono: 'Fim', slaDiasUteis: null },
};

/**
 * A fase onde a vaga termina preenchida.
 *
 * Não é pendência de ninguém — o processo acabou. Sai da lista de pendências e
 * vai para a seção de concluídos, onde o que interessa é o SLA que a vaga teve.
 */
export const FASE_CONCLUIDA = 'Processo Seletivo Concluído';

/**
 * A tela de pendências só olha vagas criadas a partir desta data.
 *
 * O histórico anterior tem mais de dois mil cards, muitos cancelados ou
 * arquivados há mais de um ano, e eles afogavam as pendências reais com tempos
 * parados que não significam nada. Decidido com o R&S em 19/10/2026.
 */
export const INICIO_DO_ACOMPANHAMENTO = '2026-09-01';

/*
  O nome "Atualizar  ou Cadastrar no Domínio" tem DOIS espaços depois de
  "Atualizar" — é assim no Pipefy. Corrigir aqui quebraria o casamento com a
  coluna do relatório, que carrega o nome da fase no meio do próprio nome.
*/

/**
 * Etapas que existem no pipe mas ainda não têm dono definido.
 *
 * Ficam fora da conta de tempo por time, e a tela as mostra em cinza — um
 * tempo sem dono é visível e cobrável depois, enquanto atribuí-lo ao time
 * errado seria invisível e falso.
 */
export function donoDaEtapa(fase: string): Dono {
  return ETAPAS[fase]?.dono ?? 'A mapear';
}

export function slaDaEtapa(fase: string): number | null {
  return ETAPAS[fase]?.slaDiasUteis ?? null;
}

/** O tempo nesta etapa é cobrado de alguém? */
export function etapaConta(fase: string): boolean {
  return !DONOS_SEM_COBRANCA.includes(donoDaEtapa(fase));
}

/** Os times que respondem por tempo, na ordem em que o processo acontece. */
export const TIMES: Dono[] = ['R&S', 'DP'];

/* ------------------------------------------------------------------------ */

/**
 * Os nomes das colunas do relatório, que mudam conforme a fase.
 *
 * O relatório do Pipefy cria três colunas POR FASE, com o nome da fase no meio
 * do nome da coluna. Montá-las aqui evita espalhar essa concatenação pelo
 * código — e deixa num lugar só o que quebra se alguém renomear uma fase.
 */
export const colunaEntrouNaFase = (fase: string) => `Primeira vez que entrou na fase ${fase}`;
export const colunaSaiuDaFase = (fase: string) => `Última vez que saiu da fase ${fase}`;

/**
 * NÃO use a coluna "Tempo total na fase X (dias)".
 *
 * Ela existe no relatório, mas não sobrevive à ida para o Google Sheets: o
 * ponto decimal é lido como separador de milhar, e `4.98265` dias viram
 * `498.265`. Medido em 19/10/2026, nas 15 linhas das etapas acompanhadas.
 *
 * O tempo é calculado a partir da data de entrada, que atravessa limpa — e de
 * quebra sai em dias úteis (o Pipefy dá corridos) e fica vivo, em vez de
 * congelado no horário da exportação.
 */
