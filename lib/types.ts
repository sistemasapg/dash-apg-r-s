import type { Sla } from './uteis.ts';

/** Uma candidatura da Gupy já traduzida para o vocabulário do dash. */
export interface LinhaNormalizada {
  chave: string;
  vaga_codigo: string;
  vaga_nome: string;
  /** A etapa como está na Gupy. */
  etapa: string;
  /** A etapa como o funil exibe: reprovados e contratados viram fases próprias. */
  etapa_funil: string;
  ordem_etapa: number;
  status: string | null;
  candidato_nome: string | null;
  candidato_email: string | null;
  origem: string | null;
  recrutador: string | null;
  aplicou_em: string | null;
  /** Última alteração da candidatura na Gupy — base para "parado há X dias". */
  atualizado_em: string | null;
  encerrado: 0 | 1;
}

/**
 * Os dados da própria vaga no dia da foto. Ficam à parte das candidaturas
 * porque mudam de outro jeito: uma vaga congela, muda de nome ou fecha, e isso
 * precisa ficar registrado no dia em que aconteceu.
 */
export interface VagaSnapshot {
  vaga_codigo: string;
  vaga_nome: string;
  status: string | null;
  unidade: string | null;
  departamento: string | null;
  funcao: string | null;
  tipo: string | null;
  posicoes: number | null;
  criada_em: string | null;
}

export interface VagaDetalhe extends VagaSnapshot {
  /** Dias entre a abertura da vaga e a data da foto. */
  diasAberta: number | null;
}

export interface Snapshot {
  id: number;
  data_ref: string;
  arquivo: string | null;
  importado_em: string;
  total_linhas: number;
}

export interface LinhaVaga {
  vaga_codigo: string;
  vaga_nome: string;
  atual: number;
  anterior: number;
  delta: number;
  variacao: number | null;
}

export interface LinhaEtapa {
  etapa: string;
  ordem: number;
  atual: number;
  anterior: number;
  delta: number;
}

export interface PontoSerie {
  data_ref: string;
  total: number;
}

export interface Movimentacao {
  chave: string;
  candidato_nome: string | null;
  vaga_codigo: string;
  vaga_nome: string;
  tipo: 'novo' | 'avancou' | 'voltou' | 'encerrou' | 'saiu';
  de: string | null;
  para: string | null;
}

/**
 * Uma vaga aberta no Pipefy, lançada à mão pelo R&S.
 *
 * É o outro lado do dash: a Gupy conta candidatos, o Pipefy conta a vaga em si
 * — desde quando está aberta, de qual regional e unidade, e qual publicação da
 * Gupy responde por ela.
 */
export interface VagaPipefy {
  id: number;
  /** O ID do card no Pipefy, como aparece na URL. É a identidade da vaga. */
  card_id: string;
  titulo: string;
  /** Define o SLA da vaga. Ver config/categorias.ts. */
  categoria: string | null;
  /** A função dentro da categoria. Livre nas categorias sem lista definida. */
  funcao: string | null;
  regional: string | null;
  unidade: string | null;
  /** Data em que a vaga passou a estar aberta, digitada pelo R&S. */
  aberta_em: string;
  /** Preenchida ao encerrar. Null enquanto a vaga estiver aberta. */
  fechada_em: string | null;
  situacao: 'aberta' | 'fechada' | 'cancelada';
  /** Código da vaga na Gupy. Null enquanto não houver publicação vinculada. */
  vaga_codigo: string | null;
  observacao: string | null;
  criada_em: string;
  atualizada_em: string;
}

/** A vaga do Pipefy com o que a Gupy sabe sobre ela na foto selecionada. */
export interface VagaPipefyComNumeros extends VagaPipefy {
  /**
   * Dias entre a abertura e o fechamento — ou entre a abertura e hoje, se a
   * vaga ainda estiver aberta.
   */
  dias: number;
  /** Nome da vaga na Gupy. Null quando não há vínculo ou a vaga saiu do ar. */
  gupy_nome: string | null;
  /** Candidatos na foto atual. Null quando não há vínculo com a Gupy. */
  candidatos: number | null;
  candidatosAntes: number | null;
  /** Candidatos que já saíram do funil (reprovados, desistentes, contratados). */
  encerrados: number | null;
  /**
   * O estado do prazo. Null quando a vaga não tem categoria — sem categoria
   * não há SLA, e inventar um cobraria do time um prazo que ninguém acordou.
   */
  sla: Sla | null;
}
