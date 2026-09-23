import type { VagaPipefyComNumeros } from './types.ts';

/**
 * As contas do painel de SLA.
 *
 * Este arquivo NÃO importa o banco de propósito: ele roda no navegador, onde a
 * tela filtra e reagrupa a cada clique. A carteira de vagas cabe folgada na
 * memória — são dezenas, não milhões —, e fazer o recorte no cliente troca uma
 * ida à rede por uma volta de laço.
 */

export interface Recorte {
  regional: string;
  unidade: string;
  categoria: string;
}

export const SEM_RECORTE: Recorte = { regional: '', unidade: '', categoria: '' };

/** Rótulo usado quando o campo está em branco. Nunca some da tela. */
export const NAO_INFORMADO = '(não informado)';

export function valor(vaga: VagaPipefyComNumeros, campo: keyof Recorte): string {
  return (vaga[campo] ?? '').trim() || NAO_INFORMADO;
}

/**
 * Os valores que aparecem num filtro.
 *
 * O filtro de escola respeita a regional já escolhida — listar as escolas de
 * Curitiba enquanto a pessoa olha a Regional Norte só produziria seleções que
 * devolvem lista vazia.
 */
export function opcoes(
  vagas: VagaPipefyComNumeros[],
  campo: keyof Recorte,
  recorte: Recorte,
): string[] {
  const base =
    campo === 'unidade' && recorte.regional
      ? vagas.filter((v) => valor(v, 'regional') === recorte.regional)
      : vagas;

  return [...new Set(base.map((v) => valor(v, campo)))].sort((a, b) =>
    // "(não informado)" sempre por último, para não ocupar o topo da lista.
    a === NAO_INFORMADO ? 1 : b === NAO_INFORMADO ? -1 : a.localeCompare(b, 'pt-BR'),
  );
}

export function filtrar(vagas: VagaPipefyComNumeros[], recorte: Recorte): VagaPipefyComNumeros[] {
  return vagas.filter(
    (v) =>
      (!recorte.regional || valor(v, 'regional') === recorte.regional) &&
      (!recorte.unidade || valor(v, 'unidade') === recorte.unidade) &&
      (!recorte.categoria || valor(v, 'categoria') === recorte.categoria),
  );
}

function media(numeros: number[]): number | null {
  if (numeros.length === 0) return null;
  return Math.round(numeros.reduce((s, n) => s + n, 0) / numeros.length);
}

export interface ResumoSla {
  abertas: number;
  /** Média de dias úteis já consumidos pelas vagas abertas. */
  mediaUteisAbertas: number | null;
  /** Média de dias corridos, que é o tempo que a vaga está de fato na rua. */
  mediaCorridosAbertas: number | null;
  foraDoPrazo: number;
  /** Abertas sem categoria: não têm SLA, e por isso não entram nas médias. */
  semCategoria: number;
  fechadas: number;
  /** Média de dias úteis que as vagas fechadas levaram para fechar. */
  mediaUteisParaFechar: number | null;
  /** Abertas ainda sem vaga da Gupy vinculada — não mostram candidatos. */
  semVinculo: number;
  /** Candidatos somados das vagas vinculadas, na foto selecionada. */
  candidatos: number;
  /** A vaga aberta há mais dias corridos. */
  maisAntiga: VagaPipefyComNumeros | null;
}

