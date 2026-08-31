/**
 * Gera 14 dias de snapshots fictícios para ver o dash funcionando antes de
 * existir token da Gupy.
 *
 *   npm run demo
 *
 * Não usa dado real de ninguém: nomes e vagas são inventados aqui mesmo.
 */
import './env.mts';
import { getSql, migrar, salvarSnapshot } from '../lib/db.ts';
import { salvarVagaPipefy } from '../lib/pipefy.ts';
import { ordemEtapa, estaEncerrado, etapaDoFunil } from '../lib/mapping.ts';
import type { LinhaNormalizada } from '../lib/types.ts';

const VAGAS = [
  { codigo: 'APG-001', nome: 'Agente Administrativo | Curitiba', recrutador: 'Ana Prado' },
  { codigo: 'APG-002', nome: 'Coordenador Pedagógico | Londrina', recrutador: 'Ana Prado' },
  { codigo: 'APG-003', nome: 'Professor de Matemática | Maringá', recrutador: 'Bruno Lima' },
  { codigo: 'APG-004', nome: 'Auxiliar de Serviços Gerais | Cascavel', recrutador: 'Bruno Lima' },
  { codigo: 'APG-005', nome: 'Analista de Dados | Sede', recrutador: 'Carla Souza' },
];

/*
  As vagas do Pipefy que o R&S teria lançado à mão. O prefixo DEMO- no card
  existe para o "npm run limpar -- demo" saber o que apagar: elas não pertencem
  a snapshot nenhum, então o cascade não as alcança.

  Uma delas fica de propósito sem vínculo com a Gupy e outra fechada, para a
  tela mostrar os dois casos que o time vai encontrar de verdade.
*/
const VAGAS_PIPEFY: {
  card: string;
  titulo: string;
  regional: string;
  unidade: string;
  abertaHa: number;
  fechadaHa?: number;
  codigo: string | null;
  situacao: 'aberta' | 'fechada' | 'cancelada';
}[] = [
  { card: 'DEMO-9001', titulo: 'Agente Administrativo', regional: 'Regional Leste', unidade: 'Curitiba', abertaHa: 12, codigo: 'APG-001', situacao: 'aberta' },
  { card: 'DEMO-9002', titulo: 'Coordenador Pedagógico', regional: 'Regional Norte', unidade: 'Londrina', abertaHa: 47, codigo: 'APG-002', situacao: 'aberta' },
  { card: 'DEMO-9003', titulo: 'Professor de Matemática', regional: 'Regional Norte', unidade: 'Maringá', abertaHa: 73, codigo: 'APG-003', situacao: 'aberta' },
  { card: 'DEMO-9004', titulo: 'Auxiliar de Serviços Gerais', regional: 'Regional Oeste', unidade: 'Cascavel', abertaHa: 30, fechadaHa: 8, codigo: 'APG-004', situacao: 'fechada' },
  { card: 'DEMO-9005', titulo: 'Assistente de RH', regional: 'Regional Leste', unidade: 'Sede', abertaHa: 6, codigo: null, situacao: 'aberta' },
];

const ETAPAS = [
  'Inscrito',
  'Triagem de currículo',
  'Teste online',
  'Entrevista com RH',
  'Entrevista com gestor',
  'Proposta',
  'Contratado',
];

// Gerador determinístico: rodar duas vezes produz o mesmo resultado, o que
// facilita comparar telas entre execuções.
let semente = 42;
function aleatorio(): number {
  semente = (semente * 1664525 + 1013904223) % 4294967296;
  return semente / 4294967296;
}

const PRIMEIROS = ['Ana', 'Bruno', 'Carla', 'Diego', 'Elisa', 'Felipe', 'Gabriela', 'Heitor', 'Iara', 'João'];
const ULTIMOS = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Costa', 'Pereira', 'Almeida'];

interface Pessoa {
  id: number;
  vaga: (typeof VAGAS)[number];
  nome: string;
  etapaIdx: number;
  encerrado: boolean;
  entrouNoDia: number;
}

const pessoas: Pessoa[] = [];
let proximoId = 1;

