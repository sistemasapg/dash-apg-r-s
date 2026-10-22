'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * A navegação, agrupada pela ORIGEM do dado.
 *
 * As telas respondem perguntas diferentes porque bebem de fontes diferentes, e
 * misturá-las na barra escondia isso: "Funil Gupy" aparecia entre duas telas do
 * Pipefy, e quem comparava números entre elas não tinha como saber que estava
 * comparando mundos distintos. O rótulo do grupo resolve isso de graça — ele é
 * a resposta antecipada para "de onde vem esse número?".
 *
 * A ordem é Pipefy, Gupy e por fim o manual, porque é essa a ordem do processo:
 * a vaga nasce no Pipefy, a divulgação acontece na Gupy, e a explicação de como
 * tudo se liga fica no fim, onde quem precisa sabe procurar.
 */
const GRUPOS = [
  {
    titulo: 'Pipefy',
    /*
      Tudo aqui vem do relatório do Pipefy, que se reescreve todo dia de manhã.

      Duas telas saíram deste grupo em 21/10/2026, e seguem acessíveis por URL:
      o dashboard antigo, em `/dashboard-manual`, que lia o cadastro digitado à
      mão — 31 vagas contra 2.282, e envelhecendo; e "Vagas R&S", em `/pipefy`,
      que era esse cadastro. Esta última é a única tela que amarra um card a uma
      publicação da Gupy, então os 29 vínculos existentes continuam valendo, mas
      nenhum novo é criado.
    */
    itens: [
      { href: '/', rotulo: 'Dashboard' },
      { href: '/simulacao', rotulo: 'Pendências' },
      { href: '/jornada', rotulo: 'Tempo por time' },
      { href: '/sla-funcao', rotulo: 'SLA por função' },
      { href: '/prazos', rotulo: 'Prazos' },
    ],
  },
  {
    titulo: 'Gupy',
    /* Vêm das fotos diárias da API da Gupy, guardadas no banco. */
    itens: [
      { href: '/candidatos', rotulo: 'Funil' },
      { href: '/movimentacoes', rotulo: 'Movimentações' },
    ],
  },
  {
    titulo: null,
    itens: [{ href: '/entenda', rotulo: 'Entenda o sistema' }],
  },
];

function ehAtivo(href: string, pathname: string): boolean {
  /*
    "/" só está ativo na própria home. A página de uma vaga (/vagas/...) marca
    "Funil", porque é de lá que se chega nela e é o funil dela que ela detalha.
  */
  if (href === '/') return pathname === '/';
  if (href === '/candidatos') {
    return pathname.startsWith('/candidatos') || pathname.startsWith('/vagas');
  }
  return pathname.startsWith(href);
}

export function Navegacao() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {GRUPOS.map((grupo, i) => (
        <div key={grupo.titulo ?? 'solto'} className="flex items-center gap-x-1">
          {/*
            O traço separa os grupos mesmo quando o rótulo não cabe — em tela
            estreita a barra continua legível como três blocos, só que sem
            nome. É a parte que não pode sumir.
          */}
          {i > 0 && <span aria-hidden="true" className="mr-3 h-5 w-px bg-borda" />}

          {grupo.titulo && (
            <span className="mr-1 hidden text-[0.65rem] font-semibold tracking-wider text-ink-muted uppercase lg:inline">
              {grupo.titulo}
            </span>
          )}

          {grupo.itens.map((item) => {
            const ativo = ehAtivo(item.href, pathname);
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
        </div>
      ))}
    </nav>
  );
}