export function resumirSla(vagas: VagaPipefyComNumeros[]): ResumoSla {
  const abertas = vagas.filter((v) => v.situacao === 'aberta');
  const fechadas = vagas.filter((v) => v.situacao === 'fechada');

  // Só entra na média quem tem prazo: uma vaga sem categoria não tem dias úteis
  // de SLA a exibir, e incluí-la como zero puxaria a média para baixo.
  const abertasComSla = abertas.filter((v) => v.sla);

  return {
    abertas: abertas.length,
    mediaUteisAbertas: media(abertasComSla.map((v) => v.sla!.decorridos)),
    mediaCorridosAbertas: media(abertas.map((v) => v.dias)),
    foraDoPrazo: abertasComSla.filter((v) => v.sla!.saldo < 0).length,
    semCategoria: abertas.filter((v) => !v.categoria).length,
    fechadas: fechadas.length,
    mediaUteisParaFechar: media(
      fechadas.filter((v) => v.sla).map((v) => v.sla!.decorridos),
    ),
    semVinculo: abertas.filter((v) => !v.vaga_codigo).length,
    /*
      Soma uma vez por VAGA DA GUPY, não por card.

      Vários cards apontam para a mesma publicação — uma por cidade, um card por
      escola —, e os candidatos dela são um pool compartilhado. Somar por card
      contaria as mesmas pessoas tantas vezes quantas forem as escolas, e o
      total do painel passaria dos candidatos que existem de verdade.
    */
    candidatos: [
      ...new Map(
        vagas
          .filter((v) => v.vaga_codigo)
          .map((v) => [v.vaga_codigo!, v.candidatos ?? 0]),
      ).values(),
    ].reduce((s, n) => s + n, 0),
    maisAntiga:
      abertas.length === 0
        ? null
        : abertas.reduce((pior, v) => (v.dias > pior.dias ? v : pior)),
  };
}

export interface LinhaCategoria {
  categoria: string;
  /** Vagas abertas nessa categoria. É o que a barra do gráfico mede. */
  abertas: number;
  foraDoPrazo: number;
  /** O prazo da categoria. Null em "(não informado)". */
  sla: number | null;
  /** Média de dias úteis consumidos pelas vagas ABERTAS — o SLA de agora. */
  mediaUteis: number | null;
  mediaCorridos: number | null;
  /** Média de dias úteis das vagas já fechadas, para contraste histórico. */
  mediaUteisFechadas: number | null;
  fechadas: number;
}

/**
 * A carteira aberta por categoria, com o tempo médio de cada uma contra o
 * próprio prazo.
 *
 * A média sozinha não compara categorias — 9 dias é folga numa vaga
 * administrativa (SLA 15) e é estouro numa de professor (SLA 7). Por isso o SLA
 * viaja junto na mesma linha: é ele que dá sentido ao número.
 */
export function porCategoria(vagas: VagaPipefyComNumeros[]): LinhaCategoria[] {
  const grupos = new Map<string, VagaPipefyComNumeros[]>();
  for (const v of vagas) {
    const chave = valor(v, 'categoria');
    const atual = grupos.get(chave);
    if (atual) atual.push(v);
    else grupos.set(chave, [v]);
  }

  const linhas = [...grupos.entries()].map(([categoria, lista]) => {
    const abertas = lista.filter((v) => v.situacao === 'aberta');
    const abertasComSla = abertas.filter((v) => v.sla);
    const fechadas = lista.filter((v) => v.situacao === 'fechada' && v.sla);

    return {
      categoria,
      abertas: abertas.length,
      foraDoPrazo: abertasComSla.filter((v) => v.sla!.saldo < 0).length,
      sla: abertasComSla[0]?.sla?.prazo ?? fechadas[0]?.sla?.prazo ?? null,
      mediaUteis: media(abertasComSla.map((v) => v.sla!.decorridos)),
      mediaCorridos: media(abertas.map((v) => v.dias)),
      mediaUteisFechadas: media(fechadas.map((v) => v.sla!.decorridos)),
      fechadas: fechadas.length,
    };
  });

  // Maior carteira primeiro: é onde está o volume de trabalho.
  return linhas.sort(
    (a, b) => b.abertas - a.abertas || a.categoria.localeCompare(b.categoria, 'pt-BR'),
  );
}

/**
 * As vagas abertas em ordem de urgência: quem tem menos folga de prazo primeiro.
 * Vaga sem SLA vai para o fim — ela não está atrasada, só não foi classificada.
 */
export function porUrgencia(vagas: VagaPipefyComNumeros[]): VagaPipefyComNumeros[] {
  return vagas
    .filter((v) => v.situacao === 'aberta')
    .sort((a, b) => (a.sla?.saldo ?? Infinity) - (b.sla?.saldo ?? Infinity) || b.dias - a.dias);
}
