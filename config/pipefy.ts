/**
 * O de-para entre o Pipefy e o vocabulário do dash.
 *
 * Tudo que é escolha — e não mecânica — mora aqui, para o R&S poder discordar
 * de uma linha sem ninguém precisar ler o código do sync.
 *
 * Os números entre parênteses são a contagem real no pipe, levantada em
 * 14/10/2026 com `npm run pipefy:descobrir`.
 */

/* ------------------------------------------------------------------------ */
/* 1. Que cards entram                                                       */
/* ------------------------------------------------------------------------ */

/**
 * Histórico a partir desta data. Antes dela, só entra o que ainda está aberto.
 *
 * O corte por data sozinho não serve: dos 127 cards abertos hoje, 68 são
 * anteriores a setembro — e são justamente os mais atrasados, que são os que
 * alguém deveria estar vendo. Por isso a regra é "tudo que está aberto, mais o
 * histórico recente".
 */
export const DESDE = '2026-09-01';

/* ------------------------------------------------------------------------ */
/* 2. Fase do Pipefy -> situação no dash                                      */
/* ------------------------------------------------------------------------ */

/**
 * Fases que encerram a vaga: **a pessoa já foi escolhida**.
 *
 * Esta é a decisão que mais mexe no número do painel, e vale entender o porquê.
 *
 * O pipe continua depois da seleção: documentação, exame admissional,
 * lançamento de benefícios, pronto para admissão. Nada disso é trabalho de
 * R&S — mas tudo isso conta se a vaga só "fechar" quando o card sai do pipe.
 *
 * Medindo pelo fim do card, a mediana das vagas fechadas é de 24 a 80 dias
 * úteis contra SLAs de 7 a 15, e o dash nasceria dizendo que o time cumpre
 * entre 11% e 34% do prazo. Medindo pelo fim da SELEÇÃO, o dash cobra do R&S
 * só o que é do R&S.
 *
 * Se o R&S disser que o SLA vai até a admissão de fato, mova estas fases para
 * `FASES_ABERTAS` e o painel se ajusta sozinho.
 */
/**
 * Fases em que a vaga está encerrada.
 *
 * É uma só, e foi decisão do R&S em 21/10/2026: a vaga está aberta enquanto
 * não chegou a "Processo Seletivo Concluído" e não foi arquivada ou cancelada.
 *
 * Antes havia nove fases aqui — todas as de admissão entravam, porque a vaga
 * "já tinha dono". Era defensável para medir *tempo até preencher*, mas
 * produzia um painel que dizia **13 vagas em aberto em todo o histórico do
 * pipe**, enquanto 48 vagas tinham um time trabalhando nelas naquele instante.
 * Um número que ninguém reconhece não serve, por mais correta que seja a
 * definição por trás.
 *
 * A vaga ficar aberta até o fim do processo criou, por um dia, um problema de
 * medição: o relógio passava a cobrar a admissão contra o prazo da categoria,
 * que foi pensado para a seleção. Resolvido em 21/10/2026 com dois relógios —
 * `lib/sla-time.ts` mede o R&S pelo prazo da categoria sobre o tempo dele, e o
 * DP por 2 dias úteis sobre o tempo da admissão. A situação da vaga e a
 * cobrança de prazo deixaram de ser a mesma conta.
 */
export const FASES_FECHADAS = ['Processo Seletivo Concluído']; // 1.408 cards

/** Fases que tiram a vaga de cena sem ela ter sido preenchida. */
export const FASES_CANCELADAS = [
  'Vaga Cancelada', // 540
  'Arquivada', // 182
  /*
    Mesmo tratamento de "Arquivada", decidido com o R&S em 21/10/2026.

    Ela parecia vaga aberta e o relógio do SLA corria contra ela — o painel
    chegava a dizer "sem responsável" e "14 dias de atraso" na mesma linha, o
    que não é afirmação que se sustente: atrasada perante quem? São 74 cards e
    7.055 dias úteis, a maior concentração de tempo do pipe, e deixá-los
    contando inflava o atraso de todo mundo com tempo que ninguém está gastando.

    Note que isto NÃO as esconde: elas seguem no relatório e na jornada de cada
    card, em cinza. O que muda é que param de ser cobradas.
  */
  'Vaga Aberta aguardando seleção', // 74
];

