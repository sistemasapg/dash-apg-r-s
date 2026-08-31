import type { VagaDetalhe } from '@/lib/types';
import { dataLonga, numero } from '@/lib/format';

const ROTULO_STATUS: Record<string, { texto: string; cor: string }> = {
  published: { texto: 'Publicada', cor: 'text-[var(--alta)]' },
  frozen: { texto: 'Congelada', cor: 'text-[var(--atencao)]' },
  closed: { texto: 'Encerrada', cor: 'text-ink-muted' },
  canceled: { texto: 'Cancelada', cor: 'text-[var(--baixa)]' },
  draft: { texto: 'Rascunho', cor: 'text-ink-muted' },
};

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valor}</dd>
    </div>
  );
}

/** Os dados da vaga em si, e não dos candidatos dela. */
export function FichaVaga({ vaga }: { vaga: VagaDetalhe }) {
  const status = vaga.status ? ROTULO_STATUS[vaga.status.toLowerCase()] : undefined;

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <h2 className="text-sm font-semibold">A vaga</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {status && (
          <Campo
            rotulo="Situação"
            valor={<span className={status.cor}>{status.texto}</span>}
          />
        )}
        {vaga.criada_em && (
          <Campo
            rotulo="Aberta há"
            valor={
              <span className="num">
                {vaga.diasAberta !== null ? `${numero(vaga.diasAberta)} dias` : '—'}
                <span className="ml-1 font-normal text-ink-muted">
                  (desde {dataLonga(vaga.criada_em)})
                </span>
              </span>
            }
          />
        )}
        {vaga.tipo && <Campo rotulo="Tipo" valor={vaga.tipo} />}
        {vaga.unidade && <Campo rotulo="Unidade" valor={vaga.unidade} />}
        {vaga.departamento && <Campo rotulo="Departamento" valor={vaga.departamento} />}
        {vaga.funcao && <Campo rotulo="Cargo" valor={vaga.funcao} />}
      </dl>
    </section>
  );
}
