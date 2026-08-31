import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listarSnapshots } from '@/lib/db';
import {
  detalheVaga,
  funilPorEtapa,
  listarCandidatos,
  movimentacoes,
  nomeDaVaga,
  resolverComparacao,
  resumoGeral,
  serieHistorica,
  temDetalhe,
} from '@/lib/metrics';
import { lerFiltro, queryDoFiltro, type ParamsBrutos } from '@/lib/consulta';
import { dataLonga } from '@/lib/format';
import { StatTile } from '@/components/StatTile';
import { SeletorPeriodo } from '@/components/SeletorPeriodo';
import { Funil } from '@/components/Funil';
import { SerieHistorica } from '@/components/SerieHistorica';
import { ListaMovimentacoes } from '@/components/ListaMovimentacoes';
import { ListaCandidatos } from '@/components/ListaCandidatos';
import { FichaVaga } from '@/components/FichaVaga';
import { FichaPipefy } from '@/components/FichaPipefy';
import { vagaPipefyPorCodigoGupy } from '@/lib/pipefy';

export const dynamic = 'force-dynamic';

export default async function Pagina({
  params,
  searchParams,
}: {
  params: Promise<{ codigo: string }>;
  searchParams: Promise<ParamsBrutos>;
}) {
  const { codigo } = await params;
  const vagaCodigo = decodeURIComponent(codigo);
  const filtro = lerFiltro(await searchParams);

  const snapshots = await listarSnapshots();
  if (snapshots.length === 0) notFound();

  const comp = await resolverComparacao(filtro.data, filtro.comparar);
  const temComparacao = Boolean(comp.anterior);
  const opcoes = { apenasAtivos: filtro.apenasAtivos, vagas: [vagaCodigo] };

  const [resumo, funil, serie, nome, ficha, cardPipefy, detalheAtual, detalheAnterior] =
    await Promise.all([
      resumoGeral(comp, opcoes),
      funilPorEtapa(comp, opcoes),
      serieHistorica(opcoes),
      nomeDaVaga(comp, vagaCodigo),
      detalheVaga(comp, vagaCodigo),
      vagaPipefyPorCodigoGupy(vagaCodigo),
      temDetalhe(comp.atual),
      temDetalhe(comp.anterior),
    ]);

  const semDetalhe = !detalheAtual;
  const semDetalheMov = semDetalhe || (!!comp.anterior && !detalheAnterior);

  const [movs, candidatos] = await Promise.all([
    semDetalheMov ? Promise.resolve([]) : movimentacoes(comp, opcoes),
    semDetalhe ? Promise.resolve([]) : listarCandidatos(comp, { ...opcoes, etapa: filtro.etapa }),
  ]);

  const etapasDisponiveis = funil.map((e) => ({ nome: e.etapa, total: e.atual }));

  // O link de volta preserva o filtro do painel, mas não a vaga aberta.
  const consultaGeral = queryDoFiltro(filtro, { vagas: filtro.vagas });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/candidatos${consultaGeral}`} className="text-sm text-ink-2 hover:text-ink">
          ← Voltar para o funil
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
          <p className="mt-1 text-sm text-ink-2">
            {vagaCodigo} · {comp.atual ? dataLonga(comp.atual.data_ref) : '—'}
            {comp.anterior ? ` vs ${dataLonga(comp.anterior.data_ref)}` : ''}
          </p>
        </div>
        <SeletorPeriodo
          snapshots={snapshots}
          atual={comp.atual?.data_ref ?? null}
          anterior={comp.anterior?.data_ref ?? null}
          apenasAtivos={filtro.apenasAtivos}
        />
      </div>

      {ficha && <FichaVaga vaga={ficha} />}

      {/* O tempo do card conta ate a data da FOTO, para casar com o resto da tela. */}
      {cardPipefy && comp.atual && (
        <FichaPipefy vaga={cardPipefy} hoje={comp.atual.data_ref} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          rotulo="Candidatos nesta vaga"
          valor={resumo.totalAtual}
          delta={temComparacao ? resumo.delta : undefined}
          variacao={temComparacao ? resumo.variacao : undefined}
          destaque
        />
        <StatTile
          rotulo="Candidaturas novas"
          valor={resumo.novosCandidatos}
          nota={temComparacao ? 'desde a foto anterior' : 'precisa de duas fotos'}
        />
        <StatTile
          rotulo="Avançaram de etapa"
          valor={resumo.avancaram}
          nota={
            temComparacao ? `${resumo.encerraram} saíram do funil` : 'precisa de duas fotos'
          }
        />
        <StatTile
          rotulo="Já encerrados"
          valor={resumo.encerradosAtual}
          nota="reprovados, desistentes e contratados"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Funil
          dados={funil}
          titulo="Funil desta vaga"
          temComparacao={temComparacao}
          etapaSelecionada={filtro.etapa ?? null}
        />
        <SerieHistorica dados={serie} titulo="Candidatos por dia nesta vaga" />
      </div>

      <ListaCandidatos
        candidatos={candidatos}
        etapas={etapasDisponiveis}
        etapaSelecionada={filtro.etapa ?? null}
        semDetalhe={semDetalhe}
      />

      {temComparacao && (
        <ListaMovimentacoes
          movimentacoes={movs}
          mostrarVaga={false}
          semDetalhe={semDetalheMov}
        />
      )}
    </div>
  );
}
