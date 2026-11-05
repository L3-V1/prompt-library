import { describe, expect, it } from 'vitest';

import { SugestaoIndisponivelError } from '../erros.js';
import type { Analise, Sugestao } from '../tipos.js';
import { aceitar, incorporar, inferirEdicao, localizar, recalcular, rejeitar } from './regras.js';

function sugestao(id: string, rascunho: string, original: string, novo: string): Sugestao {
  return {
    id,
    justificativa: `j-${id}`,
    trechoOriginal: original,
    trechoNovo: novo,
    status: 'pendente',
    inicio: localizar(rascunho, original, null),
  };
}

function analise(rascunho: string, sugestoes: Sugestao[]): Analise {
  return {
    promptId: 'p',
    baseHash: 'h',
    corpoOriginal: rascunho,
    rascunho,
    instrucao: '',
    modelo: null,
    sugestoes,
    execucao: null,
    erro: null,
    criadaEm: '2026-11-04T00:00:00.000Z',
    atualizadaEm: '2026-11-04T00:00:00.000Z',
  };
}

const status = (a: Analise) => Object.fromEntries(a.sugestoes.map((s) => [s.id, s.status]));
const porId = (a: Analise, id: string) => a.sugestoes.find((s) => s.id === id);

describe('localizar', () => {
  it('pista exata', () => {
    expect(localizar('abc abc abc', 'abc', 4)).toBe(4);
  });

  it('várias ocorrências: a mais próxima da pista', () => {
    expect(localizar('abc abc abc', 'abc', 6)).toBe(4);
    expect(localizar('abc abc abc', 'abc', 7)).toBe(8);
    expect(localizar('abc abc abc', 'abc', 100)).toBe(8);
    expect(localizar('abc abc abc', 'abc', null)).toBe(0);
  });

  it('sem ocorrência ou trecho vazio: null', () => {
    expect(localizar('abc', 'xyz', 0)).toBeNull();
    expect(localizar('abc', '', 0)).toBeNull();
  });
});

describe('inferirEdicao', () => {
  it('pelo prefixo e sufixo comuns', () => {
    expect(inferirEdicao('abcdef', 'abXYef')).toEqual({ pos: 2, removidos: 2, inseridos: 2 });
    expect(inferirEdicao('abc', 'abc!')).toEqual({ pos: 3, removidos: 0, inseridos: 1 });
    expect(inferirEdicao('aaa', 'aa')).toEqual({ pos: 2, removidos: 1, inseridos: 0 });
  });
});

describe('aceitar', () => {
  const texto = 'Um texto muito longo. Outra frase aqui. Fim.';

  it('troca o trecho e desloca as Sugestões seguintes', () => {
    const a = analise(texto, [
      sugestao('a', texto, 'muito longo', 'curto'),
      sugestao('b', texto, 'Outra frase', 'Segunda frase'),
    ]);
    const r = aceitar(a, 'a');
    expect(r.rascunho).toBe('Um texto curto. Outra frase aqui. Fim.');
    expect(status(r)).toEqual({ a: 'aceita', b: 'pendente' });
    expect(porId(r, 'b')?.inicio).toBe(r.rascunho.indexOf('Outra frase'));
    expect(a.rascunho).toBe(texto);

    const r2 = aceitar(r, 'b');
    expect(r2.rascunho).toBe('Um texto curto. Segunda frase aqui. Fim.');
  });

  it('a Sugestão sobreposta fica desatualizada', () => {
    const a = analise(texto, [
      sugestao('a', texto, 'muito longo', 'curto'),
      sugestao('b', texto, 'longo. Outra', 'longo; outra'),
    ]);
    const r = aceitar(a, 'a');
    expect(status(r)).toEqual({ a: 'aceita', b: 'desatualizada' });
    expect(porId(r, 'b')?.inicio).toBeNull();
  });

  it('aceitar uma desatualizada ou já decidida lança', () => {
    const a = analise(texto, [
      { ...sugestao('a', texto, 'muito', 'pouco'), status: 'desatualizada', inicio: null },
    ]);
    expect(() => aceitar(a, 'a')).toThrow(SugestaoIndisponivelError);
    const b = aceitar(analise(texto, [sugestao('b', texto, 'Fim', 'Final')]), 'b');
    expect(() => aceitar(b, 'b')).toThrow(SugestaoIndisponivelError);
    expect(() => aceitar(b, 'zzz')).toThrow(SugestaoIndisponivelError);
  });
});

