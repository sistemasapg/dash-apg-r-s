import { NextResponse } from 'next/server';
import { coletarSnapshot } from '@/lib/gupy';
import { hoje, migrar, salvarSnapshot, compactar, DIAS_DETALHE } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/*
  O recorte da APG é largo — todas as vagas publicadas menos Joinville — e o
  sync leva minutos, não segundos. Com Fluid Compute uma função do Vercel vai
  até 300s; sem ele, o teto é 60s e ESTA ROTA NÃO CABE.

  Se o sync estourar o tempo aqui, o caminho é rodá-lo fora do Vercel (a tarefa
  agendada do Windows, em `agendar.ps1`), e não apertar o recorte: recortar
  mudaria o número que o dash existe para mostrar.
*/
export const maxDuration = 300;

async function executar(dataRefPedida?: string) {
  const dataRef =
    dataRefPedida && /^\d{4}-\d{2}-\d{2}$/.test(dataRefPedida) ? dataRefPedida : hoje();

  await migrar();
  const resultado = await coletarSnapshot();

  if (resultado.linhas.length === 0 && resultado.erros.length > 0) {
    return NextResponse.json(
      {
        erro:
          'Nenhuma candidatura coletada e algumas vagas falharam. ' +
          'Snapshot não gravado para não estragar a comparação de amanhã.',
        detalhes: resultado.erros.slice(0, 5),
      },
      { status: 502 },
    );
  }

  const { substituiu } = await salvarSnapshot({
    dataRef,
    fonte: 'api',
    linhas: resultado.linhas,
    vagas: resultado.vagas,
  });

  const limpeza = await compactar();

  return NextResponse.json({
    ok: true,
    dataRef,
    gravadas: resultado.linhas.length,
    vagas: resultado.vagasConsultadas,
    ignoradas: resultado.vagasIgnoradas,
    foraDoFiltro: resultado.vagasForaDoFiltro,
    substituiu,
    compactacao:
      limpeza.snapshotsCompactados > 0
        ? { ...limpeza, janelaDias: DIAS_DETALHE }
        : null,
    erros: resultado.erros,
  });
}

/**
 * Disparado pelo cron do Vercel, que só faz GET e manda
 * `Authorization: Bearer <CRON_SECRET>`. O middleware libera essa rota quando o
 * segredo confere, porque o cron não sabe fazer login.
 */
export async function GET(requisicao: Request) {
  const segredo = process.env.CRON_SECRET;
  const autorizacao = requisicao.headers.get('authorization');

  if (segredo && autorizacao !== `Bearer ${segredo}`) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  try {
    return await executar();
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}

/** Botão "atualizar agora" da interface. Quem chega aqui já passou pelo login. */
export async function POST(requisicao: Request) {
  try {
    const corpo = (await requisicao.json().catch(() => ({}))) as { dataRef?: string };
    return await executar(corpo.dataRef);
  } catch (erro) {
    return NextResponse.json({ erro: (erro as Error).message }, { status: 500 });
  }
}
