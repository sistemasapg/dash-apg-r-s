/**
 * Confere se a conexão com o Postgres está de pé, antes de tentar migrar nada.
 *
 *   npm run db:testar
 *
 * Valida o formato da URL, resolve o DNS (IPv4 importa: as funções do Vercel
 * saem por IPv4) e faz uma consulta de verdade no banco. Nunca imprime a senha.
 */
import './env.mts';
import dns from 'node:dns/promises';
import { ESQUEMA, getSql } from '../lib/db.ts';

const bruta = process.env.DATABASE_URL ?? '';

console.log('--- FORMATO DA URL ---');
if (!bruta) {
  console.error('  DATABASE_URL não definida.');
  process.exit(1);
}

let alvo: URL;
try {
  alvo = new URL(bruta);
} catch (erro) {
  console.error(`  URL inválida: ${(erro as Error).message}`);
  process.exit(1);
}

console.log(`  host    : ${alvo.hostname}`);
const PORTAS = { '6543': 'pooler de transacao', '5432': 'session pooler ou conexao direta' };
console.log(
  `  porta   : ${alvo.port} ${PORTAS[alvo.port as keyof typeof PORTAS] ?? '(inesperada)'}`,
);
if (alvo.hostname.startsWith('db.')) {
  console.log('  AVISO   : host "db.<ref>" e o pooler dedicado, que só tem IPv6.');
}
console.log(`  banco   : ${alvo.pathname.slice(1)}`);
console.log(`  usuario : ${alvo.username}`);
console.log(`  senha   : ${alvo.password.length} caracteres apos decodificar`);
console.log(`  schema  : ${ESQUEMA}`);

if (/YOUR-PASSWORD|SUA_SENHA|\[|\]/.test(bruta)) {
  console.error('\n  A senha ainda é um espaço reservado. Troque pela senha real.');
  process.exit(1);
}

console.log('\n--- DNS (o Vercel sai por IPv4) ---');
for (const [rotulo, familia] of [
  ['IPv4 (A)', 4],
  ['IPv6 (AAAA)', 6],
] as const) {
  try {
    const enderecos = await dns.resolve(alvo.hostname, familia === 4 ? 'A' : 'AAAA');
    console.log(`  ${rotulo}: ${enderecos.length} endereço(s) — ${enderecos[0]}`);
  } catch {
    console.log(`  ${rotulo}: nenhum`);
  }
}

console.log('\n--- CONEXAO ---');
const sql = getSql();
try {
  const [info] = await sql<{ versao: string; banco: string; caminho: string }[]>`
    select version() as versao, current_database() as banco, current_schema() as caminho
  `;
  console.log(`  conectou: ${info.versao.split(' ').slice(0, 2).join(' ')}`);
  console.log(`  banco   : ${info.banco}`);
  console.log(`  schema efetivo: ${info.caminho}`);

  if (info.caminho !== ESQUEMA) {
    console.log(
      `\n  ATENCAO: o schema efetivo é "${info.caminho}", nao "${ESQUEMA}".\n` +
        '  O search_path nao passou pelo pooler. As tabelas iriam para o lugar errado.',
    );
    process.exitCode = 1;
  } else {
    console.log('\n  Tudo certo. Pode rodar "npm run db:migrar".');
  }
} catch (erro) {
  console.error(`\n  Falhou: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
