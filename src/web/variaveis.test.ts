import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { extrairVariaveis, lerValoresSalvos, preencher, salvarValores } from './variaveis';

describe('extrairVariaveis', () => {
  it('nomes únicos, na ordem da primeira ocorrência', () => {
    expect(extrairVariaveis('{{b}} e {{a}}, de novo {{b}} e {{A}}')).toEqual(['b', 'a', 'A']);
  });

  it('apara os espaços nas pontas', () => {
    expect(extrairVariaveis('{{ a }} {{a}} {{\tb\t}}')).toEqual(['a', 'b']);
  });

  it('aceita acentos, dígitos, `_` e `-`', () => {
    expect(extrairVariaveis('{{descrição}} {{nome_do-cliente}} {{v2}}')).toEqual([
      'descrição',
      'nome_do-cliente',
      'v2',
    ]);
  });

  it('vale também dentro de blocos de código', () => {
    expect(extrairVariaveis('```\n{{a}}\n```')).toEqual(['a']);
  });

  it('rejeita espaço interno, vazio, chaves triplas e quebra de linha', () => {
    expect(
      extrairVariaveis('{{nome do cliente}} {{}} {{ }} {{{a}}} {{{b}} {{c}}} {{\nd}} {{e\n}} {a}'),
    ).toEqual([]);
  });
});

describe('preencher', () => {
  it('troca todas as ocorrências, com ou sem espaços', () => {
    expect(preencher('{{a}}, {{ a }} e {{b}}', { a: 'x', b: 'y' })).toBe('x, x e y');
  });

  it('valor vazio ou ausente mantém a ocorrência original', () => {
    expect(preencher('{{ a }} {{b}} {{nome do cliente}}', { a: '' })).toBe(
      '{{ a }} {{b}} {{nome do cliente}}',
    );
  });

  it('não interpreta `$&` nem `$1` no valor', () => {
    expect(preencher('[{{a}}] [{{b}}]', { a: '$&', b: '$1$$' })).toBe('[$&] [$1$$]');
  });

  it('não pega nomes herdados do Object', () => {
    expect(preencher('{{toString}}', {})).toBe('{{toString}}');
  });
});

describe('memória dos valores', () => {
  let armazenado: Map<string, string>;

  beforeEach(() => {
    armazenado = new Map();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => armazenado.get(k) ?? null,
      setItem: (k: string, v: string) => armazenado.set(k, v),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('salva e lê por id do Prompt', () => {
    salvarValores('p1', { a: 'x', b: '' });
    expect(armazenado.get('prompt-library:variaveis:p1')).toBe('{"a":"x","b":""}');
    expect(lerValoresSalvos('p1')).toEqual({ a: 'x', b: '' });
    expect(lerValoresSalvos('p2')).toEqual({});
  });

  it('ignora JSON inválido, não objeto e chaves que não são string', () => {
    armazenado.set('prompt-library:variaveis:p1', '{nao json');
    expect(lerValoresSalvos('p1')).toEqual({});
    armazenado.set('prompt-library:variaveis:p1', '["a"]');
    expect(lerValoresSalvos('p1')).toEqual({});
    armazenado.set('prompt-library:variaveis:p1', '{"a":"x","b":1,"c":null,"d":{"e":"f"}}');
    expect(lerValoresSalvos('p1')).toEqual({ a: 'x' });
  });

  it('sem localStorage, não lança', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('privado');
      },
      setItem: () => {
        throw new Error('privado');
      },
    });
    expect(lerValoresSalvos('p1')).toEqual({});
    expect(() => salvarValores('p1', { a: 'x' })).not.toThrow();
  });
});
