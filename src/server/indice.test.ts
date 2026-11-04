import fs from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarAcervo, type ResultadoListagem } from '../core/index.js';
import { criarVaultTemporario, limparVaultsTemporarios } from '../core/teste/vault-temporario.js';
import { criarIndice, resumir, type Mudancas } from './indice.js';
import { prompt } from '../core/teste/prompt.js';

afterEach(limparVaultsTemporarios);

describe('criarIndice sobre um vault', () => {
  it('detecta criados, alterados e removidos e só emite quando muda', async () => {
    const vault = await criarVaultTemporario({
      'Prompts/A.md': '---\nid: a\n---\na',
      'Prompts/B.md': '---\nid: b\n---\nb',
    });
    const indice = criarIndice(criarAcervo(vault.pastas));
    const eventos: Mudancas[] = [];
    indice.ouvir((m) => eventos.push(m));

    expect(await indice.atualizar()).toEqual({ criados: ['a', 'b'], alterados: [], removidos: [] });
    expect(eventos).toHaveLength(1);

    expect(await indice.atualizar()).toEqual({ criados: [], alterados: [], removidos: [] });
    expect(eventos).toHaveLength(1);

    await vault.escrever('Prompts/A.md', '---\nid: a\n---\na editado');
    await vault.escrever('Prompts/C.md', '---\nid: c\n---\nc');
    await fs.rm(vault.caminho('Prompts/B.md'));
    expect(await indice.atualizar()).toEqual({
      criados: ['c'],
      alterados: ['a'],
      removidos: ['b'],
    });
    expect(eventos).toHaveLength(2);
    expect(indice.obter('a')?.corpo).toBe('a editado');
    expect(indice.obter('b')).toBeUndefined();
  });

  it('mover de pasta conta como alterado', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/A.md': '---\nid: a\n---\na' });
    const acervo = criarAcervo(vault.pastas);
    const indice = criarIndice(acervo);
    await indice.atualizar();
    await acervo.mover('a', 'Nova');
    expect(await indice.atualizar()).toEqual({ criados: [], alterados: ['a'], removidos: [] });
  });

  it('emite quando só muda o conjunto de Coleções', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/A.md': '---\nid: a\n---\na' });
    const acervo = criarAcervo(vault.pastas);
    const indice = criarIndice(acervo);
    await indice.atualizar();
    const ouvinte = vi.fn();
    indice.ouvir(ouvinte);
    await acervo.criarColecao('Vazia');
    await indice.atualizar();
    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(indice.colecoes()).toEqual([
      { nome: null, total: 1 },
      { nome: 'Vazia', total: 0 },
    ]);
  });

  it('colecoes, tags, problemas e listar com filtros', async () => {
    const vault = await criarVaultTemporario({
      'Prompts/A.md': '---\nid: a\ntags: [x, y]\n---\na',
      'Prompts/Code/B.md': '---\nid: b\ntags: [x]\nfavorito: true\n---\nb',
      'Prompts/Code/C.md': '---\nid: c\n---\nc',
      'Prompts/Quebrado.md': '---\n: [\n---\n',
      'Prompts/Ética/.gitkeep': '',
    });
    const indice = criarIndice(criarAcervo(vault.pastas));
    await indice.atualizar();
    expect(indice.colecoes()).toEqual([
      { nome: null, total: 1 },
      { nome: 'Code', total: 2 },
      { nome: 'Ética', total: 0 },
    ]);
    expect(indice.tags()).toEqual([
      { tag: 'x', total: 2 },
      { tag: 'y', total: 1 },
    ]);
    expect(indice.problemas().map((p) => p.caminho)).toEqual(['Quebrado.md']);
    expect(indice.listar({ colecao: 'Code', favorito: true }).map((p) => p.id)).toEqual(['b']);
  });
});

describe('single-flight', () => {
  function acervoFalso() {
    const pendentes: ((r: ResultadoListagem) => void)[] = [];
    const listar = vi.fn(
      () => new Promise<ResultadoListagem>((resolve) => pendentes.push(resolve)),
    );
    return { listar, listarColecoes: vi.fn(async () => []), pendentes };
  }

  it('uma releitura por vez; pedidos durante ela compartilham a próxima rodada', async () => {
    const acervo = acervoFalso();
    const indice = criarIndice(acervo);

    const primeira = indice.atualizar();
    const segunda = indice.atualizar();
    const terceira = indice.atualizar();
    expect(segunda).toBe(terceira);
    expect(acervo.listar).toHaveBeenCalledTimes(1);

    acervo.pendentes.shift()?.({ prompts: [prompt({ id: 'a' })], problemas: [] });
    expect(await primeira).toEqual({ criados: ['a'], alterados: [], removidos: [] });

    await vi.waitFor(() => expect(acervo.listar).toHaveBeenCalledTimes(2));
    acervo.pendentes.shift()?.({ prompts: [prompt({ id: 'b' })], problemas: [] });
    expect(await segunda).toEqual({ criados: ['b'], alterados: [], removidos: ['a'] });
    expect(acervo.listar).toHaveBeenCalledTimes(2);
  });

  it('uma falha não trava as próximas releituras', async () => {
    const acervo = acervoFalso();
    acervo.listar.mockRejectedValueOnce(new Error('falhou'));
    const indice = criarIndice(acervo);
    await expect(indice.atualizar()).rejects.toThrow('falhou');
    const depois = indice.atualizar();
    acervo.pendentes.shift()?.({ prompts: [], problemas: [] });
    await expect(depois).resolves.toEqual({ criados: [], alterados: [], removidos: [] });
  });
});

describe('resumir', () => {
  it('tira o corpo', () => {
    const r = resumir(prompt({ id: 'a', corpo: 'segredo' }));
    expect(r).not.toHaveProperty('corpo');
    expect(r.id).toBe('a');
  });
});