/**
 * A situação da vaga no dash.
 *
 * Fase desconhecida vira "aberta" de propósito: uma fase nova criada no Pipefy
 * é, quase sempre, mais uma etapa do processo. Chutar "fechada" sumiria com a
 * vaga da tela; chutar "aberta" a deixa visível, que é o erro que alguém
 * percebe e corrige.
 */
export function situacaoDaFase(fase: string): 'aberta' | 'fechada' | 'cancelada' {
  if (FASES_FECHADAS.includes(fase)) return 'fechada';
  if (FASES_CANCELADAS.includes(fase)) return 'cancelada';
  return 'aberta';
}

/* ------------------------------------------------------------------------ */
/* 3. Categoria do Pipefy -> categoria do dash                                */
/* ------------------------------------------------------------------------ */

/**
 * O Pipefy tem cinco categorias; o dash tinha quatro.
 *
 * "Técnico Pedagógico" entra como categoria própria, com SLA de 10 dias úteis
 * (decidido pelo R&S em 09/10/2026) — e isso corrige um erro que já existia: o
 * dash vinha cobrando 7 dias úteis de PAEE, Coordenador Pedagógico, Pedagogo
 * SAREH e mais seis cargos que o Pipefy classifica como técnico-pedagógicos.
 */
export const CATEGORIA_DO_PIPEFY: Record<string, string> = {
  'Administrativo/Apoio': 'Vagas Administrativas', // 811
  Professor: 'Vagas Professores', // 828
  'Técnico Pedagógico': 'Vagas Técnico Pedagógico', // 336
  Estagiário: 'Vagas Estagiário', // 233
  'Jovem Aprendiz': 'Vagas Jovem Aprendiz', // 21
};

/* ------------------------------------------------------------------------ */
/* 4. Forma de preenchimento                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Só "Contratação de novo colaborador" passa pela Gupy.
 *
 * Candidato pré-selecionado (726) e mobilidade interna (345) são preenchidos
 * sem divulgação — somados, 56% do pipe. Eles continuam entrando no dash como
 * vaga (têm prazo, ocupam o time, contam no SLA), mas a tela não os cobra de
 * vínculo com a Gupy: não há publicação a vincular, e marcá-los como "sem
 * vínculo" transformaria 56% da lista num alerta falso.
 */
export const PRECISA_DE_GUPY = 'Contratação de novo colaborador';

/* ------------------------------------------------------------------------ */
/* 5. Unidade do Pipefy -> regional e escola do dash                          */
/* ------------------------------------------------------------------------ */

/**
 * Códigos de unidade que são a regional inteira, e não uma escola.
 *
 * São os centros de custo: `BU101 - CWT`, `CSC`. A vaga existe, mas não
 * pertence a uma escola — é o caso "toda a regional" que o formulário já
 * suporta com escola em branco.
 */
const UNIDADES_REGIONAIS: Record<string, string> = {
  BU101: 'CWT',
  BU102: 'GUA',
  BU103: 'SJP',
  CSC: 'CSC',
};

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Traduz a unidade do Pipefy para a regional e a escola do dash.
 *
 * O Pipefy guarda `41018206 - CARNEIRO C E GAL EF M PROFIS`: código INEP na
 * frente e a sigla do tipo de escola atrás. Cortar por vírgula não serve —
 * CARNEIRO não tem vírgula, e outras têm duas.
 *
 * Por isso o casamento é por CONTÉM contra a lista conhecida de
 * `config/unidades.ts`: o nome da escola aparece inteiro lá dentro, e o resto
 * é decoração que varia por unidade.
 *
 * Devolve `null` quando não reconhece, e quem chama trata isso como vaga sem
 * escola — nunca como escola inventada.
 */
