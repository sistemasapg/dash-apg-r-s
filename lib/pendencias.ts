import { lerCardsDaPlanilha, primeiroValor, type LinhaPlanilha } from './planilha.ts';
import { carregarPrazos, prazoDaEtapa } from './prazos.ts';
import {
  colunaEntrouNaFase,
  colunaSaiuDaFase,
  ETAPAS,
  FASE_CONCLUIDA,
  INICIO_DO_ACOMPANHAMENTO,
  type Etapa,
} from '../config/etapas-pipefy.ts';
import { concluidosDe, type ResumoConcluidos } from './jornada.ts';
import { CATEGORIA_DO_PIPEFY, unidadeDoPipefy } from '../config/pipefy.ts';
import { REGIONAIS } from '../config/unidades.ts';
import { diasUteisEntre, hojeEmBrasilia, soAData } from './uteis.ts';

/**
 * Pendências por etapa: com quem está a bola, e há quanto tempo.
 *
 * Lê a guia do relatório do Pipefy, onde cada fase tem colunas próprias de
 * entrada e saída. Diferente do SLA da vaga — que mede do pedido até a
 * admissão, somando trabalho de três áreas —, aqui cada etapa é cobrada do seu
 * dono.
 */

/** A aba `pipefy_relatorio`, onde o robô despeja o relatório. */
const GID = process.env.PIPEFY_RELATORIO_GID ?? '1135125070';

/** O relatório chama a identidade do card de `Código`, não de `card_id`. */
const CHAVE = 'Código';

export type PrecisaoDoTempo = 'exato' | 'limite';

export interface Pendencia {
  cardId: string;
  /** Montado do cargo, porque o título do card é o nome da escola. */
  nome: string;
  etapa: string;
  dono: string;
  regional: string | null;
  escola: string | null;
  categoria: string | null;
  /** Quando entrou na etapa — ou o limite, quando houve ida e volta. */
  desde: string;
  /** Dias úteis parado, na contagem D+1 (entrou hoje = 0). */
  diasUteis: number;
  /** Prazo da etapa. Null quando a área ainda não acordou um. */
  prazo: number | null;
  /** Positivo = folga; negativo = dias úteis de atraso. Null sem prazo. */
  saldo: number | null;
  /**
   * `limite` marca o card que já saiu da etapa e voltou: o relatório só guarda
   * a PRIMEIRA entrada, então o tempo real da passagem atual é menor ou igual
   * ao mostrado. O número não engana para mais do que o necessário, mas a tela
   * precisa dizer que é aproximado.
   */
  precisao: PrecisaoDoTempo;
}


function cargoDa(linha: LinhaPlanilha): string {
  for (const c of ['Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:']) {
    const v = primeiroValor(linha[c]);
    if (v) return v;
  }
  return '';
}

function converter(linha: LinhaPlanilha, etapa: string, cfg: Etapa, hoje: string): Pendencia | null {
  const entrou = soAData(linha[colunaEntrouNaFase(etapa)]);
  if (!entrou) return null;

  /*
    Se o card já SAIU desta etapa e mesmo assim está nela agora, ele voltou — e
    a volta foi necessariamente depois da última saída. Contar desde a primeira
    entrada incluiria o tempo em que ele nem estava aqui.

    O relatório não traz "última vez que entrou" (conferido com o R&S), então a
    última saída é o melhor limite disponível sem recorrer à API.
  */
  const saiu = soAData(linha[colunaSaiuDaFase(etapa)]);
  const voltou = Boolean(saiu) && saiu >= entrou;
  const desde = voltou ? saiu : entrou;

  const diasUteis = diasUteisEntre(desde, hoje);
  // Do banco, com o valor do código como semente — ver `lib/prazos.ts`.
  const prazo = prazoDaEtapa(etapa);

  const categoriaPipefy = primeiroValor(linha['Categoria do Cargo:']);
  const { regional, escola } = unidadeDoPipefy(
    primeiroValor(linha['Unidade da APG onde a vaga será aberta']),
    REGIONAIS,
  );

  const cargo = cargoDa(linha);
  const disciplina = primeiroValor(linha['Disciplinas']);

  return {
    cardId: (linha[CHAVE] ?? '').trim(),
    nome: [cargo, disciplina].filter(Boolean).join(' · ') || categoriaPipefy || 'Vaga',
    etapa,
    dono: cfg.dono,
    regional,
    escola,
    categoria: CATEGORIA_DO_PIPEFY[categoriaPipefy] ?? null,
    desde,
    diasUteis,
    prazo,
    saldo: prazo === null ? null : prazo - diasUteis,
    precisao: voltou ? 'limite' : 'exato',
  };
}

