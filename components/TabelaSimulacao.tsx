'use client';

import { useMemo, useState } from 'react';
import type { VagaSimulada } from '@/lib/simulacao-pipefy';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';
import { urlDoCard } from '@/config/pipefy';

/** As fases que o R&S pediu para olhar primeiro. */
const FASES_DESTAQUE = ['Análise de P&C', 'Prova'];

const ROTULO_SITUACAO: Record<string, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  cancelada: 'Cancelada',
};

function Situacao({ valor }: { valor: string }) {
  const cor =
    valor === 'aberta'
      ? 'bg-[color-mix(in_srgb,var(--marca-azul)_16%,transparent)] text-[var(--marca-azul)]'
      : valor === 'fechada'
        ? 'bg-[color-mix(in_srgb,var(--alta)_16%,transparent)] text-[var(--alta)]'
        : 'bg-surface-2 text-ink-muted';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>
      {ROTULO_SITUACAO[valor] ?? valor}
    </span>
  );
}

function Prazo({ vaga }: { vaga: VagaSimulada }) {
  const { sla } = vaga;

  if (!sla) {
    /*
      Sem prazo tem duas causas bem diferentes, e a tela precisa separá-las:
      cancelada é decisão (não se cobra prazo de vaga tirada do ar); fechada sem
      data é o furo conhecido — a seleção acabou mas o card segue em admissão, e
      o Pipefy só carimba a data quando o card sai do pipe.
    */
    const motivo =
      vaga.situacao === 'cancelada'
        ? 'cancelada'
        : vaga.situacao === 'fechada'
          ? 'fechada sem data'
          : !vaga.categoria
            ? 'sem categoria'
            : 'sem prazo';
    return <span className="text-xs text-[var(--atencao)]">{motivo}</span>;
  }

  const cor =
    sla.situacao === 'atrasada' || sla.situacao === 'estourado'
      ? 'text-[var(--baixa)]'
      : sla.situacao === 'vence-hoje'
        ? 'text-[var(--atencao)]'
        : sla.situacao === 'cumprido'
          ? 'text-[var(--alta)]'
          : 'text-ink';

  const legenda =
    sla.situacao === 'atrasada'
      ? `${numero(-sla.saldo)} de atraso`
      : sla.situacao === 'vence-hoje'
        ? 'vence hoje'
        : sla.situacao === 'cumprido'
          ? 'fechada no prazo'
          : sla.situacao === 'estourado'
            ? `fechou ${numero(-sla.saldo)} além`
            : `faltam ${numero(sla.saldo)}`;

  return (
    <div className={`num text-sm font-medium ${cor}`}>
      {numero(sla.decorridos)} <span className="font-normal text-ink-muted">de</span>{' '}
      {numero(sla.prazo)} <span className="font-normal text-ink-muted">úteis</span>
      <div className="mt-0.5 text-xs font-normal">{legenda}</div>
    </div>
  );
}

