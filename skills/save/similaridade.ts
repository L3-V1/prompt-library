import { normalizar, type Prompt } from '../../src/core/index.js';

export { normalizar };

export interface Parecido {
  id: string;
  titulo: string;
  colecao: string | null;
  tags: string[];
  /** Jaccard das palavras, de 0 a 1, com duas casas. */
  pontuacao: number;
  /** O corpo do Prompt é igual ao texto (ignorando quebras de linha no fim). */
  identico: boolean;
}

/** Conjunto das palavras (letras e dígitos) com 2 ou mais caracteres. */
export function tokens(texto: string): Set<string> {
  return new Set((normalizar(texto).match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length >= 2));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let comum = 0;
  for (const t of a) if (b.has(t)) comum++;
  return comum / (a.size + b.size - comum);
}

const semFimDeLinha = (t: string) => t.replace(/(\r?\n)+$/, '');

/** Prompts parecidos com `texto`, do mais para o menos parecido. */
export function parecidos(
  texto: string,
  prompts: Prompt[],
  { limite = 3, minimo = 0.4 }: { limite?: number; minimo?: number } = {},
): Parecido[] {
  const base = tokens(texto);
  const alvo = semFimDeLinha(texto);
  return prompts
    .map((p) => {
      const identico = semFimDeLinha(p.corpo) === alvo;
      const pontuacao = identico ? 1 : Math.round(jaccard(base, tokens(p.corpo)) * 100) / 100;
      return { id: p.id, titulo: p.titulo, colecao: p.colecao, tags: p.tags, pontuacao, identico };
    })
    .filter((p) => p.identico || p.pontuacao >= minimo)
    .sort(
      (a, b) =>
        Number(b.identico) - Number(a.identico) ||
        b.pontuacao - a.pontuacao ||
        a.titulo.localeCompare(b.titulo, 'pt-BR'),
    )
    .slice(0, limite);
}
