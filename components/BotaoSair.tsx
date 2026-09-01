import { cookies } from 'next/headers';
import { sair } from '@/app/entrar/acoes';
import { COOKIE_SESSAO, lerSessao } from '@/lib/sessao';

/**
 * Quem está logado, e o botão de sair.
 *
 * O e-mail aparece porque o painel tem mais de uma conta: "Sair" sozinho não
 * diz de qual sessão você está saindo, e num computador compartilhado do R&S
 * isso importa.
 *
 * O sair é um `<form>` e não um link porque encerrar sessão muda estado no
 * servidor: um GET que desloga pode ser disparado por qualquer imagem ou
 * pré-carregamento de link apontando para a URL.
 */
export async function BotaoSair() {
  const usuario = await lerSessao((await cookies()).get(COOKIE_SESSAO)?.value);

  return (
    <div className="flex items-center gap-2">
      {usuario && (
        <span
          className="hidden max-w-[14rem] truncate text-xs text-ink-muted lg:block"
          title={usuario}
        >
          {usuario}
        </span>
      )}
      <form action={sair}>
        <button
          type="submit"
          className="rounded-md px-2.5 py-1.5 text-sm text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)]"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
