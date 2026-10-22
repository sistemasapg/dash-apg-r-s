import { lerPrazos } from '@/lib/prazos';
import { migrar } from '@/lib/db';
import { numero } from '@/lib/format';
import { LinhaDePrazo } from '@/components/LinhaDePrazo';

export const dynamic = 'force-dynamic';

/**
 * Os prazos de SLA, editáveis aqui em vez de no código.
 *
 * Até 21/10/2026 eles viviam em `config/categorias.ts` e
 * `config/etapas-pipefy.ts`: mudar um número exigia alguém com acesso ao
 * repositório editar e publicar. Prazo é combinação entre o R&S e as áreas, e
 * a tela que o mostra deveria ser a mesma que o define.
 *
 * O que está no código continua sendo a SEMENTE — o valor com que o sistema
 * nasce. O que for alterado aqui passa a valer, e "restaurar" devolve a linha
 * ao valor original.
 */
export default async function Pagina() {
  // A tabela `prazo` é nova: sem isto, a primeira visita quebraria.
  await migrar();

  /*
    `etapas` continua vindo de `lerPrazos()` e segue editável pelo código — o
    que saiu em 21/10/2026 foi a seção que as LISTAVA aqui. Eram 14 linhas,
    13 delas vazias, e o prazo por etapa não é o que o time ajusta no dia a
    dia. Voltar é renderizar a lista de novo.
  */
  const { categorias, dp, leuDoBanco } = await lerPrazos();

  const alterados = [...categorias, dp].filter((p) => !p.daSemente).length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Prazos</h1>
        <p className="mt-1 text-sm text-ink-2">
          As duas réguas do processo: o R&amp;S responde pelo prazo da categoria, o DP pelo dele
          em cada fase. O que você mudar aqui vale na hora, em todas as telas.
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">
          {numero(categorias.length)} categorias + o prazo do DP · {numero(alterados)}{" "}
          {alterados === 1 ? 'alterada' : 'alteradas'} em relação ao padrão
        </p>
      </div>

      {!leuDoBanco && (
        <div className="rounded-xl border border-[var(--baixa)] bg-[color-mix(in_srgb,var(--baixa)_8%,transparent)] p-4 text-sm">
          <strong>Não deu para ler os prazos gravados.</strong> A tela está mostrando os valores
          que vêm do código, e salvar provavelmente vai falhar. É problema de banco, não de
          configuração.
        </div>
      )}


      <section className="rounded-xl border border-borda bg-surface">
        <div className="border-b border-borda p-5">
          <h2 className="text-sm font-semibold">Prazo do R&amp;S, por categoria</h2>
          <p className="mt-1 text-xs text-ink-2">
            Medido sobre o <strong>tempo total que a vaga ficou com o R&amp;S</strong>, em dias
            úteis. É prazo de entrega: quanto o recrutamento tem para achar e entregar a
            pessoa. O tempo que a vaga passa com o DP não entra nesta conta.
          </p>
        </div>

        {categorias.map((p) => (
          <LinhaDePrazo key={p.chave} prazo={p} rotulo={p.chave.replace(/^Vagas /, '')} />
        ))}
      </section>

      {/*
O prazo do DP é UM número, e vale para a soma das fases dele — não para cada
        uma. Foi a definição do R&S em 21/10/2026: "quantos dias úteis ele passou
        nas fases do DP, o ideal é 2".
      */}
      <section className="rounded-xl border border-borda bg-surface">
        <div className="border-b border-borda p-5">
          <h2 className="text-sm font-semibold">Prazo do DP</h2>
          <p className="mt-1 text-xs text-ink-2">
Quanto tempo a admissão inteira deveria levar, somando todas as fases do DP — exame
            admissional, lançamento e aprovação de benefícios, domínio, e as demais. Hoje a
            mediana medida é de 7 dias úteis, então o indicador vai acusar bastante coisa: é
            para acusar mesmo.
          </p>
        </div>

        <LinhaDePrazo prazo={dp} rotulo="DP" detalhe="soma de todas as fases do time" />
      </section>


      <div className="flex flex-col gap-1 text-xs text-ink-muted">
        <p>
          Os prazos valem imediatamente, mas as telas guardam o que leram por até um minuto — se
          um número não mudar na hora, atualize a página.
        </p>
        <p>
          Medido desde 01/09/2026: o R&amp;S leva <strong>3 dias úteis</strong> na mediana e
          cumpre o prazo em 92% das vagas. O DP leva <strong>7</strong>, contra um ideal de 2 —
          18% no prazo. Os dois números são medidos separadamente, cada um sobre o tempo do seu
          time.
        </p>
      </div>
    </div>
  );
}
