/**
 * Modelo de edição (decisões 9 e 10), sem React: o Prompt como está no servidor (`base`) e o
 * rascunho na tela. O hash da base é o `baseHash` mandado ao salvar.
 */

/** O que o usuário edita num Prompt. */
export interface ConteudoPrompt {
  titulo: string;
  tags: string[];
  corpo: string;
}

/** O mínimo do Prompt que o modelo de edição usa. */
export interface BasePrompt extends ConteudoPrompt {
  hash: string;
}

export interface EstadoEdicao<B extends BasePrompt = BasePrompt> {
  base: B;
  rascunho: ConteudoPrompt;
}

/** Reação a uma versão do Prompt vinda do servidor depois de aberto. */
export type Reacao<E, B> =
  /** Nada a fazer na tela; `estado` pode ter a base trocada (mesmo conteúdo, outro hash). */
  | { acao: 'ignorar'; estado: E }
  /** Sem pendências: troca tudo pelo que está no disco. */
  | { acao: 'recarregar'; estado: E }
  /** Com pendências: avisa e mantém o rascunho. */
  | { acao: 'avisar'; novo: B }
  | { acao: 'removido' };

export function conteudoDe(p: ConteudoPrompt): ConteudoPrompt {
  return { titulo: p.titulo, tags: [...p.tags], corpo: p.corpo };
}

const mesmasTags = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);

export function mesmoConteudo(a: ConteudoPrompt, b: ConteudoPrompt): boolean {
  return a.titulo === b.titulo && a.corpo === b.corpo && mesmasTags(a.tags, b.tags);
}

export function iniciar<B extends BasePrompt>(base: B): EstadoEdicao<B> {
  return { base, rascunho: conteudoDe(base) };
}

/** O rascunho difere da base. */
export function pendente(estado: EstadoEdicao): boolean {
  return !mesmoConteudo(estado.base, estado.rascunho);
}

/** Só os campos alterados, para o `PUT`; `null` quando não há nada a salvar. */
export function alteracoes(estado: EstadoEdicao): Partial<ConteudoPrompt> | null {
  const { base, rascunho } = estado;
  const mudou: Partial<ConteudoPrompt> = {};
  if (rascunho.titulo !== base.titulo) mudou.titulo = rascunho.titulo;
  if (!mesmasTags(rascunho.tags, base.tags)) mudou.tags = [...rascunho.tags];
  if (rascunho.corpo !== base.corpo) mudou.corpo = rascunho.corpo;
  return Object.keys(mudou).length > 0 ? mudou : null;
}

/**
 * Troca a base e mantém o rascunho. Usado depois de Favorito e Coleção (decisão 51), que mudam
 * o hash do arquivo sem criar Versão; sem isso, o Ctrl+S seguinte daria 409 falso.
 */
export function rebasear<B extends BasePrompt>(estado: EstadoEdicao<B>, novo: B): EstadoEdicao<B> {
  return { base: novo, rascunho: estado.rascunho };
}

/**
 * Depois de salvar `enviado`: se o rascunho não mudou durante o pedido, adota o que o servidor
 * gravou (título e Tags normalizados); se mudou, só troca a base.
 */
export function aposSalvar<B extends BasePrompt>(
  estado: EstadoEdicao<B>,
  enviado: ConteudoPrompt,
  novo: B,
): EstadoEdicao<B> {
  return mesmoConteudo(estado.rascunho, enviado) ? iniciar(novo) : rebasear(estado, novo);
}

/**
 * O Prompt aberto mudou no servidor (`null` = removido):
 * - hash igual à base: foi o próprio app, `ignorar`;
 * - o disco tem o mesmo conteúdo do rascunho ou da base (o próprio salvar, ou só Favorito e
 *   Coleção): `ignorar`, trocando a base;
 * - sem pendências: `recarregar`;
 * - com pendências: `avisar`.
 */
export function reagirAMudancaExterna<B extends BasePrompt>(
  estado: EstadoEdicao<B>,
  novo: B | null,
): Reacao<EstadoEdicao<B>, B> {
  if (novo === null) return { acao: 'removido' };
  if (novo.hash === estado.base.hash) return { acao: 'ignorar', estado };
  if (mesmoConteudo(novo, estado.rascunho)) return { acao: 'ignorar', estado: iniciar(novo) };
  if (mesmoConteudo(novo, estado.base)) return { acao: 'ignorar', estado: rebasear(estado, novo) };
  if (!pendente(estado)) return { acao: 'recarregar', estado: iniciar(novo) };
  return { acao: 'avisar', novo };
}

// --- Diretrizes: um texto só, com hash `null` quando o arquivo não existe ---

export interface BaseDiretrizes {
  conteudo: string;
  hash: string | null;
}

export interface EstadoDiretrizes {
  base: BaseDiretrizes;
  rascunho: string;
}

export function iniciarDiretrizes(base: BaseDiretrizes): EstadoDiretrizes {
  return { base, rascunho: base.conteudo };
}

export function diretrizesPendentes(estado: EstadoDiretrizes): boolean {
  return estado.rascunho !== estado.base.conteudo;
}

/** A mesma regra de `reagirAMudancaExterna`, para as Diretrizes. */
export function reagirDiretrizes(
  estado: EstadoDiretrizes,
  novo: BaseDiretrizes,
): Exclude<Reacao<EstadoDiretrizes, BaseDiretrizes>, { acao: 'removido' }> {
  if (novo.hash === estado.base.hash) return { acao: 'ignorar', estado };
  if (novo.conteudo === estado.rascunho)
    return { acao: 'ignorar', estado: iniciarDiretrizes(novo) };
  if (!diretrizesPendentes(estado)) return { acao: 'recarregar', estado: iniciarDiretrizes(novo) };
  return { acao: 'avisar', novo };
}
