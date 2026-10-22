import type { Trecho } from './jornada.ts';
import type { Dono } from '../config/etapas-pipefy.ts';

import type { VagaPipefyComNumeros } from './types.ts';

/**
 * Onde o processo engasga, e em que período.
 *
 * São contas puras sobre dados que a tela já tem na mão — nenhuma ida ao
 * servidor. É o que permite trocar o período e ver o resultado na hora, que é
 * como a pergunta costuma ser feita: "e no mês passado?".
 */

/* ------------------------------------------------------------------------ */
/* Período                                                                    */
/* ------------------------------------------------------------------------ */

export interface Periodo {
  /** Data inicial, inclusive. */
  de: string;
  /** Data final, inclusive. */
  ate: string;
}

function hoje(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export interface Preset {
  chave: string;
  rotulo: string;
  periodo: () => Periodo;
}

/**
 * Os recortes que o time pede de cabeça.
 *
 * A semana começa na segunda, não no domingo: "o que fiz esta semana" numa
 * terça não deve incluir o domingo anterior como se fosse dia de trabalho.
 */
export function presets(desde: string): Preset[] {
  /*
    Do mais amplo para o mais estreito, e não o contrário.

    É a ordem em que a pergunta costuma ser feita: olha-se o todo, depois
    recorta-se. Quem quiser um intervalo que nenhum atalho cobre usa os campos
    de data ao lado, que ficam no fim justamente por serem a saída de exceção.
  */
  return [
    {
      /*
        `desde` é a criação mais antiga que existe no relatório, não uma data
        fixa. O pipe tem card desde março de 2025, e um corte escrito no código
        envelheceria calado — o histórico cresce, a constante não.
      */
      chave: 'tudo',
      rotulo: 'Todo o histórico',
      periodo: () => ({ de: desde, ate: hoje() }),
    },
    {
      chave: 'mes',
      rotulo: 'Este mês',
      periodo: () => {
        const h = hoje();
        return { de: `${h.slice(0, 7)}-01`, ate: h };
      },
    },
    {
      chave: 'mes-passado',
      rotulo: 'Mês passado',
      periodo: () => {
        const h = hoje();
        const primeiroDesteMes = `${h.slice(0, 7)}-01`;
        const ultimoDoPassado = somarDias(primeiroDesteMes, -1);
        return { de: `${ultimoDoPassado.slice(0, 7)}-01`, ate: ultimoDoPassado };
      },
    },
    {
      chave: 'semana',
      rotulo: 'Esta semana',
      periodo: () => {
        const h = hoje();
        // getUTCDay: 0 = domingo. Domingo recua 6 dias para a segunda anterior.
        const diaDaSemana = new Date(`${h}T12:00:00Z`).getUTCDay();
        const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
        return { de: somarDias(h, -recuo), ate: h };
      },
    },
  ];
}

/**
 * A vaga entra no recorte?
 *
 * Pela data de CRIAÇÃO do card. É um corte simples de explicar — "as vagas que
 * nasceram neste intervalo" —, e todo mundo que olha a tela entende o mesmo
 * número. Uma vaga aberta em setembro e trabalhada em outubro fica de fora do
 * recorte de outubro, e isso é consequência assumida do corte, não um defeito.
 */
export function noPeriodo(vaga: VagaPipefyComNumeros, periodo: Periodo): boolean {
  return vaga.aberta_em >= periodo.de && vaga.aberta_em <= periodo.ate;
}

/* ------------------------------------------------------------------------ */
/* Gargalos                                                                   */
/* ------------------------------------------------------------------------ */

export interface Gargalo {
  fase: string;
  dono: Dono;
  /** Soma dos dias úteis que as vagas do recorte passaram nesta fase. */
  diasUteis: number;
  /** Quantas vagas do recorte passaram por aqui. */
  vagas: number;
  /** Dias úteis por passagem, na mediana — resiste ao caso extremo. */
  mediana: number;
  /** A passagem mais longa. */
  pior: number;
  /** Quantas vagas estão nesta fase agora. */
  agora: number;
  /** Prazo da etapa, quando acordado. */
  sla: number | null;
  /** Fração do tempo total do recorte que esta fase consumiu. */
  fatia: number;
}

function mediana(valores: number[]): number {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export interface LeituraDeGargalo {
  gargalos: Gargalo[];
  /**
   * Dias úteis em fases sem responsável, deixados fora do ranking.
   *
   * Não somem da tela: são declarados no rodapé. Mas não disputam o topo.
   */
  diasForaDaConta: number;
  /** As fases sem responsável que mais acumularam, para o rodapé citar. */
  forasMaiores: { fase: string; diasUteis: number }[];
}

/**
 * Quanto tempo cada fase consumiu, da que mais segura para a que menos.
 *
 * **Só entram fases com responsável.** Sem esse filtro o ranking é vencido por
 * "Processo Seletivo Concluído", onde os cards repousam depois de prontos —
 * medido no recorte de outubro, ela sozinha segurava 25% do tempo e aparecia
 * como maior gargalo. Não é gargalo: é o cemitério. Gargalo é onde há trabalho
 * parado esperando alguém, e isso pressupõe que exista esse alguém.
 *
 * Ordena pelo TOTAL, não pela mediana: o gargalo de operação é onde o tempo se
 * acumula, e uma fase que demora pouco mas recebe todas as vagas segura mais o
 * processo do que uma que demora muito e recebe três. A mediana aparece ao lado
 * para separar os dois casos.
 *
 * Fases de duração zero contam como passagem: a vaga esteve lá, e saber que
 * passaram 40 vagas em zero dia é informação — é uma fase que não segura nada.
 */
/*
  `prazos` chega pronto do servidor — ver `mapaDeEtapas()` em `lib/prazos.ts`.

  Este arquivo roda no navegador, então não pode importar nada que alcance o
  banco. Uma única importação de `lib/prazos.ts` aqui arrastou o driver do
  Postgres para o bundle do cliente e derrubou a página inteira com
  "Module not found: Can't resolve 'net'". Prazo entra como dado, não como
  dependência.
*/
export function gargalosDe(
  vagas: VagaPipefyComNumeros[],
  prazos: Record<string, number | null> = {},
): LeituraDeGargalo {
  const porFase = new Map<string, { dono: Dono; dias: number[]; agora: number }>();
  const fora = new Map<string, number>();

  for (const v of vagas) {
    for (const t of v.jornada ?? []) {
      if (!t.conta) {
        fora.set(t.fase, (fora.get(t.fase) ?? 0) + t.diasUteis);
        continue;
      }
      const atual = porFase.get(t.fase) ?? { dono: t.dono, dias: [], agora: 0 };
      atual.dias.push(t.diasUteis);
      if (t.atual) atual.agora += 1;
      porFase.set(t.fase, atual);
    }
  }

  const total = [...porFase.values()].reduce((s, f) => s + f.dias.reduce((a, b) => a + b, 0), 0);

  const gargalos = [...porFase.entries()]
    .map(([fase, f]) => {
      const diasUteis = f.dias.reduce((a, b) => a + b, 0);
      return {
        fase,
        dono: f.dono,
        diasUteis,
        vagas: f.dias.length,
        mediana: mediana(f.dias),
        pior: f.dias.length ? Math.max(...f.dias) : 0,
        agora: f.agora,
        sla: prazos[fase] ?? null,
        fatia: total === 0 ? 0 : diasUteis / total,
      };
    })
    .sort((a, b) => b.diasUteis - a.diasUteis || b.vagas - a.vagas);

  return {
    gargalos,
    diasForaDaConta: [...fora.values()].reduce((a, b) => a + b, 0),
    forasMaiores: [...fora.entries()]
      .map(([fase, diasUteis]) => ({ fase, diasUteis }))
      .sort((a, b) => b.diasUteis - a.diasUteis)
      .slice(0, 3),
  };
}

export interface ResumoDoPeriodo {
  vagas: number;
  abertas: number;
  fechadas: number;
  canceladas: number;
  /** Dias úteis para fechar, na mediana, entre as que fecharam no recorte. */
  medianaParaFechar: number | null;
  /** Abertas que já passaram do prazo da categoria. */
  foraDoPrazo: number;
}

export function resumirPeriodo(vagas: VagaPipefyComNumeros[]): ResumoDoPeriodo {
  const abertas = vagas.filter((v) => v.situacao === 'aberta');
  const fechadas = vagas.filter((v) => v.situacao === 'fechada');

  return {
    vagas: vagas.length,
    abertas: abertas.length,
    fechadas: fechadas.length,
    canceladas: vagas.filter((v) => v.situacao === 'cancelada').length,
    medianaParaFechar: fechadas.length
      ? mediana(fechadas.filter((v) => v.sla).map((v) => v.sla!.decorridos))
      : null,
    foraDoPrazo: abertas.filter((v) => v.sla && v.sla.saldo < 0).length,
  };
}