describe('edição manual (recalcular)', () => {
  const texto = 'Primeira frase. Segunda frase. Terceira frase.';
  const base = () =>
    analise(texto, [
      sugestao('a', texto, 'Segunda', '2ª'),
      sugestao('b', texto, 'Terceira frase', 'Última frase'),
    ]);

  it('edição dentro do trecho: desatualizada', () => {
    const r = recalcular(base(), texto.replace('Segunda', 'Segundo'));
    expect(status(r)).toEqual({ a: 'desatualizada', b: 'pendente' });
  });

  it('edição antes do trecho: só desloca', () => {
    const novo = 'Olá! ' + texto;
    const r = recalcular(base(), novo);
    expect(status(r)).toEqual({ a: 'pendente', b: 'pendente' });
    expect(porId(r, 'a')?.inicio).toBe(novo.indexOf('Segunda'));
    expect(porId(r, 'b')?.inicio).toBe(novo.indexOf('Terceira'));
  });

  it('desfazer a edição: volta a pendente', () => {
    const editado = recalcular(base(), texto.replace('Terceira', 'Terça'));
    expect(status(editado).b).toBe('desatualizada');
    const desfeito = recalcular(editado, texto);
    expect(status(desfeito)).toEqual({ a: 'pendente', b: 'pendente' });
    expect(porId(desfeito, 'b')?.inicio).toBe(texto.indexOf('Terceira'));
  });

  it('não mexe nas aceitas e rejeitadas', () => {
    const a = rejeitar(base(), 'a');
    const r = recalcular(a, 'tudo diferente');
    expect(status(r)).toEqual({ a: 'rejeitada', b: 'desatualizada' });
  });

  it('com trechos repetidos, segue a ocorrência pela pista', () => {
    const t = 'item. item. item.';
    const s = { ...sugestao('a', t, 'item', 'ponto'), inicio: 6 };
    const r = recalcular(analise(t, [s]), 'xx ' + t);
    expect(porId(r, 'a')?.inicio).toBe(9);
  });
});

describe('rejeitar', () => {
  it('rejeita uma pendente ou desatualizada', () => {
    const t = 'abc';
    const a = analise(t, [
      sugestao('a', t, 'a', 'A'),
      { ...sugestao('b', t, 'zz', 'Z'), status: 'desatualizada', inicio: null },
    ]);
    const r = rejeitar(rejeitar(a, 'a'), 'b');
    expect(status(r)).toEqual({ a: 'rejeitada', b: 'rejeitada' });
    expect(() => rejeitar(r, 'a')).toThrow(SugestaoIndisponivelError);
  });
});

describe('incorporar', () => {
  const texto = 'Um texto muito longo. Fim.';
  const gerada = (o: string, n: string) => ({
    justificativa: 'j',
    trechoOriginal: o,
    trechoNovo: n,
  });

  it('tudo: mantém as decididas, troca as outras e descarta trechos inexistentes', () => {
    let a = analise(texto, [
      sugestao('aceita', texto, 'Um', 'O'),
      sugestao('rej', texto, 'Fim', 'Final'),
      sugestao('pend', texto, 'texto', 'prompt'),
    ]);
    a = rejeitar(aceitar(a, 'aceita'), 'rej');
    const r = incorporar(
      a,
      [
        gerada('muito longo', 'curto'),
        gerada('não existe', 'x'),
        gerada('Fim', 'Final'), // repete a rejeitada
        gerada('texto', 'texto'), // não muda nada
      ],
      'tudo',
    );
    expect(r.descartadas).toBe(3);
    expect(r.analise.sugestoes.map((s) => [s.trechoOriginal, s.status])).toEqual([
      ['Um', 'aceita'],
      ['Fim', 'rejeitada'],
      ['muito longo', 'pendente'],
    ]);
    const nova = r.analise.sugestoes[2];
    expect(nova?.inicio).toBe(a.rascunho.indexOf('muito longo'));
    expect(nova?.id).toMatch(/^[0-9a-z]{12}$/);
  });

  it('uma só: troca na mesma posição da lista', () => {
    const a = analise(texto, [
      sugestao('a', texto, 'Um', 'O'),
      sugestao('b', texto, 'texto', 'prompt'),
      sugestao('c', texto, 'Fim', 'Final'),
    ]);
    const r = incorporar(a, [gerada('não existe', 'x'), gerada('texto muito', 'prompt bem')], 'b');
    expect(r.descartadas).toBe(1);
    expect(r.analise.sugestoes.map((s) => s.trechoOriginal)).toEqual(['Um', 'texto muito', 'Fim']);
    expect(r.analise.sugestoes[0]?.id).toBe('a');
    expect(r.analise.sugestoes[2]?.id).toBe('c');
  });

  it('uma só, sem gerada válida ou com o alvo já decidido: nada muda', () => {
    const a = analise(texto, [sugestao('a', texto, 'Um', 'O')]);
    expect(incorporar(a, [gerada('nada', 'x')], 'a')).toEqual({ analise: a, descartadas: 1 });
    const decidida = rejeitar(a, 'a');
    expect(incorporar(decidida, [gerada('Fim', 'F')], 'a').analise).toBe(decidida);
  });
});
