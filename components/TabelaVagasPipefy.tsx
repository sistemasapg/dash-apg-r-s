'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { comSinal, dataLonga, numero } from '@/lib/format';
import { removerVaga } from '@/app/(painel)/pipefy/acoes';
import { rotuloRegional } from '@/config/unidades';

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

/**
 * O prazo da vaga, em dias úteis.
 *
 * A cor vem do SLA da categoria, não de um número redondo escolhido a esmo:
 * 8 dias úteis é tranquilo numa vaga administrativa (SLA 15) e já é atraso numa
 * de professor (SLA 7). Sem categoria não há cor nenhuma — o dash não inventa
 * um prazo que ninguém acordou.
 */
function Prazo({ vaga }: { vaga: VagaPipefyComNumeros }) {
  const { sla } = vaga;

  if (!sla) {
    return (
      <span className="text-xs text-[var(--atencao)]">
        {vaga.situacao === 'cancelada' ? 'cancelada, sem prazo' : 'sem categoria'}
      </span>
    );
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
      ? `${numero(-sla.saldo)} dia${sla.saldo === -1 ? '' : 's'} útil(eis) de atraso`
      : sla.situacao === 'vence-hoje'
        ? 'vence hoje'
        : sla.situacao === 'cumprido'
          ? 'fechada no prazo'
          : sla.situacao === 'estourado'
            ? `fechada ${numero(-sla.saldo)} dia(s) além do prazo`
            : `faltam ${numero(sla.saldo)} dia(s) útil(eis)`;

  return (
    <div className={`num text-sm font-medium ${cor}`}>
      {numero(sla.decorridos)} <span className="font-normal text-ink-muted">de</span>{' '}
      {numero(sla.prazo)} <span className="font-normal text-ink-muted">úteis</span>
      <div className="mt-0.5 text-xs font-normal">{legenda}</div>
      <div className="mt-0.5 text-xs font-normal text-ink-muted">
        {numero(vaga.dias)} dias corridos
      </div>
    </div>
  );
}

export function TabelaVagasPipefy({
  vagas,
  consulta,
  temComparacao,
  aoEditar,
}: {
  vagas: VagaPipefyComNumeros[];
  consulta: string;
  temComparacao: boolean;
  aoEditar: (vaga: VagaPipefyComNumeros) => void;
}) {
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('aberta');
  const [regional, setRegional] = useState('');
  const [categoria, setCategoria] = useState('');
  const [confirmando, setConfirmando] = useState<string | null>(null);

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
      .filter((v) => (situacao === 'todas' ? true : v.situacao === situacao))
      .filter((v) => (regional === '' ? true : v.regional === regional))
      .filter((v) => (categoria === '' ? true : v.categoria === categoria))
      .filter((v) =>
        termo === ''
          ? true
          : [v.titulo, v.card_id, v.unidade, v.regional, v.gupy_nome]
              .filter(Boolean)
              .some((campo) => (campo as string).toLowerCase().includes(termo)),
      )
      /*
        Ordena por SALDO de prazo, não por dias corridos: no topo fica a vaga
        mais atrasada em relação ao SLA dela, que é quem precisa de ação hoje.
        Vaga sem prazo vai para o fim, e não para o topo — ela não está atrasada,
        só não foi classificada.
      */
      .sort((a, b) => (a.sla?.saldo ?? Infinity) - (b.sla?.saldo ?? Infinity) || b.dias - a.dias);
  }, [vagas, busca, situacao, regional, categoria]);

  const seletor =
    'rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]';

  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">
          Vagas em acompanhamento
          <span className="ml-2 font-normal text-ink-muted">
            {visiveis.length} de {vagas.length}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={situacao} onChange={(e) => setSituacao(e.target.value)} className={seletor}>
            <option value="aberta">Abertas</option>
            <option value="fechada">Fechadas</option>
            <option value="cancelada">Canceladas</option>
            <option value="todas">Todas</option>
          </select>
          {categorias.length > 0 && (
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={seletor}>
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          {regionais.length > 0 && (
            <select value={regional} onChange={(e) => setRegional(e.target.value)} className={seletor}>
              <option value="">Todas as regionais</option>
              {regionais.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          )}
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Filtrar vaga, card, unidade..."
            className={seletor}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-3 py-2 text-left font-medium">Vaga / card</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Categoria e função</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Regional e escola</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Aberta em</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Prazo (SLA)</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Vaga na Gupy</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Candidatos</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((v) => {
              const delta =
                v.candidatos !== null && v.candidatosAntes !== null
                  ? v.candidatos - v.candidatosAntes
                  : null;

              return (
                <tr key={v.card_id} className="border-b border-borda last:border-0 align-top hover:bg-surface-2">
                  <td className="px-3 py-3">
                    <div className="font-medium">{v.titulo}</div>
                    <div className="num mt-0.5 text-xs text-ink-muted">card {v.card_id}</div>
                    {v.observacao && (
                      <div className="mt-1 max-w-[22rem] text-xs text-ink-2">{v.observacao}</div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {v.categoria ? (
                      <div className="text-xs">{v.categoria.replace(/^Vagas /, '')}</div>
                    ) : (
                      <div className="text-xs text-[var(--atencao)]">sem categoria</div>
                    )}
                    {v.funcao && <div className="mt-0.5 text-xs text-ink-muted">{v.funcao}</div>}
                  </td>
                  <td className="px-3 py-3">
                    <div>{rotuloRegional(v.regional) || <span className="text-ink-muted">—</span>}</div>
                    {v.unidade && <div className="text-xs text-ink-muted">{v.unidade}</div>}
                  </td>
                  <td className="num px-3 py-3 whitespace-nowrap">
                    {dataLonga(v.aberta_em)}
                    <div className="mt-1">
                      <Situacao valor={v.situacao} />
                    </div>
                    {v.fechada_em && (
                      <div className="mt-1 text-xs text-ink-muted">
                        em {dataLonga(v.fechada_em)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Prazo vaga={v} />
                  </td>
                  <td className="px-3 py-3">
                    {v.vaga_codigo ? (
                      <Link
                        href={`/vagas/${encodeURIComponent(v.vaga_codigo)}${consulta}`}
                        className="font-medium hover:underline"
                      >
                        {v.gupy_nome ?? v.vaga_codigo}
                      </Link>
                    ) : (
                      <span className="text-[var(--atencao)]">sem vínculo</span>
                    )}
                    {v.vaga_codigo && !v.gupy_nome && (
                      // Vinculada, mas ausente da foto: a vaga saiu do ar ou o
                      // recorte (publicadas, sem Joinville) deixou-a de fora.
                      <div className="text-xs text-ink-muted">fora da foto atual</div>
                    )}
                  </td>
                  <td className="num px-3 py-3 text-right whitespace-nowrap">
                    {v.candidatos === null ? (
                      <span className="text-ink-muted">—</span>
                    ) : (
                      <>
                        <span className="font-medium">{numero(v.candidatos)}</span>
                        {temComparacao && delta !== null && delta !== 0 && (
                          <span
                            className={`ml-1 text-xs ${delta > 0 ? 'text-[var(--alta)]' : 'text-[var(--baixa)]'}`}
                          >
                            {comSinal(delta)}
                          </span>
                        )}
                        {v.encerrados !== null && v.encerrados > 0 && (
                          <div className="text-xs text-ink-muted">
                            {numero(v.encerrados)} já encerrados
                          </div>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => aoEditar(v)}
                      className="rounded-md px-2 py-1 text-xs text-ink-2 underline-offset-2 hover:text-ink hover:underline"
                    >
                      editar
                    </button>
                    {confirmando === v.card_id ? (
                      <form action={removerVaga} className="mt-1 flex justify-end gap-1">
                        <input type="hidden" name="card_id" value={v.card_id} />
                        <button
                          type="submit"
                          className="rounded-md bg-[var(--baixa)] px-2 py-1 text-xs font-medium text-white"
                        >
                          confirmar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmando(null)}
                          className="rounded-md px-2 py-1 text-xs text-ink-2 hover:text-ink"
                        >
                          não
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmando(v.card_id)}
                        className="mt-1 block w-full rounded-md px-2 py-1 text-xs text-ink-muted underline-offset-2 hover:text-[var(--baixa)] hover:underline"
                      >
                        remover
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}

            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-ink-muted">
                  {vagas.length === 0
                    ? 'Nenhuma vaga lançada ainda. Use o formulário acima.'
                    : 'Nenhuma vaga com esse recorte.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
