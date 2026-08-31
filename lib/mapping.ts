import { ORDEM_MANUAL } from '../config/etapas.ts';

/** Tira acento, pontuação e caixa, para comparar nomes de etapa sem sofrer. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Etapas na ordem em que o candidato caminha. Quem não casar vai para o fim.
 *
 * A saída do funil vem PRIMEIRO na avaliação (embora receba a maior ordem):
 * "reprovado" contém "prova", e sem essa precedência ele cairia na etapa de
 * testes e apareceria no meio do funil.
 */
const ORDEM_ETAPAS: { ordem: number; termos: string[] }[] = [
  {
    ordem: 90,
    termos: [
      'reprovad(o|a)s?',
      'desisti(u|ram)',
      'desistencias?',
      'declin(ou|aram)',
      'eliminad(o|a)s?',
      'cancelad(o|a)s?',
      'nao selecionad(o|a)s?',
      'descartad(o|a)s?',
      'banco de talentos',
    ],
  },
  { ordem: 10, termos: ['inscrit(o|a)s?', 'cadastro', 'candidatura realizada', 'nov(o|a)s?', 'aplicou'] },
  { ordem: 20, termos: ['triagem', 'triagens', 'analise de curriculo', 'curriculo', 'screening'] },
  // Antes do grupo de provas: "Aula Teste" contém "teste", mas acontece bem
  // depois da prova online — é a aula demonstrativa do candidato.
  { ordem: 45, termos: ['aula teste', 'aula demonstrativa', 'aula pratica'] },
  { ordem: 35, termos: ['mapeamento', 'comportamental', 'perfil comportamental', 'fit cultural'] },
  { ordem: 30, termos: ['teste', 'testes', 'prova', 'provas', 'assessment', 'avaliacao', 'dinamica', 'desafio', 'exametric'] },
  { ordem: 40, termos: ['entrevista rh', 'entrevista inicial', 'entrevista com rh'] },
  { ordem: 50, termos: ['entrevista gestor', 'entrevista tecnica', 'entrevista final', 'entrevistas?'] },
  { ordem: 60, termos: ['proposta', 'oferta', 'negociacao'] },
  {
    ordem: 70,
    termos: [
      'exames?',
      'documentacao',
      'documentos',
      'antecedentes',
      'antecedentes criminais',
      'admissao',
      'contratacao',
      'contratad(o|a)s?',
    ],
  },
];

/**
 * Casa palavra inteira: evita que "reprovado" seja lido como "prova".
 * Os termos são fragmentos de regex, para cobrir plural e gênero sem repetir.
 */
function contemTermo(texto: string, termo: string): boolean {
  return new RegExp(`(^| )(${termo})( |$)`).test(texto);
}

export function ordemEtapa(etapa: string): number {
  const n = normalizar(etapa);

  // A configuração manual do instituto ganha da adivinhação.
  for (const [nome, ordem] of Object.entries(ORDEM_MANUAL)) {
    if (normalizar(nome) === n) return ordem;
  }

  for (const grupo of ORDEM_ETAPAS) {
    if (grupo.termos.some((t) => contemTermo(n, t))) return grupo.ordem;
  }
  return 80;
}

const TERMOS_ENCERRADO = [
  'reprovad(o|a)s?',
  'desisti(u|ram)',
  'desistencias?',
  'declin(ou|aram)',
  'eliminad(o|a)s?',
  'cancelad(o|a)s?',
  'nao selecionad(o|a)s?',
  'descartad(o|a)s?',
  'contratad(o|a)s?',
  'admitid(o|a)s?',
];

/** Candidato que já saiu do funil (reprovado, desistente ou contratado). */
export function estaEncerrado(etapa: string, status: string | null): 0 | 1 {
  const alvo = `${normalizar(etapa)} ${status ? normalizar(status) : ''}`;
  return TERMOS_ENCERRADO.some((t) => contemTermo(alvo, t)) ? 1 : 0;
}

/**
 * A etapa como o FUNIL deve exibir, que nem sempre é a etapa da Gupy.
 *
 * Quem foi reprovado na Prova Online continua marcado em "Prova Online" lá na
 * Gupy — e contá-lo ali infla a etapa com gente que já saiu. Aqui essas pessoas
 * viram fases próprias no fim do funil. A etapa original não se perde: ela
 * continua na lista de candidatos, mostrando ONDE a pessoa foi reprovada.
 */
export function etapaDoFunil(etapa: string, status: string | null): string {
  const alvo = `${normalizar(etapa)} ${status ? normalizar(status) : ''}`;

  if (['contratad(o|a)s?', 'admitid(o|a)s?'].some((t) => contemTermo(alvo, t))) {
    return 'Contratado';
  }
  if (
    ['desisti(u|ram)', 'desistencias?', 'declin(ou|aram)'].some((t) => contemTermo(alvo, t))
  ) {
    return 'Desistiu';
  }
  if (
    ['reprovad(o|a)s?', 'eliminad(o|a)s?', 'nao selecionad(o|a)s?', 'descartad(o|a)s?'].some((t) =>
      contemTermo(alvo, t),
    )
  ) {
    return 'Reprovado';
  }
  return etapa;
}

/** Converte data em vários formatos (BR, ISO) para YYYY-MM-DD. */
export function paraDataISO(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    return valor.toISOString().slice(0, 10);
  }

  const s = String(valor).trim();
  const br = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
