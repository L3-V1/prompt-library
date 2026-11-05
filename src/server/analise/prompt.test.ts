import { describe, expect, it } from 'vitest';

import { montarPrompt } from './prompt.js';

const base = {
  diretrizes: 'Use a segunda pessoa.',
  instrucao: 'foque em concisão',
  titulo: 'Revisor',
  caminho: 'Código/Revisor.md',
  rascunho: 'Revise o código com muito cuidado.',
  rejeitadas: [],
};

describe('montarPrompt', () => {
  it('traz Diretrizes, Instrução, caminho e o Prompt entre delimitadores', () => {
    const t = montarPrompt(base);
    expect(t).toContain('Use a segunda pessoa.');
    expect(t).toContain('foque em concisão');
    expect(t).toContain('Código/Revisor.md');
    expect(t).toContain('<<<PROMPT\nRevise o código com muito cuidado.\nPROMPT>>>');
    expect(t).toMatch(/copiado literalmente/);
    expect(t).toMatch(/não podem se sobrepor/);
    expect(t).toMatch(/Não mude o idioma/);
    expect(t).not.toMatch(/regenerar esta Sugestão/);
  });

  it('sem Diretrizes nem Instrução', () => {
    const t = montarPrompt({ ...base, diretrizes: '  ', instrucao: '' });
    expect(t).toMatch(/sem Diretrizes/);
    expect(t).not.toMatch(/Instrução para esta Análise/);
  });

  it('lista as rejeitadas e, ao regenerar uma, o alvo', () => {
    const t = montarPrompt({
      ...base,
      rejeitadas: [
        { justificativa: 'tirar ênfase', trechoOriginal: 'muito cuidado', trechoNovo: 'cuidado' },
      ],
      alvo: {
        justificativa: 'mais direto',
        trechoOriginal: 'Revise o código',
        trechoNovo: 'Revise',
      },
    });
    expect(t).toMatch(/já rejeitadas/);
    expect(t).toContain('"muito cuidado"');
    expect(t).toMatch(/regenerar esta Sugestão/);
    expect(t).toContain('"Revise o código"');
    expect(t).toMatch(/exatamente uma/);
  });
});
