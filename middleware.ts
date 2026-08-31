import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_SESSAO, sessaoValida } from '@/lib/sessao';

/**
 * Trava de acesso ao dash.
 *
 * O painel mostra nome, e-mail e etapa de candidatos reais. Publicado numa URL
 * da internet sem trava, qualquer pessoa com o link veria isso — é vazamento de
 * dado pessoal, não descuido de configuração. Então: sem usuário e senha
 * definidos, o dash não sobe em produção.
 *
 * Quem não tem sessão válida vai para `/entrar`, e volta para a página que
 * tentou abrir depois de entrar.
 *
 * Configuração (variáveis de ambiente):
 *   DASH_USUARIO, DASH_SENHA  -> credencial de acesso
 *   DASH_SEGREDO              -> assina o cookie de sessão
 *   CRON_SECRET               -> deixa o cron do Vercel chamar /api/sync
 */
export async function middleware(requisicao: NextRequest) {
  const usuario = process.env.DASH_USUARIO;
  const senha = process.env.DASH_SENHA;
  const caminho = requisicao.nextUrl.pathname;

  // Em desenvolvimento, sem credencial configurada, libera: exigir login no
  // localhost só atrasaria quem está mexendo no código.
  if (!usuario || !senha) {
    if (process.env.NODE_ENV === 'production') {
      return new NextResponse(
        'Dash bloqueado: defina DASH_USUARIO e DASH_SENHA nas variáveis de ambiente ' +
          'antes de expor dados de candidatos na internet.',
        { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      );
    }
    return NextResponse.next();
  }

  // O cron do Vercel não sabe fazer login; ele se identifica pelo segredo.
  const segredoCron = process.env.CRON_SECRET;
  const autorizacao = requisicao.headers.get('authorization') ?? '';
  if (caminho === '/api/sync' && segredoCron && autorizacao === `Bearer ${segredoCron}`) {
    return NextResponse.next();
  }

  const autenticado = await sessaoValida(requisicao.cookies.get(COOKIE_SESSAO)?.value);

  if (caminho === '/entrar') {
    // Já entrou e voltou para a tela de login: manda para o painel, em vez de
    // pedir a senha de novo de alguém que acabou de digitá-la.
    if (autenticado) return NextResponse.redirect(new URL('/', requisicao.url));
    return NextResponse.next();
  }

  if (autenticado) return NextResponse.next();

  /*
    Rota de API sem sessão devolve 401, não redireciona: um fetch que recebe o
    HTML da tela de login em vez de JSON quebra de um jeito difícil de entender.
  */
  if (caminho.startsWith('/api/')) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const destino = new URL('/entrar', requisicao.url);
  // Guarda para onde a pessoa ia, para o login devolvê-la ao lugar certo.
  const query = requisicao.nextUrl.search;
  if (caminho !== '/') destino.searchParams.set('de', caminho + query);
  return NextResponse.redirect(destino);
}

export const config = {
  // Arquivos estáticos e o logo ficam fora: eles não expõem dado de candidato e
  // barrá-los quebraria a própria tela de login.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|logo.png).*)'],
};
