/**
 * Testes das regras que não dependem do banco: a ordenação do funil, a
 * detecção de saída e as contas de tempo das vagas do Pipefy.
 *
 *   npm test
 *
 * Os nomes de etapa são os REAIS da conta da APG, levantados com
 * `npm run gupy:etapas`. Se alguém mexer nas regras e quebrar um deles, aparece
 * aqui antes de aparecer no dash.
 */
import { ordemEtapa, estaEncerrado, etapaDoFunil, normalizar } from '../lib/mapping.ts';
import { filtrar, opcoes, porCategoria, porUrgencia, resumirSla } from '../lib/analise-sla.ts';
import type { VagaPipefyComNumeros } from '../lib/types.ts';
import { calcularSla, diasUteisEntre, ehDiaUtil, prazoFinal } from '../lib/uteis.ts';
import { funcoesDaCategoria, NOMES_CATEGORIAS, slaDaCategoria } from '../config/categorias.ts';
import { escolaValida, escolasDaRegional, normalizarEscola, normalizarRegional, REGIONAIS, SIGLAS } from '../config/unidades.ts';
import { SEM_RECORTE } from '../lib/analise-sla.ts';
import { conferirCredenciais, temCredenciais } from '../lib/sessao.ts';

let falhas = 0;

function conferir(descricao: string, obtido: unknown, esperado: unknown) {
  const ok = obtido === esperado;
  if (!ok) falhas += 1;
  console.log(
    `  ${ok ? 'ok  ' : 'FALHOU'} ${descricao}${ok ? '' : ` (esperado ${esperado}, obtido ${obtido})`}`,
  );
}

console.log('\nO funil da APG, na ordem de config/etapas.ts');
const FUNIL_APG = [
  'Cadastro',
  'Triagem',
  'Prova Online',
  'Triagem 2',
  'Antecedentes Criminais',
  'Agendamento de Aula Teste e Entrevista',
  'Aula Teste e Entrevista Agendada',
  'Aula Teste e Entrevista Realizada',
  'Aguardando agendamento da entrevista',
  'Entrevista Agendada',
  'Entrevista',
  'Entrevista Realizada',
  'Plano B',
  'Contratação',
];

FUNIL_APG.forEach((etapa, i) => {
  if (i === 0) return;
  const anterior = FUNIL_APG[i - 1];
  conferir(`${anterior} vem antes de ${etapa}`, ordemEtapa(anterior) < ordemEtapa(etapa), true);
});

conferir(
  'as fases de saida ficam depois de Contratação',
  ordemEtapa('Contratação') < ordemEtapa('Contratado') &&
    ordemEtapa('Contratado') < ordemEtapa('Desistiu') &&
    ordemEtapa('Desistiu') < ordemEtapa('Reprovado'),
  true,
);

console.log('\nOs três pontos em que a adivinhação errava');
conferir('Triagem 2 vem DEPOIS da prova, não junto da Triagem', ordemEtapa('Triagem 2'), 40);
conferir('Antecedentes Criminais antes das entrevistas', ordemEtapa('Antecedentes Criminais'), 50);
conferir('Plano B não cai no fim sem regra', ordemEtapa('Plano B'), 70);

console.log('\n"Plano A - Banco de Talentos" é lista de espera, não saída');
conferir('não vai parar no meio dos reprovados', ordemEtapa('Plano A - Banco de Talentos'), 71);
conferir(
  'e continua contando como candidato ativo',
  estaEncerrado('Plano A - Banco de Talentos', 'Em processo'),
  0,
);

console.log('\nA adivinhação genérica, para etapas que a APG ainda não tem');
conferir('Prova enviada na Exametric = 30', ordemEtapa('Prova enviada na Exametric'), 30);
conferir('Mapeamento Comportamental = 35', ordemEtapa('Mapeamento Comportamental'), 35);
conferir('Proposta = 60', ordemEtapa('Proposta'), 60);
conferir('Reprovados = 90', ordemEtapa('Reprovados'), 90);
conferir('etapa desconhecida cai no fim', ordemEtapa('Alinhamento com a diretoria'), 80);
// "Nova" é sinônimo de candidatura recém-chegada nas regras — vale lembrar que
// batizar uma etapa de "Fase Nova" a jogaria para o começo do funil, não para o fim.
conferir('"Fase Nova" é lida como entrada, não como etapa sem regra', ordemEtapa('Fase Nova'), 10);

