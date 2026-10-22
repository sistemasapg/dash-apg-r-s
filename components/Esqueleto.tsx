/**
 * As peças de carregamento.
 *
 * Toda tela do painel é `force-dynamic` e leva de 2 a 14 segundos para montar —
 * ela lê a planilha, o banco, ou os dois. Sem esqueleto, clicar numa aba
 * deixava a tela ANTERIOR congelada por todo esse tempo, sem sinal de vida
 * nenhum: a pessoa clicava de novo achando que não tinha pego.
 *
 * O esqueleto não deixa a página mais rápida. Ele faz a espera ser visível, que
 * é outra coisa — e, para quem usa, a diferença entre "travou" e "está vindo".
 *
 * Desenhados com a FORMA da tela que vão substituir. Um retângulo genérico
 * avisaria que algo carrega; um que já tem o número de cartões e colunas certos
 * evita o salto de layout quando o conteúdo chega.
 */

/** Um bloco cinza que pulsa. A unidade de todo o resto. */
export function Barra({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-surface-2 ${className}`} />;
}

export function CabecalhoEsqueleto() {
  return (
    <div className="flex flex-col gap-2">
      <Barra className="h-7 w-64" />
      <Barra className="h-4 w-full max-w-xl" />
      <Barra className="h-3 w-80" />
    </div>
  );
}

/** A fileira de números grandes. `quantos` espelha a tela de destino. */
export function CartoesEsqueleto({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="rounded-xl border border-borda bg-surface p-5">
          <Barra className="h-3 w-28" />
          <Barra className="mt-3 h-8 w-20" />
          <Barra className="mt-3 h-3 w-36" />
        </div>
      ))}
    </div>
  );
}

/** Uma tabela com cabeçalho e linhas de largura variada. */
export function TabelaEsqueleto({
  linhas = 8,
  colunas = 6,
}: {
  linhas?: number;
  colunas?: number;
}) {
  return (
    <section className="rounded-xl border border-borda bg-surface">
      <div className="flex items-center justify-between border-b border-borda p-5">
        <Barra className="h-4 w-40" />
        <Barra className="h-3 w-32" />
      </div>

      <div className="border-b border-borda bg-surface-2 px-4 py-3">
        <div className="flex gap-6">
          {Array.from({ length: colunas }, (_, i) => (
            <Barra key={i} className="h-2.5 flex-1" />
          ))}
        </div>
      </div>

      <div className="flex flex-col">
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="flex items-center gap-6 border-b border-borda px-4 py-4 last:border-0">
            {Array.from({ length: colunas }, (_, c) => (
              /*
                Larguras desiguais de propósito: uma grade de blocos idênticos
                parece uma planilha vazia, não um texto que ainda não chegou.
              */
              <Barra key={c} className={`h-3 ${["flex-1", "w-24", "flex-1", "w-16", "w-20", "flex-1", "w-14"][c % 7]}`} />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

/** A caixa de filtros do topo. */
export function FiltrosEsqueleto() {
  return (
    <section className="rounded-xl border border-borda bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        {['w-32', 'w-24', 'w-28', 'w-24'].map((w, i) => (
          <Barra key={i} className={`h-8 ${w}`} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-borda pt-4">
        {[0, 1, 2].map((i) => (
          <Barra key={i} className="h-8 w-40" />
        ))}
      </div>
    </section>
  );
}

/** O conjunto completo: cabeçalho, filtros, números e uma tabela. */
export function PainelEsqueleto({
  cartoes = 4,
  filtros = true,
  colunas = 6,
}: {
  cartoes?: number;
  filtros?: boolean;
  colunas?: number;
}) {
  return (
    <div
      className="flex flex-col gap-6"
      /*
        `aria-busy` e o texto escondido contam a mesma coisa para quem navega
        por leitor de tela: sem isso o esqueleto é só um monte de div vazia.
      */
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Carregando os dados do painel…</span>
      <CabecalhoEsqueleto />
      {filtros && <FiltrosEsqueleto />}
      <CartoesEsqueleto quantos={cartoes} />
      <TabelaEsqueleto colunas={colunas} />
    </div>
  );
}
