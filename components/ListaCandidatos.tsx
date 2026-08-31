'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { CandidatoLinha } from '@/lib/metrics';
import { dataLonga, numero } from '@/lib/format';

const POR_PAGINA = 50;

/**
 * Há quanto tempo o candidato não sai do lugar. Quem está parado há muito
 * tempo é justamente quem some da vista do recrutador.
 */
function TempoParado({
  dias,
  fonte,
}: {
  dias: number | null;
  fonte: 'historico' | 'gupy' | null;
}) {
  if (dias === null) return <span className="text-ink-muted">—</span>;

  const cor =
    dias >= 30
      ? 'text-[var(--baixa)] font-medium'
      : dias >= 14
        ? 'text-[var(--atencao)] font-medium'
        : 'text-ink-2';

  return (
    <span
      className={cor}
      title={
        // A abreviação economiza espaço na coluna; o título por extenso mantém
        // a leitura acessível para quem usa leitor de tela.
        `${numero(dias)} ${dias === 1 ? 'dia' : 'dias'} — ` +
        (fonte === 'historico'
          ? 'contado desde o dia em que o dash viu o candidato mudar de etapa.'
          : 'aproximado, baseado na última alteração da candidatura na Gupy, porque ainda não há histórico suficiente.')
      }
    >
      {numero(dias)}d
      {fonte === 'gupy' && <span className="ml-0.5 text-ink-muted">*</span>}
    </span>
  );
}

/**
 * Quem são as pessoas por trás do número. A etapa escolhida vive na URL, e não
 * no estado local, para o clique no funil e o seletor daqui apontarem sempre
 * para a mesma verdade — e para o recorte poder ser compartilhado por link.
 */
