'use client';

import { useMemo, useState } from 'react';
import type { VagaPipefyComNumeros } from '@/lib/types';
import {
  filtrar,
  opcoes,
  porCategoria,
  porUrgencia,
  resumirSla,
  SEM_RECORTE,
  type Recorte,
} from '@/lib/analise-sla';
import { rotuloRegional } from '@/config/unidades';
import { numero } from '@/lib/format';
import { StatTile } from './StatTile';
import { BarrasCategoria } from './BarrasCategoria';
import { MediaVsSla } from './MediaVsSla';
import { ListaVagasSla } from './ListaVagasSla';

/** Onde a lista de vagas mora, para os cartões conseguirem rolar até ela. */
const ID_LISTA = 'lista-vagas';

/** O que a lista de baixo está mostrando. */
type Foco = 'abertas' | 'fora-do-prazo';

/**
 * O painel de vagas e prazos.
 *
 * Tudo é recalculado no navegador a partir da carteira inteira: são dezenas de
 * vagas, e trocar de regional, clicar numa barra ou num cartão vira uma volta de
 * laço em vez de uma ida ao servidor. É o que torna o recorte instantâneo.
 */
export function PainelSla({ vagas }: { vagas: VagaPipefyComNumeros[] }) {
  const [recorte, setRecorte] = useState<Recorte>(SEM_RECORTE);
  const [foco, setFoco] = useState<Foco>('abertas');

  const filtradas = useMemo(() => filtrar(vagas, recorte), [vagas, recorte]);
  const resumo = useMemo(() => resumirSla(filtradas), [filtradas]);
  const abertas = useMemo(() => porUrgencia(filtradas), [filtradas]);

  const listadas = useMemo(
    () => (foco === 'fora-do-prazo' ? abertas.filter((v) => v.sla && v.sla.saldo < 0) : abertas),
    [abertas, foco],
  );

  /*
    As barras por categoria ignoram o recorte de categoria: elas são o próprio
    seletor. Escondê-las ao clicar deixaria a pessoa sem como voltar ou trocar.
  */
  const categorias = useMemo(
    () => porCategoria(filtrar(vagas, { ...recorte, categoria: '' })),
    [vagas, recorte],
  );

  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  const trocar = (campo: keyof Recorte, valor: string) =>
    setRecorte((r) => ({
      ...r,
      [campo]: valor,
      // Trocar de regional zera a escola: a escola anterior é de outra regional
      // e o recorte devolveria lista vazia sem a pessoa entender por quê.
      ...(campo === 'regional' ? { unidade: '' } : {}),
    }));

  /** Muda o que a lista mostra e leva a pessoa até ela. */
  const focar = (novo: Foco) => {
    setFoco(novo);
    document.getElementById(ID_LISTA)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const temRecorte = recorte.regional || recorte.unidade || recorte.categoria;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={recorte.regional}
          onChange={(e) => trocar('regional', e.target.value)}
          className={seletor}
          aria-label="Regional"
        >
          <option value="">Todas as regionais</option>
          {opcoes(vagas, 'regional', recorte).map((r) => (
            <option key={r} value={r}>
              {rotuloRegional(r) || r}
            </option>
          ))}
        </select>

        <select
          value={recorte.unidade}
          onChange={(e) => trocar('unidade', e.target.value)}
          className={seletor}
          aria-label="Escola"
        >
          <option value="">Todas as escolas</option>
          {opcoes(vagas, 'unidade', recorte).map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>

        {/*
          A categoria também está nas barras do gráfico. Os dois caminhos mexem
          no mesmo estado, então escolher aqui acende a barra correspondente e
          vice-versa — quem procura filtro no lugar dos filtros acha, e quem
          prefere clicar no gráfico continua clicando.
        */}
        <select
          value={recorte.categoria}
          onChange={(e) => trocar('categoria', e.target.value)}
          className={seletor}
          aria-label="Categoria"
        >
          <option value="">Todas as categorias</option>
          {opcoes(vagas, 'categoria', recorte).map((c) => (
            <option key={c} value={c}>
              {c.replace(/^Vagas /, '')}
            </option>
          ))}
        </select>

        {/*
          O recorte que veio do cartão aparece aqui, junto dos outros filtros e
          com o mesmo jeito de sair. Antes ele só existia como borda azul no
          cartão lá em cima, o que não se lia como filtro nenhum.
        */}
        {foco === 'fora-do-prazo' && (
          <button
            type="button"
            onClick={() => setFoco('abertas')}
            className="flex items-center gap-2 rounded-lg border border-[var(--baixa)] bg-[color-mix(in_srgb,var(--baixa)_10%,transparent)] px-3 py-1.5 text-sm text-[var(--baixa)]"
          >
            Só as fora do prazo
            <span aria-hidden="true">×</span>
            <span className="sr-only">remover este filtro</span>
          </button>
        )}

        {(temRecorte || foco !== 'abertas') && (
          <button
            type="button"
            onClick={() => {
              setRecorte(SEM_RECORTE);
              setFoco('abertas');
            }}
            className="rounded-lg px-3 py-1.5 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            limpar tudo
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          rotulo="Vagas em aberto"
          valor={resumo.abertas}
          nota={
            resumo.semCategoria > 0
              ? `${numero(resumo.semCategoria)} sem categoria, fora do prazo medido`
              : 'todas com categoria'
          }
          destaque
          /*
            Este cartão não filtra: ele leva à lista completa e desfaz o recorte
            de "fora do prazo". Marcá-lo como ativo daria a entender que há um
            filtro ligado quando não há — é o estado normal da tela.
          */
          aoClicar={resumo.abertas > 0 ? () => focar('abertas') : undefined}
          dicaClique={
            foco === 'fora-do-prazo' ? 'clique para ver todas' : 'clique para ir à lista'
          }
        />
        <StatTile
          rotulo="Média em aberto"
          valor={resumo.mediaUteisAbertas ?? 0}
          sufixo=" dias úteis"
          nota={
            resumo.mediaCorridosAbertas !== null
              ? `${numero(resumo.mediaCorridosAbertas)} dias corridos`
              : 'nenhuma vaga aberta'
          }
        />
        <StatTile
          rotulo="Fora do prazo"
          valor={resumo.foraDoPrazo}
          nota={
            resumo.foraDoPrazo === 0
              ? 'nenhuma vaga passou do SLA'
              : `de ${numero(resumo.abertas - resumo.semCategoria)} vagas com prazo`
          }
          // Cartão zerado não vira clique: levaria a uma lista vazia, que é um
          // beco sem saída disfarçado de resposta.
          aoClicar={
            resumo.foraDoPrazo > 0
              ? () => focar(foco === 'fora-do-prazo' ? 'abertas' : 'fora-do-prazo')
              : undefined
          }
          ativo={foco === 'fora-do-prazo'}
          dicaClique={
            foco === 'fora-do-prazo'
              ? 'filtrando · clique para tirar'
              : 'clique para filtrar a lista'
          }
        />
        <StatTile
          rotulo="Média até fechar"
          valor={resumo.mediaUteisParaFechar ?? 0}
          sufixo=" dias úteis"
          nota={
            resumo.fechadas === 0
              ? 'nenhuma vaga fechada ainda'
              : `sobre ${numero(resumo.fechadas)} vaga${resumo.fechadas > 1 ? 's' : ''} fechada${resumo.fechadas > 1 ? 's' : ''}`
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <BarrasCategoria
          linhas={categorias}
          selecionada={recorte.categoria}
          aoSelecionar={(c) => trocar('categoria', c)}
        />
        <MediaVsSla linhas={porCategoria(filtradas)} />
      </div>

      <div id={ID_LISTA} className="scroll-mt-6">
        <ListaVagasSla
          vagas={listadas}
          titulo={[
            foco === 'fora-do-prazo' ? 'Vagas fora do prazo' : 'Vagas abertas',
            recorte.categoria && `· ${recorte.categoria.replace(/^Vagas /, '')}`,
            recorte.unidade
              ? `· ${recorte.unidade}`
              : recorte.regional && `· ${rotuloRegional(recorte.regional)}`,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      </div>
    </div>
  );
}
