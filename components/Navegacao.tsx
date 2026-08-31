'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITENS = [
  { href: '/', rotulo: 'Dashboard' },
  { href: '/candidatos', rotulo: 'Funil Gupy' },
  { href: '/pipefy', rotulo: 'Vagas R&S' },
  { href: '/movimentacoes', rotulo: 'Movimentações' },
  { href: '/entenda', rotulo: 'Entenda o sistema' },
];

export function Navegacao() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {ITENS.map((item) => {
        /*
          "/" só está ativo na própria home. A página de uma vaga (/vagas/...)
          marca "Candidatos", porque é de lá que se chega nela e é o funil dela
          que a página detalha.
        */
        const ativo =
          item.href === '/'
            ? pathname === '/'
            : item.href === '/candidatos'
              ? pathname.startsWith('/candidatos') || pathname.startsWith('/vagas')
              : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? 'page' : undefined}
            className={`relative rounded-md px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--marca-azul)] ${
              ativo ? 'font-medium text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
            }`}
          >
            {item.rotulo}
            {ativo && (
              <span
                aria-hidden="true"
                className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-[var(--marca-laranja)]"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
