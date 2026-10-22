import { lerCardsDaPlanilha, primeiroValor, type LinhaPlanilha } from './planilha.ts';
import { carregarPrazos } from './prazos.ts';
import {
  colunaEntrouNaFase,
  colunaSaiuDaFase,
  donoDaEtapa,
  etapaConta,
  FASE_CONCLUIDA,
  type Dono,
} from '../config/etapas-pipefy.ts';
import { CATEGORIA_DO_PIPEFY, unidadeDoPipefy } from '../config/pipefy.ts';
import { REGIONAIS } from '../config/unidades.ts';
import { diasUteisEntre, hojeEmBrasilia, soAData } from './uteis.ts';

/**
 * A jornada de um card: para onde o tempo foi, time por time.
 *
 * Nasceu de um problema concreto: o card 1465545192 está com o DP, e a tela de
 * pendências mostra só isso — "DP, há 1 dia útil". O tempo que o R&S levou
 * antes disso desaparece no momento em que a vaga troca de mão. Quem olha vê
 * sempre o último responsável, e um processo de 40 dias parece um de 1.
 *
 * Aqui o card inteiro é aberto em trechos, um por fase visitada, cada um
 * cobrado do seu dono. O tempo do R&S continua visível depois de passar a bola.
 */

const GID = process.env.PIPEFY_RELATORIO_GID ?? '1135125070';
const CHAVE = 'Código';

const PREFIXO_ENTRADA = 'Primeira vez que entrou na fase ';

export interface Trecho {
  fase: string;
  dono: Dono;
  /** Entrada na fase. Com ida e volta, é a PRIMEIRA entrada — veja `sobreposto`. */
  inicio: string;
  /** Saída da fase, ou hoje quando o card ainda está nela. */
  fim: string;
  diasUteis: number;
  /** O card está nesta fase agora. */
  atual: boolean;
  /** O tempo deste trecho é cobrado de um time? */
  conta: boolean;
}

export interface TempoDoTime {
  dono: Dono;
  diasUteis: number;
  /** Por quantas fases daquele time o card passou. */
  fases: number;
}

export interface Jornada {
  cardId: string;
  nome: string;
  regional: string | null;
  escola: string | null;
  categoria: string | null;
  faseAtual: string;
  donoAtual: Dono;
  /** Em ordem de acontecimento. */
  trechos: Trecho[];
  /** R&S e DP primeiro, depois o que não é de nenhum dos dois. */
  porTime: TempoDoTime[];
  /** Dias úteis cobrados de algum time — a soma de R&S + DP. */
  totalCobrado: number;
  /** Dias úteis desde a criação do card, cobrados ou não. */
  totalDecorrido: number;
  /**
   * A soma de todos os trechos — é o que a barra desenha.
   *
   * Existe separado do `totalCobrado` porque é por ele que a lista ordena: com
   * a maior parte do tempo ainda em fases sem dono, ordenar pelo tempo cobrado
   * colocaria no topo barras curtas e no fim barras compridas, e a tela
   * contradiria a si mesma.
   */
  totalNaBarra: number;
  criadoEm: string;
  /** Vazio enquanto o card não foi finalizado no Pipefy. */
  finalizadoEm: string;
  /** A vaga ainda está correndo: não terminou nem foi cancelada. */
  aberta: boolean;
  /**
   * O card passou duas vezes por alguma fase.
   *
   * O relatório guarda só a PRIMEIRA entrada e a ÚLTIMA saída de cada fase, e
   * entre as duas o card pode ter estado em outro lugar. Quando isso acontece a
   * soma dos trechos passa do tempo que de fato decorreu, e cada trecho é um
   * limite superior. Detectado comparando as duas somas — não há coluna que
   * diga isso direto.
   */
  sobreposto: boolean;
}

function cargoDa(linha: LinhaPlanilha): string {
  for (const c of ['Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:']) {
    const v = primeiroValor(linha[c]);
    if (v) return v;
  }
  return '';
}

