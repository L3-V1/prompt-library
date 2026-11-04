import { describe, expect, it } from 'vitest';

import {
  comFiltro,
  escreverNavegacao,
  lerNavegacao,
  NAVEGACAO_INICIAL,
  type Navegacao,
} from './navegacao';

const idaEVolta = (nav: Navegacao) => lerNavegacao(escreverNavegacao(nav));

describe('navegação na URL', () => {
  it('URL vazia é o estado inicial', () => {
    expect(lerNavegacao('')).toEqual(NAVEGACAO_INICIAL);
    expect(escreverNavegacao(NAVEGACAO_INICIAL)).toBe('');
  });

  it('ida e volta com todos os campos', () => {
    const nav: Navegacao = {
      colecao: 'Code review',
      tag: 'git',
      favoritos: true,
      q: 'revisão de código',
      p: 'abc123def456',
      vista: 'prompts',
    };
    expect(idaEVolta(nav)).toEqual(nav);
  });

  it('"Sem coleção" é colecao= vazio', () => {
    const nav: Navegacao = { ...NAVEGACAO_INICIAL, colecao: null };
    expect(escreverNavegacao(nav)).toBe('?colecao=');
    expect(idaEVolta(nav)).toEqual(nav);
  });

  it('acentos e caracteres especiais', () => {
    const nav: Navegacao = {
      ...NAVEGACAO_INICIAL,
      colecao: 'Ação & Reação',
      tag: 'çã/é',
      q: 'a+b=c?',
    };
    expect(idaEVolta(nav)).toEqual(nav);
    expect(lerNavegacao('?colecao=Planejamento%20%C3%A1gil').colecao).toBe('Planejamento ágil');
  });

  it('vista=diretrizes ignora o Prompt aberto', () => {
    expect(lerNavegacao('?vista=diretrizes&p=x')).toEqual({
      ...NAVEGACAO_INICIAL,
      vista: 'diretrizes',
    });
    expect(escreverNavegacao({ ...NAVEGACAO_INICIAL, vista: 'diretrizes', p: 'x' })).toBe(
      '?vista=diretrizes',
    );
  });

  it('comFiltro troca os filtros e mantém busca e Prompt', () => {
    const nav: Navegacao = {
      colecao: 'A',
      tag: 't',
      favoritos: true,
      q: 'x',
      p: 'id',
      vista: 'prompts',
    };
    expect(comFiltro(nav, { colecao: null })).toEqual({
      colecao: null,
      favoritos: false,
      q: 'x',
      p: 'id',
      vista: 'prompts',
    });
  });
});