function criarPessoa(vaga: (typeof VAGAS)[number], dia: number): Pessoa {
  const nome = `${PRIMEIROS[Math.floor(aleatorio() * PRIMEIROS.length)]} ${
    ULTIMOS[Math.floor(aleatorio() * ULTIMOS.length)]
  }`;
  return { id: proximoId++, vaga, nome, etapaIdx: 0, encerrado: false, entrouNoDia: dia };
}

function dataDeDiasAtras(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

const DIAS = 14;

await migrar();

// População inicial, para o primeiro dia já ter volume.
for (const vaga of VAGAS) {
  const inicial = 12 + Math.floor(aleatorio() * 20);
  for (let i = 0; i < inicial; i++) {
    const p = criarPessoa(vaga, 0);
    p.etapaIdx = Math.floor(aleatorio() * 3);
    pessoas.push(p);
  }
}

for (let dia = 0; dia < DIAS; dia++) {
  const dataRef = dataDeDiasAtras(DIAS - 1 - dia);

  if (dia > 0) {
    // Candidaturas novas do dia.
    for (const vaga of VAGAS) {
      const novos = Math.floor(aleatorio() * 9);
      for (let i = 0; i < novos; i++) pessoas.push(criarPessoa(vaga, dia));
    }

    // Movimentação de quem já estava no funil.
    for (const p of pessoas) {
      if (p.encerrado || p.entrouNoDia >= dia) continue;
      const sorte = aleatorio();
      if (sorte < 0.12 && p.etapaIdx < ETAPAS.length - 1) {
        p.etapaIdx += 1;
        if (ETAPAS[p.etapaIdx] === 'Contratado') p.encerrado = true;
      } else if (sorte > 0.94) {
        p.encerrado = true;
      }
    }
  }

  const linhas: LinhaNormalizada[] = pessoas
    .filter((p) => p.entrouNoDia <= dia)
    .map((p) => {
      const contratado = p.encerrado && ETAPAS[p.etapaIdx] === 'Contratado';
      const etapa = p.encerrado && !contratado ? 'Reprovado' : ETAPAS[p.etapaIdx];
      const status = contratado ? 'Contratado' : p.encerrado ? 'Reprovado' : 'Em processo';

      return {
        chave: `${p.vaga.codigo}::${p.id}`.toLowerCase(),
        vaga_codigo: p.vaga.codigo,
        vaga_nome: p.vaga.nome,
        etapa,
        etapa_funil: etapaDoFunil(etapa, status),
        ordem_etapa: ordemEtapa(etapaDoFunil(etapa, status)),
        status,
        candidato_nome: p.nome,
        candidato_email: `candidato${p.id}@exemplo.test`,
        origem: ['Site de carreiras', 'LinkedIn', 'Indicação', 'Gupy'][Math.floor(aleatorio() * 4)],
        recrutador: p.vaga.recrutador,
        aplicou_em: dataDeDiasAtras(DIAS - 1 - p.entrouNoDia),
        atualizado_em: dataDeDiasAtras(DIAS - 1 - dia),
        encerrado: estaEncerrado(etapa, status),
      };
    });

  await salvarSnapshot({ dataRef, fonte: 'demo', linhas });
  console.log(`  ${dataRef}: ${linhas.length} candidaturas`);
}

for (const v of VAGAS_PIPEFY) {
  await salvarVagaPipefy({
    card_id: v.card,
    titulo: v.titulo,
    regional: v.regional,
    unidade: v.unidade,
    aberta_em: dataDeDiasAtras(v.abertaHa),
    fechada_em: v.fechadaHa === undefined ? null : dataDeDiasAtras(v.fechadaHa),
    situacao: v.situacao,
    vaga_codigo: v.codigo,
    observacao: null,
  });
}
console.log(`  ${VAGAS_PIPEFY.length} vagas do Pipefy lançadas (cards DEMO-*)`);

console.log(`\n${DIAS} snapshots de demonstração gravados. Rode "npm run dev" e abra o dash.`);
await getSql().end();
