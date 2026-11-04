import { describe, expect, it } from 'vitest';

import { FrontmatterInvalidoError } from './erros.js';
import { definirCampo, definirId, definirTags, juntar, lerCampos, separar } from './frontmatter.js';

describe('separar / juntar', () => {
  it('faz round-trip exato sem alterações', () => {
    const texto =
      '---\n# comentário\ntitulo: X\ntags: [a, b]\noutro: 1\n---\ncorpo\n\n  com espaços  \n';
    expect(juntar(separar(texto))).toBe(texto);
  });

  it('preserva campos desconhecidos, comentários, ordem e corpo ao definir campos', () => {
    const corpo = 'linha 1\n\n---\nnão é frontmatter\n';
    const texto = `---\n# topo\ntitulo: X # inline\noutro_campo: preservado\ntags:\n  - a\n---\n${corpo}`;
    const s = separar(texto);
    definirId(s, 'abc');
    definirCampo(s, 'titulo', 'Y');
    definirTags(s, ['a', 'b']);
    expect(s.corpo).toBe(corpo);
    expect(juntar(s)).toBe(
      `---\n# topo\nid: abc\ntitulo: Y # inline\noutro_campo: preservado\ntags:\n  - a\n  - b\n---\n${corpo}`,
    );
  });

  it('preserva BOM e CRLF', () => {
    const texto = '﻿---\r\ntitulo: X\r\n---\r\ncorpo\r\nfim';
    const s = separar(texto);
    expect(s.bom).toBe(true);
    expect(s.eol).toBe('\r\n');
    expect(s.corpo).toBe('corpo\r\nfim');
    definirId(s, 'abc');
    expect(juntar(s)).toBe('﻿---\r\nid: abc\r\ntitulo: X\r\n---\r\ncorpo\r\nfim');
  });

  it('aceita arquivo sem frontmatter e cria um ao definir o id', () => {
    const texto = 'só corpo\r\noutra linha';
    const s = separar(texto);
    expect(s.dados).toBeNull();
    expect(s.corpo).toBe(texto);
    expect(juntar(s)).toBe(texto);
    definirId(s, 'abc');
    expect(juntar(s)).toBe(`---\r\nid: abc\r\n---\r\n${texto}`);
  });

  it('trata frontmatter vazio e sem fechamento', () => {
    const vazio = separar('---\n---\ncorpo');
    expect(vazio.corpo).toBe('corpo');
    definirId(vazio, 'abc');
    expect(juntar(vazio)).toBe('---\nid: abc\n---\ncorpo');

    const aberto = separar('---\ntitulo: X\ncorpo');
    expect(aberto.dados).toBeNull();
    expect(aberto.corpo).toBe('---\ntitulo: X\ncorpo');
  });

  it('rejeita YAML inválido e frontmatter que não é mapa', () => {
    expect(() => separar('---\ntitulo: [x\n---\ncorpo')).toThrow(FrontmatterInvalidoError);
    expect(() => separar('---\n- a\n- b\n---\ncorpo')).toThrow(FrontmatterInvalidoError);
    expect(() => separar('---\na: 1\na: 2\n---\n')).toThrow(FrontmatterInvalidoError);
  });

  it('usa flow em tags novas', () => {
    const s = separar('corpo');
    definirTags(s, ['a', 'b']);
    expect(juntar(s)).toBe('---\ntags: [a, b]\n---\ncorpo');
  });
});

describe('lerCampos', () => {
  it('lê os campos conhecidos com padrões', () => {
    expect(lerCampos(null)).toEqual({ id: undefined, titulo: null, tags: [], favorito: false });
    const { dados } = separar(
      '---\nid: k3\ntitulo: Revisão\ntags: [code-review, "#git", git]\nfavorito: true\norigem: { projeto: p, data: 2026-11-04, sessao: s }\n---\n',
    );
    expect(lerCampos(dados)).toEqual({
      id: 'k3',
      titulo: 'Revisão',
      tags: ['code-review', 'git'],
      favorito: true,
      origem: { projeto: 'p', data: '2026-11-04', sessao: 's' },
    });
  });

  it('converte tags que não são lista', () => {
    expect(lerCampos(separar('---\ntags: a, b c\n---\n').dados).tags).toEqual(['a', 'b', 'c']);
    expect(lerCampos(separar('---\ntags: 42\n---\n').dados).tags).toEqual(['42']);
    expect(lerCampos(separar('---\ntags: { x: 1 }\n---\n').dados).tags).toEqual([]);
  });
});
