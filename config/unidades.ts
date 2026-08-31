/**
 * As regionais da APG e as escolas de cada uma.
 *
 * Origem: a aba **Escola x Regional** da planilha do `pipefy-rs`
 * (`1v-9U9yGgivGThxsj0Y2qM33barb-kMprTnJ2SzJ4u00`, gid 1407033594), que é o
 * de-para que o próprio R&S mantém. Consultada em 30/08/2026.
 *
 * O `cesta_servico` tem um de-para parecido, mas contábil: ele lista centros de
 * custo (com código, e com linhas como "PESSOAL ( A RATEAR )") em vez de
 * escolas. Para o R&S, a lista boa é esta.
 *
 * ---
 *
 * NÃO CONFUNDA ESCOLA COM A CIDADE DO NOME DA VAGA. A Gupy publica por cidade
 * ("Professor de Matemática | Fazenda Rio Grande"), e essas cidades — Fazenda
 * Rio Grande, Roncador, Laranjeiras do Sul, Matinhos & Pontal, Juiz de Fora —
 * NÃO são escolas e não pertencem a esta lista. São duas dimensões diferentes:
 * a cidade é onde a vaga foi anunciada, a escola é de quem é a demanda.
 *
 * Por isso o dash nunca tenta casar escola com cidade pelo nome. O vínculo
 * entre uma vaga do R&S e a publicação da Gupy é feito à mão, pelo código da
 * vaga — e é assim que deve continuar.
 *
 * A lista abaixo está completa, confirmada com o R&S em 31/08/2026. Escola nova
 * entra aqui, e só aqui.
 */

export interface Regional {
  /** Nome por extenso, que é como aparece na tela. */
  nome: string;
  escolas: string[];
}

/** A chave é a sigla, que é como as outras ferramentas da APG gravam a regional. */
export const REGIONAIS: Record<string, Regional> = {
  CWT: {
    nome: 'Curitiba',
    escolas: [
      'DECIO DOSSI',
      'HOMERO B DE BARROS',
      'ISABEL L S SOUZA',
      'IVO LEAO',
      'JOAO DE OLIVEIRA FRANCO',
      'JOAO MAZZAROTTO',
      'SANTO AGOSTINHO',
    ],
  },
  GUA: {
    nome: 'Guarapuava',
    escolas: [
      'ANTONIO TUPY PINHEIRO',
      'CARNEIRO',
      'CRISTO REI',
      'FRANCISCO C MARTINS',
      'GILDO A SCHUCK',
      'LIANE MARTA DA COSTA',
    ],
  },
  SJP: {
    nome: 'São José dos Pinhais',
    escolas: [
      'ANITA CANET',
      'COSTA VIANA',
      'GODOFREDO MACHADO',
      'PAULO FREIRE',
      'TARSILA DO AMARAL',
      'TEREZA DA S RAMOS',
      'VICTOR DO AMARAL',
    ],
  },
  CSC: {
    nome: 'CSC / Sede',
    escolas: ['CSC', 'DIRETORIA APRENDIZAGEM E DESENVOLVIMENTO'],
  },
};

export const SIGLAS = Object.keys(REGIONAIS);

/** "CWT" -> "Curitiba (CWT)". A sigla fica visível porque é ela que se grava. */
export function rotuloRegional(sigla: string | null): string {
  if (!sigla) return '';
  const r = REGIONAIS[sigla];
  return r ? `${r.nome} (${sigla})` : sigla;
}

export function escolasDaRegional(sigla: string | null): string[] {
  if (!sigla) {
    // Sem regional escolhida, sugere todas — é melhor uma lista longa do que
    // nenhuma sugestão para quem ainda não decidiu a regional.
    return [...new Set(Object.values(REGIONAIS).flatMap((r) => r.escolas))].sort();
  }
  return REGIONAIS[sigla]?.escolas ?? [];
}

/**
 * Aceita a sigla ou o nome por extenso e devolve sempre a sigla.
 *
 * Existe porque o time já digitou "São José dos Pinhais" à mão antes de o campo
 * virar lista. Sem isso, esses cadastros virariam uma regional própria na tela,
 * paralela à SJP, e os dois grupos apareceriam separados nos relatórios.
 */
export function normalizarRegional(valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.trim();
  if (!limpo) return null;

  const chave = limpo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  if (REGIONAIS[limpo.toUpperCase()]) return limpo.toUpperCase();

  for (const [sigla, r] of Object.entries(REGIONAIS)) {
    const nome = r.nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    if (chave === nome || chave === sigla.toLowerCase()) return sigla;
  }

  // Regional desconhecida volta como veio: melhor mostrá-la errada na tela,
  // onde alguém corrige, do que apagá-la silenciosamente ao gravar.
  return limpo;
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Devolve o nome canônico da escola quando o que veio casa com a lista,
 * ignorando acento e caixa.
 *
 * Sem isso, "Tarsila do Amaral" e "TARSILA DO AMARAL" seriam duas escolas
 * diferentes nos filtros e nos agrupamentos — o painel mostraria a mesma escola
 * duas vezes, cada uma com metade das vagas. Continua valendo mesmo com o campo
 * fechado num `select`, porque há cadastro antigo gravado à mão.
 *
 * Valor fora da lista volta como veio; quem decide recusá-lo é `escolaValida`.
 */
export function normalizarEscola(regional: string | null, valor: string | null): string | null {
  if (!valor) return null;
  const limpo = valor.trim();
  if (!limpo) return null;

  const alvo = semAcento(limpo);
  const candidatas = [
    ...escolasDaRegional(regional),
    // Também procura fora da regional: se a escola veio certa mas a regional
    // está errada, é melhor gravar o nome canônico mesmo assim.
    ...escolasDaRegional(null),
  ];

  return candidatas.find((e) => semAcento(e) === alvo) ?? limpo;
}

/**
 * A escola pertence à lista?
 *
 * O campo é fechado porque a lista está completa: escola fora dela é erro de
 * digitação ou escola nova, e nos dois casos a mensagem tem de aparecer na
 * hora. Vazio é válido — é a vaga que atende a regional inteira, sem escola.
 */
export function escolaValida(valor: string | null): boolean {
  if (!valor) return true;
  return escolasDaRegional(null).includes(valor);
}
