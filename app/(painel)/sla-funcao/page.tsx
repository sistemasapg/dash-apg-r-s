import { lerSlaPorFuncao, totalizar } from '@/lib/sla-funcao';
import { dataHora, dataLonga, numero } from '@/lib/format';
import { PainelSlaFuncao } from '@/components/PainelSlaFuncao';

export const dynamic = 'force-dynamic';

/**
 * SLA por função: quanto cada cargo demora para fechar, contra o prazo dele.
 *
 * O painel de SLA da aba "Vagas R&S" recorta por regional, unidade e categoria.
 * Esta tela troca o eixo para a função, que é onde a média da categoria
 * esconde o problema: "Vagas Administrativas" fecha razoavelmente bem na média,
 * e dentro dela há funções que estouram o prazo com folga.
 *
 * Usa a mesma régua escrita em `config/categorias.ts` — dias úteis de criado a
 * finalizado — e lê do relatório do Pipefy, não do cadastro manual. Não grava
 * nada.
 */
export default async function Pagina() {
  let dados;
  let erro: string | null = null;

  try {
    dados = await lerSlaPorFuncao();
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

  const { resumos, desde, totalNoPipe, lidoEm } = dados;
  const total = totalizar(resumos);

  const semPrazo = resumos.filter((r) => r.sla === null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">SLA por função</h1>
        <p className="mt-1 text-sm text-ink-2">
          Quanto cada cargo demora para fechar, contra o prazo da categoria dele. É onde a média da
          categoria esconde o problema — dentro de uma categoria que vai bem cabe uma função que
          estoura o prazo em todas as vagas.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {numero(total.funcoes)} funções · {numero(total.cards)} vagas abertas desde{' '}
          {dataLonga(desde)} · {numero(totalNoPipe)} cards no relatório · lido em{' '}
          {dataHora(lidoEm)}
        </p>
      </div>

      {/*
        Sem prazo é diferente de fora do prazo, e misturar os dois seria o pior
        dos dois mundos: a função sem régua apareceria como se cumprisse.
      */}
      {semPrazo.length > 0 && (
        <div className="rounded-xl border border-[var(--atencao)] bg-[color-mix(in_srgb,var(--atencao)_8%,transparent)] p-4 text-sm">
          <strong>
            {semPrazo.length === 1 ? 'Uma função ainda' : `${semPrazo.length} funções ainda`} sem
            prazo a cumprir:
          </strong>{' '}
          {semPrazo.map((r) => r.funcao).join(' · ')}. Aparecem com o tempo medido, mas sem
          cobrança — ou a categoria do card está em branco no Pipefy, ou vem classificada em duas ao
          mesmo tempo.
        </div>
      )}

      <PainelSlaFuncao resumos={resumos} total={total} />

      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <p>
          O prazo de cada função é <strong>herdado da categoria dela</strong>, definida em{' '}
          <code>config/categorias.ts</code>. Para dar prazo próprio a uma função, há{' '}
          <code>config/sla-funcao.ts</code> — que começa vazio de propósito: toda exceção é um
          número que alguém vai ter que defender depois.
        </p>
        <p>
          A função vem do cargo escrito no card, <strong>no vocabulário do Pipefy</strong> —
          &quot;AUXILIAR SERVIÇOS GERAIS&quot;, e não o &quot;ASG&quot; que o formulário da aba
          Vagas R&amp;S oferece. Dos dois vocabulários, 7 nomes casam e 15 não; unificá-los é
          decisão do R&amp;S, não de código.
        </p>
        <p>
          O tempo é contado em dias úteis, descontando fins de semana e feriados nacionais, do dia
          seguinte à criação do card (D+1) até a finalização — a mesma régua do painel de SLA da aba
          Vagas R&amp;S. Esta tela <strong>não grava nada</strong>.
        </p>
      </div>
    </div>
  );
}
