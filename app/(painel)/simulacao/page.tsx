import { lerPendencias, resumirPorDono } from '@/lib/pendencias';
import { ETAPAS, etapaConta, INICIO_DO_ACOMPANHAMENTO } from '@/config/etapas-pipefy';
import { dataHora, dataLonga, numero } from '@/lib/format';
import { PainelPendencias } from '@/components/PainelPendencias';
import { ProcessosConcluidos } from '@/components/ProcessosConcluidos';

export const dynamic = 'force-dynamic';

/**
 * Pendências por etapa: com quem está a bola, e há quanto tempo.
 *
 * Esta tela não grava nada — lê a guia do relatório do Pipefy a cada
 * carregamento e calcula na hora. É ensaio enquanto os prazos de cada etapa não
 * forem acordados com as áreas; depois, o mesmo cálculo passa a alimentar o
 * cadastro de verdade.
 *
 * Mede diferente do SLA da vaga: lá o relógio corre do pedido até a admissão,
 * somando o trabalho de três áreas num número só. Aqui cada etapa responde pelo
 * seu dono — e é por isso que este número o time reconhece.
 */
export default async function Pagina() {
  let dados;
  let erro: string | null = null;

  try {
    dados = await lerPendencias();
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
          <strong>R&amp;S _ BASE</strong>, que recebe o relatório do Pipefy. Ela precisa
          continuar compartilhada como &quot;qualquer pessoa com o link pode ver&quot;.
        </p>
      </div>
    );
  }

  const { pendencias, totalNoPipe, concluidos, lidoEm } = dados;
  const porDono = resumirPorDono(pendencias);

  // Só etapas cobradas de algum time: concluído, cancelada etc. não têm prazo a acordar.
  const semPrazo = Object.entries(ETAPAS).filter(
    ([nome, e]) => e.slaDiasUteis === null && etapaConta(nome),
  );
  const atrasadas = pendencias.filter((p) => p.saldo !== null && p.saldo < 0).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pendências por etapa</h1>
        <p className="mt-1 text-sm text-ink-2">
          Com quem está a bola agora, e há quantos dias úteis. Cada etapa é cobrada do seu
          dono — o R&amp;S pela seleção, o DP pela admissão.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {numero(pendencias.length)} pendências em {numero(Object.keys(ETAPAS).length)} etapas
          acompanhadas · {numero(totalNoPipe)} vagas criadas desde{' '}
          {dataLonga(INICIO_DO_ACOMPANHAMENTO)} · lido em {dataHora(lidoEm)}
        </p>
      </div>

      {atrasadas > 0 && (
        <div className="rounded-xl border border-[var(--baixa)] bg-[color-mix(in_srgb,var(--baixa)_8%,transparent)] p-4 text-sm">
          <strong>
            {numero(atrasadas)}{' '}
            {atrasadas === 1 ? 'pendência passou' : 'pendências passaram'} do prazo da etapa.
          </strong>{' '}
          São vagas paradas esperando alguém agir — o card leva direto ao Pipefy.
        </div>
      )}

      {/*
        As etapas sem prazo aparecem na lista com o tempo parado, mas sem
        cobrança. Inventar um número seria pior: o painel passaria a acusar
        atraso contra uma régua que ninguém combinou.
      */}
      {semPrazo.length > 0 && (
        <div className="rounded-xl border border-[var(--atencao)] bg-[color-mix(in_srgb,var(--atencao)_8%,transparent)] p-4 text-sm">
          <strong>
            {semPrazo.length === 1 ? 'Uma etapa ainda' : `${semPrazo.length} etapas ainda`} sem
            prazo acordado:
          </strong>{' '}
          {semPrazo.map(([nome, e]) => `${nome} (${e.dono})`).join(' · ')}. Elas aparecem com o
          tempo parado, mas sem cobrança.
          <div className="mt-1 text-ink-2">
            Medido no histórico do pipe: <strong>Análise de P&amp;C</strong> leva 0 dias úteis na
            mediana e 1 em três quartos dos casos; <strong>Prova</strong> leva 5 e 8. É a base para
            escolher o prazo em <code>config/etapas-pipefy.ts</code>.
          </div>
        </div>
      )}

      <PainelPendencias pendencias={pendencias} porDono={porDono} />

      <ProcessosConcluidos resumo={concluidos} />

      <p className="text-xs text-ink-muted">
        Esta tela é um ensaio e <strong>não grava nada</strong>. O tempo é contado em dias úteis,
        descontando fins de semana e feriados nacionais, a partir da entrada na etapa — e não da
        coluna de tempo do relatório, que não sobrevive à ida para o Google Sheets.
      </p>
    </div>
  );
}