export interface ResultadoPendencias {
  pendencias: Pendencia[];
  /** Quantos cards entraram no acompanhamento (criados desde a data de corte). */
  totalNoPipe: number;
  /** As vagas concluídas, fora da lista de pendências, com o SLA que tiveram. */
  concluidos: ResumoConcluidos;
  lidoEm: string;
}

/**
 * As pendências abertas nas etapas acompanhadas, da mais parada para a menos.
 *
 * Ordena por SALDO quando há prazo — quem estourou mais aparece primeiro — e
 * joga as etapas sem prazo para o fim: elas não estão atrasadas, só não foram
 * acordadas ainda.
 */
export async function lerPendencias(): Promise<ResultadoPendencias> {
  // Os prazos vêm do banco; sem isto as telas cairiam na semente do código.
  await carregarPrazos();
  const todas = await lerCardsDaPlanilha({ gid: GID, colunaChave: CHAVE });
  const hoje = hojeEmBrasilia();

  // Só as vagas criadas desde o início do acompanhamento — o histórico fica de fora.
  const linhas = todas.filter((l) => soAData(l['Criado em']) >= INICIO_DO_ACOMPANHAMENTO);

  const pendencias = linhas
    .flatMap((l) => {
      const etapa = (l['Fase atual'] ?? '').trim();
      // Concluído não é pendência: o processo acabou. Vai para a seção de concluídos.
      if (etapa === FASE_CONCLUIDA) return [];
      const cfg = ETAPAS[etapa];
      // Fases sem responsável (cancelada, arquivada, aberta aguardando seleção):
      // não há ninguém com a bola, então não é pendência de ninguém.
      if (!cfg || cfg.dono === 'Fim') return [];
      const p = converter(l, etapa, cfg, hoje);
      return p ? [p] : [];
    })
    .sort((a, b) => {
      const sa = a.saldo ?? Infinity;
      const sb = b.saldo ?? Infinity;
      return sa - sb || b.diasUteis - a.diasUteis;
    });

  return {
    pendencias,
    totalNoPipe: linhas.length,
    concluidos: concluidosDe(linhas),
    lidoEm: new Date().toISOString(),
  };
}

export interface ResumoPorDono {
  dono: string;
  total: number;
  atrasadas: number;
  semPrazo: number;
  /** Média de dias úteis parados, entre as pendências desse dono. */
  mediaDias: number;
  /** A que está parada há mais tempo. */
  maisAntiga: Pendencia | null;
}

/** Agrupa por dono — é a leitura de "com quem está a bola". */
export function resumirPorDono(pendencias: Pendencia[]): ResumoPorDono[] {
  const grupos = new Map<string, Pendencia[]>();
  for (const p of pendencias) {
    const atual = grupos.get(p.dono);
    if (atual) atual.push(p);
    else grupos.set(p.dono, [p]);
  }

  return [...grupos.entries()]
    .map(([dono, lista]) => ({
      dono,
      total: lista.length,
      atrasadas: lista.filter((p) => p.saldo !== null && p.saldo < 0).length,
      semPrazo: lista.filter((p) => p.prazo === null).length,
      mediaDias: Math.round(lista.reduce((s, p) => s + p.diasUteis, 0) / lista.length),
      maisAntiga: lista.reduce<Pendencia | null>(
        (pior, p) => (!pior || p.diasUteis > pior.diasUteis ? p : pior),
        null,
      ),
    }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.total - a.total);
}
