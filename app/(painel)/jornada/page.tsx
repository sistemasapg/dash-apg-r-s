import { lerJornadas, somarPorTime } from '@/lib/jornada';
import { dataHora, numero } from '@/lib/format';
import { JornadaVagas } from '@/components/JornadaVagas';

export const dynamic = 'force-dynamic';

/**
 * Tempo por time: quanto de cada vaga aberta foi do R&S e quanto foi do DP.
 *
 * A tela de pendências responde "com quem está a bola agora". Esta responde
 * "por onde a bola passou" — e é uma pergunta diferente, porque no instante em
 * que a vaga troca de mão o tempo do time anterior desaparece da primeira. Um
 * card que o R&S resolveu em 28 dias e passou ao DP ontem aparece lá como "DP,
 * 1 dia útil".
 *
 * Lê o relatório a cada carregamento e não grava nada.
 */
export default async function Pagina() {
  let dados;
  let erro: string | null = null;

  try {
    dados = await lerJornadas();
  } catch (e) {
    erro = (e as Error).message;
  }

  if (erro || !dados) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-borda bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight">Não deu para ler a planilha</h1>
        <p className="mt-3 text-sm text-[var(--baixa)]">{erro}</p>
        <p className="mt-4 text-sm text-ink-2">
          Esta tela lê a guia <code>pipefy_relatorio</code> da planilha{' '}
          <strong>R&amp;S _ BASE</strong>, que recebe o relatório do Pipefy. Ela precisa continuar
          compartilhada como &quot;qualquer pessoa com o link pode ver&quot;.
        </p>
      </div>
    );
  }

  const { jornadas, totalNoPipe, fasesSemDono, lidoEm } = dados;
  const porTime = somarPorTime(jornadas);

  const semDono = fasesSemDono.reduce((s, f) => s + f.diasUteis, 0);
  const total = porTime.reduce((s, t) => s + t.diasUteis, 0);
  const fatiaSemDono = total === 0 ? 0 : Math.round((semDono / total) * 100);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tempo por time</h1>
        <p className="mt-1 text-sm text-ink-2">
          Quanto de cada vaga aberta foi do R&amp;S e quanto foi do DP. A tela de pendências mostra
          quem está com a bola agora; aqui aparece todo o caminho — inclusive o tempo de quem já
          passou a bola adiante.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {numero(jornadas.length)} vagas abertas · {numero(totalNoPipe)} cards no relatório · lido
          em {dataHora(lidoEm)}
        </p>
      </div>

      {/*
        O aviso tem precedência sobre os números: enquanto a maior parte do tempo
        estiver em fases sem dono, a divisão R&S/DP logo abaixo é uma leitura de
        uma fatia pequena, e dizer isso antes evita que ela seja lida como o
        todo.
      */}
      {fasesSemDono.length > 0 && (
        <div className="rounded-xl border border-[var(--atencao)] bg-[color-mix(in_srgb,var(--atencao)_8%,transparent)] p-4 text-sm">
          <strong>
            {fatiaSemDono}% do tempo está em fases sem dono definido ({numero(semDono)} dias úteis).
          </strong>{' '}
          Esse tempo não é cobrado de ninguém e aparece em cinza nas barras. Enquanto for assim, a
          divisão entre R&amp;S e DP cobre só o resto.
          <ul className="num mt-2 flex flex-col gap-0.5 text-ink-2">
            {fasesSemDono.map((f) => (
              <li key={f.fase}>
                <strong>{numero(f.diasUteis)}</strong> {f.diasUteis === 1 ? 'dia útil' : 'dias úteis'}{' '}
                em {numero(f.cards)} {f.cards === 1 ? 'vaga' : 'vagas'} · {f.fase}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-ink-2">
            Basta dizer de quem é cada uma e elas entram na conta —{' '}
            <code>config/etapas-pipefy.ts</code>.
          </p>
        </div>
      )}

      <JornadaVagas jornadas={jornadas} porTime={porTime} />

      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <p>
          Esta tela é um ensaio e <strong>não grava nada</strong>. Conta em dias úteis, descontando
          fins de semana e feriados nacionais, a partir das datas de entrada e saída de cada fase —
          e não da coluna de tempo do relatório, que não sobrevive à ida para o Google Sheets.
        </p>
        <p>
          <strong>Total de time</strong> soma só as fases com dono: a aprovação do diretor regional
          e as fases finais ficam fora, porque não são trabalho de R&amp;S nem de DP.{' '}
          <strong>Corridos no pipe</strong> é o tempo desde a criação do card, que inclui tudo.
        </p>
      </div>
    </div>
  );
}