console.log('\nAs duas armadilhas de substring');
conferir('"Reprovado" contém "prova" mas fica fora do funil', ordemEtapa('Reprovado') >= 90, true);
conferir('"Prova Online" continua sendo prova', ordemEtapa('Prova Online'), 30);
conferir('"Aula Teste" contém "teste" mas vem depois da prova', ordemEtapa('Aula Teste'), 45);
conferir(
  'e a etapa real da APG também',
  ordemEtapa('Prova Online') < ordemEtapa('Aula Teste e Entrevista Agendada'),
  true,
);

console.log('\nEspaço em branco e acento não podem mudar a ordem');
conferir('"Entrevista " com espaço sobrando', ordemEtapa('Entrevista '), 60);
conferir('CONTRATAÇÃO em caixa alta acha a regra manual', ordemEtapa('CONTRATAÇÃO'), 75);
conferir('normalizar tira acento', normalizar('Contratação'), 'contratacao');

console.log('\nSaída do funil (etapa + status da API)');
conferir('status Reprovado encerra', estaEncerrado('Triagem', 'Reprovado'), 1);
conferir('status Contratado encerra', estaEncerrado('Contratação', 'Contratado'), 1);
conferir('status Desistiu encerra', estaEncerrado('Prova Online', 'Desistiu'), 1);
conferir('status Em processo NÃO encerra', estaEncerrado('Prova Online', 'Em processo'), 0);
conferir('etapa Contratação sozinha não encerra', estaEncerrado('Contratação', 'Em processo'), 0);
conferir('etapa Reprovados encerra sem status', estaEncerrado('Reprovados', null), 1);

console.log('\nQuem saiu do funil vira fase própria, não fica na etapa antiga');
conferir(
  'reprovado na Prova Online vai para Reprovado',
  etapaDoFunil('Prova Online', 'Reprovado'),
  'Reprovado',
);
conferir('desistente vira Desistiu', etapaDoFunil('Triagem', 'Desistiu'), 'Desistiu');
conferir('contratado vira Contratado', etapaDoFunil('Contratação', 'Contratado'), 'Contratado');
conferir(
  'quem está em processo mantém a etapa real',
  etapaDoFunil('Prova Online', 'Em processo'),
  'Prova Online',
);
conferir('etapa "Reprovados" sem status também agrupa', etapaDoFunil('Reprovados', null), 'Reprovado');
conferir(
  'etapa Contratação sozinha NÃO vira Contratado',
  etapaDoFunil('Contratação', 'Em processo'),
  'Contratação',
);

/* ------------------------------------------------------------------------ */

console.log('\nDias úteis: fins de semana e feriados');
// 2026-08-31 é uma segunda-feira; 2026-09-04, a sexta seguinte.
conferir('segunda é dia útil', ehDiaUtil('2026-08-31'), true);
conferir('sábado não é', ehDiaUtil('2026-09-05'), false);
conferir('domingo não é', ehDiaUtil('2026-09-06'), false);
conferir('7 de setembro não é', ehDiaUtil('2026-09-07'), false);
conferir('Natal não é', ehDiaUtil('2026-12-25'), false);
// Páscoa de 2026 cai em 05/04: Sexta-feira Santa em 03/04, Carnaval em 16 e 17/02.
conferir('Sexta-feira Santa não é', ehDiaUtil('2026-04-03'), false);
conferir('terça de Carnaval não é', ehDiaUtil('2026-02-17'), false);
conferir('Corpus Christi não é', ehDiaUtil('2026-06-04'), false);

