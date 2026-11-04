import { normalizar, type Prompt } from '../core/index.js';

export interface Filtros {
  /** Termos de busca; todos precisam aparecer em título, Tags ou corpo. */
  q?: string;
  /** Nome da Coleção; `''` = "Sem coleção". */
  colecao?: string;
  tag?: string;
  favorito?: boolean;
}

const PESO_TITULO = 3;
const PESO_TAG = 2;
const PESO_CORPO = 1;

const porTitulo = (a: Prompt, b: Prompt) => a.titulo.localeCompare(b.titulo, 'pt-BR');

/** Termos normalizados (minúsculas, sem acentos) de uma busca. */
export function termos(q: string): string[] {
  return normalizar(q)
    .split(/\s+/)
    .filter((t) => t !== '');
}

/**
 * Pontuação de um Prompt para os termos: soma, por termo, 3 se aparece no título, 2 se
 * aparece em alguma Tag e 1 se aparece no corpo. `null` se algum termo não aparece.
 */
export function pontuar(prompt: Prompt, lista: string[]): number | null {
  const titulo = normalizar(prompt.titulo);
  const tags = prompt.tags.map(normalizar);
  const corpo = normalizar(prompt.corpo);
  let total = 0;
  for (const termo of lista) {
    let pontos = 0;
    if (titulo.includes(termo)) pontos += PESO_TITULO;
    if (tags.some((t) => t.includes(termo))) pontos += PESO_TAG;
    if (corpo.includes(termo)) pontos += PESO_CORPO;
    if (pontos === 0) return null;
    total += pontos;
  }
  return total;
}

/** Filtra e ordena os Prompts (busca pura, sem E/S). */
export function buscar(prompts: Iterable<Prompt>, filtros: Filtros = {}): Prompt[] {
  const tag = filtros.tag !== undefined ? normalizar(filtros.tag) : undefined;
  const filtrados = [...prompts].filter(
    (p) =>
      (filtros.colecao === undefined || (p.colecao ?? '') === filtros.colecao) &&
      (tag === undefined || p.tags.some((t) => normalizar(t) === tag)) &&
      (filtros.favorito === undefined || p.favorito === filtros.favorito),
  );

  const lista = termos(filtros.q ?? '');
  if (lista.length === 0) return filtrados.sort(porTitulo);

  return filtrados
    .map((prompt) => ({ prompt, pontos: pontuar(prompt, lista) }))
    .filter((r): r is { prompt: Prompt; pontos: number } => r.pontos !== null)
    .sort(
      (a, b) =>
        b.pontos - a.pontos ||
        Number(b.prompt.favorito) - Number(a.prompt.favorito) ||
        porTitulo(a.prompt, b.prompt),
    )
    .map((r) => r.prompt);
}
