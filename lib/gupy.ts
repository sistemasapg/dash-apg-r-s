import {
  estaEncerrado,
  etapaDoFunil,
  normalizar,
  ordemEtapa,
  paraDataISO,
} from './mapping.ts';
import type { LinhaNormalizada, VagaSnapshot } from './types.ts';

const BASE = process.env.GUPY_API_BASE ?? 'https://api.gupy.io';
const POR_PAGINA = Number(process.env.GUPY_POR_PAGINA ?? 100);
// Sem recorte de praça, o sync da APG passa por centenas de vagas. A Gupy
// aceita 500 req/min por IP; 6 em paralelo encurta o sync e continua longe do teto.
const CONCORRENCIA = Number(process.env.GUPY_CONCORRENCIA ?? 6);

/**
 * Status de vaga que ENTRAM no acompanhamento. Lista de permissão, não de
 * bloqueio: o dash da APG acompanha só o que está no ar, e um status novo que a
 * Gupy invente amanhã fica de fora sozinho, em vez de entrar sem ninguém notar.
 */
const STATUS_PERMITIDOS = (process.env.GUPY_STATUS_VAGA ?? 'published')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export class ErroGupy extends Error {
  // Campos declarados no corpo (e não como parâmetros do construtor) porque
  // os scripts rodam direto no Node, que só remove tipos — não transpila.
  status: number | undefined;
  corpo: string | undefined;

  constructor(message: string, status?: number, corpo?: string) {
    super(message);
    this.name = 'ErroGupy';
    this.status = status;
    this.corpo = corpo;
  }
}

