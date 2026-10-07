/**
 * Varre o pipe de R&S e mostra o que existe lá dentro.
 *
 *   npm run pipefy:descobrir
 *
 * É o equivalente do `gupy:etapas` para o Pipefy: antes de escrever qualquer
 * de-para, é preciso ver os valores REAIS dos campos. A saída é um resumo —
 * contagens e valores distintos — e nunca o conteúdo dos cards: o que interessa
 * para calibrar o sync é a forma do dado, não o dado.
 */
import './env.mts';
import { buscarTodosOsCards, campo, type CardPipefy } from '../lib/pipefy-api.ts';

/** Conta ocorrências e imprime da mais comum para a menos. */
function resumir(titulo: string, valores: (string | null)[], limite = 40): void {
  const conta = new Map<string, number>();
  for (const v of valores) {
    const chave = v?.trim() || '(vazio)';
    conta.set(chave, (conta.get(chave) ?? 0) + 1);
  }
  const ordenado = [...conta.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\n--- ${titulo} (${ordenado.length} valores distintos) ---`);
  for (const [valor, n] of ordenado.slice(0, limite)) {
    console.log(`  ${String(n).padStart(5)}  ${valor.slice(0, 80)}`);
  }
  if (ordenado.length > limite) console.log(`  ... e mais ${ordenado.length - limite}`);
}

const inicio = Date.now();
const cards = await buscarTodosOsCards((lidos) => {
  process.stdout.write(`\r  lendo... ${lidos} cards`.padEnd(40));
});
process.stdout.write('\n');

console.log(
  `\n${cards.length} cards no pipe, em ${((Date.now() - inicio) / 1000).toFixed(1)}s`,
);

const cargo = (c: CardPipefy) =>
  campo(c, 'Cargo Administrativo:', 'Cargo Pedagógico:', 'Cargo do Professor:');

resumir('FASE ATUAL', cards.map((c) => c.current_phase?.name ?? null));
resumir('Categoria do Cargo:', cards.map((c) => campo(c, 'Categoria do Cargo:')));
resumir('Unidade da APG onde a vaga será aberta', cards.map((c) => campo(c, 'Unidade da APG onde a vaga será aberta')));
resumir('CARGO (os três campos juntos)', cards.map(cargo), 60);
resumir('Tipo de solicitação da vaga', cards.map((c) => campo(c, 'Tipo de solicitação da vaga')));

/* Datas: o que alimenta "aberta em" e "fechada em". */
const comCriacao = cards.filter((c) => c.createdAt).length;
const comFim = cards.filter((c) => c.finished_at).length;
console.log('\n--- DATAS ---');
console.log(`  createdAt preenchido:   ${comCriacao} de ${cards.length}`);
console.log(`  finished_at preenchido: ${comFim} de ${cards.length}`);
const datas = cards.map((c) => c.createdAt).filter(Boolean).sort();
console.log(`  card mais antigo: ${datas[0]?.slice(0, 10)} | mais novo: ${datas.at(-1)?.slice(0, 10)}`);

/*
  Todos os nomes de campo que existem no pipe. É daqui que sai a certeza de que
  o de-para está olhando para o campo certo — e a lista de onde tirar algo que
  faltar depois.
*/
const nomes = new Map<string, number>();
for (const c of cards) {
  for (const f of c.fields) {
    if (f.value?.trim()) nomes.set(f.name, (nomes.get(f.name) ?? 0) + 1);
  }
}
console.log(`\n--- CAMPOS DISPONÍVEIS (${nomes.size}, com quantos cards preenchidos) ---`);
for (const [nome, n] of [...nomes.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(5)}  ${nome.slice(0, 70)}`);
}