/**
 * As fases do pipe, lidas dos cabeçalhos em vez de uma lista fixa.
 *
 * O relatório cria três colunas por fase, com o nome da fase no meio do nome da
 * coluna. Derivar daí significa que uma fase nova no Pipefy aparece na jornada
 * sozinha — sem dono, em cinza, mas aparece. Uma lista fixa aqui esconderia
 * silenciosamente o tempo gasto nela.
 */
export function fasesDoRelatorio(linha: LinhaPlanilha): string[] {
  return Object.keys(linha)
    .filter((c) => c.startsWith(PREFIXO_ENTRADA))
    .map((c) => c.slice(PREFIXO_ENTRADA.length));
}

/** A ordem dos times na barra: quem trabalha antes vem antes. */
const ORDEM: Dono[] = ['R&S', 'DP', 'Regional', 'A mapear', 'Fim'];

/**
 * Por quais fases o card passou, em ordem, com o tempo de cada uma.
 *
 * Público porque o Dashboard 2 mostra a mesma jornada dentro da linha da vaga.
 * Duas varreduras separadas acabariam divergindo na primeira fase nova do pipe
 * — e divergiriam calado, com duas telas dando números diferentes para o mesmo
 * card.
 */
export function trechosDoCard(
  linha: LinhaPlanilha,
  fases: string[],
  hoje: string,
): Trecho[] {
  const faseAtual = (linha['Fase atual'] ?? '').trim();
  const trechos: Trecho[] = [];

  for (const fase of fases) {
    const inicio = soAData(linha[colunaEntrouNaFase(fase)]);
    if (!inicio) continue; // nunca passou por aqui

    const saiu = soAData(linha[colunaSaiuDaFase(fase)]);
    const atual = fase === faseAtual;

    /*
      Se o card está na fase agora, o trecho está aberto e corre até hoje —
      mesmo havendo uma saída registrada, porque nesse caso ele saiu e voltou.
      Se já saiu de vez, o trecho fecha na saída. Sem saída e sem ser a fase
      atual é card inconsistente no relatório; cai para hoje, que é o limite
      seguro.
    */
    const fim = atual ? hoje : saiu || hoje;
    if (fim < inicio) continue;

    trechos.push({
      fase,
      dono: donoDaEtapa(fase),
      inicio,
      fim,
      diasUteis: diasUteisEntre(inicio, fim),
      atual,
      conta: etapaConta(fase),
    });
  }

  return trechos.sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
}

function montar(linha: LinhaPlanilha, fases: string[], hoje: string): Jornada | null {
  const cardId = (linha[CHAVE] ?? '').trim();
  if (!cardId) return null;

  const faseAtual = (linha['Fase atual'] ?? '').trim();
  const criadoEm = soAData(linha['Criado em']);
  const finalizadoEm = soAData(linha['Finalizado em']);

  const trechos = trechosDoCard(linha, fases, hoje);

  const porDono = new Map<Dono, TempoDoTime>();
  for (const t of trechos) {
    const acumulado = porDono.get(t.dono);
    if (acumulado) {
      acumulado.diasUteis += t.diasUteis;
      acumulado.fases += 1;
    } else {
      porDono.set(t.dono, { dono: t.dono, diasUteis: t.diasUteis, fases: 1 });
    }
  }

  const porTime = ORDEM.filter((d) => porDono.has(d)).map((d) => porDono.get(d) as TempoDoTime);

  const totalCobrado = trechos.filter((t) => t.conta).reduce((s, t) => s + t.diasUteis, 0);
  const totalDecorrido = criadoEm ? diasUteisEntre(criadoEm, finalizadoEm || hoje) : 0;
  const somaDosTrechos = trechos.reduce((s, t) => s + t.diasUteis, 0);

  const categoriaPipefy = primeiroValor(linha['Categoria do Cargo:']);
  const { regional, escola } = unidadeDoPipefy(
    primeiroValor(linha['Unidade da APG onde a vaga será aberta']),
    REGIONAIS,
  );
  const cargo = cargoDa(linha);
  const disciplina = primeiroValor(linha['Disciplinas']);

  return {
    cardId,
    nome: [cargo, disciplina].filter(Boolean).join(' · ') || categoriaPipefy || 'Vaga',
    regional,
    escola,
    categoria: CATEGORIA_DO_PIPEFY[categoriaPipefy] ?? null,
    faseAtual,
    donoAtual: donoDaEtapa(faseAtual),
    trechos,
    porTime,
    totalCobrado,
    totalDecorrido,
    totalNaBarra: somaDosTrechos,
    criadoEm,
    finalizadoEm,
    aberta: !finalizadoEm && donoDaEtapa(faseAtual) !== 'Fim',
    /*
      A folga de 1 dia absorve o arredondamento: cada trecho conta em D+1 a
      partir da sua própria data, e trechos que começam e terminam no mesmo dia
      somam 0 sem que nada esteja errado.
    */
    sobreposto: somaDosTrechos > totalDecorrido + 1,
  };
}

