import { describe, expect, it } from 'vitest';

import type { Prompt } from '../../src/core/index.js';
import { jaccard, normalizar, parecidos, tokens } from './similaridade.js';

function prompt(id: string, corpo: string, titulo = id): Prompt {
  return {
    id,
    titulo,
    tags: ['t'],
    favorito: false,
    colecao: null,
    corpo,
    caminho: `${titulo}.md`,
    mtime: 0,
    hash: 'h',
  };
}

describe('tokens e jaccard', () => {
  it('ignora acentos, caixa e palavras de uma letra', () => {
    expect(normalizar('Ação ÉPICA')).toBe('acao epica');
    expect([...tokens('Revisão de código: a REVISAO do Código!')].sort()).toEqual([
      'codigo',
      'de',
      'do',
      'revisao',
    ]);
  });

  it('calcula a interseção sobre a união', () => {
    expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set())).toBe(0);
  });
});

describe('parecidos', () => {
  const texto = 'revise o código deste PR com atenção a erros de concorrência';

  it('ordena pela pontuação, respeita o mínimo e o limite', () => {
    const prompts = [
      prompt('fraco', 'receita de bolo de cenoura'),
      prompt('medio', 'revise o código deste PR'),
      prompt('forte', 'Revise o CÓDIGO deste PR com atencao a erros'),
      prompt('quase', 'revise o código deste PR com atenção a erros de concorrência e testes'),
    ];
    const lista = parecidos(texto, prompts);
    expect(lista.map((p) => p.id)).toEqual(['quase', 'forte', 'medio']);
    expect(lista.every((p) => p.pontuacao >= 0.4 && !p.identico)).toBe(true);
    expect(parecidos(texto, prompts, { limite: 1 }).map((p) => p.id)).toEqual(['quase']);
    expect(parecidos(texto, prompts, { minimo: 0.95 })).toEqual([]);
  });

  it('marca como idêntico o corpo igual, ignorando a quebra de linha final', () => {
    const lista = parecidos(`${texto}\n`, [
      prompt('outro', texto.toUpperCase()),
      prompt('igual', texto),
    ]);
    expect(lista[0]).toEqual({
      id: 'igual',
      titulo: 'igual',
      colecao: null,
      tags: ['t'],
      pontuacao: 1,
      identico: true,
    });
    expect(lista[1]).toMatchObject({ id: 'outro', pontuacao: 1, identico: false });
  });
});
