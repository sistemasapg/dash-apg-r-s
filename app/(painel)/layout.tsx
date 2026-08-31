import { Logo } from '@/components/Logo';
import { Navegacao } from '@/components/Navegacao';
import { BotaoSair } from '@/components/BotaoSair';

/** A moldura do painel: cabeçalho, navegação e rodapé. Só para quem já entrou. */
export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Fio da marca: azul do logo com o corte laranja, sem virar enfeite. */}
      <div aria-hidden="true" className="relative z-10 flex h-1">
        <span className="flex-1 bg-[var(--marca-azul)]" />
        <span className="w-24 bg-[var(--marca-laranja)]" />
      </div>

      <header className="relative z-10 border-b border-borda bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-4 px-6 py-4">
          <a
            href="/"
            className="shrink-0 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--marca-azul)]"
            aria-label="APG — visão geral"
          >
            <Logo />
          </a>

          <span aria-hidden="true" className="hidden h-8 w-px bg-borda sm:block" />

          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs uppercase tracking-[0.12em] text-ink-muted">
              Recrutamento e Seleção
            </span>
            <span className="text-sm font-medium">Acompanhamento diário de candidatos</span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <Navegacao />
            <span aria-hidden="true" className="hidden h-6 w-px bg-borda sm:block" />
            <BotaoSair />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 py-8">{children}</main>

      <footer className="relative z-10 border-t border-borda bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-ink-muted">
          <span>APG · Gupy sincronizada uma vez por dia · vagas de R&amp;S lançadas a partir do Pipefy</span>
          <a
            href="/entenda"
            className="underline decoration-borda underline-offset-2 hover:text-ink"
          >
            Como este painel funciona
          </a>
        </div>
      </footer>
    </>
  );
}
