import Link from 'next/link';
import type { VagaPipefy } from '@/lib/types';
import { dataLonga, numero } from '@/lib/format';
import { slaDaCategoria } from '@/config/categorias';
import { calcularSla, type SituacaoSla } from '@/lib/uteis';
import { rotuloRegional } from '@/config/unidades';

function corSla(situacao: SituacaoSla): string {
  switch (situacao) {
    case 'atrasada':
    case 'estourado':
      return 'text-[var(--baixa)]';
    case 'vence-hoje':
      return 'text-[var(--atencao)]';
    case 'cumprido':
      return 'text-[var(--alta)]';
    default:
      return '';
  }
}

/** Dias entre duas datas ISO, sem cair na armadilha de fuso. */
function diasEntre(inicioISO: string, fimISO: string): number {
  const [a1, m1, d1] = inicioISO.split('-').map(Number);
  const [a2, m2, d2] = fimISO.split('-').map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

function Campo({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{rotulo}</dt>
      <dd className="mt-0.5 text-sm font-medium">{valor}</dd>
    </div>
  );
}

/**
 * O card do Pipefy que originou esta vaga, quando o R&S já fez o vínculo.
 *
 * A Gupy sabe quantos candidatos a vaga tem; só o Pipefy sabe desde quando ela
 * está aberta e de quem é a demanda. Esta ficha é onde as duas metades se
 * encontram na tela da vaga.
 */
export function FichaPipefy({ vaga, hoje }: { vaga: VagaPipefy; hoje: string }) {
  // Vaga aberta conta até a foto; vaga fechada congela no dia do fechamento.
  const dias = diasEntre(vaga.aberta_em, vaga.fechada_em ?? hoje);
  const aberta = vaga.situacao === 'aberta';

  // Vaga cancelada não é cobrada de prazo: ninguém deixou de cumprir SLA de uma
  // vaga que a própria APG tirou do ar.
  const sla =
    vaga.situacao === 'cancelada'
      ? null
      : calcularSla(
          vaga.aberta_em,
          slaDaCategoria(vaga.categoria),
          aberta ? null : vaga.fechada_em,
          hoje,
        );

  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">A vaga no R&amp;S</h2>
        <Link href="/pipefy" className="text-xs text-ink-2 underline-offset-2 hover:underline">
          ver todas as vagas do R&amp;S
        </Link>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Campo rotulo="Card" valor={<span className="num">{vaga.card_id}</span>} />
        <Campo
          rotulo={aberta ? 'Em aberto há' : 'Levou'}
          valor={
            <span className="num">
              {numero(dias)} dias
              <span className="ml-1 font-normal text-ink-muted">
                (desde {dataLonga(vaga.aberta_em)})
              </span>
            </span>
          }
        />
        {vaga.categoria && (
          <Campo
            rotulo="Categoria"
            valor={
              <span>
                {vaga.categoria}
                {sla && (
                  <span className="ml-1 font-normal text-ink-muted">
                    (SLA {sla.prazo} dias úteis)
                  </span>
                )}
              </span>
            }
          />
        )}
        {vaga.funcao && <Campo rotulo="Função" valor={vaga.funcao} />}
        {sla && (
          <Campo
            rotulo="Prazo"
            valor={
              <span className={`num ${corSla(sla.situacao)}`}>
                {numero(sla.decorridos)} de {numero(sla.prazo)} dias úteis
                <span className="ml-1 font-normal text-ink-muted">
                  {sla.saldo < 0
                    ? `(${numero(-sla.saldo)} de atraso)`
                    : `(vence em ${dataLonga(sla.vencimento)})`}
                </span>
              </span>
            }
          />
        )}
        {vaga.regional && <Campo rotulo="Regional" valor={rotuloRegional(vaga.regional)} />}
        {vaga.unidade && <Campo rotulo="Escola" valor={vaga.unidade} />}
        <Campo
          rotulo="Situação no Pipefy"
          valor={
            aberta
              ? 'Aberta'
              : `${vaga.situacao === 'fechada' ? 'Fechada' : 'Cancelada'}${
                  vaga.fechada_em ? ` em ${dataLonga(vaga.fechada_em)}` : ''
                }`
          }
        />
        <Campo rotulo="Título no Pipefy" valor={vaga.titulo} />
        {vaga.observacao && (
          <div className="sm:col-span-2 lg:col-span-4">
            <dt className="text-xs text-ink-muted">Observação</dt>
            <dd className="mt-0.5 text-sm text-ink-2">{vaga.observacao}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