export interface FaseSemDono {
  fase: string;
  cards: number;
  diasUteis: number;
}

export interface ResultadoJornadas {
  jornadas: Jornada[];
  /** Quantos cards o relatório tem, antes de qualquer recorte. */
  totalNoPipe: number;
  /** Fases visitadas sem dono definido — tempo que não é cobrado de ninguém. */
  fasesSemDono: FaseSemDono[];
  lidoEm: string;
}

/**
 * As jornadas das vagas abertas, da que mais consumiu tempo para a que menos.
 *
 * Só as abertas: numa vaga encerrada o tempo já não é acionável, e a pergunta
 * que trouxe esta tela — "quanto foi do R&S antes de virar DP?" — é sobre as
 * que ainda estão correndo. O histórico das fechadas serve para calibrar
 * prazos, e isso é outra conta.
 */
export async function lerJornadas(): Promise<ResultadoJornadas> {
  // Os prazos vêm do banco; sem isto as telas cairiam na semente do código.
  await carregarPrazos();
  const linhas = await lerCardsDaPlanilha({ gid: GID, colunaChave: CHAVE });
  const hoje = hojeEmBrasilia();
  if (linhas.length === 0) {
    return { jornadas: [], totalNoPipe: 0, fasesSemDono: [], lidoEm: new Date().toISOString() };
  }

  const fases = fasesDoRelatorio(linhas[0]);

  const jornadas = linhas
    .flatMap((l) => {
      const j = montar(l, fases, hoje);
      return j ? [j] : [];
    })
    .filter((j) => j.aberta)
    .sort((a, b) => b.totalNaBarra - a.totalNaBarra || b.totalCobrado - a.totalCobrado);

  // Onde há tempo sem dono, para a tela poder pedir o mapeamento.
  const semDono = new Map<string, FaseSemDono>();
  for (const j of jornadas) {
    for (const t of j.trechos) {
      if (t.dono !== 'A mapear') continue;
      const acumulado = semDono.get(t.fase);
      if (acumulado) {
        acumulado.cards += 1;
        acumulado.diasUteis += t.diasUteis;
      } else {
        semDono.set(t.fase, { fase: t.fase, cards: 1, diasUteis: t.diasUteis });
      }
    }
  }

  return {
    jornadas,
    totalNoPipe: linhas.length,
    fasesSemDono: [...semDono.values()].sort((a, b) => b.diasUteis - a.diasUteis),
    lidoEm: new Date().toISOString(),
  };
}

export interface TotalDoTime {
  dono: Dono;
  /** Soma de dias úteis daquele time, em todas as vagas abertas. */
  diasUteis: number;
  /** Quantas vagas passaram por aquele time. */
  vagas: number;
  /** Quantas estão com aquele time AGORA. */
  agora: number;
  /** Média de dias úteis por vaga que passou pelo time. */
  mediaDias: number;
}

/**
 * O agregado: de todo o tempo das vagas abertas, quanto é de cada time.
 *
 * É a leitura que a tela de pendências não dá. Lá o R&S aparece com as vagas
 * que estão na mão dele hoje; aqui, com todo o tempo que consumiu — inclusive
 * nas vagas que já passou para o DP.
 */
