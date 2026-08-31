/**
 * Mostra o FORMATO da resposta da Gupy sem expor dado de candidato.
 *
 *   npm run gupy:inspecionar
 *
 * Imprime os caminhos dos campos e o tipo de cada um. Valores só aparecem para
 * campos que não identificam ninguém (status, nome de etapa, origem, datas).
 * A saída é segura para colar em um chat ou ticket.
 */
import './env.mts';
import { listarVagas, listarCandidaturas, vagaAtiva, requisitarBruto } from '../lib/gupy.ts';

/** Campos cujo valor é categoria, não identidade — esses podem aparecer. */
const CHAVES_SEGURAS = new Set([
  'status',
  'source',
  'origin',
  'type',
  'currentStep.name',
  'currentStep.type',
  'step.name',
  'step.type',
  'job.status',
  'department.name',
  'role.name',
  'branch.name',
  'disapprovalReason',
]);

const CHAVES_DATA = new Set(['createdAt', 'updatedAt', 'endedAt', 'appliedAt']);

type Bruto = Record<string, unknown>;

function tipoDe(valor: unknown): string {
  if (valor === null) return 'null';
  if (Array.isArray(valor)) return `array[${valor.length}]`;
  return typeof valor;
}

function descrever(valor: unknown, caminho: string, ultimaChave: string): string {
  const tipo = tipoDe(valor);
  if (valor === null || valor === undefined) return tipo;

  if (CHAVES_SEGURAS.has(caminho) || CHAVES_SEGURAS.has(ultimaChave)) {
    return `${tipo} = ${JSON.stringify(valor)}`;
  }
  if (CHAVES_DATA.has(ultimaChave)) {
    return `${tipo} = <data, ex. formato ${String(valor).length} chars>`;
  }
  if (typeof valor === 'number') return `${tipo} (valor oculto)`;
  if (typeof valor === 'boolean') return `${tipo} (valor oculto)`;
  if (typeof valor === 'string') return `${tipo}[${valor.length}] (valor oculto)`;
  return tipo;
}

function mapear(obj: unknown, prefixo = '', profundidade = 0, saida: string[] = []): string[] {
  if (profundidade > 3 || obj === null || typeof obj !== 'object') return saida;

  for (const [chave, valor] of Object.entries(obj as Bruto)) {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;

    if (valor !== null && typeof valor === 'object' && !Array.isArray(valor)) {
      saida.push(`  ${caminho}: object`);
      mapear(valor, caminho, profundidade + 1, saida);
    } else if (Array.isArray(valor)) {
      saida.push(`  ${caminho}: array[${valor.length}]`);
      if (valor.length > 0 && typeof valor[0] === 'object') {
        mapear(valor[0], `${caminho}[0]`, profundidade + 1, saida);
      }
    } else {
      saida.push(`  ${caminho}: ${descrever(valor, caminho, chave)}`);
    }
  }
  return saida;
}

async function principal() {
  console.log('Consultando /api/v1/jobs ...\n');
  const vagas = await listarVagas();
  const ativas = vagas.filter(vagaAtiva);

  console.log(`Vagas retornadas: ${vagas.length} (ativas pelo filtro atual: ${ativas.length})`);
  console.log(
    `Status distintos de vaga: ${JSON.stringify([...new Set(vagas.map((v) => v.status))])}\n`,
  );

  const alvo = ativas[0] ?? vagas[0];
  if (!alvo) {
    console.log('Nenhuma vaga retornada — verifique as permissões do token.');
    return;
  }

  console.log('--- ESTRUTURA DE UMA VAGA (campos que o dash extraiu) ---');
  console.log(
    `  id: ${alvo.id ? 'preenchido' : 'VAZIO'} | codigo: ${alvo.codigo ? 'preenchido' : 'VAZIO'} | ` +
      `nome: ${alvo.nome ? 'preenchido' : 'VAZIO'} | recrutador: ${alvo.recrutador ? 'preenchido' : 'VAZIO'}`,
  );

  console.log('\n--- TODOS OS CAMPOS QUE A GUPY DEVOLVE SOBRE UMA VAGA ---');
  const corpoVagas = (await requisitarBruto('/api/v1/jobs', { page: 1, perPage: 1 })) as Bruto;
  const listaVagas = (corpoVagas.data ?? corpoVagas.results ?? []) as Bruto[];
  if (listaVagas.length > 0) {
    console.log(mapear(listaVagas[0]).join('\n'));
  } else {
    console.log('  (nenhuma vaga retornada nesta chamada)');
  }

  console.log(`\nConsultando candidaturas da vaga ${alvo.id} ...\n`);
  const candidaturas = await listarCandidaturas(alvo.id);
  console.log(`Candidaturas retornadas nessa vaga: ${candidaturas.length}\n`);

  if (candidaturas.length === 0) {
    console.log('Vaga sem candidaturas. Rode de novo apontando para uma vaga com movimento.');
    return;
  }

  console.log('--- ESTRUTURA DE UMA CANDIDATURA (valores pessoais ocultos) ---');
  console.log(mapear(candidaturas[0]).join('\n'));

  const etapas = new Set<string>();
  const status = new Set<string>();
  for (const c of candidaturas as Bruto[]) {
    const passo = (c.currentStep ?? c.step) as Bruto | undefined;
    if (passo?.name) etapas.add(String(passo.name));
    if (c.status) status.add(String(c.status));
  }

  console.log('\n--- ETAPAS DO FUNIL ENCONTRADAS ---');
  console.log([...etapas].map((e) => `  - ${e}`).join('\n') || '  (nenhuma)');
  console.log('\n--- STATUS ENCONTRADOS ---');
  console.log([...status].map((s) => `  - ${s}`).join('\n') || '  (nenhum)');
  console.log('\nPode colar essa saída — ela não contém nome, e-mail nem CPF de ninguém.');
}

principal().catch((erro) => {
  console.error(`\nFalhou: ${erro.message}`);
  process.exitCode = 1;
});