console.log('\nA contagem D+1: o dia da abertura não conta');
conferir('abriu e olhou no mesmo dia = 0', diasUteisEntre('2026-08-31', '2026-08-31'), 0);
conferir('segunda -> terça = 1', diasUteisEntre('2026-08-31', '2026-09-01'), 1);
conferir('segunda -> sexta = 4', diasUteisEntre('2026-08-31', '2026-09-04'), 4);
// De segunda 31/08 a segunda 07/09 dá 4, e não 5: o fim de semana sai, e o
// 07/09 cai justamente nessa segunda. É o feriado sendo descontado.
conferir('segunda -> segunda, com 7 de setembro no meio = 4', diasUteisEntre('2026-08-31', '2026-09-07'), 4);
conferir('referência anterior à abertura não fica negativa', diasUteisEntre('2026-08-31', '2026-08-20'), 0);

console.log('\nO prazo final é o N-ésimo dia útil depois da abertura');
// 1,2,3,4 (ter-sex), 07 é feriado, 8,9,10 -> o sétimo dia útil é 10/09.
conferir('SLA 7 abrindo na segunda 31/08', prazoFinal('2026-08-31', 7), '2026-09-10');
conferir('SLA 15 abrindo na segunda 31/08', prazoFinal('2026-08-31', 15), '2026-09-22');
conferir('abrir na sexta empurra o primeiro dia para segunda', prazoFinal('2026-09-04', 1), '2026-09-08');

console.log('\nSLA e funções por categoria');
conferir('Vagas Professores = 7 dias úteis', slaDaCategoria('Vagas Professores'), 7);
conferir('Vagas Administrativas = 15', slaDaCategoria('Vagas Administrativas'), 15);
conferir('Vagas Jovem Aprendiz = 10', slaDaCategoria('Vagas Jovem Aprendiz'), 10);
conferir('Vagas Estagiário = 10', slaDaCategoria('Vagas Estagiário'), 10);
conferir('categoria desconhecida não tem prazo', slaDaCategoria('Vagas Marcianas'), null);
conferir('vaga sem categoria não tem prazo', slaDaCategoria(null), null);
conferir('Professores tem 12 funções', funcoesDaCategoria('Vagas Professores').length, 12);
conferir('Administrativas tem 9 funções', funcoesDaCategoria('Vagas Administrativas').length, 9);
conferir('Jovem Aprendiz tem uma função', funcoesDaCategoria('Vagas Jovem Aprendiz').join(','), 'Jovem Aprendiz');
conferir('Estagiário tem uma função', funcoesDaCategoria('Vagas Estagiário').join(','), 'Tutor');
// Todas as quatro têm lista: o campo de função é fechado em toda categoria.
conferir(
  'nenhuma categoria ficou sem lista de funções',
  NOMES_CATEGORIAS.every((c) => funcoesDaCategoria(c).length > 0),
  true,
);

console.log('\nO estado do prazo');
const noPrazo = calcularSla('2026-08-31', 7, null, '2026-09-03');
conferir('3 dias úteis de 7 estão no prazo', noPrazo?.situacao, 'no-prazo');
conferir('e sobram 4', noPrazo?.saldo, 4);
conferir('no último dia o rótulo é vence-hoje', calcularSla('2026-08-31', 7, null, '2026-09-10')?.situacao, 'vence-hoje');
const atrasada = calcularSla('2026-08-31', 7, null, '2026-09-11');
conferir('um dia útil depois, atrasada', atrasada?.situacao, 'atrasada');
conferir('com saldo negativo', atrasada?.saldo, -1);
conferir('fechada dentro do prazo é cumprido', calcularSla('2026-08-31', 7, '2026-09-08', '2026-12-01')?.situacao, 'cumprido');
conferir('fechada fora do prazo é estourado', calcularSla('2026-08-31', 7, '2026-09-15', '2026-12-01')?.situacao, 'estourado');
conferir(
  'vaga fechada não muda de estado com o passar dos dias',
  calcularSla('2026-08-31', 7, '2026-09-08', '2027-06-01')?.saldo,
  calcularSla('2026-08-31', 7, '2026-09-08', '2026-09-09')?.saldo,
);
conferir('sem categoria não há SLA', calcularSla('2026-08-31', null, null, '2026-09-10'), null);

