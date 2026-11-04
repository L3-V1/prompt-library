import fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { caminhoLivre, gravarAtomico, hashDe, limparNome, nomeSeguro } from './arquivos.js';
import { criarVaultTemporario, limparVaultsTemporarios } from './teste/vault-temporario.js';

afterEach(limparVaultsTemporarios);

describe('nomeSeguro', () => {
  it('remove caracteres proibidos e apara', () => {
    expect(nomeSeguro('  a/b\\c:d*e?f"g<h>i|j#k^l[m]n  ')).toBe('abcdefghijklmn');
    expect(nomeSeguro('Revisão  de\tPR')).toBe('Revisão de PR');
  });

  it('vazio vira "Sem título"', () => {
    expect(nomeSeguro('  ')).toBe('Sem título');
    expect(nomeSeguro('///')).toBe('Sem título');
    expect(limparNome('///')).toBe('');
  });

  it('não gera nomes ocultos nem ignorados', () => {
    expect(nomeSeguro('.env')).toBe('env');
    expect(nomeSeguro('_rascunho')).toBe('rascunho');
  });

  it('limita o tamanho', () => {
    expect(Array.from(nomeSeguro('é'.repeat(500)))).toHaveLength(120);
  });
});

describe('caminhoLivre', () => {
  it('acrescenta sufixo em colisão e aceita o próprio arquivo', async () => {
    const v = await criarVaultTemporario({ 'd/a.md': '', 'd/a 2.md': '' });
    const dir = v.caminho('d');
    expect(await caminhoLivre(dir, 'b')).toBe(path.join(dir, 'b.md'));
    expect(await caminhoLivre(dir, 'a')).toBe(path.join(dir, 'a 3.md'));
    expect(await caminhoLivre(dir, 'a', '.md', path.join(dir, 'a.md'))).toBe(
      path.join(dir, 'a.md'),
    );
  });
});

describe('gravarAtomico', () => {
  it('grava sem deixar temporários', async () => {
    const v = await criarVaultTemporario({ 'd/x.md': 'antigo' });
    await gravarAtomico(v.caminho('d/x.md'), 'novo');
    expect(await v.ler('d/x.md')).toBe('novo');
    expect(await fs.readdir(v.caminho('d'))).toEqual(['x.md']);
  });

  it('remove o temporário em caso de erro', async () => {
    const v = await criarVaultTemporario({ 'd/sub/y.md': '' });
    // rename de arquivo sobre diretório não vazio falha
    await expect(gravarAtomico(v.caminho('d/sub'), 'x')).rejects.toThrow();
    expect(await fs.readdir(v.caminho('d'))).toEqual(['sub']);
  });
});

describe('hashDe', () => {
  it('é o sha256 hex', () => {
    expect(hashDe('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hashDe(Buffer.from('abc'))).toBe(hashDe('abc'));
  });
});
