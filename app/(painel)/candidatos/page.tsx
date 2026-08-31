import Link from 'next/link';
import { listarSnapshots } from '@/lib/db';
import {
  funilPorEtapa,
  listarCandidatos,
  resolverComparacao,
  resumoGeral,
  serieHistorica,
  temDetalhe,
  vagasComparadas,
} from '@/lib/metrics';
import { ListaCandidatos } from '@/components/ListaCandidatos';
import { lerFiltro, queryDoFiltro, type ParamsBrutos } from '@/lib/consulta';
import { dataHora, dataLonga } from '@/lib/format';
import { BotaoAtualizar } from '@/components/BotaoAtualizar';
import { StatTile } from '@/components/StatTile';
import { SeletorPeriodo } from '@/components/SeletorPeriodo';
import { TabelaVagas } from '@/components/TabelaVagas';
import { FiltroVagas } from '@/components/FiltroVagas';
import { Funil } from '@/components/Funil';
import { SerieHistorica } from '@/components/SerieHistorica';

export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const filtro = lerFiltro(await searchParams);
  const snapshots = await listarSnapshots();

  if (snapshots.length === 0) return <SemDados />;

  const comp = await resolverComparacao(filtro.data, filtro.comparar);
  const temComparacao = Boolean(comp.anterior);
  const opcoes = { apenasAtivos: filtro.apenasAtivos, vagas: filtro.vagas };
  const consulta = queryDoFiltro(filtro);

  // Cada consulta é uma ida ao banco remoto; em paralelo elas custam o tempo da
  // mais lenta, e não a soma de todas.
  // A barra lateral lista sempre TODAS as vagas: filtrar a própria lista de
  // filtros deixaria a pessoa presa na seleção que acabou de fazer.
  const [resumo, funil, serie, todasAsVagas, detalheDisponivel] = await Promise.all([
    resumoGeral(comp, opcoes),
    funilPorEtapa(comp, opcoes),
    serieHistorica(opcoes),
    vagasComparadas(comp, { apenasAtivos: filtro.apenasAtivos }),
    temDetalhe(comp.atual),
  ]);

  // `temDetalhe` responde se o detalhe EXISTE; a tela pergunta o contrário.
  const semDetalhe = !detalheDisponivel;

  // A lista só aparece depois que alguém clica numa etapa: sem recorte seriam
  // as quase mil candidaturas de uma vez, o que não ajuda ninguém.
  const candidatos =
    filtro.etapa && !semDetalhe
      ? await listarCandidatos(comp, { ...opcoes, etapa: filtro.etapa })
      : [];
  const etapasDisponiveis = funil.map((e) => ({ nome: e.etapa, total: e.atual }));
  const vagasFiltradas =
    filtro.vagas.length > 0
      ? todasAsVagas.filter((v) => filtro.vagas.includes(v.vaga_codigo))
      : todasAsVagas;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Funil Gupy</h1>
          <p className="mt-1 text-sm text-ink-2">
            {comp.atual ? dataLonga(comp.atual.data_ref) : '—'}
            {comp.anterior
              ? ` comparado com ${dataLonga(comp.anterior.data_ref)}`
              : ' — primeira foto guardada, a comparação começa no próximo sync'}
          </p>
          {comp.atual && (
            <p className="mt-0.5 text-xs text-ink-muted">
              Foto tirada em {dataHora(comp.atual.importado_em)}. O dash mostra este
              instante, não o tempo real da Gupy.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <SeletorPeriodo
            snapshots={snapshots}
            atual={comp.atual?.data_ref ?? null}
            anterior={comp.anterior?.data_ref ?? null}
            apenasAtivos={filtro.apenasAtivos}
          />
          <BotaoAtualizar />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <FiltroVagas
          vagas={todasAsVagas}
          selecionadas={filtro.vagas}
          temComparacao={temComparacao}
        />

        <div className="flex min-w-0 flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              rotulo="Candidatos no total"
              valor={resumo.totalAtual}
              delta={temComparacao ? resumo.delta : undefined}
              variacao={temComparacao ? resumo.variacao : undefined}
              nota={filtro.apenasAtivos ? 'somente candidatos ativos' : 'inclui encerrados'}
              destaque
            />
            <StatTile
              rotulo="Candidaturas novas"
              valor={resumo.novosCandidatos}
              nota={temComparacao ? 'entraram desde a foto anterior' : 'precisa de duas fotos'}
            />
            <StatTile
              rotulo="Avançaram de etapa"
              valor={resumo.avancaram}
              nota={
                temComparacao
                  ? `${resumo.encerraram} saíram do funil no mesmo período`
                  : 'precisa de duas fotos'
              }
            />
            <StatTile
              rotulo="Vagas com candidatos"
              valor={resumo.vagas}
              nota={`${resumo.encerradosAtual} candidatos já encerrados`}
            />
          </div>

          <div className="grid gap-6 2xl:grid-cols-2">
            <Funil
              dados={funil}
              titulo={
                filtro.vagas.length > 0
                  ? `Funil por etapa (${filtro.vagas.length} vaga${filtro.vagas.length > 1 ? 's' : ''})`
                  : 'Funil por etapa (todas as vagas)'
              }
              temComparacao={temComparacao}
              etapaSelecionada={filtro.etapa ?? null}
            />
            <SerieHistorica dados={serie} titulo="Total de candidatos por dia" />
          </div>

          {filtro.etapa && (
            <ListaCandidatos
              candidatos={candidatos}
              etapas={etapasDisponiveis}
              etapaSelecionada={filtro.etapa}
              mostrarVaga
              semDetalhe={semDetalhe}
            />
          )}

          <TabelaVagas
            linhas={vagasFiltradas}
            consulta={consulta}
            temComparacao={temComparacao}
          />

          <p className="text-xs text-ink-muted">
            Clique em uma vaga para ver o funil e a lista de candidatos dela.{' '}
            {temComparacao && (
              <Link href={`/movimentacoes${consulta}`} className="underline hover:text-ink">
                Ver quem se moveu entre as duas fotos
              </Link>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function SemDados() {
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-borda bg-surface p-8">
      <h1 className="text-xl font-semibold tracking-tight">Nenhuma foto guardada ainda</h1>
      <p className="mt-3 text-sm text-ink-2">
        O dash compara fotos diárias dos candidatos. Escolha por onde começar:
      </p>

      <ol className="mt-5 flex flex-col gap-4 text-sm">
        <li>
          <div className="font-medium">1. Puxar da Gupy</div>
          <p className="mt-1 text-ink-2">
            Com o token em <code>.env.local</code>:
          </p>
          <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 text-xs">npm run sync</code>
        </li>
        <li>
          <div className="font-medium">2. Ver funcionando com dados fictícios</div>
          <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 text-xs">npm run demo</code>
        </li>
      </ol>
    </div>
  );
}
