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

/** Quem foi guardado no cookie. Null se ele não vale mais. */
export async function lerSessao(valor: string | undefined | null): Promise<string | null> {
  if (!valor || !(await sessaoValida(valor))) return null;
  try {
    const corpo = valor.slice(0, valor.lastIndexOf('.'));
    const { u } = JSON.parse(atob(corpo.replace(/-/g, '+').replace(/_/g, '/'))) as { u: string };
    return typeof u === 'string' ? u : null;
  } catch {
    return null;
  }
}

/**
 * As contas que podem entrar.
 *
 * `DASH_USUARIO` / `DASH_SENHA` é a conta principal, e continua sendo o que o
 * middleware checa para decidir se o dash pode subir. `DASH_USUARIOS` acrescenta
 * as outras, uma por linha (ou separadas por vírgula), no formato
 * `email:senha`.
 *
 * Não há banco de usuários de propósito: o painel tem um punhado de pessoas do
 * mesmo time e nenhuma permissão diferente entre elas. Uma tabela traria
 * cadastro, recuperação de senha e tela de administração para resolver um
 * problema que uma variável de ambiente resolve. Se um dia existir perfil
 * diferente por pessoa, aí a tabela passa a valer a pena.
 */
function contas(): { usuario: string; senha: string }[] {
  const lista: { usuario: string; senha: string }[] = [];

  const principal = process.env.DASH_USUARIO?.trim();
  const senhaPrincipal = process.env.DASH_SENHA;
  if (principal && senhaPrincipal) lista.push({ usuario: principal, senha: senhaPrincipal });

  for (const linha of (process.env.DASH_USUARIOS ?? '').split(/[\n,]/)) {
    const bruto = linha.trim();
    if (!bruto) continue;
    // Corta no PRIMEIRO ":": o e-mail nunca tem um, e a senha pode ter.
    const corte = bruto.indexOf(':');
    if (corte <= 0) continue;
    const usuario = bruto.slice(0, corte).trim();
    const senha = bruto.slice(corte + 1);
    if (usuario && senha) lista.push({ usuario, senha });
  }

  return lista;
}

/** Há pelo menos uma conta configurada? É o que decide se o dash pode subir. */
export function temCredenciais(): boolean {
  return contas().length > 0;
}

/**
 * Compara em tempo constante.
 *
 * Comparar strings com `===` vaza, pela duração da comparação, quantos
 * caracteres do começo estão certos. É um ataque improvável num painel interno,
 * mas o custo de evitá-lo são estas seis linhas.
 */
function igual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/**
 * Confere usuário e senha contra todas as contas.
 *
 * Devolve o e-mail canônico (o que está configurado) e não o que foi digitado,
 * para o cookie guardar sempre a mesma grafia — senão a mesma pessoa apareceria
 * de dois jeitos dependendo de como digitou.
 */
export function conferirCredenciais(usuario: string, senha: string): string | null {
  const alvo = usuario.trim().toLowerCase();

  let encontrada: string | null = null;
  // Percorre a lista inteira mesmo depois de achar: parar no primeiro acerto
  // faria o tempo de resposta contar em que posição a conta está.
  for (const conta of contas()) {
    if (igual(alvo, conta.usuario.toLowerCase()) && igual(senha, conta.senha)) {
      encontrada = conta.usuario;
    }
  }
  return encontrada;
}