export function somarPorTime(jornadas: Jornada[]): TotalDoTime[] {
  const mapa = new Map<Dono, { diasUteis: number; vagas: number; agora: number }>();

  for (const j of jornadas) {
    for (const t of j.porTime) {
      const acumulado = mapa.get(t.dono) ?? { diasUteis: 0, vagas: 0, agora: 0 };
      acumulado.diasUteis += t.diasUteis;
      acumulado.vagas += 1;
      mapa.set(t.dono, acumulado);
    }
    const atual = mapa.get(j.donoAtual);
    if (atual) atual.agora += 1;
  }

  return ORDEM.filter((d) => mapa.has(d)).map((d) => {
    const v = mapa.get(d) as { diasUteis: number; vagas: number; agora: number };
    return {
      dono: d,
      diasUteis: v.diasUteis,
      vagas: v.vagas,
      agora: v.agora,
      mediaDias: v.vagas === 0 ? 0 : Math.round(v.diasUteis / v.vagas),
    };
  });
}

/* ------------------------------------------------------------------------ */

export interface Concluido {
  cardId: string;
  nome: string;
  regional: string | null;
  escola: string | null;
  categoria: string | null;
  criadoEm: string;
  concluidoEm: string;
  /** Dias úteis da criação do card até a conclusão — o SLA que a vaga teve. */
  slaDiasUteis: number;
  /** Quanto disso ficou com cada time. Null quando o card não passou por ele. */
  rs: number | null;
  dp: number | null;
}

export interface ResumoConcluidos {
  /** Do concluído mais recente para o mais antigo. */
  concluidos: Concluido[];
  medianaSla: number | null;
  medianaRs: number | null;
  medianaDp: number | null;
  /** Concluídos nos últimos 30 dias corridos. */
  ultimos30: number;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(v.length / 2);
  return v.length % 2 ? v[meio] : Math.round((v[meio - 1] + v[meio]) / 2);
}

/**
 * As vagas em Processo Seletivo Concluído, com o SLA que cada uma teve.
 *
 * Recebe as linhas já lidas para a tela de pendências não baixar a planilha
 * duas vezes. Mediana em vez de média: meia dúzia de cards esquecidos por meses
 * antes de alguém concluir puxaria a média para um número que ninguém viveu.
 */
export function concluidosDe(linhas: LinhaPlanilha[]): ResumoConcluidos {
  const vazio = { concluidos: [], medianaSla: null, medianaRs: null, medianaDp: null, ultimos30: 0 };
  if (linhas.length === 0) return vazio;

  const hoje = hojeEmBrasilia();
  const fases = fasesDoRelatorio(linhas[0]);

  const concluidos = linhas
    .filter((l) => (l['Fase atual'] ?? '').trim() === FASE_CONCLUIDA)
    .flatMap((l): Concluido[] => {
      const j = montar(l, fases, hoje);
      if (!j || !j.criadoEm) return [];

      // "Finalizado em" vem vazio em alguns cards antigos; a entrada na fase serve.
      const concluidoEm = j.finalizadoEm || soAData(l[colunaEntrouNaFase(FASE_CONCLUIDA)]);
      if (!concluidoEm) return [];

      const doTime = (d: Dono) => j.porTime.find((t) => t.dono === d)?.diasUteis ?? null;

      return [
        {
          cardId: j.cardId,
          nome: j.nome,
          regional: j.regional,
          escola: j.escola,
          categoria: j.categoria,
          criadoEm: j.criadoEm,
          concluidoEm,
          slaDiasUteis: diasUteisEntre(j.criadoEm, concluidoEm),
          rs: doTime('R&S'),
          dp: doTime('DP'),
        },
      ];
    })
    .sort((a, b) => b.concluidoEm.localeCompare(a.concluidoEm));

  const corte = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);

  return {
    concluidos,
    medianaSla: mediana(concluidos.map((c) => c.slaDiasUteis)),
    medianaRs: mediana(concluidos.flatMap((c) => (c.rs === null ? [] : [c.rs]))),
    medianaDp: mediana(concluidos.flatMap((c) => (c.dp === null ? [] : [c.dp]))),
    ultimos30: concluidos.filter((c) => c.concluidoEm >= corte).length,
  };
}
