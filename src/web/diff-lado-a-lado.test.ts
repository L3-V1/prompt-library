import { diffLines } from 'diff';
import { describe, expect, it } from 'vitest';

import { linhasLadoALado, semDiferencas } from './diff-lado-a-lado';

const lado = (a: string, b: string) => linhasLadoALado(diffLines(a, b));

describe('linhasLadoALado', () => {
  it('textos iguais', () => {
    const linhas = lado('a\nb\n', 'a\nb\n');
    expect(linhas).toEqual([
      { esquerda: { n: 1, texto: 'a' }, direita: { n: 1, texto: 'a' }, tipo: 'igual' },
      { esquerda: { n: 2, texto: 'b' }, direita: { n: 2, texto: 'b' }, tipo: 'igual' },
    ]);
    expect(semDiferencas(diffLines('a\n', 'a\n'))).toBe(true);
  });

  it('só adição', () => {
    expect(lado('a\n', 'a\nb\n')).toEqual([
      { esquerda: { n: 1, texto: 'a' }, direita: { n: 1, texto: 'a' }, tipo: 'igual' },
      { direita: { n: 2, texto: 'b' }, tipo: 'adicionada' },
    ]);
  });

  it('só remoção', () => {
    expect(lado('a\nb\nc\n', 'a\nc\n')).toEqual([
      { esquerda: { n: 1, texto: 'a' }, direita: { n: 1, texto: 'a' }, tipo: 'igual' },
      { esquerda: { n: 2, texto: 'b' }, tipo: 'removida' },
      { esquerda: { n: 3, texto: 'c' }, direita: { n: 2, texto: 'c' }, tipo: 'igual' },
    ]);
  });

  it('troca emparelhada', () => {
    expect(lado('a\nb\nc\n', 'a\nB\nc\n')[1]).toEqual({
      esquerda: { n: 2, texto: 'b' },
      direita: { n: 2, texto: 'B' },
      tipo: 'alterada',
    });
  });

  it('blocos desiguais: o excedente fica sozinho e a numeração segue', () => {
    const linhas = lado('x\n1\n2\nz\n', 'x\nA\nB\nC\nz\n');
    expect(linhas.map((l) => l.tipo)).toEqual([
      'igual',
      'alterada',
      'alterada',
      'adicionada',
      'igual',
    ]);
    expect(linhas[3]).toEqual({ direita: { n: 4, texto: 'C' }, tipo: 'adicionada' });
    expect(linhas[4]).toEqual({
      esquerda: { n: 4, texto: 'z' },
      direita: { n: 5, texto: 'z' },
      tipo: 'igual',
    });
  });

  it('sem \\n final: a última linha é marcada', () => {
    const linhas = lado('a\nb', 'a\nb\n');
    expect(linhas).toEqual([
      { esquerda: { n: 1, texto: 'a' }, direita: { n: 1, texto: 'a' }, tipo: 'igual' },
      {
        esquerda: { n: 2, texto: 'b', semQuebraFinal: true },
        direita: { n: 2, texto: 'b' },
        tipo: 'alterada',
      },
    ]);
  });

  it('diff vazio', () => {
    expect(linhasLadoALado([])).toEqual([]);
  });
});
