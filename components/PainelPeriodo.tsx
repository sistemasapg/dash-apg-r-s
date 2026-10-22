'use client';

import { useMemo, useState } from 'react';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { gargalosDe, noPeriodo, presets, resumirPeriodo, type Periodo } from '@/lib/gargalos';
import { filtrar, opcoes, resumirSla, SEM_RECORTE, type Recorte } from '@/lib/analise-sla';
import { rotuloRegional } from '@/config/unidades';
import { aderenciaPorTime } from '@/lib/sla-time';
import { LegendaDosTimes } from './SeloDeTime';
import { dataLonga, numero } from '@/lib/format';
import { StatTile } from './StatTile';
import { PainelSla, type Foco as FocoDaLista } from './PainelSla';
import { Amostra, COR, TEXTURA } from './Jornada';

/**
 * O recorte por período e a leitura de gargalo.
 *
 * Existe para responder perguntas de gestão que a lista de vagas não responde
 * sozinha: quantas vagas trabalhei este mês, e onde o processo está segurando.
 *
 * O filtro vive aqui e não na página porque precisa reger as duas leituras ao
 * mesmo tempo. Ter o período num lugar e os gargalos noutro produziria duas
 * respostas para recortes diferentes na mesma tela — e ninguém repara nisso até
 * tomar uma decisão errada.
 */
const ID_LISTA = 'lista-dashboard-2';
const ID_GARGALOS = 'gargalos';

