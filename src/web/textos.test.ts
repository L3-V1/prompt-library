import { describe, expect, it } from 'vitest';

import { textoExclusaoColecao } from './textos';

describe('textoExclusaoColecao', () => {
  it.each([
    [{ prompts: 0, outros: 0 }, 'A Coleção está vazia.'],
    [{ prompts: 1, outros: 0 }, '1 Prompt vai para Sem coleção.'],
    [{ prompts: 3, outros: 0 }, '3 Prompts vão para Sem coleção.'],
    [{ prompts: 0, outros: 1 }, '1 arquivo vai para a lixeira do vault.'],
    [
      { prompts: 3, outros: 2 },
      '3 Prompts vão para Sem coleção e 2 arquivos vão para a lixeira do vault.',
    ],
    [
      { prompts: 1, outros: 1 },
      '1 Prompt vai para Sem coleção e 1 arquivo vai para a lixeira do vault.',
    ],
  ])('%o', (contagens, esperado) => {
    expect(textoExclusaoColecao(contagens)).toBe(esperado);
  });
});
