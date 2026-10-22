import Link from 'next/link';
import { lerDashboardPipefy } from '@/lib/dashboard-pipefy';
import { mapaDeEtapas, prazoDoDp } from '@/lib/prazos';
import { idadeDoRelatorio } from '@/lib/planilha';
import { dataHora, dataLonga, numero } from '@/lib/format';
import { PainelPeriodo } from '@/components/PainelPeriodo';

export const dynamic = 'force-dynamic';

/**
 * O Dashboard: painel de SLA alimentado pelo relatório do Pipefy.
 *
 * Tomou o lugar do dashboard antigo em 21/10/2026. O antigo lia o cadastro que
 * o R&S preenchia à mão — 31 vagas contra as 2.282 daqui — e envelhecia: seis
 * vagas que ele ainda mostrava como abertas tinham encerrado em 15/10. Segue
 * acessível em `/dashboard-manual`, fora da navegação, enquanto o time confere
 * se não perdeu nada.
 *
 * Esta tela não lê nem grava o banco. O cadastro manual segue intacto, e é
 * onde continua morando o vínculo com a Gupy.
 */
export default async function Pagina() {
  let dados;
  let erro: string | null = null;

  try {
    dados = await lerDashboardPipefy();
  } catch (e) {
    erro = (e as Error).message;
  }

  if (erro || !dados) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-borda bg-surface p-8">
        <h1 className="text-xl font-semibold tracking-tight">Não deu para montar o painel</h1>
        <p className="mt-3 text-sm text-[var(--baixa)]">{erro}</p>
        <p className="mt-4 text-sm text-ink-2">
          Esta tela cruza a guia <code>pipefy_relatorio</code> da planilha com os vínculos da Gupy
          que estão no banco. Precisa das duas coisas.
        </p>
      </div>
    );
  }

  const { vagas, desde, totalNoPipe, lidoEm } = dados;
  const idade = await idadeDoRelatorio();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-2">
          O painel de SLA, alimentado <strong>só</strong> pelo relatório
          automático do Pipefy. Cobre todas as vagas do pipe, sem ninguém digitar, e não usa nada
          do cadastro manual.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
{numero(vagas.length)} vagas desde {dataLonga(desde)} · {numero(totalNoPipe)} cards no
          relatório ·{' '}
          {idade.carregadoEm
            ? `carregado do Pipefy em ${dataHora(idade.carregadoEm)}`
            : `lido em ${dataHora(lidoEm)}`}
        </p>
      </div>

      {/*
        O aviso de dado velho vem antes de qualquer número.

        Sem ele a falha do robô é silenciosa: a tela dizia "lido em agora" — a
        hora em que o DASH leu a planilha, que é sempre agora — e continuaria
        dizendo isso servindo dado de semanas atrás. O robô pode parar por
        token, por limite de export do Pipefy (50 por pipe a cada 24h) ou por
        falha de rede, e nenhum desses avisa ninguém. Este aviso avisa.
      */}
      {idade.velho && (
        <div className="rounded-xl border border-[var(--baixa)] bg-[color-mix(in_srgb,var(--baixa)_8%,transparent)] p-4 text-sm">
          <strong>
            Os dados têm {Math.floor((idade.horas ?? 0) / 24)}{' '}
            {Math.floor((idade.horas ?? 0) / 24) === 1 ? 'dia' : 'dias'}.
          </strong>{' '}
          O robô que traz o relatório do Pipefy roda todo dia de manhã, e a última carga foi em{' '}
          {idade.carregadoEm ? dataHora(idade.carregadoEm) : '—'}. Tudo nesta tela reflete aquele
          momento, não o de agora. Vale conferir o acionador no Apps Script.
        </div>
      )}

      {idade.desconhecido && (
        <div className="rounded-xl border border-[var(--atencao)] bg-[color-mix(in_srgb,var(--atencao)_8%,transparent)] p-4 text-sm">
          <strong>Não deu para saber quando os dados foram carregados.</strong> A aba{' '}
          <code>log_relatorio</code> da planilha não respondeu. Os números abaixo podem estar
          atualizados ou não — esta tela não tem como afirmar.
        </div>
      )}

      {/*
        Já houve aqui um aviso listando os cards cadastrados à mão que o
        relatório não traz. Saiu: eram dois, os dois foram investigados e
        nenhum era problema desta tela — um é de outro pipe (Autorização para
        Desligamento) e o outro o token não enxerga. Um alerta permanente para
        duas linhas erradas no cadastro manual pedia atenção toda vez para algo
        que se resolve uma vez só.
      */}

      <PainelPeriodo
        vagas={vagas}
        desde={desde}
        prazosDeEtapa={mapaDeEtapas()}
        prazoDp={prazoDoDp()}
      />

      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <p>
          Esta tela <strong>não lê nem grava o banco</strong>. Tudo o que ela mostra vem do
          relatório do Pipefy, que se reescreve todo dia de manhã.
        </p>
        <p>
          Por isso ela não traz <strong>contagem de candidatos</strong>: ligar um card da Gupy a um
          card do Pipefy é decisão humana — a Gupy publica por cidade, o Pipefy abre por unidade —
          e esse vínculo mora no cadastro manual, em{' '}
          <Link href="/pipefy" className="text-[var(--marca-azul)] underline-offset-2 hover:underline">
            Vagas R&amp;S
          </Link>
          . Conferi: o relatório não tem nenhum campo que aponte para a Gupy, então não é questão
          de buscar noutro lugar.
        </p>
        <p>
          O SLA é o de <code>config/categorias.ts</code>, contado em dias úteis a partir de D+1.
          A vaga conta como aberta até chegar a <em>Processo Seletivo Concluído</em> — ou seja, o
          relógio cobre também a admissão, e não só a seleção.
        </p>
      </div>
    </div>
  );
}
