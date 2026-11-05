import { afterEach, describe, expect, it } from 'vitest';

import type { Analise } from './analise';
import { lerAtividade, limparAtividades } from './atividade';
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

describe('atividade do Claude', () => {
  afterEach(limparAtividades);

  it('não invalida nada', () => {
    expect(
      chavesParaInvalidar({ tipo: 'atividade', dados: { promptId: 'a', atividade: null } }),
    ).toEqual([]);
  });

  it('grava no store; null apaga', () => {
    emitir({
      tipo: 'atividade',
      dados: { promptId: 'a', atividade: { tipo: 'ler', caminho: 'x.md' } },
    });
    expect(lerAtividade('a')).toEqual({ tipo: 'ler', caminho: 'x.md' });
    expect(lerAtividade('b')).toBeNull();
    emitir({ tipo: 'atividade', dados: { promptId: 'a', atividade: null } });
    expect(lerAtividade('a')).toBeNull();
  });

  it('a Análise sem execucao apaga a atividade', () => {
    emitir({
      tipo: 'atividade',
      dados: { promptId: 'a', atividade: { tipo: 'buscar', termo: 't' } },
    });
    emitir({ tipo: 'analise', dados: { promptId: 'a', analise: null } });
    expect(lerAtividade('a')).toBeNull();
    clienteConsultas.clear();
  });
});
