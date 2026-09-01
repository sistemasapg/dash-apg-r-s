'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { conferirCredenciais, COOKIE_SESSAO, criarSessao } from '@/lib/sessao';

export interface EstadoLogin {
  erro: string | null;
}

export async function entrar(_anterior: EstadoLogin, dados: FormData): Promise<EstadoLogin> {
  const usuario = String(dados.get('usuario') ?? '').trim();
  const senha = String(dados.get('senha') ?? '');

  if (!usuario || !senha) return { erro: 'Preencha usuário e senha.' };

  const conta = conferirCredenciais(usuario, senha);
  if (!conta) {
    /*
      Uma mensagem só para os dois casos, de propósito: dizer "usuário não
      existe" contaria a quem está tentando adivinhar que o outro campo é o
      certo, e o painel tem um usuário só.
    */
    return { erro: 'Usuário ou senha incorretos.' };
  }

  const { valor, maxAge } = await criarSessao(conta);
  (await cookies()).set(COOKIE_SESSAO, valor, {
    httpOnly: true,
    sameSite: 'lax',
    // Em desenvolvimento o localhost é http; exigir HTTPS aqui impediria o
    // cookie de ser gravado e o login nunca completaria na máquina de quem
    // está mexendo no código.
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  });

  /*
    O destino vem do middleware, que guardou a página que a pessoa tentou abrir.
    Só caminhos internos são aceitos: um "de" apontando para outro site
    transformaria a tela de login num trampolim de phishing.
  */
  const bruto = String(dados.get('de') ?? '');
  const destino = bruto.startsWith('/') && !bruto.startsWith('//') ? bruto : '/';

  redirect(destino);
}

export async function sair(): Promise<void> {
  (await cookies()).delete(COOKIE_SESSAO);
  redirect('/entrar');
}
