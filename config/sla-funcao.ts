import { CATEGORIAS } from './categorias.ts';

/**
 * Prazo próprio de uma função, quando ela não deve ser cobrada no prazo da
 * categoria dela.
 *
 * O padrão é a função **herdar** o SLA da sua categoria, e é assim que deve
 * continuar enquanto o R&S não decidir o contrário: uma exceção aqui é um
 * número que alguém vai ter que defender depois. O mapa começa vazio de
 * propósito.
 *
 * A tela "SLA por função" mostra a mediana medida de cada função ao lado do
 * prazo em vigor — é de lá que sai a conversa sobre quais merecem exceção.
 *
 * A chave é o nome do cargo **como o Pipefy escreve**, em maiúsculas e com a
 * pontuação que ele usa. Veja a nota sobre vocabulário no fim deste arquivo.
 */
export const SLA_POR_FUNCAO: Record<string, number> = {
  // 'PEDAGOGO(A)-SAREH': 20,
};

/**
 * O prazo que vale para uma função, em dias úteis.
 *
 * Devolve `null` quando a categoria é desconhecida e não há exceção — sem régua
 * combinada, a tela mostra o tempo medido e não acusa atraso. Chutar um prazo
 * seria pior: o painel passaria a cobrar contra um número que ninguém decidiu.
 */
export function slaDaFuncao(
  funcao: string,
  categoria: string | null,
  /*
    O prazo da categoria entra por parâmetro para este arquivo não precisar
    conhecer o banco: ele é configuração pura, importado inclusive por
    componentes de tela. Quem chama resolve o prazo com `lib/prazos.ts` e passa
    o número pronto.
  */
  prazoDaCategoria?: (categoria: string | null) => number | null,
): number | null {
  const excecao = SLA_POR_FUNCAO[funcao];
  if (excecao !== undefined) return excecao;
  if (!categoria) return null;
  if (prazoDaCategoria) return prazoDaCategoria(categoria);
  return CATEGORIAS[categoria]?.slaDiasUteis ?? null;
}

/** A função tem prazo próprio, em vez de herdar o da categoria? */
export function temPrazoProprio(funcao: string): boolean {
  return SLA_POR_FUNCAO[funcao] !== undefined;
}

/**
 * Abaixo de quantas vagas fechadas a mediana não sustenta uma decisão.
 *
 * Não é estatística fina, é bom senso: com duas vagas fechadas a "mediana" é a
 * média de duas, e uma delas atípica move o número inteiro. A tela mostra o
 * valor de qualquer jeito — esconder dado não ajuda ninguém — mas marca quais
 * leituras são finas, para ninguém mudar um prazo com base em n=1.
 */
export const MINIMO_PARA_CONFIAR = 5;

/*
  NOTA SOBRE VOCABULÁRIO — leia antes de mexer nas listas de função.

  Existem hoje DOIS vocabulários de função, e eles não casam:

  1. `CATEGORIAS[...].funcoes` em `config/categorias.ts` alimenta o formulário
     da aba "Vagas R&S", onde o R&S digita. Usa nomes curtos: "ASG",
     "Auxiliar Adm", "PAE", "Inspetor de Aluno".

  2. O relatório do Pipefy traz o cargo escrito por extenso e em maiúsculas:
     "AUXILIAR SERVIÇOS GERAIS", "AUXILIAR ADMINISTRATIVO",
     "PROFISSIONAL DE APOIO ESCOLAR - PAE", "INSPETOR DE ALUNOS".

  Das 22 funções da lista do dash, 7 casam com o Pipefy. Esta tela usa o
  vocabulário do PIPEFY, porque é de lá que vem o dado medido — e não força um
  de-para que ninguém decidiu. Unificar os dois é decisão do R&S, não de código:
  envolve dizer que "ASG" e "AUXILIAR SERVIÇOS GERAIS" são a mesma função, e
  escolher qual nome fica.

  Enquanto não unificar, a regra é: quem digita vê a lista do dash; quem mede vê
  o nome do Pipefy.
*/

/**
 * Como a tela chama o card sem cargo preenchido.
 *
 * Mora na configuração, e não em `lib/sla-funcao.ts`, porque o componente de
 * tela precisa dele — e importar um valor de um módulo do servidor arrasta
 * junto tudo o que ele importa. Já aconteceu: bastou `lib/sla-funcao.ts` passar
 * a ler os prazos do banco para o bundle do cliente tentar resolver `net` e a
 * página inteira cair com erro 500.
 */
export const SEM_CARGO = '(cargo não informado)';
