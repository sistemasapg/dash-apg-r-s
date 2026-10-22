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
          O dash bebe de <strong>duas fontes que não se misturam</strong>: o Pipefy, que sabe de
          vagas, fases e prazos, e a Gupy, que sabe de candidatos. As telas lá em cima estão
          agrupadas por isso, e esta página segue a mesma ordem.
        </p>
      </header>

      <h2 className="mt-4 border-b border-borda pb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        Do Pipefy — as vagas e os prazos
      </h2>

      <Secao titulo="As vagas, no Pipefy">
        <p className="text-sm text-ink-2">
          Toda vaga nasce como um <strong>card</strong> no pipe de R&amp;S e caminha por fases
          até a admissão. O dash não pergunta nada ao Pipefy ao vivo: um robô exporta o
          relatório do pipe inteiro toda manhã para uma planilha, e as telas leem de lá. São{' '}
          <strong>2.282 cards</strong>, desde março de 2025.
        </p>
        <p className="text-sm text-ink-2">
          Cada fase tem um <strong>time responsável</strong>. O R&amp;S responde da triagem até
          juntar a documentação; o DP, do exame admissional ao cadastro. A aprovação do diretor
          regional não é cobrada de nenhum dos dois, e as fases de repouso — concluído,
          cancelada, arquivada, aberta aguardando seleção — não são cobradas de ninguém.
        </p>
        <p className="text-sm text-ink-2">
          É esse mapa que sustenta três telas:{' '}
          <Link href="/simulacao" className="underline hover:text-ink">
            Pendências
          </Link>{' '}
          mostra com quem está a bola agora,{' '}
          <Link href="/jornada" className="underline hover:text-ink">
            Tempo por time
          </Link>{' '}
          abre cada vaga em quanto foi do R&amp;S e quanto foi do DP, e{' '}
          <Link href="/sla-funcao" className="underline hover:text-ink">
            SLA por função
          </Link>{' '}
          compara cargo a cargo. Os donos de cada fase vivem em{' '}
          <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
            config/etapas-pipefy.ts
          </code>
          .
        </p>
        <p className="text-sm text-[var(--atencao)]">
          <strong>O que ainda falta combinar:</strong> das 14 fases com responsável, só uma tem
          prazo acordado — &quot;Aguardando envio da documentação&quot;, em 2 dias úteis. As
          outras aparecem com o tempo medido, mas sem cobrança, porque inventar um prazo seria
          acusar atraso contra uma régua que ninguém decidiu.
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
          A contagem é <strong>D+1</strong>: o dia da criação do card não conta, o relógio
          começa no próximo dia útil. Sábados, domingos e feriados nacionais ficam de fora,
          Carnaval e Corpus Christi incluídos.
        </p>
        <p className="text-sm text-ink-2">
          A vaga conta como <strong>aberta</strong> até chegar a{' '}
          <em>Processo Seletivo Concluído</em> — tudo o que não for isso, nem arquivada, nem
          cancelada, nem parada aguardando seleção, está em aberto. As fases de admissão
          entram: a vaga só termina quando o processo termina, não quando o candidato é
          escolhido.
        </p>
        <p className="text-sm text-ink-2">
          <strong>Cada time é medido pela sua régua, e só pelo tempo que foi dele.</strong> O
          R&amp;S responde pelo prazo da categoria sobre o tempo que segurou a vaga; o DP, por
          2 dias úteis sobre o tempo da admissão. Antes havia um número só, somando os dois — e
          ele não apontava para ninguém: uma vaga com 4 dias de R&amp;S e 13 de DP aparecia como
          &quot;13 de 15, no prazo&quot;.
        </p>
        <p className="text-sm text-ink-2">
          Medido desde 01/09/2026: o R&amp;S leva <strong>3 dias úteis</strong> na mediana e
          cumpre o prazo em <strong>92%</strong> das vagas; o DP leva <strong>7</strong> contra
          um ideal de 2, e fica em <strong>18%</strong>. O prazo do DP é apertado de propósito —
          ele mostra uma distância que o time quer fechar, não uma meta já atingida.
        </p>
      </Secao>

      <h2 className="mt-4 border-b border-borda pb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        Da Gupy — os candidatos
      </h2>

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

      <h2 className="mt-4 border-b border-borda pb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase">
        Como as duas se encontram
      </h2>

      <Secao titulo="A ponte com a Gupy">
        <p className="text-sm text-ink-2">
          As duas fontes vivem <strong>separadas</strong>. O Pipefy sabe de vagas e prazos; a
          Gupy, de candidatos. O relatório do Pipefy não tem nenhum campo que aponte para uma
          publicação da Gupy — e o contrário também não.
        </p>
        <p className="text-sm text-ink-2">
          Houve um cadastro manual que amarrava os dois, e ele deixou 29 vínculos feitos: nas
          vagas da Gupy que os têm, a página da vaga ainda mostra de qual card ela veio. Esse
          cadastro saiu da navegação em 21/10/2026, quando a entrada automática passou a cobrir
          as vagas sozinha. Vínculos novos não estão sendo criados.
        </p>
        <p className="text-sm text-ink-2">
          Ligar os dois de novo, se um dia fizer falta, é mudança <em>no Pipefy</em>: um campo
          &quot;código da vaga na Gupy&quot; no formulário faria o vínculo chegar pelo relatório,
          sem ninguém digitar nada aqui.
        </p>
      </Secao>

      <Secao titulo="De onde vêm os dados">
        <p className="text-sm text-ink-2">
          São <strong>duas fontes independentes</strong>, e a navegação lá em cima está agrupada
          por elas. Nenhum número de um lado é calculado com dado do outro.
        </p>
        <p className="text-sm text-ink-2">
          <strong>Do Pipefy</strong>, pelo relatório do pipe. Um robô na nuvem pede o export
          todo dia de manhã, converte e grava numa planilha; as telas leem a planilha. São duas
          chamadas de API por dia — o arquivo vem inteiro de uma vez, então o custo não cresce
          com o tamanho do pipe. Se o robô falhar, o dash mostra a última carga e diz a hora
          dela.
        </p>
        <p className="text-sm text-ink-2">
          <strong>Da Gupy</strong>, direto da API, sem planilha no meio. Um programa roda todo
          dia, pergunta as vagas e os candidatos, e grava uma <strong>foto</strong> daquele
          momento no banco.
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
