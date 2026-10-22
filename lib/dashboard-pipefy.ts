import { lerCardsDaPlanilha, primeiroValor, type LinhaPlanilha } from './planilha.ts';
import {
  CATEGORIA_DO_PIPEFY,
  DESDE,
  etiquetasDe,
  situacaoDaFase,
  unidadeDoPipefy,
} from '../config/pipefy.ts';
import { REGIONAIS } from '../config/unidades.ts';
import { carregarPrazos, prazoDaCategoria, prazoDoDp } from './prazos.ts';
import { medirVaga } from './sla-time.ts';
import { calcularSla, hojeEmBrasilia, soAData } from './uteis.ts';
import { fasesDoRelatorio, trechosDoCard } from './jornada.ts';
import type { VagaPipefyComNumeros } from './types.ts';

/**
 * O Dashboard montado a partir do relatório do Pipefy, e só dele.
 *
 * Esta tela não lê o banco. É a regra que a define: tudo o que ela mostra vem
 * da varredura automática do pipe, e nada vem do cadastro que o R&S preenche à
 * mão — esse é o Dashboard original, que segue existindo ao lado.
 *
 * Manter as duas fontes separadas é o que torna a comparação entre as telas
 * informativa. Se esta aqui tomasse emprestado um campo do cadastro manual,
 * "o automático cobre mais que o manual" deixaria de ser verificável, porque o
 * automático dependeria do manual para estar completo.
 *
 * O preço dessa regra é concreto e está documentado em `ResultadoDashboard`:
 * sem o cadastro manual não há vínculo com a Gupy, e sem vínculo não há
 * contagem de candidatos.
 */

const GID = process.env.PIPEFY_RELATORIO_GID ?? '1135125070';
const CHAVE = 'Código';

const COLUNAS_DE_CARGO = ['Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:'];

function cargoDa(linha: LinhaPlanilha): string {
  for (const c of COLUNAS_DE_CARGO) {
    const v = primeiroValor(linha[c]);
    if (v) return v;
  }
  return '';
}

export interface ResultadoDashboard {
  vagas: VagaPipefyComNumeros[];
  /**
   * A criação mais antiga que existe no relatório.
   *
   * Serve de limite para o filtro de período — e não de corte. Quem decide o
   * recorte é a tela; aqui vem tudo.
   */
  desde: string;
  /** Cards no relatório, incluindo os que não têm data de criação. */
  totalNoPipe: number;
  lidoEm: string;
}

/**
 * Todas as vagas do pipe, com SLA e com a jornada de fases de cada uma.
 *
 * A data de abertura é o `Criado em` do card — não existe outra automática. Ela
 * diverge do que o R&S digitou no cadastro manual em 17 dos 29 cards que
 * existem nos dois lugares, quase sempre por 1 a 5 dias, e por isso o SLA daqui
 * não bate com o do Dashboard original para a mesma vaga. A tela diz isso.
 */
export async function lerDashboardPipefy(): Promise<ResultadoDashboard> {
  // Os prazos vêm do banco; sem isto as telas cairiam na semente do código.
  await carregarPrazos();
  const linhas = await lerCardsDaPlanilha({ gid: GID, colunaChave: CHAVE });
  const hoje = hojeEmBrasilia();

  /*
    Vem tudo: os 2.282 cards do pipe, desde março de 2025. O corte em `DESDE`
    saiu daqui em 21/10/2026 porque filtrava na origem o que a tela já filtra —
    e o relatório traz o pipe inteiro de qualquer jeito, então descartar cedo
    não economizava nada e custava o histórico.

    O histórico não muda nenhum número do mês corrente: todo card anterior a
    setembro/2026 já está fechado ou cancelado. O que ele melhora é a base das
    medianas, que antes se apoiavam em 176 vagas e agora em mais de duas mil.

    Fica de fora só o card sem data de criação, que não tem como ser recortado
    por período nem ter SLA contado.
  */
  const doRecorte = linhas.filter((l) => soAData(l['Criado em']));

  // Os nomes das fases saem dos cabeçalhos, uma vez só para todas as linhas.
  const fases = linhas.length > 0 ? fasesDoRelatorio(linhas[0]) : [];

  const vagas: VagaPipefyComNumeros[] = doRecorte.map((l, i) => {
    const aberta_em = soAData(l['Criado em']);
    const fase = (l['Fase atual'] ?? '').trim();
    const situacao = situacaoDaFase(fase);

    /*
      O relatório tem "Finalizado em", mas ele só é preenchido quando o card
      chega às fases finais — e há fase que conta como fechada sem data. Nesse
      caso o SLA não tem até quando contar, e usar hoje faria o relógio seguir
      correndo numa vaga encerrada. Fica null, e o SLA trata como aberta: é o
      erro menos ruim, e é visível.
    */
    const fim = soAData(l['Finalizado em']);
    const fechada_em = situacao === 'aberta' ? null : fim || null;

    const categoriaPipefy = primeiroValor(l['Categoria do Cargo:']);
    const categoria = CATEGORIA_DO_PIPEFY[categoriaPipefy] ?? null;
    const { regional, escola } = unidadeDoPipefy(
      primeiroValor(l['Unidade da APG onde a vaga será aberta']),
      REGIONAIS,
    );

    // Calculada uma vez: alimenta a jornada da tela e a medição por time.
    const trechos = trechosDoCard(l, fases, hoje);

    const cargo = cargoDa(l);
    const disciplina = primeiroValor(l['Disciplinas']);

    const referencia = fechada_em ?? hoje;
    const dias = Math.max(
      0,
      Math.round(
        (new Date(`${referencia}T00:00:00Z`).getTime() -
          new Date(`${aberta_em}T00:00:00Z`).getTime()) /
          86400000,
      ),
    );

    return {
      // Não há linha em banco: o id serve só de chave de lista na tela.
      id: i + 1,
      card_id: (l[CHAVE] ?? '').trim(),
      titulo: [cargo, disciplina].filter(Boolean).join(' · ') || categoriaPipefy || 'Vaga',
      categoria,
      funcao: cargo || null,
      regional,
      unidade: escola,
      aberta_em,
      fechada_em,
      situacao,
      criada_em: aberta_em,
      atualizada_em: soAData(l['Atualizado em']) || aberta_em,

      /*
        Vínculo com a Gupy, observação e contagem de candidatos moram no
        cadastro manual, e esta tela não o lê. Ficam nulos de propósito — a
        tabela esconde a coluna de candidatos quando nenhuma vaga tem vínculo,
        em vez de mostrar uma coluna inteira de "sem vínculo".
      */
      vaga_codigo: null,
      observacao: null,
      gupy_nome: null,
      candidatos: null,
      candidatosAntes: null,
      encerrados: null,

      dias,
      sla: calcularSla(aberta_em, prazoDaCategoria(categoria), fechada_em, hoje),
      jornada: trechos,
      slaPorTime: medirVaga(trechos, prazoDaCategoria(categoria), prazoDoDp()),
      etiquetas: etiquetasDe(l['Etiquetas']),
    };
  });

  vagas.sort(
    (a, b) => a.situacao.localeCompare(b.situacao) || a.aberta_em.localeCompare(b.aberta_em),
  );

  const maisAntiga = vagas.reduce(
    (menor, v) => (v.aberta_em < menor ? v.aberta_em : menor),
    vagas[0]?.aberta_em ?? DESDE,
  );

  return {
    vagas,
    desde: maisAntiga,
    totalNoPipe: linhas.length,
    lidoEm: new Date().toISOString(),
  };
}
