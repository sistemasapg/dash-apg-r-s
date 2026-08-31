import Link from 'next/link';
import { listarSnapshots } from '@/lib/db';
import { movimentacoes, resolverComparacao, temDetalhe } from '@/lib/metrics';
import { lerFiltro, queryDoFiltro, type ParamsBrutos } from '@/lib/consulta';
import { dataLonga } from '@/lib/format';
import { SeletorPeriodo } from '@/components/SeletorPeriodo';
import { ListaMovimentacoes } from '@/components/ListaMovimentacoes';

export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const filtro = lerFiltro(await searchParams);
  const snapshots = await listarSnapshots();

  if (snapshots.length === 0) {
    return (
      <p className="text-sm text-ink-2">
        Ainda não há fotos guardadas.{' '}
        <Link href="/candidatos" className="underline hover:text-ink">
          Voltar
        </Link>
      </p>
    );
  }

  const comp = await resolverComparacao(filtro.data, filtro.comparar);
  const [detalheAtual, detalheAnterior] = await Promise.all([
    temDetalhe(comp.atual),
    temDetalhe(comp.anterior),
  ]);
  const semDetalhe = !detalheAtual || (!!comp.anterior && !detalheAnterior);
  const movs = semDetalhe
    ? []
    : await movimentacoes(comp, { apenasAtivos: filtro.apenasAtivos, vagas: filtro.vagas });
  const consulta = queryDoFiltro(filtro);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/candidatos${consulta}`} className="text-sm text-ink-2 hover:text-ink">
          ← Voltar para o funil
        </Link>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Movimentações</h1>
          <p className="mt-1 text-sm text-ink-2">
            {comp.anterior
              ? `${dataLonga(comp.anterior.data_ref)} → ${comp.atual ? dataLonga(comp.atual.data_ref) : '—'}`
              : 'Selecione uma foto de comparação para ver o que mudou.'}
          </p>
        </div>
        <SeletorPeriodo
          snapshots={snapshots}
          atual={comp.atual?.data_ref ?? null}
          anterior={comp.anterior?.data_ref ?? null}
          apenasAtivos={filtro.apenasAtivos}
        />
      </div>

      <ListaMovimentacoes movimentacoes={movs} semDetalhe={semDetalhe} />
    </div>
  );
}
