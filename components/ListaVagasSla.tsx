import Link from 'next/link';
import type { VagaPipefyComNumeros } from '@/lib/types';
import { dataLonga, numero } from '@/lib/format';
import { rotuloRegional } from '@/config/unidades';

/**
 * As vagas do recorte, em ordem de urgência.
 *
 * É a resposta ao clique no gráfico: "12 administrativas" vira "quais são as
 * 12". Por isso ela vive logo abaixo dos gráficos e obedece aos mesmos filtros.
 */
export function ListaVagasSla({
  vagas,
  titulo,
}: {
  vagas: VagaPipefyComNumeros[];
  titulo: string;
}) {
  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-borda p-5">
        <h2 className="text-sm font-semibold">
          {titulo}
          <span className="ml-2 font-normal text-ink-muted">{numero(vagas.length)}</span>
        </h2>
        <span className="text-xs text-ink-muted">mais urgente primeiro</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="text-ink-2">
            <tr className="border-b border-borda">
              <th scope="col" className="px-4 py-2 text-left font-medium">Vaga</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Categoria</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Regional / escola</th>
              <th scope="col" className="px-4 py-2 text-left font-medium">Aberta em</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Dias úteis</th>
              <th scope="col" className="px-4 py-2 text-right font-medium">Candidatos</th>
            </tr>
          </thead>
          <tbody>
            {vagas.map((v) => {
              const sla = v.sla;
              const cor =
                !sla
                  ? 'text-ink-muted'
                  : sla.saldo < 0
                    ? 'text-[var(--baixa)]'
                    : sla.saldo === 0
                      ? 'text-[var(--atencao)]'
                      : 'text-ink';

              return (
                <tr key={v.card_id} className="border-b border-borda last:border-0 hover:bg-surface-2">
                  <td className="px-4 py-2.5">
                    <div className="font-medium">{v.titulo}</div>
                    <div className="num text-xs text-ink-muted">card {v.card_id}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    {v.categoria ? (
                      <>
                        <div>{v.categoria.replace(/^Vagas /, '')}</div>
                        {v.funcao && <div className="text-ink-muted">{v.funcao}</div>}
                      </>
                    ) : (
                      <span className="text-[var(--atencao)]">sem categoria</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs">
                    <div>{rotuloRegional(v.regional) || <span className="text-ink-muted">—</span>}</div>
                    {v.unidade && <div className="text-ink-muted">{v.unidade}</div>}
                  </td>
                  <td className="num px-4 py-2.5 text-xs whitespace-nowrap">
                    {dataLonga(v.aberta_em)}
                    <div className="text-ink-muted">{numero(v.dias)} dias corridos</div>
                  </td>
                  <td className={`num px-4 py-2.5 text-right whitespace-nowrap ${cor}`}>
                    {sla ? (
                      <>
                        <span className="font-medium">
                          {numero(sla.decorridos)} / {numero(sla.prazo)}
                        </span>
                        <div className="text-xs">
                          {sla.saldo < 0
                            ? `${numero(-sla.saldo)} de atraso`
                            : sla.saldo === 0
                              ? 'vence hoje'
                              : `faltam ${numero(sla.saldo)}`}
                        </div>
                      </>
                    ) : (
                      <span className="text-xs">sem prazo</span>
                    )}
                  </td>
                  <td className="num px-4 py-2.5 text-right whitespace-nowrap">
                    {v.vaga_codigo ? (
                      <Link
                        href={`/vagas/${encodeURIComponent(v.vaga_codigo)}`}
                        className="hover:underline"
                      >
                        {numero(v.candidatos ?? 0)}
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--atencao)]">sem vínculo</span>
                    )}
                  </td>
                </tr>
              );
            })}

            {vagas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-muted">
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
