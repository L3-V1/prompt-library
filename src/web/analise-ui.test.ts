import { describe, expect, it } from 'vitest';

import { miniDiff, resumoStatus, tempoDecorrido, textoResumo } from './analise-ui';

describe('miniDiff', () => {
  it('marca as palavras removidas e adicionadas', () => {
    expect(miniDiff('com muito cuidado', 'com cuidado')).toEqual([
      { tipo: 'igual', texto: 'com ' },
      { tipo: 'removido', texto: 'muito ' },
      { tipo: 'igual', texto: 'cuidado' },
    ]);
    expect(miniDiff('a', 'b')).toEqual([
      { tipo: 'removido', texto: 'a' },
      { tipo: 'adicionado', texto: 'b' },
    ]);
  });

  it('remoção total', () => {
    expect(miniDiff('apague isto', '')).toEqual([{ tipo: 'removido', texto: 'apague isto' }]);
  });
});

describe('resumoStatus', () => {
  it('conta por status', () => {
    const r = resumoStatus([
      { status: 'pendente' },
      { status: 'pendente' },
      { status: 'aceita' },
      { status: 'desatualizada' },
    ]);
    expect(r).toEqual({ pendente: 2, aceita: 1, rejeitada: 0, desatualizada: 1, total: 4 });
    expect(textoResumo(r)).toBe('2 pendentes, 1 aceita, 1 desatualizada');
    expect(textoResumo(resumoStatus([]))).toBe('');
  });
});

describe('tempoDecorrido', () => {
  it('em m:ss', () => {
    const inicio = '2026-11-04T10:00:00.000Z';
    expect(tempoDecorrido(inicio, Date.parse(inicio) + 75_400)).toBe('1:15');
    expect(tempoDecorrido(inicio, Date.parse(inicio) - 5)).toBe('0:00');
  });
});