export function unidadeDoPipefy(
  bruto: string,
  regionais: Record<string, { escolas: string[] }>,
): { regional: string | null; escola: string | null } {
  const v = semAcento(bruto);
  if (!v) return { regional: null, escola: null };

  // Centro de custo: a vaga é da regional inteira.
  for (const [codigo, sigla] of Object.entries(UNIDADES_REGIONAIS)) {
    if (v.startsWith(codigo) || v === codigo) return { regional: sigla, escola: null };
  }

  /*
    Nomes mais longos primeiro: se um nome fosse pedaço de outro, o curto
    casaria antes e levaria a vaga para a regional errada.
  */
  const todas = Object.entries(regionais).flatMap(([sigla, r]) =>
    r.escolas.map((e) => ({ sigla, escola: e, alvo: semAcento(e) })),
  );
  todas.sort((a, b) => b.alvo.length - a.alvo.length);

  const achada = todas.find((e) => v.includes(e.alvo));
  return achada ? { regional: achada.sigla, escola: achada.escola } : { regional: null, escola: null };
}

/**
 * Link direto para o card no Pipefy.
 *
 * `open-cards` é a rota que abre um card específico de qualquer pipe — não é
 * preciso passar o pipe na URL. É o que transforma o ID numa ponte: quem vê um
 * atraso na tabela chega na origem dele com um clique, em vez de procurar o
 * número à mão dentro do Pipefy.
 */
export function urlDoCard(cardId: string): string {
  return `https://app.pipefy.com/open-cards/${encodeURIComponent(cardId)}`;
}

/* ------------------------------------------------------------------------ */
/* 6. Nomes das colunas na planilha                                           */
/* ------------------------------------------------------------------------ */

/**
 * Os nomes exatos das colunas da aba `pipefy_cards`.
 *
 * Ficam aqui, e não espalhados pelo sync, porque são o contrato com a planilha:
 * se o R&S renomear um campo no formulário do Pipefy, é esta lista que precisa
 * acompanhar — e o sync avisa qual sumiu em vez de gravar vazio.
 */
export const COLUNAS = {
  cardId: 'card_id',
  titulo: 'titulo',
  fase: 'fase_atual',
  criadoEm: 'criado_em',
  finalizadoEm: 'finalizado_em',
  categoria: 'Categoria do Cargo:',
  unidade: 'Unidade da APG onde a vaga será aberta',
  regional: 'Seletor de Etiquetas - Regional',
  formaPreenchimento: 'Qual será a forma de preenchimento desta vaga',
  disciplina: 'Disciplinas',
  /** O cargo mora em três colunas conforme a categoria; só uma vem preenchida. */
  cargos: ['Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:'],
} as const;

/* ------------------------------------------------------------------------ */
/* 6. Etiquetas do card -> selos na tela                                      */
/* ------------------------------------------------------------------------ */

/**
 * Etiquetas do Pipefy que viram um selo ao lado do nome da vaga.
 *
 * A chave é a etiqueta como o Pipefy a escreve — sem acento em "TEMPORARIA",
 * porque é assim que está lá. O valor é o rótulo curto que aparece na tela.
 *
 * Só entram aqui etiquetas que mudam como se lê a vaga. As outras —
 * NOVA CONTRATAÇÃO, PEDAGÓGICO, CURITIBA, PRÉ-ADMISSÃO — descrevem coisas que
 * a tabela já mostra em coluna própria, e repeti-las como selo seria ruído.
 */
export const SELOS: Record<string, string> = {
  'CONTRATAÇÃO TEMPORARIA': 'RPA',
};

/**
 * A lista de etiquetas de um card, como o relatório a entrega.
 *
 * A coluna `Etiquetas` traz as etiquetas de fato aplicadas ao card, separadas
 * por vírgula. Existe também um campo de formulário `Etiqueta - Temporaria`,
 * onde alguém SELECIONA a etiqueta — e os dois não batem: medido em 21/10/2026,
 * 103 cards tinham a seleção e só 87 tinham a etiqueta no card. Os 16 de
 * diferença marcaram no formulário sem a etiqueta chegar a ser aplicada.
 *
 * Vale o que está no card, que é o que o time vê no Pipefy.
 */
export function etiquetasDe(bruto: string | undefined): string[] {
  return (bruto ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/** Os selos que uma vaga exibe, na ordem em que foram declarados. */
export function selosDe(etiquetas: string[] | undefined): string[] {
  if (!etiquetas?.length) return [];
  const normal = etiquetas.map((e) => e.toUpperCase());
  return Object.entries(SELOS)
    .filter(([etiqueta]) => normal.includes(etiqueta.toUpperCase()))
    .map(([, selo]) => selo);
}