console.log('\nRegionais e escolas');
conferir('SJP existe', REGIONAIS.SJP?.nome, 'São José dos Pinhais');
conferir('são 4 regionais', SIGLAS.length, 4);
conferir('CWT tem 7 escolas', escolasDaRegional('CWT').length, 7);
conferir('sem regional, sugere todas as escolas', escolasDaRegional(null).length, 22);
conferir('nome por extenso vira sigla', normalizarRegional('São José dos Pinhais'), 'SJP');
conferir('sem acento também', normalizarRegional('sao jose dos pinhais'), 'SJP');
conferir('sigla continua sigla', normalizarRegional('sjp'), 'SJP');
// Regional desconhecida volta como veio: sumir da tela seria pior que aparecer errada.
conferir('regional desconhecida não é apagada', normalizarRegional('Regional Norte'), 'Regional Norte');
conferir('vazio vira null', normalizarRegional('   '), null);
conferir('escola digitada em caixa mista acha a canonica', normalizarEscola('SJP', 'Tarsila do Amaral'), 'TARSILA DO AMARAL');
conferir('sem acento tambem', normalizarEscola('CWT', 'joao mazzarotto'), 'JOAO MAZZAROTTO');
// A lista pode estar incompleta: escola nova e gravada como veio, sem travar.
conferir('escola fora da lista passa como veio', normalizarEscola('CWT', 'Escola Nova'), 'Escola Nova');
conferir('escola certa com regional errada ainda normaliza', normalizarEscola('CWT', 'anita canet'), 'ANITA CANET');
// A lista de escolas e fechada: cidade do nome da vaga na Gupy nao e escola.
conferir('escola da lista e valida', escolaValida('TARSILA DO AMARAL'), true);
conferir('cidade nao e escola', escolaValida('Fazenda Rio Grande'), false);
conferir('escola em branco e valida (vaga da regional inteira)', escolaValida(null), true);

/* ------------------------------------------------------------------------ */

console.log('\nO painel de SLA: recorte, resumo e agrupamento');

function vagaFalsa(parcial: Partial<VagaPipefyComNumeros>): VagaPipefyComNumeros {
  return {
    id: 1, card_id: '1', titulo: 'Vaga', categoria: null, funcao: null, sla: null,
    regional: null, unidade: null, aberta_em: '2026-08-31', fechada_em: null,
    situacao: 'aberta', vaga_codigo: null, observacao: null,
    criada_em: '2026-08-31T00:00:00.000Z', atualizada_em: '2026-08-31T00:00:00.000Z',
    dias: 0, gupy_nome: null, candidatos: null, candidatosAntes: null, encerrados: null,
    ...parcial,
  };
}

const HOJE = '2026-09-14';
const prof = (fechada: string | null) => calcularSla('2026-08-31', 7, fechada, HOJE);
const adm = (fechada: string | null) => calcularSla('2026-08-31', 15, fechada, HOJE);

const CARTEIRA = [
  // Professores: uma aberta atrasada (9 úteis de 7) e duas fechadas.
  vagaFalsa({ card_id: 'P1', situacao: 'aberta', categoria: 'Vagas Professores', funcao: 'PROFESSOR(A)',
              regional: 'CWT', unidade: 'IVO LEAO', dias: 14, sla: prof(null), vaga_codigo: 'V1', candidatos: 20 }),
  vagaFalsa({ card_id: 'P2', situacao: 'fechada', categoria: 'Vagas Professores', funcao: 'PROFESSOR(A)',
              regional: 'CWT', unidade: 'IVO LEAO', dias: 8, sla: prof('2026-09-08') }),
  vagaFalsa({ card_id: 'P3', situacao: 'fechada', categoria: 'Vagas Professores', funcao: 'PAC',
              regional: 'SJP', unidade: 'ANITA CANET', dias: 14, sla: prof('2026-09-14') }),
  // Administrativa aberta e no prazo.
  vagaFalsa({ card_id: 'A1', situacao: 'aberta', categoria: 'Vagas Administrativas', funcao: 'Auxiliar Adm',
              regional: 'SJP', unidade: 'ANITA CANET', dias: 14, sla: adm(null), vaga_codigo: 'V2', candidatos: 30 }),
  // Sem categoria: aparece no total de abertas, mas fora das médias.
  vagaFalsa({ card_id: 'S1', situacao: 'aberta', regional: 'CWT', dias: 40 }),
  // Cancelada: fora de tudo que mede prazo.
  vagaFalsa({ card_id: 'C1', situacao: 'cancelada', categoria: 'Vagas Professores', regional: 'CWT' }),
];

