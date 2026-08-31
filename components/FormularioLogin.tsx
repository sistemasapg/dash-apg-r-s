'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { entrar, type EstadoLogin } from '@/app/entrar/acoes';

const INICIAL: EstadoLogin = { erro: null };

const ENTRADA =
  'w-full rounded-lg border border-borda bg-surface px-3 py-2.5 text-sm ' +
  'focus:outline-2 focus:outline-offset-1 focus:outline-[var(--marca-azul)]';

function Botao() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-1 w-full rounded-lg bg-[var(--marca-azul)] px-4 py-2.5 text-sm font-medium text-white transition-opacity disabled:opacity-60"
    >
      {pending ? 'Entrando...' : 'Entrar'}
    </button>
  );
}

export function FormularioLogin({ de }: { de: string }) {
  const [estado, acao] = useActionState(entrar, INICIAL);

  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="de" value={de} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="usuario" className="text-xs font-medium text-ink-2">
          Usuário
        </label>
        <input
          id="usuario"
          name="usuario"
          type="email"
          required
          autoComplete="username"
          // O campo recebe o cursor sozinho: quem chega aqui veio para digitar.
          autoFocus
          placeholder="nome@apggov.com.br"
          className={ENTRADA}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="senha" className="text-xs font-medium text-ink-2">
          Senha
        </label>
        <input
          id="senha"
          name="senha"
          type="password"
          required
          autoComplete="current-password"
          className={ENTRADA}
        />
      </div>

      {estado.erro && (
        <p
          role="alert"
          className="rounded-lg bg-[color-mix(in_srgb,var(--baixa)_12%,transparent)] px-3 py-2 text-sm text-[var(--baixa)]"
        >
          {estado.erro}
        </p>
      )}

      <Botao />
    </form>
  );
}
