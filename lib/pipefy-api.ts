/**
 * Cliente da API GraphQL do Pipefy.
 *
 * Existe para o dash parar de depender de digitação: os cards de vaga do R&S
 * vêm do próprio Pipefy, e não de alguém preenchendo oito campos à mão.
 *
 * O que ele NÃO busca, de propósito: `phases_history`. O SLA daqui é contado da
 * data de abertura até o fechamento, não por tempo em cada fase — pedir o
 * histórico engordaria cada resposta sem alimentar nenhum número da tela.
 */

const ENDPOINT = 'https://api.pipefy.com/graphql';

/** O pipe de R&S da APG. */
const PIPE_ID = process.env.PIPEFY_PIPE_ID ?? '305884324';

/** A API pagina em no máximo 50 por chamada. */
const POR_PAGINA = 50;

export class ErroPipefy extends Error {
  corpo: string | undefined;

  constructor(message: string, corpo?: string) {
    super(message);
    this.name = 'ErroPipefy';
    this.corpo = corpo;
  }
}

function token(): string {
  const t = process.env.PIPEFY_TOKEN?.trim();
  if (!t) {
    throw new ErroPipefy(
      'PIPEFY_TOKEN não configurado. Gere em Configurações > Tokens de API no ' +
        'Pipefy e coloque em .env.local',
    );
  }
  return t;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function consultar<T>(query: string, tentativa = 1): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    });
  } catch (erro) {
    if (tentativa <= 4) {
      await espera(500 * 2 ** tentativa);
      return consultar<T>(query, tentativa + 1);
    }
    throw new ErroPipefy(`Falha de rede ao chamar o Pipefy: ${(erro as Error).message}`);
  }

  if (resposta.status === 429 || resposta.status >= 500) {
    if (tentativa <= 5) {
      await espera(Math.min(30_000, 1_000 * 2 ** tentativa));
      return consultar<T>(query, tentativa + 1);
    }
  }

  const texto = await resposta.text();

  if (!resposta.ok) {
    const dica = resposta.status === 401 ? ' — token inválido ou expirado.' : '';
    throw new ErroPipefy(`Pipefy respondeu ${resposta.status}${dica}`, texto.slice(0, 400));
  }

  const corpo = JSON.parse(texto) as { data?: T; errors?: { message: string }[] };

  /*
    O GraphQL responde 200 mesmo quando a consulta falha — o erro vem no corpo.
    Sem esta checagem, um token sem permissão viraria "nenhum card encontrado",
    e o sync apagaria o cadastro inteiro achando que o pipe esvaziou.
  */
  if (corpo.errors?.length) {
    throw new ErroPipefy(
      `Pipefy recusou a consulta: ${corpo.errors.map((e) => e.message).join('; ')}`,
      texto.slice(0, 400),
    );
  }
  if (!corpo.data) throw new ErroPipefy('Pipefy respondeu sem dados.', texto.slice(0, 400));

  return corpo.data;
}

export interface CampoPipefy {
  name: string;
  value: string | null;
}

export interface CardPipefy {
  id: string;
  title: string;
  createdAt: string | null;
  finished_at: string | null;
  due_date: string | null;
  late: boolean | null;
  current_phase: { name: string } | null;
  fields: CampoPipefy[];
}

interface RespostaCards {
  allCards: {
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
    edges: { node: CardPipefy }[];
  };
}

/** Todos os cards do pipe, paginando até acabar. */
export async function buscarTodosOsCards(
  aoProgredir?: (lidos: number) => void,
): Promise<CardPipefy[]> {
  const todos: CardPipefy[] = [];
  let cursor: string | null = null;

  // Trava de segurança: se a paginação devolver sempre o mesmo cursor, o laço
  // só pararia quando a lista viesse vazia — o que pode nunca acontecer.
  const MAX_PAGINAS = 200;

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const after: string = cursor ? `, after: "${cursor}"` : '';
    const dados: RespostaCards = await consultar<RespostaCards>(`{
      allCards(pipeId: ${PIPE_ID}, first: ${POR_PAGINA}${after}) {
        pageInfo { hasNextPage endCursor }
        edges { node {
          id
          title
          createdAt
          finished_at
          due_date
          late
          current_phase { name }
          fields { name value }
        } }
      }
    }`);

    todos.push(...dados.allCards.edges.map((e) => e.node));
    aoProgredir?.(todos.length);

    if (!dados.allCards.pageInfo.hasNextPage) break;
    cursor = dados.allCards.pageInfo.endCursor;
  }

  return todos;
}

/**
 * O valor de um campo do card, pelo nome, ignorando caixa e espaço sobrando.
 *
 * Aceita vários nomes e devolve o primeiro que tiver conteúdo: o cargo, por
 * exemplo, mora em três campos diferentes conforme a categoria da vaga
 * (administrativo, pedagógico ou professor), e só um deles vem preenchido.
 */
export function campo(card: CardPipefy, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const alvo = nome.trim().toLowerCase();
    const achado = card.fields.find((f) => (f.name ?? '').trim().toLowerCase() === alvo);
    const valor = achado?.value?.trim();
    if (valor) return valor;
  }
  return null;
}
