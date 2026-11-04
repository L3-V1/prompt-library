import type { Prompt } from '../tipos.js';

/** Prompt de teste com valores padrão. */
export function prompt(campos: Partial<Prompt> & { id: string }): Prompt {
  return {
    titulo: campos.id,
    tags: [],
    favorito: false,
    colecao: null,
    corpo: '',
    caminho: `${campos.id}.md`,
    mtime: 0,
    hash: `hash-${campos.id}`,
    ...campos,
  };
}
