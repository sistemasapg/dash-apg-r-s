/**
 * Cria (ou atualiza) as tabelas do dash no Postgres.
 *
 *   npm run db:migrar
 *
 * Idempotente: pode rodar quantas vezes quiser. É o primeiro comando depois de
 * configurar a DATABASE_URL.
 */
import './env.mts';
import { ESQUEMA, getSql, migrar } from '../lib/db.ts';

const sql = getSql();
const ESPERADAS = [
  'candidatura',
  'controle',
  'resumo_dia',
  'snapshot',
  'vaga_dia',
  'vaga_pipefy',
];

try {
  console.log(`Schema de destino: ${ESQUEMA}\n`);
  await migrar();

  const tabelas = await sql<{ tabela: string }[]>`
    select table_name as tabela from information_schema.tables
    where table_schema = ${ESQUEMA} order by table_name
  `;

  const encontradas = tabelas.map((t) => t.tabela);
  for (const nome of ESPERADAS) {
    console.log(`  ${encontradas.includes(nome) ? 'ok  ' : 'FALTA'} ${ESQUEMA}.${nome}`);
  }

  const faltando = ESPERADAS.filter((n) => !encontradas.includes(n));
  if (faltando.length > 0) {
    // Sintoma clássico de search_path que não pegou: as tabelas foram criadas,
    // mas em outro schema. Melhor gritar aqui do que descobrir com dado gravado
    // no lugar errado.
    throw new Error(
      `As tabelas não apareceram em "${ESQUEMA}". Verifique se a connection string ` +
        `aceita o search_path, ou use DATABASE_SCHEMA=public.`,
    );
  }

  const outras = encontradas.filter((n) => !ESPERADAS.includes(n));
  if (outras.length > 0) {
    console.log(`\nOutras tabelas neste schema (não são do dash): ${outras.join(', ')}`);
  }

  console.log('\nEsquema pronto.');
} catch (erro) {
  console.error(`\nFalhou: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