function token(): string {
  const t = process.env.GUPY_TOKEN?.trim();
  if (!t) {
    throw new ErroGupy(
      'GUPY_TOKEN não configurado. Gere o token em SETUP > Configurações Avançadas > ' +
        'Geração de Tokens na Gupy e coloque em .env.local',
    );
  }
  return t;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A Gupy limita a 500 req/min por IP e devolve 429 ao estourar. Também tratamos
 * 5xx como transitório, porque uma falha isolada não deve derrubar o sync inteiro.
 */
async function requisitar<T = unknown>(
  caminho: string,
  params: Record<string, string | number | undefined> = {},
  tentativa = 1,
): Promise<T> {
  const url = new URL(caminho, BASE);
  for (const [chave, valor] of Object.entries(params)) {
    if (valor !== undefined) url.searchParams.set(chave, String(valor));
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      headers: { Authorization: `Bearer ${token()}`, Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch (erro) {
    if (tentativa <= 4) {
      await espera(500 * 2 ** tentativa);
      return requisitar<T>(caminho, params, tentativa + 1);
    }
    throw new ErroGupy(`Falha de rede ao chamar ${url.pathname}: ${(erro as Error).message}`);
  }

  if (resposta.status === 429 || resposta.status >= 500) {
    if (tentativa <= 5) {
      await espera(Math.min(30_000, 1_000 * 2 ** tentativa));
      return requisitar<T>(caminho, params, tentativa + 1);
    }
  }

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => '');
    const dica =
      resposta.status === 401
        ? ' — token inválido ou ausente.'
        : resposta.status === 403
          ? ' — o token existe mas não tem permissão para este endpoint. Habilite a permissão na tela de geração de tokens.'
          : '';
    throw new ErroGupy(
      `Gupy respondeu ${resposta.status} em ${url.pathname}${dica}`,
      resposta.status,
      corpo.slice(0, 500),
    );
  }

  return (await resposta.json()) as T;
}

/** Acesso cru ao endpoint, para scripts de diagnóstico. */
export function requisitarBruto(
  caminho: string,
  params: Record<string, string | number | undefined> = {},
): Promise<unknown> {
  return requisitar(caminho, params);
}

type Bruto = Record<string, unknown>;

/** A resposta da Gupy varia entre `data` e `results`; aceitamos as duas formas. */
function extrairLista(corpo: unknown): Bruto[] {
  if (Array.isArray(corpo)) return corpo as Bruto[];
  const c = (corpo ?? {}) as Bruto;
  for (const chave of ['data', 'results', 'items', 'content']) {
    if (Array.isArray(c[chave])) return c[chave] as Bruto[];
  }
  return [];
}

function extrairTotal(corpo: unknown): number | null {
  const c = (corpo ?? {}) as Bruto;
  const summary = (c.summary ?? {}) as Bruto;
  for (const valor of [c.totalResults, c.total, summary.total, summary.totalResults]) {
    if (typeof valor === 'number') return valor;
  }
  return null;
}

/** Percorre todas as páginas de um endpoint até acabar. */
async function paginar(
  caminho: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Bruto[]> {
  const acumulado: Bruto[] = [];
  let pagina = 1;

  // Trava de segurança: se a API ignorar o parâmetro de página, o loop pararia
  // apenas quando a lista viesse vazia — o que pode nunca acontecer.
  const MAX_PAGINAS = 500;

  while (pagina <= MAX_PAGINAS) {
    const corpo = await requisitar(caminho, { ...params, page: pagina, perPage: POR_PAGINA });
    const lote = extrairLista(corpo);
    acumulado.push(...lote);

    const total = extrairTotal(corpo);
    if (lote.length === 0) break;
    if (total !== null && acumulado.length >= total) break;
    if (lote.length < POR_PAGINA) break;

    pagina += 1;
  }

  return acumulado;
}

/** Roda as tarefas com concorrência limitada, para não estourar o rate limit. */
async function emLotes<T, R>(itens: T[], limite: number, tarefa: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = new Array(itens.length);
  let cursor = 0;

  const trabalhador = async () => {
    while (cursor < itens.length) {
      const indice = cursor++;
      saida[indice] = await tarefa(itens[indice]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limite, itens.length) }, trabalhador));
  return saida;
}

function txt(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const s = String(valor).trim();
  return s === '' ? null : s;
}

/** Lê um caminho aninhado sem quebrar quando o campo não existe. */
function caminhoDe(obj: Bruto, ...caminhos: string[]): string | null {
  for (const caminho of caminhos) {
    let atual: unknown = obj;
    for (const parte of caminho.split('.')) {
      if (atual === null || typeof atual !== 'object') {
        atual = undefined;
        break;
      }
      atual = (atual as Bruto)[parte];
    }
    const valor = txt(atual);
    if (valor) return valor;
  }
  return null;
}

export interface VagaGupy {
  id: string;
  codigo: string;
  nome: string;
  status: string | null;
  unidade: string | null;
  departamento: string | null;
  funcao: string | null;
  tipo: string | null;
  posicoes: number | null;
  criadaEm: string | null;
  /**
   * A API de vagas desta conta não devolve responsável — fica nulo. Os caminhos
   * seguem aqui porque outras contas da Gupy expõem o campo.
   */
  recrutador: string | null;
}

/** Tipos de vaga vêm como `vacancy_type_lecturer`; viram texto de gente. */
function tipoLegivel(bruto: string | null): string | null {
  if (!bruto) return null;
  const limpo = bruto.replace(/^vacancy_type_/, '').replace(/[_-]+/g, ' ').trim();
  const traducoes: Record<string, string> = {
    lecturer: 'Docente',
    effective: 'Efetiva',
    temporary: 'Temporária',
    apprentice: 'Aprendiz',
    internship: 'Estágio',
    talent_pool: 'Banco de talentos',
    outsource: 'Terceirizada',
    freelancer: 'Freelancer',
  };
  const chave = bruto.replace(/^vacancy_type_/, '').toLowerCase();
  return traducoes[chave] ?? limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

function inteiro(valor: string | null): number | null {
  if (valor === null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

export async function listarVagas(): Promise<VagaGupy[]> {
  const brutas = await paginar('/api/v1/jobs');

  return brutas
    .map((j) => ({
      id: caminhoDe(j, 'id') ?? '',
      codigo: caminhoDe(j, 'code', 'id') ?? '',
      nome: caminhoDe(j, 'name', 'title', 'role.name') ?? 'Vaga sem nome',
      status: caminhoDe(j, 'status', 'jobStatus'),
      unidade: caminhoDe(j, 'branchName', 'branch.name'),
      departamento: caminhoDe(j, 'departmentName', 'department.name'),
      funcao: caminhoDe(j, 'roleName', 'role.name'),
      tipo: tipoLegivel(caminhoDe(j, 'type', 'vacancyType')),
      posicoes: inteiro(caminhoDe(j, 'numVacancies', 'vacancies', 'openings')),
      criadaEm: paraDataISO(caminhoDe(j, 'createdAt', 'publishedAt')),
      recrutador: caminhoDe(j, 'recruiter.name', 'recruiterName', 'owner.name', 'responsible.name'),
    }))
    .filter((v) => v.id !== '');
}

/**
 * Vaga sem status vem de resposta incompleta da API, não de vaga publicada —
 * incluí-la traria rascunho e vaga encerrada de volta pela porta dos fundos.
 */
export function vagaAtiva(vaga: VagaGupy): boolean {
  if (STATUS_PERMITIDOS.length === 0) return true;
  if (!vaga.status) return false;
  return STATUS_PERMITIDOS.includes(vaga.status.toLowerCase());
}

/**
 * Recorte por nome de vaga, para acompanhar só uma unidade ou praça.
 * Aceita vários termos separados por vírgula (basta um casar) e ignora
 * acento e maiúscula: "joinville" casa com "Joinville".
 */
const TERMOS_FILTRO = (process.env.GUPY_FILTRO_VAGA ?? '')
  .split(',')
  .map((t) => normalizar(t))
  .filter(Boolean);

/**
 * O contrário: nomes que ficam DE FORA. Joinville tem dash próprio
 * (dash-rs-instituto) e acompanhar a praça duas vezes só duplicaria trabalho e
 * confundiria o número total.
 *
 * A exclusão é avaliada DEPOIS da inclusão e ganha dela: se um termo entrar nas
 * duas listas, a vaga fica de fora. É a leitura mais segura — o recorte que
 * exclui existe para proteger o número, não para competir com o que inclui.
 */
const TERMOS_EXCLUIDOS = (process.env.GUPY_EXCLUIR_VAGA ?? 'Joinville')
  .split(',')
  .map((t) => normalizar(t))
  .filter(Boolean);

export function vagaSelecionada(vaga: VagaGupy): boolean {
  const nome = normalizar(vaga.nome);
  if (TERMOS_EXCLUIDOS.some((termo) => nome.includes(termo))) return false;
  if (TERMOS_FILTRO.length === 0) return true;
  return TERMOS_FILTRO.some((termo) => nome.includes(termo));
}

export const filtroAtivo = TERMOS_FILTRO.length > 0 ? TERMOS_FILTRO.join(', ') : null;
export const exclusaoAtiva = TERMOS_EXCLUIDOS.length > 0 ? TERMOS_EXCLUIDOS.join(', ') : null;
export const statusAtivo = STATUS_PERMITIDOS.length > 0 ? STATUS_PERMITIDOS.join(', ') : null;

/**
 * `fields=all` não é luxo: no retorno padrão a Gupy OMITE o campo `status`, e
 * sem ele não dá para saber quem foi reprovado, desistiu ou foi contratado —
 * todo mundo pareceria ativo. O `all` também traz `source` (origem) e
 * `vacancyCode`.
 */
const CAMPOS = process.env.GUPY_CAMPOS ?? 'all';

export async function listarCandidaturas(jobId: string): Promise<Bruto[]> {
  return paginar(`/api/v1/jobs/${encodeURIComponent(jobId)}/applications`, {
    fields: CAMPOS || undefined,
  });
}

/**
 * A Gupy guarda nome e sobrenome separados. Usar só `name` deixava a lista com
 * "Beatriz" e "Lucas" soltos, sem sobrenome para diferenciar homônimos.
 */
function nomeCompleto(c: Bruto): string | null {
  const nome = caminhoDe(c, 'candidate.name', 'candidateName', 'name');
  const sobrenome = caminhoDe(c, 'candidate.lastName', 'candidateLastName', 'lastName');
  if (!nome) return sobrenome;
  if (!sobrenome) return nome;
  // Algumas contas já gravam o nome inteiro no primeiro campo.
  if (nome.toLowerCase().endsWith(sobrenome.toLowerCase())) return nome;
  return `${nome} ${sobrenome}`;
}

/** Nomes de origem vêm em snake_case da Gupy; aqui viram texto de gente. */
const ORIGENS: Record<string, string> = {
  portal_de_vagas_da_gupy: 'Portal de vagas Gupy',
  gupy_portal: 'Portal de vagas Gupy',
  site_de_carreiras: 'Site de carreiras',
  linkedin: 'LinkedIn',
  whatsapp: 'WhatsApp',
  indeed: 'Indeed',
  google: 'Google',
  facebook: 'Facebook',
  instagram: 'Instagram',
  indicacao: 'Indicação',
  referral: 'Indicação',
  vagas_com: 'Vagas.com',
  infojobs: 'InfoJobs',
  catho: 'Catho',
};

function origemLegivel(bruto: string | null): string | null {
  if (!bruto) return null;
  const chave = bruto.trim().toLowerCase();
  if (ORIGENS[chave]) return ORIGENS[chave];
  // Fallback: troca separadores por espaço e sobe a primeira letra.
  const limpo = chave.replace(/[_-]+/g, ' ').trim();
  return limpo.charAt(0).toUpperCase() + limpo.slice(1);
}

/** Traduz o status da Gupy para algo que o R&S lê sem manual. */
function statusLegivel(status: string | null): string | null {
  switch (status?.toLowerCase()) {
    case 'in_process':
      return 'Em processo';
    case 'reproved':
      return 'Reprovado';
    case 'give_up':
      return 'Desistiu';
    case 'hired':
      return 'Contratado';
    default:
      return status;
  }
}

export interface ResultadoColeta {
  linhas: LinhaNormalizada[];
  vagas: VagaSnapshot[];
  vagasConsultadas: number;
  /** Fora do status permitido (não publicadas). */
  vagasIgnoradas: number;
  /** Publicadas, mas descartadas pelo recorte de nome (ex.: Joinville). */
  vagasForaDoFiltro: number;
  erros: { vaga: string; mensagem: string }[];
}

/**
 * Monta a foto do momento: todas as candidaturas das vagas ativas, já no
 * formato que o banco guarda.
 */
export async function coletarSnapshot(
  aoProgredir?: (feito: number, total: number, vaga: string) => void,
): Promise<ResultadoColeta> {
  const todas = await listarVagas();
  const abertas = todas.filter(vagaAtiva);
  const ativas = abertas.filter(vagaSelecionada);
  const erros: { vaga: string; mensagem: string }[] = [];
  let feito = 0;

  const porVaga = await emLotes(ativas, CONCORRENCIA, async (vaga) => {
    try {
      const candidaturas = await listarCandidaturas(vaga.id);
      return candidaturas.map((c): LinhaNormalizada => {
        const etapa = caminhoDe(c, 'currentStep.name', 'step.name', 'currentStepName') ?? 'Sem etapa';
        const status = statusLegivel(caminhoDe(c, 'status'));
        const identidade =
          caminhoDe(c, 'id', 'candidate.id', 'candidate.email') ?? `${vaga.id}-sem-id`;

        const etapaFunil = etapaDoFunil(etapa, status);

        return {
          chave: `${vaga.codigo}::${identidade}`.toLowerCase(),
          vaga_codigo: vaga.codigo,
          vaga_nome: vaga.nome,
          etapa,
          etapa_funil: etapaFunil,
          ordem_etapa: ordemEtapa(etapaFunil),
          status,
          candidato_nome: nomeCompleto(c),
          candidato_email: caminhoDe(c, 'candidate.email', 'candidateEmail', 'email'),
          origem: origemLegivel(caminhoDe(c, 'source', 'origin', 'candidate.source')),
          recrutador: vaga.recrutador,
          aplicou_em: paraDataISO(caminhoDe(c, 'createdAt', 'appliedAt', 'candidate.createdAt')),
          atualizado_em: paraDataISO(caminhoDe(c, 'updatedAt', 'lastUpdatedAt')),
          encerrado: estaEncerrado(etapa, status),
        };
      });
    } catch (erro) {
      erros.push({ vaga: vaga.nome, mensagem: (erro as Error).message });
      return [];
    } finally {
      feito += 1;
      aoProgredir?.(feito, ativas.length, vaga.nome);
    }
  });

  return {
    linhas: porVaga.flat(),
    vagas: ativas.map((v) => ({
      vaga_codigo: v.codigo,
      vaga_nome: v.nome,
      status: v.status,
      unidade: v.unidade,
      departamento: v.departamento,
      funcao: v.funcao,
      tipo: v.tipo,
      posicoes: v.posicoes,
      criada_em: v.criadaEm,
    })),
    vagasConsultadas: ativas.length,
    vagasIgnoradas: todas.length - abertas.length,
    vagasForaDoFiltro: abertas.length - ativas.length,
    erros,
  };
}
