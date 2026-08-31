/**
 * A sessão do painel: um cookie assinado, sem banco e sem tabela de sessões.
 *
 * O dash tem um usuário só e um time pequeno. Guardar sessão no Postgres
 * significaria uma ida à rede em toda navegação para responder "essa pessoa
 * entrou?" — pergunta que o próprio cookie responde, desde que ninguém consiga
 * forjá-lo. Daí a assinatura HMAC.
 *
 * Este arquivo é importado pelo `middleware.ts`, que roda no runtime Edge: aqui
 * não pode entrar `node:crypto`, nem o driver do banco, nem nada de Node. Só
 * Web Crypto, que existe nos dois lados.
 */

export const COOKIE_SESSAO = 'dash_sessao';

/** Quanto tempo o login dura antes de pedir senha de novo. */
const HORAS = 12;

function segredo(): string {
  /*
    Sem segredo próprio, cai no CRON_SECRET — que já é um texto longo e
    aleatório e existe em toda instalação. É fallback, não recomendação:
    trocar o CRON_SECRET passaria a deslogar todo mundo de brinde.
  */
  const s = process.env.DASH_SEGREDO?.trim() || process.env.CRON_SECRET?.trim();
  if (!s) {
    throw new Error(
      'DASH_SEGREDO não configurado. Gere um texto longo e aleatório — é ele ' +
        'que assina o cookie de sessão.',
    );
  }
  return s;
}

function base64url(bytes: Uint8Array): string {
  let texto = '';
  for (const b of bytes) texto += String.fromCharCode(b);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function assinar(mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign(
    'HMAC',
    chave,
    new TextEncoder().encode(mensagem),
  );
  return base64url(new Uint8Array(assinatura));
}

/** O valor do cookie: quem entrou, até quando vale, e a prova de que é nosso. */
export async function criarSessao(usuario: string): Promise<{ valor: string; maxAge: number }> {
  const expira = Date.now() + HORAS * 3600_000;
  const corpo = base64url(new TextEncoder().encode(JSON.stringify({ u: usuario, exp: expira })));
  return { valor: `${corpo}.${await assinar(corpo)}`, maxAge: HORAS * 3600 };
}

/**
 * Diz se o cookie é nosso e ainda vale.
 *
 * Devolve `false` para qualquer coisa estranha em vez de lançar: um cookie
 * corrompido ou de uma versão antiga do segredo tem de virar "faça login de
 * novo", e não uma tela de erro 500.
 */
export async function sessaoValida(valor: string | undefined | null): Promise<boolean> {
  if (!valor) return false;

  const separador = valor.lastIndexOf('.');
  if (separador <= 0) return false;

  const corpo = valor.slice(0, separador);
  const assinatura = valor.slice(separador + 1);

  try {
    if ((await assinar(corpo)) !== assinatura) return false;

    const json = atob(corpo.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json) as { u: string; exp: number };
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

/**
 * Confere usuário e senha, em tempo constante.
 *
 * Comparar strings com `===` vaza, pela duração da comparação, quantos
 * caracteres do começo estão certos. É um ataque improvável num painel interno,
 * mas o custo de evitá-lo são estas seis linhas.
 */
export function credenciaisConferem(usuario: string, senha: string): boolean {
  const uEsperado = process.env.DASH_USUARIO ?? '';
  const sEsperado = process.env.DASH_SENHA ?? '';
  if (!uEsperado || !sEsperado) return false;

  const igual = (a: string, b: string) => {
    if (a.length !== b.length) return false;
    let diferenca = 0;
    for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diferenca === 0;
  };

  // O usuário é um e-mail: caixa não deve separar duas pessoas que são a mesma.
  return igual(usuario.trim().toLowerCase(), uEsperado.trim().toLowerCase()) && igual(senha, sEsperado);
}
