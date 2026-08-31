/**
 * Remove fotos do banco.
 *
 *   npm run limpar -- demo          apaga tudo que veio do gerador ficticio
 *   npm run limpar -- 2026-08-13    apaga uma data especifica
 *   npm run limpar -- api           apaga o que veio da Gupy
 *
 * Existe porque misturar foto ficticia com foto real produz variacao inventada:
 * o dash compararia candidatos reais contra ficticios do dia anterior.
 */
import './env.mts';
import { getSql, listarSnapshots } from '../lib/db.ts';

const sql = getSql();
const alvo = process.argv[2];

try {
  if (!alvo) {
    console.log('Informe o que apagar: "demo", "api" ou uma data YYYY-MM-DD.\n');
    console.log('Fotos atuais:');
    for (const s of await listarSnapshots()) {
      console.log(`  ${s.data_ref}  ${s.fonte.padEnd(9)} ${s.total_linhas} candidaturas`);
    }
    process.exitCode = 1;
  } else {
    const porData = /^\d{4}-\d{2}-\d{2}$/.test(alvo);

    const alvos = porData
      ? await sql<{ data_ref: string; fonte: string; total_linhas: number }[]>`
          select data_ref, fonte, total_linhas from snapshot where data_ref = ${alvo}
        `
      : await sql<{ data_ref: string; fonte: string; total_linhas: number }[]>`
          select data_ref, fonte, total_linhas from snapshot where fonte = ${alvo}
        `;

    if (alvos.length === 0) {
      console.log(`Nada encontrado para "${alvo}". Nenhuma alteracao feita.`);
    } else {
      console.log(`Removendo ${alvos.length} foto(s):`);
      for (const a of alvos) {
        console.log(`  ${a.data_ref}  ${a.fonte}  ${a.total_linhas} candidaturas`);
      }

      // O cascade em snapshot leva candidatura, resumo_dia e vaga_dia junto.
      if (porData) {
        await sql`delete from snapshot where data_ref = ${alvo}`;
      } else {
        await sql`delete from snapshot where fonte = ${alvo}`;
      }

      /*
        As vagas do Pipefy não pertencem a snapshot nenhum, então o cascade não
        as alcança. As de demonstração precisam sair junto — senão sobram cards
        fictícios apontando para vagas da Gupy que acabaram de ser apagadas.

        Só as DEMO-: apagar cadastro digitado pelo time seria perda de trabalho.
      */
      if (alvo === 'demo') {
        const removidas = await sql`delete from vaga_pipefy where card_id like 'DEMO-%'`;
        if (removidas.count > 0) {
          console.log(`  ${removidas.count} vaga(s) ficticia(s) do Pipefy removida(s)`);
        }
      }

      const restantes = await listarSnapshots();
      console.log(`\nRestam ${restantes.length} foto(s):`);
      for (const s of restantes) {
        console.log(`  ${s.data_ref}  ${s.fonte.padEnd(9)} ${s.total_linhas} candidaturas`);
      }
    }
  }
} finally {
  await sql.end();
}