const r = resumirSla(CARTEIRA);
conferir('conta as abertas, inclusive a sem categoria', r.abertas, 3);
conferir('e sinaliza a sem categoria', r.semCategoria, 1);
conferir('a média em dias úteis ignora a sem categoria', r.mediaUteisAbertas, 9);
conferir('a média em dias corridos inclui todas as abertas', r.mediaCorridosAbertas, 23);
conferir('uma aberta está fora do prazo', r.foraDoPrazo, 1);
conferir('duas fechadas', r.fechadas, 2);
// P2 levou 5 úteis e P3 levou 9 (o 7/9 caiu no meio dos dois): média 7.
conferir('média até fechar', r.mediaUteisParaFechar, 7);
conferir('uma aberta sem vínculo com a Gupy', r.semVinculo, 1);
conferir('candidatos somam as vinculadas', r.candidatos, 50);
conferir('a mais antiga é a de 40 dias corridos', r.maisAntiga?.card_id, 'S1');

const cat = porCategoria(CARTEIRA);
const professores = cat.find((l) => l.categoria === 'Vagas Professores');
conferir('professores: 1 aberta', professores?.abertas, 1);
conferir('professores: prazo 7', professores?.sla, 7);
conferir('professores: média 9 dias úteis nas abertas', professores?.mediaUteis, 9);
conferir('professores: 1 fora do prazo', professores?.foraDoPrazo, 1);
conferir('professores: média das fechadas', professores?.mediaUteisFechadas, 7);
const semCat = cat.find((l) => l.categoria === '(não informado)');
conferir('vaga sem categoria vira um grupo próprio, não some', semCat?.abertas, 1);
conferir('e esse grupo não tem prazo', semCat?.sla, null);

const soCwt = filtrar(CARTEIRA, { regional: 'CWT', unidade: '', categoria: '' });
conferir('recorte por regional', soCwt.length, 4);
const soIvoLeao = filtrar(CARTEIRA, { regional: 'CWT', unidade: 'IVO LEAO', categoria: '' });
conferir('recorte por escola', soIvoLeao.length, 2);
const soProf = filtrar(CARTEIRA, { regional: '', unidade: '', categoria: 'Vagas Professores' });
conferir('recorte por categoria', soProf.length, 4);

conferir('as regionais do filtro', opcoes(CARTEIRA, 'regional', SEM_RECORTE).join(','), 'CWT,SJP');
// A lista de escolas respeita a regional escolhida: oferecer escola de outra
// regional só produziria recortes vazios.
conferir(
  'as escolas seguem a regional escolhida',
  opcoes(CARTEIRA, 'unidade', { regional: 'SJP', unidade: '', categoria: '' }).join(','),
  'ANITA CANET',
);
conferir(
  'a opção sem informação fica por último',
  opcoes(CARTEIRA, 'unidade', SEM_RECORTE).at(-1),
  '(não informado)',
);

const urgencia = porUrgencia(CARTEIRA);
conferir('a fila só traz abertas', urgencia.length, 3);
conferir('a mais atrasada vem primeiro', urgencia[0]?.card_id, 'P1');
conferir('a sem prazo vai para o fim', urgencia.at(-1)?.card_id, 'S1');

console.log(falhas === 0 ? '\nTodos os testes passaram.\n' : `\n${falhas} teste(s) falharam.\n`);
process.exitCode = falhas === 0 ? 0 : 1;

/* ------------------------------------------------------------------------ */

console.log('\nContas de acesso');

// As contas saem do ambiente, entao o teste monta o ambiente que quer conferir.
const salvo = {
  u: process.env.DASH_USUARIO,
  s: process.env.DASH_SENHA,
  m: process.env.DASH_USUARIOS,
};
process.env.DASH_USUARIO = 'admin@apggov.com.br';
process.env.DASH_SENHA = 'senha-do-admin';
process.env.DASH_USUARIOS = 'recrutamento@apggov.com.br:senha-do-rs\ncoordenacao@apggov.com.br:terceira';

