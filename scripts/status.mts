/**
 * Diagnóstico do banco: quais fotos existem, quanto ocupam e até onde ainda há
 * detalhe por candidato.
 *
 *   npm run status
 */
import './env.mts';
import { getSql, detalheDesde, listarSnapshots, DIAS_DETALHE, ESQUEMA, migrar } from '../lib/db.ts';

const sql = getSql();

try {
  await migrar();

  const snapshots = await listarSnapshots();
  console.log(`\nFotos guardadas: ${snapshots.length}`);

  if (snapshots.length === 0) {
    console.log('Nenhuma. Rode "npm run sync" ou "npm run demo".\n');
  } else {
    const linhas = await sql<
      {
        data_ref: string;
        fonte: string;
        total_linhas: number;
        detalhe: number;
        agregado: number;
      }[]
    >`
      select s.data_ref,
             s.fonte,
             s.total_linhas,
             (select count(*)::int from candidatura c where c.snapshot_id = s.id) as detalhe,
             (select count(*)::int from resumo_dia r  where r.snapshot_id = s.id) as agregado
      from snapshot s order by s.data_ref desc
    `;

    console.log('\n  data         fonte     candidaturas   detalhe   agregado');
    console.log('  ' + '-'.repeat(58));
    for (const s of linhas) {
      const aviso =
        s.agregado === 0 ? '  <-- AGREGADO VAZIO' : s.detalhe === 0 ? '  (compactada)' : '';
      console.log(
        `  ${s.data_ref}   ${s.fonte.padEnd(9)} ${String(s.total_linhas).padStart(12)} ` +
          `${String(s.detalhe).padStart(9)} ${String(s.agregado).padStart(10)}${aviso}`,
      );
    }

    console.log(`\nDetalhe por candidato disponivel desde: ${(await detalheDesde()) ?? '(nenhum)'}`);
    console.log(`Janela configurada: ${DIAS_DETALHE} dias (DASH_DIAS_DETALHE)`);

    // No Postgres o tamanho vem do próprio banco, não de um arquivo em disco.
    // Só as nossas tabelas: o banco é compartilhado com outros sistemas.
    const tamanhos = await sql<{ tabela: string; tamanho: string; bytes: number }[]>`
      select c.relname as tabela,
             pg_size_pretty(pg_total_relation_size(c.oid)) as tamanho,
             pg_total_relation_size(c.oid)::bigint as bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = ${ESQUEMA} and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
    `;

    console.log(`\nTabelas em ${ESQUEMA}:`);
    let bytes = 0;
    for (const t of tamanhos) {
      console.log(`  ${t.tabela.padEnd(14)} ${String(t.tamanho).padStart(10)}`);
      bytes += Number(t.bytes);
    }
    console.log(`  ${'TOTAL'.padEnd(14)} ${(bytes / 1024 / 1024).toFixed(1).padStart(7)} MB`);

    const comDetalhe = linhas.filter((s) => s.detalhe > 0).length;
    if (comDetalhe > 0) {
      const porFoto = bytes / 1024 / 1024 / comDetalhe;
      console.log(
        `\nProjecao: ~${porFoto.toFixed(1)} MB por foto. ` +
          `Em regime, ${DIAS_DETALHE} dias ≈ ${(porFoto * DIAS_DETALHE).toFixed(0)} MB.`,
      );
    }
  }
  console.log('');
} finally {
  await sql.end();
}
