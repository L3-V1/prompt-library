import { afterEach, describe, expect, it } from 'vitest';

import type { Analise } from './analise';
import { chaves, clienteConsultas } from './consultas';
import { chavesParaInvalidar, emitir } from './eventos';

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

  it('analise não invalida nada (o evento já traz o estado)', () => {
    expect(
      chavesParaInvalidar({ tipo: 'analise', dados: { promptId: 'a', analise: null } }),
    ).toEqual([]);
  });
});

describe('conjunto de Análises abertas', () => {
  afterEach(() => clienteConsultas.clear());

  const analise = (promptId: string) =>
    ({ promptId, criadaEm: 't0', atualizadaEm: 't1' }) as unknown as Analise;
  const abertas = () => clienteConsultas.getQueryData<string[]>(chaves.analises);

  it('entra com a Análise e sai com null', () => {
    clienteConsultas.setQueryData(chaves.analises, ['b']);
    emitir({ tipo: 'analise', dados: { promptId: 'a', analise: analise('a') } });
    expect(abertas()).toEqual(['a', 'b']);
    emitir({ tipo: 'analise', dados: { promptId: 'a', analise: analise('a') } });
    expect(abertas()).toEqual(['a', 'b']);
    emitir({ tipo: 'analise', dados: { promptId: 'b', analise: null } });
    expect(abertas()).toEqual(['a']);
  });

  it('sem a lista no cache, não a cria', () => {
    emitir({ tipo: 'analise', dados: { promptId: 'a', analise: analise('a') } });
    expect(abertas()).toBeUndefined();
  });
});
