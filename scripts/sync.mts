/**
 * Grava a foto de hoje: consulta a Gupy e salva o snapshot no banco.
 *
 *   npm run sync              -> grava com a data de hoje
 *   npm run sync -- 2026-08-13 -> grava com uma data específica (recuperar um dia perdido)
 *
 * É este script que o Agendador de Tarefas do Windows chama. Em produção, o
 * mesmo trabalho é feito pela rota /api/sync, disparada pelo cron do Vercel.
 */
import './env.mts';
import { coletarSnapshot, exclusaoAtiva, filtroAtivo, statusAtivo } from '../lib/gupy.ts';
import { compactar, DIAS_DETALHE, getSql, hoje, migrar, salvarSnapshot } from '../lib/db.ts';

const argumento = process.argv[2];
const dataRef = argumento && /^\d{4}-\d{2}-\d{2}$/.test(argumento) ? argumento : hoje();

const inicio = Date.now();
console.log(`[${new Date().toISOString()}] Sync Gupy -> snapshot ${dataRef}`);
if (statusAtivo) console.log(`  Status de vaga aceitos: ${statusAtivo}`);
if (exclusaoAtiva) console.log(`  Excluindo vagas cujo nome contenha: ${exclusaoAtiva}`);
if (filtroAtivo) console.log(`  Somente vagas cujo nome contenha: ${filtroAtivo}`);

try {
  // Idempotente: garante que o esquema existe antes de tentar gravar.
  await migrar();

  const resultado = await coletarSnapshot((feito, total, vaga) => {
    process.stdout.write(`\r  vagas: ${feito}/${total} (${vaga.slice(0, 40)})`.padEnd(80));
  });
  process.stdout.write('\n');

  if (resultado.linhas.length === 0 && resultado.erros.length > 0) {
    // Salvar um snapshot vazio por causa de falha de rede estragaria a comparação
    // do dia seguinte, que passaria a mostrar uma queda que nunca aconteceu.
    throw new Error(
      `Nenhuma candidatura coletada e ${resultado.erros.length} vaga(s) falharam. Snapshot não gravado.`,
    );
  }

  const { substituiu } = await salvarSnapshot({
    dataRef,
    fonte: 'api',
    linhas: resultado.linhas,
    vagas: resultado.vagas,
  });

  console.log(
    `  ${resultado.linhas.length} candidaturas em ${resultado.vagasConsultadas} vagas ` +
      `(${resultado.vagasIgnoradas} fora do status aceito` +
      (resultado.vagasForaDoFiltro > 0
        ? `, ${resultado.vagasForaDoFiltro} descartadas pelo nome`
        : '') +
      ')',
  );

  if (resultado.erros.length > 0) {
    console.log(`  ATENCAO: ${resultado.erros.length} vaga(s) falharam:`);
    for (const e of resultado.erros.slice(0, 10)) {
      console.log(`    - ${e.vaga}: ${e.mensagem}`);
    }
  }

  console.log(
    `  Snapshot ${substituiu ? 'substituido' : 'criado'} em ${((Date.now() - inicio) / 1000).toFixed(1)}s`,
  );

  // Mantém o banco sob controle: o detalhe por candidato de fotos antigas sai,
  // as contagens ficam.
  const limpeza = await compactar();
  if (limpeza.snapshotsCompactados > 0) {
    console.log(
      `  Compactacao: ${limpeza.linhasRemovidas} linhas de detalhe removidas de ` +
        `${limpeza.snapshotsCompactados} foto(s) com mais de ${DIAS_DETALHE} dias ` +
        `(as contagens continuam)`,
    );
  }
} catch (erro) {
  console.error(`\nFalhou: ${(erro as Error).message}`);
  process.exitCode = 1;
} finally {
  // Sem fechar o pool o processo fica pendurado e a tarefa agendada nunca encerra.
  await getSql().end();
}