export function PainelPeriodo({
  vagas,
  desde,
  prazosDeEtapa,
  prazoDp,
}: {
  vagas: VagaPipefyComNumeros[];
  desde: string;
  /** Prazo de cada fase, resolvido no servidor. Ver mapaDeEtapas() em lib/prazos.ts. */
  prazosDeEtapa: Record<string, number | null>;
  /** Prazo do DP por fase, resolvido no servidor. */
  prazoDp: number | null;
}) {
  const atalhos = useMemo(() => presets(desde), [desde]);

  const [preset, setPreset] = useState('mes');
  const [manual, setManual] = useState<Periodo | null>(null);

  /** A fase clicada na lista de gargalos. Recorta só a lista de vagas. */
  const [fase, setFase] = useState<string | null>(null);
  const [tudo, setTudo] = useState(false);
  const [recorte, setRecorte] = useState<Recorte>(SEM_RECORTE);
  const [foco, setFoco] = useState<FocoDaLista>('abertas');

  /** Leva a pessoa até a seção que detalha o número em que ela clicou. */
  function irPara(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Abre a lista na aba pedida e rola até ela. */
  function verNaLista(aba: FocoDaLista) {
    setFase(null);
    setFoco(aba);
    irPara(ID_LISTA);
  }

  const periodo = useMemo<Periodo>(
    () => manual ?? atalhos.find((p) => p.chave === preset)!.periodo(),
    [manual, preset, atalhos],
  );

  /*
    Dois recortes em sequência, e a ordem importa: o período primeiro, porque
    é ele que define o universo da tela, e só depois regional/escola/categoria.
    As opções dos seletores saem de `doPeriodo` — oferecer uma escola que não
    teve vaga no período devolveria lista vazia sem a pessoa entender por quê.
  */
  const doPeriodo = useMemo(() => vagas.filter((v) => noPeriodo(v, periodo)), [vagas, periodo]);
  const doRecorte = useMemo(() => filtrar(doPeriodo, recorte), [doPeriodo, recorte]);

  const temRecorte = Boolean(recorte.regional || recorte.unidade || recorte.categoria);

  const trocarRecorte = (campo: keyof Recorte, valor: string) =>
    setRecorte({
      ...recorte,
      [campo]: valor,
      // Trocar de regional zera a escola: a anterior é de outra regional.
      ...(campo === 'regional' ? { unidade: '' } : {}),
    });

  const resumo = useMemo(() => resumirPeriodo(doRecorte), [doRecorte]);
  const sla = useMemo(() => resumirSla(doRecorte), [doRecorte]);

  /* As duas réguas: o R&S contra o prazo da categoria, o DP contra o dele por fase. */
  const porTime = useMemo(
    () => aderenciaPorTime(doRecorte.flatMap((v) => (v.slaPorTime ? [v.slaPorTime] : []))),
    [doRecorte],
  );
  const aderenciaRs = porTime.find((a) => a.dono === 'R&S');
  const aderenciaDp = porTime.find((a) => a.dono === 'DP');
  const { gargalos, diasForaDaConta } = useMemo(
    () => gargalosDe(doRecorte, prazosDeEtapa),
    [doRecorte, prazosDeEtapa],
  );

  const maior = gargalos[0]?.diasUteis ?? 1;

  /** Quantas fases a lista mostra fechada. Da sexta para baixo nenhuma passa de 5%. */
  const LIMITE = 5;
  const visiveis = tudo ? gargalos : gargalos.slice(0, LIMITE);

  /*
    A fase clicada recorta só a lista de baixo — os cartões e a tabela de
    gargalos seguem falando do período inteiro. Recortá-los junto apagaria o
    contexto que fez a pessoa clicar: ela quer ver as vagas DAQUELA fase sem
    perder de vista o quanto ela pesa no todo.

    Filtra pela fase ATUAL da vaga, não por ter passado por lá: quem clica num
    gargalo quer as vagas que estão presas nele agora.
  */
  const listadas = useMemo(() => {
    if (!fase) return doRecorte;
    return doRecorte.filter((v) => (v.jornada ?? []).some((t) => t.atual && t.fase === fase));
  }, [doRecorte, fase]);

  // Fase escolhida que sai do recorte ao trocar o período não pode ficar presa.
  const faseValida = fase && gargalos.some((g) => g.fase === fase) ? fase : null;

  function escolherPreset(chave: string) {
    setManual(null);
    setFase(null);
    setPreset(chave);
  }

  const botao =
    'rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)]';
  const campo =
    'rounded-lg border border-borda bg-surface px-2.5 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-borda bg-surface p-5">
        <div className="flex flex-wrap items-center gap-2">
          {atalhos.map((p) => {
            const ativo = !manual && preset === p.chave;
            return (
              <button
                key={p.chave}
                type="button"
                onClick={() => escolherPreset(p.chave)}
                aria-pressed={ativo}
                className={`${botao} ${
                  ativo
                    ? 'border-[var(--marca-azul)] bg-[color-mix(in_srgb,var(--marca-azul)_10%,transparent)] font-medium text-ink'
                    : 'border-borda text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`}
              >
                {p.rotulo}
              </button>
            );
          })}

          <span className="mx-1 text-ink-muted">|</span>

          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            de
            <input
              type="date"
              value={periodo.de}
              min={desde}
              onChange={(e) => setManual({ de: e.target.value, ate: periodo.ate })}
              className={campo}
              aria-label="Data inicial"
            />
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ink-2">
            até
            <input
              type="date"
              value={periodo.ate}
              min={desde}
              onChange={(e) => setManual({ de: periodo.de, ate: e.target.value })}
              className={campo}
              aria-label="Data final"
            />
          </label>
        </div>

        {/*
          Os filtros de recorte moram na mesma caixa dos de data, e não dentro
          do painel de baixo. Separados, a tela tinha duas barras de filtro e
          duas fileiras de cartões, com números repetidos entre elas — e nada
          dizia que um filtro valia para a tela inteira e o outro só para
          metade dela.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-borda pt-4">
          <select
            value={recorte.regional}
            onChange={(e) => trocarRecorte('regional', e.target.value)}
            className={campo}
            aria-label="Regional"
          >
            <option value="">Todas as regionais</option>
            {opcoes(doPeriodo, 'regional', recorte).map((r) => (
              <option key={r} value={r}>
                {rotuloRegional(r) || r}
              </option>
            ))}
          </select>

          <select
            value={recorte.unidade}
            onChange={(e) => trocarRecorte('unidade', e.target.value)}
            className={campo}
            aria-label="Escola"
          >
            <option value="">Todas as escolas</option>
            {opcoes(doPeriodo, 'unidade', recorte).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          <select
            value={recorte.categoria}
            onChange={(e) => trocarRecorte('categoria', e.target.value)}
            className={campo}
            aria-label="Categoria"
          >
            <option value="">Todas as categorias</option>
            {opcoes(doPeriodo, 'categoria', recorte).map((c) => (
              <option key={c} value={c}>
                {c.replace(/^Vagas /, '')}
              </option>
            ))}
          </select>

          {temRecorte && (
            <button
              type="button"
              onClick={() => setRecorte(SEM_RECORTE)}
              className="rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              limpar
            </button>
          )}

          <span className="num ml-auto text-xs text-ink-muted">
            criadas entre {dataLonga(periodo.de)} e {dataLonga(periodo.ate)}
          </span>
        </div>
      </section>

      {/*
        A ordem dos cartões segue a pergunta de quem abre a tela: quanto entrou,
        quanto demora, quanto está pendente, onde trava.
      */}
      {/* Cinco cartões: três de volume e dois de aderência, um por time. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/*
          Todo cartão leva à seção que o detalha. Um número grande sem caminho
          até o detalhe obriga a pessoa a procurar na tela qual parte o explica.
        */}
        {/*
          Os três primeiros fecham uma conta: criadas = encerradas + em aberto.
          Quem olha confere a soma de cabeça, e isso dá confiança no resto.
        */}
        <StatTile
          rotulo="Vagas criadas"
          valor={resumo.vagas}
          nota="todas as que nasceram no período"
          aoClicar={() => verNaLista('todas')}
          ativo={foco === 'todas' && !faseValida}
          dicaClique="clique para ver todas na lista"
        />
        <StatTile
          rotulo="Encerradas"
          valor={resumo.fechadas + resumo.canceladas}
          nota={`${numero(resumo.fechadas)} concluídas · ${numero(resumo.canceladas)} canceladas`}
          aoClicar={() => verNaLista('fechadas')}
          ativo={foco === 'fechadas' && !faseValida}
          dicaClique="clique para ver as concluídas"
        />
        <StatTile
          rotulo="Ainda em aberto"
          valor={resumo.abertas}
          nota={[
            sla.mediaUteisAbertas === null
              ? null
              : `há ${numero(sla.mediaUteisAbertas)} dias úteis na média`,
            resumo.foraDoPrazo > 0
              ? `${numero(resumo.foraDoPrazo)} fora do prazo`
              : 'todas dentro do prazo',
          ]
            .filter(Boolean)
            .join(' · ')}
          destaque={resumo.foraDoPrazo > 0}
          aoClicar={() => verNaLista('abertas')}
          ativo={foco === 'abertas' && !faseValida}
          dicaClique="clique para ver as abertas"
        />

        {/*
          Duas réguas, dois cartões. Eram um só — "tempo para fechar" — que
          somava o trabalho dos dois times e por isso não apontava para
          ninguém: uma vaga com R&S de 4 dias e DP de 13 aparecia como "13 de
          15, no prazo".
        */}
        <StatTile
          rotulo="R&S no prazo"
          valor={aderenciaRs?.aderencia === null || !aderenciaRs ? '—' : Math.round(aderenciaRs.aderencia * 100)}
          sufixo={aderenciaRs?.aderencia == null ? undefined : '%'}
          nota={
            aderenciaRs?.aderencia == null
              ? 'nenhuma vaga passou pelo R&S no recorte'
              : `${numero(aderenciaRs.dentro)} de ${numero(aderenciaRs.medidas)} · mediana ${numero(aderenciaRs.mediana)} dias úteis`
          }
          destaque={aderenciaRs?.aderencia != null && aderenciaRs.aderencia < 0.8}
        />
        <StatTile
          rotulo="DP no prazo"
          valor={aderenciaDp?.aderencia === null || !aderenciaDp ? '—' : Math.round(aderenciaDp.aderencia * 100)}
          sufixo={aderenciaDp?.aderencia == null ? undefined : '%'}
          nota={
            aderenciaDp?.aderencia == null
              ? 'nenhuma vaga passou pelo DP no recorte'
              : `${numero(aderenciaDp.dentro)} de ${numero(aderenciaDp.medidas)} · mediana ${numero(aderenciaDp.mediana)} dias úteis`
          }
          destaque={aderenciaDp?.aderencia != null && aderenciaDp.aderencia < 0.8}
        />
        {/*
          Este cartão responde "qual fase", não "quantos dias".

          Ele já trouxe o TOTAL de dias da fase líder — 30.294 em dezoito meses.
          Número grande sem magnitude que alguém reconheça não informa, só ocupa
          a atenção que os outros quatro precisam. O nome da fase é a resposta;
          a porcentagem fica ao lado para dizer o tamanho dela.
        */}
        <button
          type="button"
          onClick={() => gargalos[0] && irPara(ID_GARGALOS)}
          disabled={!gargalos[0]}
          className="rounded-xl border border-borda bg-surface p-5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-surface"
        >
          <div className="text-sm text-ink-2">Onde mais trava</div>

          {gargalos[0] ? (
            <>
              <div className="mt-2 line-clamp-2 text-lg leading-snug font-semibold tracking-tight">
                {gargalos[0].fase}
              </div>
              <div className="num mt-2 min-h-5 text-sm text-ink-2">
                <span className="font-medium">{Math.round(gargalos[0].fatia * 100)}%</span> de
                todo o tempo
              </div>
              <div className="mt-1 text-xs text-ink-muted">
                {numero(gargalos[0].agora)}{' '}
                {gargalos[0].agora === 1 ? 'vaga parada aqui' : 'vagas paradas aqui'} · clique
                para ver
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-lg font-semibold tracking-tight text-ink-muted">—</div>
              <div className="mt-2 min-h-5 text-sm text-ink-2">sem histórico no recorte</div>
            </>
          )}
        </button>
      </div>

      <LegendaDosTimes prazoDp={prazoDp} />


      {faseValida && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--marca-azul)] bg-[color-mix(in_srgb,var(--marca-azul)_8%,transparent)] p-4 text-sm">
          <span>
            Mostrando as <strong>{numero(listadas.length)}</strong> vagas paradas em{' '}
            <strong>{faseValida}</strong>. Os cartões continuam falando do
            período inteiro.
          </span>
          <button
            type="button"
            onClick={() => setFase(null)}
            className="rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            Mostrar todas
          </button>
        </div>
      )}

      {/*
        A `key` remonta o painel quando a fase muda, e é o que faz a aba voltar
        para "todas". Sem isso o estado interno sobreviveria ao clique e a lista
        abriria em "abertas" — vazia, porque fases de trabalho em andamento como
        "Aguardando envio da documentação" contam como vaga fechada no dash.
      */}
      <div id={ID_LISTA} className="scroll-mt-6">
        <PainelSla
          vagas={listadas}
          foco={foco}
          aoMudarFoco={setFoco}
          recorte={recorte}
          aoMudarRecorte={setRecorte}
        />
      </div>

      {/*
        O gargalo vem DEPOIS da lista e cabe em poucas linhas: é complemento.
        A pergunta principal da tela é como foi o período, e isso os cartões e
        a lista respondem. Esta seção responde a pergunta seguinte — "e onde
        travou?" — para quem quiser puxar o fio.

        Mostra as cinco maiores porque da sexta para baixo nenhuma passa de 5%
        do tempo: catorze linhas para encontrar três que importam é trabalho
        que a tela deveria poupar.
      */}
      <section id={ID_GARGALOS} className="scroll-mt-6 rounded-xl border border-borda bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Onde o tempo ficou</h2>
          {gargalos.length > LIMITE && (
            <button
              type="button"
              onClick={() => setTudo(!tudo)}
              className="text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              {tudo ? '▴ mostrar só as maiores' : `▾ ver todas as ${numero(gargalos.length)}`}
            </button>
          )}
        </div>

        <ul className="mt-4 flex flex-col gap-2.5">
          {visiveis.map((g) => {
            const selecionada = faseValida === g.fase;
            const clicavel = g.agora > 0;
            return (
              <li key={g.fase}>
                <button
                  type="button"
                  disabled={!clicavel}
                  onClick={() => {
                    if (selecionada) {
                      setFase(null);
                      return;
                    }
                    setFase(g.fase);
                    /*
                      Aba "todas", e não "abertas": várias fases de trabalho em
                      andamento contam como vaga fechada no dash, então abrir
                      em "abertas" devolveria lista vazia logo depois do clique.
                    */
                    setFoco('todas');
                    irPara(ID_LISTA);
                  }}
                  aria-pressed={selecionada}
                  title={
                    clicavel
                      ? `Ver as ${g.agora} vagas paradas aqui · ${g.vagas} passaram · costuma levar ${g.mediana} dias úteis`
                      : `${g.vagas} vagas passaram · costuma levar ${g.mediana} dias úteis · nenhuma parada aqui agora`
                  }
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    selecionada
                      ? 'bg-[color-mix(in_srgb,var(--marca-azul)_10%,transparent)]'
                      : clicavel
                        ? 'hover:bg-surface-2'
                        : 'cursor-default'
                  }`}
                >
                  <Amostra dono={g.dono} />

                  <span className="w-60 shrink-0 truncate text-sm" title={g.fase}>
                    {g.fase}
                  </span>

                  {/* Escala comum: as barras existem para se comparar entre si. */}
                  <span className="h-2.5 min-w-[5rem] flex-1 rounded-full bg-surface-2">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max((g.diasUteis / maior) * 100, 1.5)}%`,
                        background: COR[g.dono],
                        backgroundImage: TEXTURA[g.dono],
                      }}
                    />
                  </span>

                  <span className="num w-20 shrink-0 text-right text-sm tabular-nums">
                    {numero(g.diasUteis)}
                    <span className="ml-1 text-xs text-ink-muted">
                      {Math.round(g.fatia * 100)}%
                    </span>
                  </span>

                  <span
                    className={`num w-24 shrink-0 text-right text-xs tabular-nums ${
                      clicavel ? 'text-[var(--marca-azul)]' : 'text-ink-muted'
                    }`}
                  >
                    {clicavel ? `${numero(g.agora)} paradas →` : '—'}
                  </span>
                </button>
              </li>
            );
          })}

          {gargalos.length === 0 && (
            <li className="py-4 text-center text-sm text-ink-muted">
              Nenhuma vaga com histórico de fase neste período.
            </li>
          )}
        </ul>

        <p className="mt-4 text-xs text-ink-muted">
          Só fases com responsável entram — as de repouso, como{' '}
          <em>Processo Seletivo Concluído</em>, somam {numero(diasForaDaConta)} dias úteis e
          liderariam o ranking sem ninguém estar esperando nada. Tempo total alto pode ser volume
          e não demora: passe o mouse para ver quantas passaram e quanto costuma levar.
        </p>
      </section>
    </div>
  );
}
