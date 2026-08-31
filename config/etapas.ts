/**
 * Ordem manual das etapas do funil.
 *
 * O dash tenta adivinhar a ordem pelo nome da etapa (triagem vem antes de
 * entrevista, que vem antes de proposta). Quando a APG usa um nome que a
 * adivinhação não reconhece, a etapa cai no fim do funil — e é aqui que se
 * corrige, sem mexer em código.
 *
 * Para descobrir quais etapas estão sem regra:
 *
 *     npm run gupy:etapas
 *
 * Ele marca com "SEM REGRA" toda etapa que caiu na ordem 80.
 *
 * A escala vai de 10 (entrada) a 95 (saída do funil). A chave é o nome exato
 * como aparece na Gupy (maiúsculas e acentos são ignorados na comparação).
 */

/*
  Levantado em 28/08/2026 com `npm run gupy:etapas -- 120`: 17.328 candidaturas
  em 120 das 230 vagas publicadas.

  A conta da Gupy é a MESMA do Instituto (Joinville), então o esqueleto do funil
  — Cadastro, Triagem, Prova Online, Triagem 2, Antecedentes Criminais — é o que
  o R&S já confirmou lá, e é ele que está reproduzido aqui.

  A adivinhação automática errava três pontos, todos corrigidos abaixo:

    Triagem 2               caía em 20, junto da primeira triagem (antes da prova)
    Antecedentes Criminais  caía em 70, depois das entrevistas
    Plano B                 caía em 80, SEM REGRA, no fim do funil

  >>> O QUE AINDA PRECISA DE CONFIRMAÇÃO DO R&S DA APG <<<

  As etapas de aula teste e entrevista (55 a 62) não existem no funil de
  Joinville — são só da APG. A sequência abaixo é a leitura mais natural dos
  nomes (agendar -> agendada -> realizada), colocada depois de Antecedentes
  Criminais porque é ali que o instituto posiciona o bloco de entrevistas.

  Se o time disser outra coisa, é só trocar os números aqui.
*/
export const ORDEM_MANUAL: Record<string, number> = {
  Cadastro: 10,
  Triagem: 20,

  // As duas são a mesma fase: a Exametric é a plataforma onde a prova acontece.
  'Prova Online': 30,
  'Prova enviada na Exametric': 30,

  'Triagem 2': 40,
  'Antecedentes Criminais': 50,

  // Bloco de aula teste e entrevista — a confirmar com o R&S da APG.
  'Agendamento de Aula Teste e Entrevista': 55,
  'Aula Teste e Entrevista Agendada': 56,
  'Aula Teste e Entrevista Realizada': 57,
  'Aguardando agendamento da entrevista': 58,
  'Entrevista Agendada': 59,
  Entrevista: 60,
  'Entrevista Realizada': 62,

  /*
    Planos A e B são listas de espera, não saídas do processo. "Plano A - Banco
    de Talentos" precisa estar aqui por um motivo específico: a adivinhação lê
    "banco de talentos" como saída do funil e o jogaria para 90, no meio dos
    reprovados — o candidato continuaria contando como ativo, mas apareceria no
    fim da tela, onde ninguém o procuraria.
  */
  'Plano B': 70,
  'Plano A - Banco de Talentos': 71,

  Contratação: 75,

  // Fases de saída, criadas por `etapaDoFunil`. Ficam depois de tudo.
  Contratado: 80,
  Desistiu: 90,
  Reprovado: 95,
};

/**
 * O que acontece em cada etapa, na linguagem do R&S.
 *
 * Aparece na página "Entenda o sistema" e ao passar o mouse sobre as barras do
 * funil. Etapa sem descrição aqui é sinalizada na tela como pendente — em vez
 * de inventar um significado que ninguém confirmou.
 *
 * As quatro primeiras vêm do funil de Joinville, na mesma conta da Gupy e com o
 * mesmo significado. As etapas de aula teste e entrevista estão de propósito
 * sem descrição: só o R&S da APG sabe o que as separa.
 */
export const DESCRICOES: Record<string, string> = {
  Cadastro: 'O candidato está em processo de cadastro. Ainda não passou por análise do R&S.',
  Triagem:
    'O time de R&S analisa o cadastro e avalia se o perfil do candidato está apto para a vaga.',
  'Prova Online': 'O candidato está em processo de prova na Exametric.',
  'Prova enviada na Exametric':
    'A prova foi enviada e o dash aguarda o candidato realizá-la. Mesma fase da Prova Online.',
  'Antecedentes Criminais':
    'Consulta dos dados do candidato na Netrin, plataforma de antecedentes criminais.',

  Contratado: 'Candidato aprovado e contratado. Sai do funil ativo.',
  Desistiu: 'O próprio candidato desistiu do processo. Sai do funil ativo.',
  Reprovado:
    'Reprovado pelo R&S. Sai do funil ativo, mas a lista mostra em qual etapa a reprovação aconteceu.',
};
