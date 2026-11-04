import { describe, expect, it } from 'vitest';

import { buscar, pontuar, termos } from './busca.js';
import { prompt } from '../core/teste/prompt.js';

const ids = (lista: { id: string }[]) => lista.map((p) => p.id);

describe('termos', () => {
  it('normaliza acentos e caixa e divide por espaços', () => {
    expect(termos('  Revisão  de CÓDIGO ')).toEqual(['revisao', 'de', 'codigo']);
    expect(termos('')).toEqual([]);
  });
});

describe('pontuar', () => {
  const p = prompt({ id: 'a', titulo: 'Revisão', tags: ['codigo'], corpo: 'revise o código' });

  it('soma título 3, Tag 2 e corpo 1 por termo', () => {
    expect(pontuar(p, ['revis'])).toBe(3 + 1);
    expect(pontuar(p, ['codigo'])).toBe(2 + 1);
    expect(pontuar(p, ['revis', 'codigo'])).toBe(4 + 3);
  });

  it('null se algum termo não aparece', () => {
    expect(pontuar(p, ['revis', 'inexistente'])).toBeNull();
  });
});

describe('buscar', () => {
  const prompts = [
    prompt({ id: 'corpo', titulo: 'Zeta', corpo: 'Faça uma revisão do código' }),
    prompt({ id: 'titulo', titulo: 'Revisão de PR', corpo: 'olhe o diff', colecao: 'Code' }),
    prompt({ id: 'tag', titulo: 'Beta', tags: ['revisao'], corpo: 'x', favorito: true }),
    prompt({ id: 'fav', titulo: 'Ômega', corpo: 'REVISÃO geral', favorito: true }),
    prompt({ id: 'alfa', titulo: 'alfa', corpo: 'nada', colecao: 'Code', tags: ['Python'] }),
  ];

  it('sem q ordena por título (pt-BR)', () => {
    expect(ids(buscar(prompts))).toEqual(['alfa', 'tag', 'fav', 'titulo', 'corpo']);
  });

  it('ignora acentos e caixa', () => {
    expect(ids(buscar(prompts, { q: 'REVISAO' }))).toContain('fav');
    expect(ids(buscar(prompts, { q: 'omega' }))).toEqual(['fav']);
  });

  it('exige todos os termos', () => {
    expect(ids(buscar(prompts, { q: 'revisão código' }))).toEqual(['corpo']);
    expect(ids(buscar(prompts, { q: 'revisão inexistente' }))).toEqual([]);
  });

  it('ordena por pontuação, depois favoritos, depois título', () => {
    // titulo: 3; tag: 2; corpo e fav: 1 (fav é favorito e vem antes de corpo).
    expect(ids(buscar(prompts, { q: 'revisao' }))).toEqual(['titulo', 'tag', 'fav', 'corpo']);
  });

  it('filtra por Coleção, incluindo Sem coleção', () => {
    expect(ids(buscar(prompts, { colecao: 'Code' }))).toEqual(['alfa', 'titulo']);
    expect(ids(buscar(prompts, { colecao: '' }))).toEqual(['tag', 'fav', 'corpo']);
    expect(ids(buscar(prompts, { colecao: 'Outra' }))).toEqual([]);
  });

  it('filtra por Tag (sem diferenciar caixa) e Favorito', () => {
    expect(ids(buscar(prompts, { tag: 'python' }))).toEqual(['alfa']);
    expect(ids(buscar(prompts, { favorito: true }))).toEqual(['tag', 'fav']);
    expect(ids(buscar(prompts, { favorito: false }))).toEqual(['alfa', 'titulo', 'corpo']);
  });

  it('combina filtros e busca', () => {
    expect(ids(buscar(prompts, { q: 'revisao', colecao: '', favorito: true }))).toEqual([
      'tag',
      'fav',
    ]);
  });
});
