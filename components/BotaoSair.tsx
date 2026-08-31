import { sair } from '@/app/entrar/acoes';

/**
 * Sair do painel.
 *
 * É um `<form>` e não um link porque encerrar sessão muda estado no servidor:
 * um GET que desloga pode ser disparado por qualquer imagem ou pré-carregamento
 * de link apontando para a URL.
 */
export function BotaoSair() {
  return (
    <form action={sair}>
      <button
        type="submit"
        className="rounded-md px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)]"
      >
        Sair
      </button>
    </form>
  );
}