export function ListaCandidatos({
  candidatos,
  etapas,
  etapaSelecionada = null,
  mostrarVaga = false,
  semDetalhe = false,
}: {
  candidatos: CandidatoLinha[];
  etapas: { nome: string; total: number }[];
  etapaSelecionada?: string | null;
  mostrarVaga?: boolean;
  semDetalhe?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState(0);

  const trocarEtapa = (valor: string) => {
    const novos = new URLSearchParams(params.toString());
    if (valor === 'todas') novos.delete('etapa');
    else novos.set('etapa', valor);
    setPagina(0);
    router.push(`${pathname}?${novos.toString()}`, { scroll: false });
  };

  const limparEtapa = () => trocarEtapa('todas');

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return candidatos;
    return candidatos.filter(
      (c) =>
        (c.candidato_nome ?? '').toLowerCase().includes(termo) ||
        (c.candidato_email ?? '').toLowerCase().includes(termo),
    );
  }, [candidatos, busca]);

  const totalPaginas = Math.ceil(visiveis.length / POR_PAGINA);
  const paginaAtual = Math.min(pagina, Math.max(0, totalPaginas - 1));
  const fatia = visiveis.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const totalGeral = etapas.reduce((soma, e) => soma + e.total, 0);

  if (semDetalhe) {
    return (
      <section id="candidatos" className="rounded-xl border border-borda bg-surface p-5">
        <h2 className="text-sm font-semibold">Candidatos</h2>
        <p className="mt-3 text-sm text-ink-muted">
          Esta foto é antiga demais: o detalhe por candidato foi compactado. As contagens
          por etapa continuam corretas, mas a lista nominal não existe mais para esta data.
        </p>
      </section>
    );
  }

  return (
    <section
      id="candidatos"
      className={`scroll-mt-4 rounded-xl border bg-surface ${
        etapaSelecionada ? 'border-[var(--serie-1)]' : 'border-borda'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borda p-5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">
            {etapaSelecionada ? (
              <>
                Candidatos em <span className="text-[var(--serie-1)]">{etapaSelecionada}</span>
              </>
            ) : (
              'Candidatos'
            )}{' '}
            <span className="num font-normal text-ink-muted">({numero(visiveis.length)})</span>
          </h2>
          {etapaSelecionada && (
            <button
              type="button"
              onClick={limparEtapa}
              className="mt-1 text-xs text-ink-2 underline hover:text-ink"
            >
              ver todas as etapas
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={etapaSelecionada ?? 'todas'}
            onChange={(e) => trocarEtapa(e.target.value)}
            className="rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm"
          >
            <option value="todas">Todas as etapas ({numero(totalGeral)})</option>
            {etapas.map((e) => (
              <option key={e.nome} value={e.nome}>
                {e.nome} ({numero(e.total)})
              </option>
            ))}
          </select>
          <input
            type="search"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPagina(0);
            }}
            placeholder="Nome ou e-mail..."
            className="rounded-lg border border-borda bg-surface px-3 py-1.5 text-sm focus:outline-2 focus:outline-[var(--serie-1)]"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-3 py-2 text-left font-medium">Candidato</th>
              {mostrarVaga && (
                <th scope="col" className="px-3 py-2 text-left font-medium">Vaga</th>
              )}
              <th scope="col" className="px-3 py-2 text-left font-medium">Etapa</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Situação</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Origem</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Candidatou-se</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Parado há</th>
            </tr>
          </thead>
          <tbody>
            {fatia.map((c) => (
              <tr key={c.chave} className="border-b border-borda last:border-0 hover:bg-surface-2">
                <td className="px-3 py-2">
                  <div className="font-medium">{c.candidato_nome ?? '—'}</div>
                  {c.candidato_email && (
                    <div className="text-xs text-ink-muted">{c.candidato_email}</div>
                  )}
                </td>
                {mostrarVaga && (
                  <td className="px-3 py-2 text-ink-2">
                    <Link
                      href={`/vagas/${encodeURIComponent(c.vaga_codigo)}`}
                      className="hover:underline"
                    >
                      {c.vaga_nome}
                    </Link>
                  </td>
                )}
                <td className="px-3 py-2 text-ink-2">{c.etapa}</td>
                <td className="px-3 py-2">
                  <span className={c.encerrado ? 'text-ink-muted' : 'text-ink-2'}>
                    {c.status ?? '—'}
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-2">{c.origem ?? '—'}</td>
                <td className="num px-3 py-2 text-ink-2">
                  {c.aplicou_em ? dataLonga(c.aplicou_em) : '—'}
                </td>
                <td className="num px-3 py-2">
                  <TempoParado dias={c.diasNaEtapa} fonte={c.origemDoTempo} />
                </td>
              </tr>
            ))}
            {fatia.length === 0 && (
              <tr>
                <td
                  colSpan={mostrarVaga ? 7 : 6}
                  className="px-3 py-8 text-center text-ink-muted"
                >
                  Nenhum candidato nesta seleção.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {candidatos.some((c) => c.origemDoTempo === 'gupy') && (
        <p className="border-t border-borda px-5 py-3 text-xs text-ink-muted">
          <span aria-hidden="true">*</span> Tempo aproximado, calculado pela última alteração
          da candidatura na Gupy. A partir do segundo dia de sync o dash passa a contar pelo
          próprio histórico, que é exato.
        </p>
      )}

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-3 border-t border-borda px-5 py-3 text-sm">
          <span className="num text-ink-muted">
            {numero(paginaAtual * POR_PAGINA + 1)}–
            {numero(Math.min((paginaAtual + 1) * POR_PAGINA, visiveis.length))} de{' '}
            {numero(visiveis.length)}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={paginaAtual === 0}
              onClick={() => setPagina(paginaAtual - 1)}
              className="rounded-lg border border-borda px-3 py-1.5 text-ink-2 disabled:opacity-40 hover:text-ink"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={paginaAtual >= totalPaginas - 1}
              onClick={() => setPagina(paginaAtual + 1)}
              className="rounded-lg border border-borda px-3 py-1.5 text-ink-2 disabled:opacity-40 hover:text-ink"
            >
              Próxima
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
