import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dash R&S — APG',
  description:
    'Acompanhamento diário dos candidatos por vaga e etapa (Gupy) e das vagas abertas no Pipefy',
};

/**
 * Só o esqueleto da página.
 *
 * O cabeçalho, a navegação e o rodapé moram em `app/(painel)/layout.tsx`,
 * porque a tela de login não deve mostrá-los: um menu do painel visível para
 * quem ainda não entrou promete o que ainda não existe, e o botão "Sair" ao
 * lado do campo de senha não faz sentido nenhum.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col antialiased">{children}</body>
    </html>
  );
}
