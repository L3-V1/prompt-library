import { describe, expect, it } from 'vitest';

import {
  alteracoes,
  aposSalvar,
  iniciar,
  iniciarDiretrizes,
  pendente,
  reagirAMudancaExterna,
  reagirDiretrizes,
  rebasear,
  type BasePrompt,
} from './edicao';

const base: BasePrompt = { titulo: 'Revisão', tags: ['codigo'], corpo: 'Revise.\n', hash: 'h1' };

describe('pendente e alteracoes', () => {
  it('sem mudanças não há pendência nem nada a salvar', () => {
    const e = iniciar(base);
    expect(pendente(e)).toBe(false);
    expect(alteracoes(e)).toBeNull();
  });

  it('só os campos alterados vão para o PUT', () => {
    const e = {
      ...iniciar(base),
      rascunho: { ...base, tags: ['codigo', 'git'], corpo: 'Novo.\n' },
    };
    expect(pendente(e)).toBe(true);
    expect(alteracoes(e)).toEqual({ tags: ['codigo', 'git'], corpo: 'Novo.\n' });
  });

  it('a ordem das Tags conta', () => {
    const b = { ...base, tags: ['a', 'b'] };
    expect(pendente({ base: b, rascunho: { ...b, tags: ['b', 'a'] } })).toBe(true);
  });
});

describe('rebasear', () => {
  it('troca a base (e o hash) e mantém o rascunho', () => {
    const e = { base, rascunho: { ...base, corpo: 'Editado.\n' } };
    const novo = { ...base, hash: 'h2' };
    const r = rebasear(e, novo);
    expect(r.base.hash).toBe('h2');
    expect(r.rascunho.corpo).toBe('Editado.\n');
    expect(pendente(r)).toBe(true);
  });
});

describe('aposSalvar', () => {
  it('adota o que o servidor gravou quando o rascunho não mudou durante o pedido', () => {
    const enviado = { ...base, titulo: ' Revisão 2 ' };
    const e = { base, rascunho: enviado };
    const gravado = { ...base, titulo: 'Revisão 2', hash: 'h2' };
    const r = aposSalvar(e, enviado, gravado);
    expect(r.rascunho.titulo).toBe('Revisão 2');
    expect(pendente(r)).toBe(false);
  });

  it('mantém o que foi digitado durante o pedido', () => {
    const enviado = { ...base, corpo: 'A\n' };
    const e = { base, rascunho: { ...base, corpo: 'AB\n' } };
    const r = aposSalvar(e, enviado, { ...base, corpo: 'A\n', hash: 'h2' });
    expect(r.base.hash).toBe('h2');
    expect(r.rascunho.corpo).toBe('AB\n');
  });
});

describe('reagirAMudancaExterna', () => {
  const editado = { base, rascunho: { ...base, corpo: 'Meu texto.\n' } };
  const externo = { ...base, corpo: 'Texto do Obsidian.\n', hash: 'h9' };

  it('hash igual à base: ignorar', () => {
    expect(reagirAMudancaExterna(editado, { ...base })).toEqual({
      acao: 'ignorar',
      estado: editado,
    });
  });

  it('sem pendências: recarregar', () => {
    const r = reagirAMudancaExterna(iniciar(base), externo);
    expect(r.acao).toBe('recarregar');
    if (r.acao === 'recarregar') expect(r.estado.rascunho.corpo).toBe('Texto do Obsidian.\n');
  });

  it('com pendências: avisar', () => {
    expect(reagirAMudancaExterna(editado, externo)).toEqual({ acao: 'avisar', novo: externo });
  });

  it('removido', () => {
    expect(reagirAMudancaExterna(editado, null)).toEqual({ acao: 'removido' });
  });

  it('o disco igual ao rascunho (o próprio salvar chegou antes da resposta): ignorar', () => {
    const r = reagirAMudancaExterna(editado, { ...base, corpo: 'Meu texto.\n', hash: 'h2' });
    expect(r.acao).toBe('ignorar');
    if (r.acao === 'ignorar') expect(pendente(r.estado)).toBe(false);
  });

  it('só Favorito ou Coleção mudaram: ignorar com a base trocada', () => {
    const r = reagirAMudancaExterna(editado, { ...base, hash: 'h3' });
    expect(r.acao).toBe('ignorar');
    if (r.acao === 'ignorar') {
      expect(r.estado.base.hash).toBe('h3');
      expect(r.estado.rascunho.corpo).toBe('Meu texto.\n');
    }
  });
});

describe('reagirDiretrizes', () => {
  const base = { conteudo: 'A', hash: 'h1' };

  it('segue a mesma regra por hash', () => {
    const limpo = iniciarDiretrizes(base);
    const editado = { base, rascunho: 'AB' };
    expect(reagirDiretrizes(editado, base).acao).toBe('ignorar');
    expect(reagirDiretrizes(limpo, { conteudo: 'C', hash: 'h2' }).acao).toBe('recarregar');
    expect(reagirDiretrizes(editado, { conteudo: 'C', hash: 'h2' }).acao).toBe('avisar');
    expect(reagirDiretrizes(editado, { conteudo: 'AB', hash: 'h2' }).acao).toBe('ignorar');
  });

  it('arquivo criado fora quando não existia', () => {
    const vazio = iniciarDiretrizes({ conteudo: '', hash: null });
    expect(reagirDiretrizes(vazio, { conteudo: 'X', hash: 'h1' }).acao).toBe('recarregar');
  });
});