conferir('ha credenciais configuradas', temCredenciais(), true);
conferir(
  'a conta principal entra',
  conferirCredenciais('admin@apggov.com.br', 'senha-do-admin'),
  'admin@apggov.com.br',
);
conferir(
  'a segunda conta entra',
  conferirCredenciais('recrutamento@apggov.com.br', 'senha-do-rs'),
  'recrutamento@apggov.com.br',
);
conferir(
  'a terceira tambem (separadas por quebra de linha)',
  conferirCredenciais('coordenacao@apggov.com.br', 'terceira'),
  'coordenacao@apggov.com.br',
);
conferir(
  'caixa alta no e-mail nao separa a mesma pessoa',
  conferirCredenciais('Recrutamento@APGGov.com.br', 'senha-do-rs'),
  'recrutamento@apggov.com.br',
);
conferir(
  'devolve o e-mail canonico, nao o digitado',
  conferirCredenciais('  ADMIN@apggov.com.br  ', 'senha-do-admin'),
  'admin@apggov.com.br',
);

console.log('\nO que NAO pode entrar');
conferir('senha de outra conta', conferirCredenciais('admin@apggov.com.br', 'senha-do-rs'), null);
conferir('usuario inexistente', conferirCredenciais('ninguem@apggov.com.br', 'senha-do-rs'), null);
conferir('senha vazia', conferirCredenciais('admin@apggov.com.br', ''), null);
conferir('senha com caixa trocada', conferirCredenciais('admin@apggov.com.br', 'SENHA-DO-ADMIN'), null);

// Senha com ":" precisa sobreviver: o corte e no PRIMEIRO dois-pontos.
process.env.DASH_USUARIOS = 'x@apggov.com.br:a:b:c';
conferir('senha com dois-pontos', conferirCredenciais('x@apggov.com.br', 'a:b:c'), 'x@apggov.com.br');

// Sem nenhuma conta, o dash tem de se recusar a subir em producao.
delete process.env.DASH_USUARIO;
delete process.env.DASH_SENHA;
delete process.env.DASH_USUARIOS;
conferir('sem conta nenhuma, nao ha credencial', temCredenciais(), false);
conferir('e ninguem entra', conferirCredenciais('admin@apggov.com.br', 'senha-do-admin'), null);

process.env.DASH_USUARIO = salvo.u;
process.env.DASH_SENHA = salvo.s;
process.env.DASH_USUARIOS = salvo.m;

/* ------------------------------------------------------------------------ */

console.log('\nVários cards na mesma vaga da Gupy');

/*
  A Gupy publica por CIDADE e o R&S abre um card por UNIDADE, então a mesma
  publicação atende várias escolas — e os candidatos dela são um pool dividido
  entre elas, não uma fila por escola.
*/
const MESMA_CIDADE = [
  vagaFalsa({ card_id: 'C1', vaga_codigo: 'CWB-MAT', candidatos: 500 }),
  vagaFalsa({ card_id: 'C2', vaga_codigo: 'CWB-MAT', candidatos: 500 }),
  vagaFalsa({ card_id: 'C3', vaga_codigo: 'CWB-MAT', candidatos: 500 }),
  vagaFalsa({ card_id: 'C4', vaga_codigo: 'SJP-MAT', candidatos: 120 }),
  vagaFalsa({ card_id: 'C5', vaga_codigo: null, candidatos: null }),
];

const compartilhado = resumirSla(MESMA_CIDADE);
conferir('cada card continua sendo uma vaga aberta', compartilhado.abertas, 5);
// 500 uma vez (e não três) + 120. Somar por card daria 1.620 candidatos que
// não existem — é o erro que este teste existe para impedir.
conferir('o total soma o pool UMA vez por publicação', compartilhado.candidatos, 620);
conferir('card sem vínculo não soma nada', compartilhado.semVinculo, 1);
conferir(
  'e um card sozinho continua somando normalmente',
  resumirSla([MESMA_CIDADE[3]]).candidatos,
  120,
);