export function TabelaSimulacao({ vagas }: { vagas: VagaSimulada[] }) {
  const [fase, setFase] = useState('(destaque)');
  const [situacao, setSituacao] = useState('aberta');
  const [categoria, setCategoria] = useState('');
  const [regional, setRegional] = useState('');
  const [busca, setBusca] = useState('');

  const fases = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of vagas) m.set(v.fase, (m.get(v.fase) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [vagas]);

  const categorias = useMemo(
    () => [...new Set(vagas.map((v) => v.categoria).filter(Boolean) as string[])].sort(),
    [vagas],
  );
  const regionais = useMemo(
    () => [...new Set(vagas.map((v) => v.regional).filter(Boolean) as string[])].sort(),
    [vagas],
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return vagas
      .filter((v) =>
        fase === '(todas)'
          ? true
          : fase === '(destaque)'
            ? FASES_DESTAQUE.includes(v.fase)
            : v.fase === fase,
      )
      .filter((v) => (situacao === 'todas' ? true : v.situacao === situacao))
      .filter((v) => (categoria === '' ? true : v.categoria === categoria))
      .filter((v) => (regional === '' ? true : v.regional === regional))
      .filter((v) =>
        termo === ''
          ? true
          : [v.nome, v.cardId, v.escola, v.cargo, v.fase]
              .filter(Boolean)
              .some((c) => (c as string).toLowerCase().includes(termo)),
      );
  }, [vagas, fase, situacao, categoria, regional, busca]);

  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">
          Vagas da planilha
          <span className="ml-2 font-normal text-ink-muted">
            {numero(visiveis.length)} de {numero(vagas.length)}
          </span>
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <select value={fase} onChange={(e) => setFase(e.target.value)} className={seletor}>
            <option value="(destaque)">Análise de P&amp;C + Prova</option>
            <option value="(todas)">Todas as fases</option>
            {fases.map(([f, n]) => (
              <option key={f} value={f}>
                {f} ({n})
              </option>
            ))}
          </select>

          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={seletor}>
            <option value="aberta">Abertas</option>
            <option value="fechada">Fechadas</option>
            <option value="cancelada">Canceladas</option>
            <option value="todas">Todas</option>
          </select>

          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={seletor}>
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c.replace(/^Vagas /, '')}
              </option>
            ))}
          </select>

          <select value={regional} onChange={(e) => setRegional(e.target.value)} className={seletor}>
            <option value="">Todas as regionais</option>
            {regionais.map((r) => (
              <option key={r} value={r}>
                {rotuloRegional(r) || r}
              </option>
            ))}
          </select>

          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar cargo, card, escola..."
            className={seletor}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[70rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-3 py-2 text-left font-medium">Card</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Vaga</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Categoria</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Regional / escola</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Fase no Pipefy</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Aberta em</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Prazo (SLA)</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Gupy</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((v) => (
              <tr key={v.cardId} className="border-b border-borda align-top last:border-0 hover:bg-surface-2">
                {/*
                  O ID abre o card no Pipefy, em outra aba. É a ponte de volta
                  para a origem: quem vê um atraso aqui chega no card que o
                  causou sem procurar o número à mão lá dentro.

                  `noreferrer` junto com `noopener` porque a aba nova não tem
                  nada a ganhar sabendo de onde veio.
                */}
                <td className="px-3 py-3 whitespace-nowrap">
                  <a
                    href={urlDoCard(v.cardId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`Abrir o card ${v.cardId} no Pipefy`}
                    className="num inline-flex items-center gap-1 font-medium text-[var(--marca-azul)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)]"
                  >
                    {v.cardId}
                    <span aria-hidden="true" className="text-xs">↗</span>
                  </a>
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium">{v.nome}</div>
                </td>
                <td className="px-3 py-3 text-xs">
                  {v.categoria ? (
                    <>
                      <div>{v.categoria.replace(/^Vagas /, '')}</div>
                      <div className="text-ink-muted">{v.categoriaPipefy}</div>
                    </>
                  ) : (
                    <span className="text-[var(--atencao)]">
                      sem de-para: {v.categoriaPipefy || '(vazio)'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs">
                  <div>{rotuloRegional(v.regional) || <span className="text-ink-muted">—</span>}</div>
                  <div className="text-ink-muted">{v.escola ?? 'toda a regional'}</div>
                </td>
                <td className="px-3 py-3 text-xs">
                  <div>{v.fase}</div>
                  <div className="mt-1">
                    <Situacao valor={v.situacao} />
                  </div>
                </td>
                <td className="num px-3 py-3 text-xs whitespace-nowrap">
                  {dataLonga(v.abertaEm)}
                  <div className="text-ink-muted">{numero(v.dias)} dias corridos</div>
                  {v.fechadaEm && (
                    <div className="text-ink-muted">fechou {dataLonga(v.fechadaEm)}</div>
                  )}
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <Prazo vaga={v} />
                </td>
                <td className="px-3 py-3 text-xs">
                  {v.vaiParaGupy ? (
                    <span className="text-ink-2">precisa vincular</span>
                  ) : (
                    <span className="text-ink-muted">
                      {v.formaPreenchimento || 'não informado'}
                    </span>
                  )}
                </td>
              </tr>
            ))}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ink-muted">
                  Nenhuma vaga neste recorte.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
