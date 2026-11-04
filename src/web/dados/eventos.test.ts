import { describe, expect, it } from 'vitest';

import { chavesParaInvalidar } from './eventos';

describe('chavesParaInvalidar', () => {
  it('acervo invalida listas e os ids alterados e removidos', () => {
    const chaves = chavesParaInvalidar({
      tipo: 'acervo',
      dados: { criados: ['novo'], alterados: ['a'], removidos: ['r'] },
    });
    expect(chaves).toEqual([
      ['prompts'],
      ['colecoes'],
      ['tags'],
      ['prompt', 'a'],
      ['versoes', 'a'],
      ['diff', 'a'],
      ['prompt', 'r'],
      ['versoes', 'r'],
      ['diff', 'r'],
    ]);
  });

  it('acervo sem ids (só Coleções ou problemas) invalida as listas', () => {
    expect(
      chavesParaInvalidar({ tipo: 'acervo', dados: { criados: [], alterados: [], removidos: [] } }),
    ).toEqual([['prompts'], ['colecoes'], ['tags']]);
  });

  it('diretrizes invalida só as Diretrizes', () => {
    expect(chavesParaInvalidar({ tipo: 'diretrizes', dados: { hash: 'h' } })).toEqual([
      ['diretrizes'],
    ]);
  });
});
