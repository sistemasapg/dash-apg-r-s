'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import type { Prazo } from '@/lib/prazos';
import { guardarPrazo, voltarAoPadrao, type EstadoPrazo } from '@/app/(painel)/prazos/acoes';
import { dataHora } from '@/lib/format';

const VAZIO: EstadoPrazo = { erro: null, salvo: null };

function Botao({ rotulo, ocupado }: { rotulo: string; ocupado: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg border border-[var(--marca-azul)] bg-[color-mix(in_srgb,var(--marca-azul)_10%,transparent)] px-3 py-1.5 text-sm font-medium disabled:opacity-60"
    >
      {pending ? ocupado : rotulo}
    </button>
  );
}

function BotaoRestaurar() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Voltar ao valor que está no código"
      className="rounded-lg px-2 py-1.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-60"
    >
      {pending ? '…' : 'restaurar'}
    </button>
  );
}

/**
 * Uma linha editável de prazo.
 *
 * Cada linha é um formulário próprio, e não um formulário gigante com tudo:
 * assim quem muda o prazo das administrativas não corre o risco de gravar sem
 * querer uma alteração que outra pessoa deixou aberta em outro campo. O preço é
 * um clique por linha, que é o certo para uma tela onde se mexe em um número de
 * cada vez.
 */
export function LinhaDePrazo({
  prazo,
  rotulo,
  detalhe,
}: {
  prazo: Prazo;
  rotulo: string;
  detalhe?: string;
}) {
  const [estado, acao] = useActionState(guardarPrazo, VAZIO);
  const [estadoRestauro, restaurar] = useActionState(voltarAoPadrao, VAZIO);

  const erro = estado.erro ?? estadoRestauro.erro;
  const salvo = Boolean(estado.salvo || estadoRestauro.salvo) && !erro;

  return (
    <div className="flex flex-col gap-2 border-b border-borda px-5 py-4 last:border-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-56 flex-1">
          <div className="font-medium">{rotulo}</div>
          {detalhe && <div className="text-xs text-ink-muted">{detalhe}</div>}
        </div>

        <form action={acao} className="flex items-center gap-2">
          <input type="hidden" name="escopo" value={prazo.escopo} />
          <input type="hidden" name="chave" value={prazo.chave} />

          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input
              type="number"
              name="dias"
              min={0}
              max={365}
              step={1}
              defaultValue={prazo.diasUteis ?? ''}
              placeholder="sem prazo"
              aria-label={`Prazo de ${rotulo} em dias úteis`}
              className="num w-28 rounded-lg border border-borda bg-surface px-2.5 py-1.5 text-sm tabular-nums focus:outline-2 focus:outline-[var(--marca-azul)]"
            />
            dias úteis
          </label>

          <input
            type="text"
            name="observacao"
            defaultValue={prazo.observacao ?? ''}
            placeholder="por quê (opcional)"
            aria-label={`Observação do prazo de ${rotulo}`}
            className="w-48 rounded-lg border border-borda bg-surface px-2.5 py-1.5 text-sm focus:outline-2 focus:outline-[var(--marca-azul)]"
          />

          <Botao rotulo="Salvar" ocupado="Salvando…" />
        </form>

        {!prazo.daSemente && (
          <form action={restaurar}>
            <input type="hidden" name="escopo" value={prazo.escopo} />
            <input type="hidden" name="chave" value={prazo.chave} />
            <BotaoRestaurar />
          </form>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 text-xs">
        {prazo.diasUteis === null && (
          <span className="text-[var(--atencao)]">
            ▲ sem prazo acordado — aparece sem cobrança nas telas
          </span>
        )}
        {prazo.daSemente ? (
          <span className="text-ink-muted">valor que veio do código</span>
        ) : (
          <span className="text-ink-muted">
            alterado em {prazo.atualizadoEm ? dataHora(prazo.atualizadoEm) : '—'}
            {prazo.atualizadoPor ? ` por ${prazo.atualizadoPor}` : ''}
          </span>
        )}
        {salvo && <span className="text-[var(--alta)]">✓ gravado</span>}
        {erro && <span className="text-[var(--baixa)]">{erro}</span>}
      </div>
    </div>
  );
}
