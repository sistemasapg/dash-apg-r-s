import './scripts/env.mts';
import { listarVagas, listarCandidaturas, vagaSelecionada } from './lib/gupy.ts';

const todas = await listarVagas();
const porStatus = new Map<string, number>();
for (const v of todas) porStatus.set(v.status ?? '(sem status)', (porStatus.get(v.status ?? '(sem status)') ?? 0) + 1);

console.log(`vagas na conta: ${todas.length}\n`);
console.log('status        vagas   sem Joinville');
for (const [s, n] of [...porStatus].sort((a, b) => b[1] - a[1])) {
  const semJoin = todas.filter((v) => (v.status ?? '(sem status)') === s && vagaSelecionada(v)).length;
  console.log(`  ${s.padEnd(12)} ${String(n).padStart(4)}   ${String(semJoin).padStart(5)}`);
}

// Amostra as NAO publicadas para estimar quanto elas trariam.
const naoPublicadas = todas.filter((v) => v.status !== 'published' && vagaSelecionada(v));
const amostra = naoPublicadas.slice(0, 12);
console.log(`\namostrando ${amostra.length} de ${naoPublicadas.length} vagas nao publicadas...`);
let soma = 0;
for (const v of amostra) {
  const c = await listarCandidaturas(v.id);
  soma += c.length;
  console.log(`  ${String(c.length).padStart(5)}  [${v.status}] ${v.nome.slice(0, 55)}`);
}
const media = soma / amostra.length;
console.log(`\nmedia: ${media.toFixed(0)} candidaturas por vaga nao publicada`);
console.log(`estimativa se incluisse todas: +${Math.round(media * naoPublicadas.length).toLocaleString('pt-BR')} candidaturas`);
console.log(`ou seja, a foto passaria de ~37.500 para ~${Math.round(37500 + media * naoPublicadas.length).toLocaleString('pt-BR')}`);
