import Link from 'next/link';
import { ORDEM_MANUAL, DESCRICOES } from '@/config/etapas';
import { listarSnapshots } from '@/lib/db';
import { funilPorEtapa, resolverComparacao } from '@/lib/metrics';
import { numero } from '@/lib/format';

export const dynamic = 'force-dynamic';

const SAIDAS = ['Contratado', 'Desistiu', 'Reprovado'];

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function Pagina() {
  const temDados = (await listarSnapshots()).length > 0;

  // Quantas pessoas há hoje em cada etapa, para o texto não ficar abstrato.
  const contagem = new Map<string, number>();
  const ordens = new Map<string, number>();
  if (temDados) {
    const comp = await resolverComparacao();
    for (const linha of await funilPorEtapa(comp)) {
      contagem.set(linha.etapa, linha.atual);
      ordens.set(linha.etapa, linha.ordem);
    }
  }

  /*
    A lista de etapas sai do que a Gupy da APG realmente usa, e não de uma lista
    fixa no código: o funil ainda não foi levantado com o R&S, e uma lista
    escrita a mão ficaria desatualizada no dia em que alguém criasse uma etapa.
    `config/etapas.ts` entra por cima, para a ordem e as descrições confirmadas
    ganharem da adivinhação.
  */
  const nomes = new Set([...ordens.keys(), ...Object.keys(ORDEM_MANUAL)]);
  const etapasAtivas = [...nomes]
    .filter((nome) => !SAIDAS.includes(nome))
    .sort(
      (a, b) =>
        (ORDEM_MANUAL[a] ?? ordens.get(a) ?? 80) - (ORDEM_MANUAL[b] ?? ordens.get(b) ?? 80) ||
        a.localeCompare(b, 'pt-BR'),
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Entenda o sistema</h1>
        <p className="text-sm text-ink-2">
          O que cada etapa do funil significa, o que cada número do painel está medindo e de
          onde os dados vêm.
        </p>
      </header>

      <Secao titulo="As etapas do funil">
        <p className="text-sm text-ink-2">
          O candidato caminha nesta ordem. O número ao lado é quanta gente está em cada etapa
          na foto mais recente.
        </p>

        {etapasAtivas.length === 0 && (
          <p className="rounded-xl border border-borda bg-surface p-4 text-sm text-[var(--atencao)]">
            Ainda não há foto da Gupy, então o dash não sabe quais etapas a APG usa. Depois do
            primeiro <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">npm run sync</code>{' '}
            elas aparecem aqui sozinhas.
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {etapasAtivas.map((etapa, i) => {
            const descricao = DESCRICOES[etapa];
            const total = contagem.get(etapa);

            return (
              <li
                key={etapa}
                className="grid grid-cols-[2rem_minmax(0,1fr)] gap-4 rounded-xl border border-borda bg-surface p-4"
              >
                <span className="num mt-0.5 grid size-8 place-items-center rounded-full border border-borda text-sm font-medium text-ink-2">
                  {i + 1}
                </span>
                <div>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-medium">{etapa}</h3>
                    {total !== undefined && (
                      <span className="num text-sm text-ink-muted">
                        {numero(total)} candidato{total === 1 ? '' : 's'} agora
                      </span>
                    )}
                  </div>
                  {descricao ? (
                    <p className="mt-1 text-sm text-ink-2">{descricao}</p>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--atencao)]">
                      Descrição pendente — ninguém confirmou o que acontece aqui. Preencha em{' '}
                      <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                        config/etapas.ts
                      </code>
                      .
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Secao>

      <Secao titulo="Quem sai do funil">
        <p className="text-sm text-ink-2">
          Na Gupy, quem é reprovado na Prova Online continua marcado em &quot;Prova Online&quot;.
          Contar essas pessoas ali infla a etapa com gente que já saiu, então o dash as agrupa
          em fases próprias, no fim do funil.
        </p>

        <div className="flex flex-col gap-3">
          {SAIDAS.map((fase) => (
            <div key={fase} className="rounded-xl border border-borda bg-surface p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{fase}</h3>
                {contagem.get(fase) !== undefined && (
                  <span className="num text-sm text-ink-muted">
                    {numero(contagem.get(fase) ?? 0)} agora
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-2">{DESCRICOES[fase]}</p>
            </div>
          ))}
        </div>

        <p className="text-sm text-ink-2">
          A etapa original não se perde: na lista de candidatos, a coluna <strong>Etapa</strong>{' '}
          mostra onde a pessoa estava quando saiu. É assim que dá para ver em que ponto do
          processo o funil mais perde gente.
        </p>
      </Secao>

      <Secao titulo="O que cada número mede">
        <dl className="flex flex-col gap-4">
          {[
            {
              termo: 'Candidatos no total',
              texto:
                'Todas as candidaturas das vagas acompanhadas na foto selecionada. Marcar "Só candidatos ativos" tira reprovados, desistentes e contratados da conta.',
            },
            {
              termo: 'Candidaturas novas',
              texto:
                'Pessoas que aparecem na foto de hoje e não existiam na foto de comparação. Precisa de duas fotos para existir.',
            },
            {
              termo: 'Avançaram de etapa',
              texto:
                'Quem estava numa etapa e passou para uma seguinte. Ser reprovado não conta como avanço, mesmo saindo do lugar.',
            },
            {
              termo: 'Variação (↑ +12)',
              texto:
                'A diferença entre a foto atual e a foto de comparação. Quando só existe uma foto, a coluna some em vez de comparar contra zero.',
            },
            {
              termo: 'Parado há',
              texto:
                'Quantos dias o candidato está na mesma etapa. Enquanto não há histórico, o número vem da última alteração registrada na Gupy e aparece com asterisco. A partir do segundo dia de sync, passa a ser contado pelo próprio histórico do dash.',
            },
            {
              termo: 'Movimentações',
              texto:
                'A lista nominal do que aconteceu entre duas fotos: quem entrou, quem avançou, quem voltou e quem saiu do funil.',
            },
          ].map((item) => (
            <div key={item.termo}>
              <dt className="font-medium">{item.termo}</dt>
              <dd className="mt-0.5 text-sm text-ink-2">{item.texto}</dd>
            </div>
          ))}
        </dl>
      </Secao>

      <Secao titulo="As vagas de R&amp;S">
        <p className="text-sm text-ink-2">
          A Gupy conta <strong>candidatos</strong>; ela não sabe desde quando a vaga foi pedida
          nem de qual regional veio a demanda. Isso mora no Pipefy, e é o time de R&amp;S que
          traz para cá: na aba{' '}
          <Link href="/pipefy" className="underline hover:text-ink">
            Vagas R&amp;S
          </Link>{' '}
          cada vaga é lançada com nome, regional, unidade, data de abertura e o ID do card.
        </p>
        <p className="text-sm text-ink-2">
          O campo que amarra as duas metades é a <strong>vaga correspondente na Gupy</strong>.
          Feito o vínculo, o card passa a mostrar quantos candidatos aquela publicação tem, e a
          página da vaga passa a mostrar de onde ela veio. Um card corresponde a uma vaga da
          Gupy, e vice-versa.
        </p>
        <p className="text-sm text-ink-2">
          <strong>Dias em aberto</strong> conta a partir da data de abertura digitada — não da
          criação da vaga na Gupy, que costuma ser posterior. Ao marcar a vaga como fechada, o
          contador congela no dia do fechamento: é o que permite falar em tempo médio de
          preenchimento sem que ele cresça sozinho todo dia.
        </p>
        <p className="text-sm text-ink-2">
          Este cadastro é o único dado do dash digitado por gente. Ele não pertence a nenhuma
          foto e sobrevive a qualquer limpeza de snapshots — apagar o histórico da Gupy não
          apaga o trabalho do time.
        </p>
      </Secao>

      <Secao titulo="O prazo (SLA) de cada vaga">
        <p className="text-sm text-ink-2">
          Cada <strong>categoria</strong> carrega o prazo para fechar a vaga, em{' '}
          <strong>dias úteis</strong>: administrativas <strong>15</strong>, professores{' '}
          <strong>7</strong>, jovem aprendiz e estagiário <strong>10</strong>. É por isso que a
          categoria é obrigatória no lançamento — sem ela o dash não tem prazo a cobrar.
        </p>
        <p className="text-sm text-ink-2">
          A contagem é <strong>D+1</strong>: o dia da abertura não conta, o relógio começa no
          próximo dia útil. Sábados, domingos e feriados nacionais ficam de fora, Carnaval e
          Corpus Christi incluídos. O prazo vale da abertura até a finalização; ao fechar a
          vaga o contador congela naquele dia, e vaga cancelada não é cobrada de prazo nenhum.
        </p>
        <p className="text-sm text-ink-2">
          A aba{' '}
          <Link href="/" className="underline hover:text-ink">
            Dashboard
          </Link>{' '}
          mostra as duas leituras: a <strong>fila de hoje</strong>, com o que venceu ou está
          para vencer, e a <strong>aderência</strong> — o percentual das vagas fechadas que
          cumpriram o prazo, recortável por categoria, regional, unidade ou função.
        </p>
        <p className="text-sm text-[var(--atencao)]">
          A aderência só significa alguma coisa se o time marcar as vagas como fechadas aqui.
          Vaga preenchida na vida real e nunca fechada no dash continua contando prazo e vira
          atraso — um percentual baixo pode ser falta de preenchimento, e não de desempenho.
        </p>
      </Secao>

      <Secao titulo="De onde vêm os dados">
        <p className="text-sm text-ink-2">
          Direto da API da Gupy, sem planilha no meio. Um programa roda todo dia, pergunta as
          vagas e os candidatos, e grava uma <strong>foto</strong> daquele momento no banco.
        </p>
        <p className="text-sm text-ink-2">
          O recorte é o da APG: entram as vagas <strong>publicadas</strong> cujo nome{' '}
          <strong>não contenha &quot;Joinville&quot;</strong> — a praça tem painel próprio, e
          contá-la aqui também duplicaria o número. Vaga em rascunho, congelada ou encerrada
          fica de fora.
        </p>
        <p className="text-sm text-ink-2">
          <strong>O dash não é tempo real.</strong> Ele mostra a última foto tirada, e a data e
          a hora dela aparecem embaixo do título na visão geral. Se alguém se candidatar agora,
          aparece aqui no próximo sync — ou na hora, se você clicar em{' '}
          <strong>Atualizar agora</strong>.
        </p>
        <p className="text-sm text-ink-2">
          Isso é escolha de projeto, não limitação. A Gupy só sabe responder &quot;como está
          agora&quot;: ela não guarda quantos candidatos a vaga tinha na terça passada. É a foto
          diária que constrói esse histórico — e sem ela não existiria nenhuma comparação.
        </p>
      </Secao>

      <p className="border-t border-borda pt-6 text-sm text-ink-muted">
        Falta alguma etapa aqui, ou alguma descrição está errada? Tudo isso vive em{' '}
        <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">config/etapas.ts</code>, num
        arquivo só, sem precisar mexer no resto.{' '}
        <Link href="/" className="underline hover:text-ink">
          Voltar para o painel
        </Link>
        .
      </p>
    </div>
  );
}
