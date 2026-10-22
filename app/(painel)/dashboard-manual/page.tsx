import Link from 'next/link';
import { listarSnapshots, migrar } from '@/lib/db';
import { resolverComparacao, resumoGeral } from '@/lib/metrics';
import { vagasPipefyComNumeros } from '@/lib/pipefy';
import { lerFiltro, queryDoFiltro, type ParamsBrutos } from '@/lib/consulta';
import { dataLonga, numero } from '@/lib/format';
import { PainelSla } from '@/components/PainelSla';

export const dynamic = 'force-dynamic';

/**
 * A tela de entrada.
 *
 * Ela é o painel de vagas — quantas estão em aberto, por categoria, e há
 * quantos dias úteis contra o prazo. É essa a pergunta que o R&S e a diretoria
 * fazem primeiro; o funil de candidatos, que é o outro lado do dash, mora em
 * "Candidatos" e aparece aqui resumido numa faixa, para a home não fingir que a
 * outra metade não existe.
 */
export default async function Pagina({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const filtro = lerFiltro(await searchParams);
  await migrar();

  const snapshots = await listarSnapshots();
  const comp = await resolverComparacao(filtro.data, filtro.comparar);

  const [vagas, gupy] = await Promise.all([
    vagasPipefyComNumeros(comp),
    // Sem foto ainda, a faixa da Gupy não tem o que somar.
    snapshots.length > 0 ? resumoGeral(comp) : Promise.resolve(null),
  ]);

  const consulta = queryDoFiltro(filtro);
  const temComparacao = Boolean(comp.anterior);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-2">
            As vagas em aberto por categoria e o prazo de cada uma, em dias úteis.
          </p>
        </div>
        {comp.atual && (
          <p className="text-xs text-ink-muted">
            Candidatos da foto de {dataLonga(comp.atual.data_ref)}
          </p>
        )}
      </div>

      {vagas.length === 0 ? (
        <div className="rounded-xl border border-borda bg-surface p-8">
          <h2 className="text-lg font-semibold tracking-tight">Nenhuma vaga lançada ainda</h2>
          <p className="mt-2 text-sm text-ink-2">
            O painel se monta a partir das vagas do R&amp;S: categoria, regional, escola e data
            de abertura. Assim que o time lançar a primeira{' '}
            <Link href="/pipefy" className="underline hover:text-ink">
              na aba Vagas R&amp;S
            </Link>
            , esta tela começa a medir.
          </p>
        </div>
      ) : (
        <PainelSla vagas={vagas} />
      )}

      {/*
        A faixa da Gupy. É uma linha, e não mais quatro cartões: o assunto desta
        tela são as vagas, e repetir o peso visual do topo faria as duas metades
        disputarem a atenção em vez de se complementarem.
      */}
      <section className="rounded-xl border border-borda bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <h2 className="text-sm font-semibold">Candidatos na Gupy</h2>

            {gupy ? (
              <>
                <span className="text-sm">
                  <span className="num text-lg font-semibold">{numero(gupy.totalAtual)}</span>
                  <span className="ml-1.5 text-ink-2">no total</span>
                </span>
                <span className="text-sm">
                  <span className="num text-lg font-semibold">
                    {numero(gupy.novosCandidatos)}
                  </span>
                  <span className="ml-1.5 text-ink-2">
                    {temComparacao ? 'candidaturas novas' : 'novas (precisa de duas fotos)'}
                  </span>
                </span>
                <span className="text-sm">
                  <span className="num text-lg font-semibold">{numero(gupy.avancaram)}</span>
                  <span className="ml-1.5 text-ink-2">avançaram de etapa</span>
                </span>
              </>
            ) : (
              <span className="text-sm text-ink-2">
                Nenhuma foto guardada ainda — rode <code>npm run sync</code>.
              </span>
            )}
          </div>

          <Link
            href={`/candidatos${consulta}`}
            className="shrink-0 text-sm underline decoration-borda underline-offset-2 hover:text-ink"
          >
            ver o funil completo
          </Link>
        </div>
      </section>
    </div>
  );
}
