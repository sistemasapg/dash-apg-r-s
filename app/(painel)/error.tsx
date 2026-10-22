'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * A tela de erro do painel.
 *
 * Sem ela, qualquer falha não prevista caía na tela padrão do Next: fundo
 * branco, "Application error: a client-side exception has occurred" e nada
 * mais. Quem usa o dash não tem como saber se o problema é dele, se vai passar
 * sozinho, nem a quem contar.
 *
 * As telas já tratam o caso previsível — a planilha fora do ar. Isto aqui é
 * para o resto: banco indisponível, coluna renomeada no relatório, bug.
 */
export default function Erro({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Vai para os logs do servidor na Vercel, onde dá para investigar depois.
    console.error('Falha no painel:', error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 rounded-xl border border-borda bg-surface p-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Esta tela não carregou</h1>
        <p className="mt-2 text-sm text-ink-2">
          O painel continua no ar — o problema é desta página. Quase sempre é uma fonte de dados
          que não respondeu, e tentar de novo resolve.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--marca-azul)] bg-[color-mix(in_srgb,var(--marca-azul)_10%,transparent)] px-4 py-2 text-sm font-medium hover:bg-[color-mix(in_srgb,var(--marca-azul)_16%,transparent)]"
        >
          Tentar de novo
        </button>
        <Link
          href="/"
          className="rounded-lg border border-borda px-4 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
        >
          Ir para o Dashboard
        </Link>
      </div>

      <div className="border-t border-borda pt-4 text-sm text-ink-2">
        <p className="font-medium text-ink">Se continuar acontecendo</p>
        <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
          <li>
            A planilha <strong>R&amp;S _ BASE</strong> precisa seguir compartilhada como
            &quot;qualquer pessoa com o link pode ver&quot;.
          </li>
          <li>
            Uma coluna renomeada no relatório do Pipefy derruba as telas que a procuram pelo
            nome.
          </li>
          <li>Manda a mensagem abaixo para quem cuida do sistema.</li>
        </ul>
      </div>

      {/*
        A mensagem técnica fica visível, e não escondida num console: quem usa
        não abre o DevTools, mas copia e cola o que está na tela. O `digest` é
        o que liga este erro à linha correspondente no log do servidor.
      */}
      <pre className="overflow-x-auto rounded-lg border border-borda bg-surface-2 p-3 text-xs text-ink-2">
        {error.message || 'Erro sem mensagem.'}
        {error.digest ? `\n\nreferência: ${error.digest}` : ''}
      </pre>
    </div>
  );
}
