import Link from 'next/link';

/**
 * Página não encontrada.
 *
 * Existe porque duas telas saíram da navegação em 21/10/2026 e seguem só por
 * URL — quem tiver um link antigo salvo vai cair aqui, e merece saber para
 * onde ir em vez de ver o 404 cru do Next.
 */
export default function NaoEncontrada() {
  return (
    <div className="grid min-h-dvh place-items-center bg-page p-6">
      <div className="flex max-w-lg flex-col gap-4 rounded-xl border border-borda bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight">Esta página não existe</h1>
        <p className="text-sm text-ink-2">
          O endereço pode ter mudado. O painel foi reorganizado em 21/10/2026: o Dashboard
          agora é o automático, alimentado pelo Pipefy.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/"
            className="rounded-lg border border-[var(--marca-azul)] bg-[color-mix(in_srgb,var(--marca-azul)_10%,transparent)] px-4 py-2 text-sm font-medium"
          >
            Ir para o Dashboard
          </Link>
          <Link
            href="/entenda"
            className="rounded-lg border border-borda px-4 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Entenda o sistema
          </Link>
        </div>
      </div>
    </div>
  );
}
