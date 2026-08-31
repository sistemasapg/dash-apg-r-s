import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { FormularioLogin } from '@/components/FormularioLogin';
import type { ParamsBrutos } from '@/lib/consulta';

export const metadata: Metadata = { title: 'Entrar — Dash R&S APG' };
export const dynamic = 'force-dynamic';

export default async function Pagina({ searchParams }: { searchParams: Promise<ParamsBrutos> }) {
  const params = await searchParams;
  const de = Array.isArray(params.de) ? params.de[0] : params.de;

  return (
    <div className="flex flex-1 flex-col">
      {/* O mesmo fio da marca do painel, para a tela de login não parecer outro sistema. */}
      <div aria-hidden="true" className="flex h-1">
        <span className="flex-1 bg-[var(--marca-azul)]" />
        <span className="w-24 bg-[var(--marca-laranja)]" />
      </div>

      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center gap-3 text-center">
            <Logo />
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Dash R&amp;S</h1>
              <p className="mt-0.5 text-sm text-ink-2">
                Acompanhamento de candidatos e vagas
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-borda bg-surface p-6">
            <FormularioLogin de={de ?? '/'} />
          </div>

          <p className="mt-6 text-center text-xs text-ink-muted">
            O painel mostra nome e e-mail de candidatos reais. O acesso é restrito ao
            time de Recrutamento e Seleção.
          </p>
        </div>
      </main>
    </div>
  );
}
