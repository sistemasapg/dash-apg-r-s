/**
 * Varre uma amostra de vagas e lista TODAS as etapas de funil em uso, com a
 * ordem que o dash daria para cada uma. Serve para calibrar `ordemEtapa`.
 *
 *   npm run gupy:etapas          -> amostra de 60 vagas
 *   npm run gupy:etapas -- 150   -> amostra maior
 *
 * Também testa se `fields=all` traz o status da candidatura, que não vem no
 * retorno padrão desta conta.
 */
import './env.mts';
import { listarVagas, listarCandidaturas, vagaAtiva, requisitarBruto } from '../lib/gupy.ts';
import { ordemEtapa, normalizar } from '../lib/mapping.ts';

const amostra = Number(process.argv[2] ?? 60);

const vagas = (await listarVagas()).filter(vagaAtiva);
console.log(`Vagas ativas: ${vagas.length}. Amostrando ${Math.min(amostra, vagas.length)}.\n`);

const alvos = vagas.slice(0, amostra);
const etapas = new Map<string, number>();
const status = new Map<string, number>();
let totalCandidaturas = 0;
let vagasVazias = 0;

const CONCORRENCIA = 4;
let cursor = 0;
let feitas = 0;

async function trabalhador() {
  while (cursor < alvos.length) {
    const vaga = alvos[cursor++];
    try {
      const candidaturas = await listarCandidaturas(vaga.id);
      totalCandidaturas += candidaturas.length;
      if (candidaturas.length === 0) vagasVazias += 1;

      for (const c of candidaturas as Record<string, unknown>[]) {
        const passo = c.currentStep as Record<string, unknown> | undefined;
        const nome = passo?.name ? String(passo.name) : '(sem etapa)';
        etapas.set(nome, (etapas.get(nome) ?? 0) + 1);

        const s = c.status ? String(c.status) : '(ausente)';
        status.set(s, (status.get(s) ?? 0) + 1);
      }
    } catch (erro) {
      console.log(`  falhou vaga ${vaga.id}: ${(erro as Error).message}`);
    }
    feitas += 1;
    process.stdout.write(`\r  ${feitas}/${alvos.length} vagas`.padEnd(40));
  }
}

await Promise.all(Array.from({ length: CONCORRENCIA }, trabalhador));
process.stdout.write('\n\n');

console.log(`Candidaturas lidas: ${totalCandidaturas} (${vagasVazias} vagas sem candidatos)\n`);

console.log('--- ETAPAS EM USO (quantidade | ordem que o dash daria) ---');
const ordenadas = [...etapas.entries()].sort((a, b) => b[1] - a[1]);
for (const [nome, quantidade] of ordenadas) {
  const ordem = ordemEtapa(nome);
  const marca = ordem === 80 ? '  <-- SEM REGRA, cai no fim do funil' : '';
  console.log(`  ${String(quantidade).padStart(6)} | ordem ${String(ordem).padStart(2)} | ${nome}${marca}`);
}

console.log('\n--- STATUS DA CANDIDATURA ---');
for (const [nome, quantidade] of [...status.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(quantidade).padStart(6)} | ${nome}`);
}

// A doc diz que `fields=all` traz mais campos. Vale conferir se o status vem ali.
const comCandidatos = alvos.find(() => true);
if (comCandidatos) {
  console.log('\n--- TESTE: fields=all traz `status`? ---');
  try {
    const corpo = (await requisitarBruto(
      `/api/v1/jobs/${comCandidatos.id}/applications`,
      { page: 1, perPage: 1, fields: 'all' },
    )) as Record<string, unknown>;

    const lista = (corpo.data ?? corpo.results ?? []) as Record<string, unknown>[];
    if (lista.length === 0) {
      console.log('  vaga sem candidaturas, teste inconclusivo');
    } else {
      const chaves = Object.keys(lista[0]).sort();
      console.log(`  chaves retornadas: ${chaves.join(', ')}`);
      console.log(`  tem "status"? ${chaves.includes('status') ? 'SIM -> ' + JSON.stringify(lista[0].status) : 'NAO'}`);
      console.log(`  tem "source"? ${chaves.includes('source') ? 'SIM' : 'NAO'}`);
    }
  } catch (erro) {
    console.log(`  falhou: ${(erro as Error).message}`);
  }
}

console.log(`\n(normalizacao usada no casamento, exemplo: "${normalizar(ordenadas[0]?.[0] ?? '')}")`);
