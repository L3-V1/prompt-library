import fs from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { criarAcervo } from './acervo.js';
import {
  ColecaoInvalidaError,
  ColecaoJaExisteError,
  ColecaoNaoEncontradaError,
  ConflitoError,
  PromptNaoEncontradoError,
} from './erros.js';
import { criarVaultTemporario, limparVaultsTemporarios } from './teste/vault-temporario.js';

afterEach(limparVaultsTemporarios);

async function montar(arquivos: Record<string, string> = {}) {
  const vault = await criarVaultTemporario(arquivos);
  return { vault, acervo: criarAcervo(vault.pastas) };
}

describe('varredura', () => {
  it('devolve vazio sem a pasta Prompts/ e não a cria', async () => {
    const { vault, acervo } = await montar();
    expect(await acervo.listar()).toEqual({ prompts: [], problemas: [] });
    expect(await acervo.listarColecoes()).toEqual([]);
    expect(await vault.existe('Prompts')).toBe(false);
  });

  it('ignora _*.md, ocultos e não-.md; Coleção é o primeiro nível', async () => {
    const { acervo } = await montar({
      'Prompts/_Diretrizes.md': 'diretrizes',
      'Prompts/.oculto.md': 'x',
      'Prompts/.versoes/abc/20260101T000000000Z-manual.md': 'x',
      'Prompts/.analises/a.md': 'x',
      'Prompts/_rascunhos/r.md': 'x',
      'Prompts/notas.txt': 'x',
      'Prompts/Raiz.md': '---\nid: raiz\n---\nr',
      'Prompts/Code review/PR.md': '---\nid: pr\n---\np',
      'Prompts/Code review/fundo/Aninhado.md': '---\nid: aninhado\n---\na',
    });
    const { prompts, problemas } = await acervo.listar();
    expect(problemas).toEqual([]);
    expect(prompts.map((p) => [p.caminho, p.colecao, p.titulo])).toEqual([
      ['Code review/fundo/Aninhado.md', 'Code review', 'Aninhado'],
      ['Code review/PR.md', 'Code review', 'PR'],
      ['Raiz.md', null, 'Raiz'],
    ]);
  });

  it('lê os campos e usa o nome do arquivo sem título', async () => {
    const { acervo } = await montar({
      'Prompts/A.md':
        '---\nid: a\ntitulo: Revisão de PR\ntags: [x, y]\nfavorito: true\n---\ncorpo\n',
      'Prompts/B.md': '---\nid: b\n---\n',
    });
    const [a, b] = (await acervo.listar()).prompts;
    expect(a).toMatchObject({
      id: 'a',
      titulo: 'Revisão de PR',
      tags: ['x', 'y'],
      favorito: true,
      corpo: 'corpo\n',
    });
    expect(a?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toMatchObject({ id: 'b', titulo: 'B', tags: [], favorito: false, corpo: '' });
  });

  it('YAML inválido vira problema e o arquivo fica intacto', async () => {
    const texto = '---\ntitulo: [quebrado\n---\ncorpo';
    const { vault, acervo } = await montar({ 'Prompts/Ruim.md': texto });
    const { prompts, problemas } = await acervo.listar();
    expect(prompts).toEqual([]);
    expect(problemas).toEqual([{ caminho: 'Ruim.md', mensagem: expect.stringContaining('YAML') }]);
    expect(await vault.ler('Prompts/Ruim.md')).toBe(texto);
  });
});

describe('id', () => {
  it('é atribuído só no frontmatter, com o corpo idêntico, e fica estável', async () => {
    const corpo = '\nCorpo com --- e espaços  \n\n';
    const { vault, acervo } = await montar({
      'Prompts/Teste/Sem id.md': `---\ntitulo: T\nextra: 1 # c\n---${'\n'}${corpo}`,
      'Prompts/Nu.md': 'sem frontmatter',
    });
    const primeira = await acervo.listar();
    const [nu, semId] = primeira.prompts;
    expect(semId?.id).toMatch(/^[0-9a-z]{12}$/);
    expect(await vault.ler('Prompts/Teste/Sem id.md')).toBe(
      `---\nid: ${semId?.id}\ntitulo: T\nextra: 1 # c\n---\n${corpo}`,
    );
    expect(await vault.ler('Prompts/Nu.md')).toBe(`---\nid: ${nu?.id}\n---\nsem frontmatter`);
    expect(nu?.corpo).toBe('sem frontmatter');

    const segunda = await acervo.listar();
    expect(segunda.prompts).toEqual(primeira.prompts);
    expect(await vault.arquivos('Prompts')).toEqual(['Nu.md', 'Teste/Sem id.md']);
  });

  it('id inválido é tratado como ausente', async () => {
    const { acervo } = await montar({ 'Prompts/X.md': '---\nid: ../fora\n---\n' });
    const [p] = (await acervo.listar()).prompts;
    expect(p?.id).toMatch(/^[0-9a-z]{12}$/);
  });

  it('duplicado: o arquivo mais antigo mantém o id', async () => {
    const { vault, acervo } = await montar({
      'Prompts/A original.md': '---\nid: dup\n---\na',
      'Prompts/B copia.md': '---\nid: dup\n---\na',
    });
    await fs.utimes(
      vault.caminho('Prompts/A original.md'),
      new Date(2026, 0, 2),
      new Date(2026, 0, 2),
    );
    await fs.utimes(
      vault.caminho('Prompts/B copia.md'),
      new Date(2026, 0, 1),
      new Date(2026, 0, 1),
    );
    const { prompts } = await acervo.listar();
    const porCaminho = Object.fromEntries(prompts.map((p) => [p.caminho, p.id]));
    expect(porCaminho['B copia.md']).toBe('dup');
    expect(porCaminho['A original.md']).not.toBe('dup');
    expect((await acervo.listar()).prompts.map((p) => p.id)).toEqual(prompts.map((p) => p.id));
  });
});

describe('escrita', () => {
  it('criar grava na Coleção, com colisão de nome e primeira Versão', async () => {
    const { vault, acervo } = await montar({
      'Prompts/Planejamento/Plano.md': '---\nid: existente\n---\n',
    });
    const p = await acervo.criar({
      titulo: 'Plano',
      corpo: 'faça um plano\n',
      tags: ['a', '#b', 'a'],
      colecao: 'Planejamento',
      origem: { projeto: 'proj', data: '2026-11-04', sessao: 's1' },
    });
    expect(p).toMatchObject({
      titulo: 'Plano',
      caminho: 'Planejamento/Plano 2.md',
      colecao: 'Planejamento',
      tags: ['a', 'b'],
      favorito: false,
      origem: { projeto: 'proj', data: '2026-11-04', sessao: 's1' },
    });
    expect(await vault.ler('Prompts/Planejamento/Plano 2.md')).toBe(
      `---\nid: ${p.id}\ntitulo: Plano\ntags: [a, b]\nfavorito: false\norigem:\n  projeto: proj\n  data: 2026-11-04\n  sessao: s1\n---\nfaça um plano\n`,
    );
    const versoes = await acervo.listarVersoes(p.id);
    expect(versoes.map((v) => v.motivo)).toEqual(['criacao']);
    expect(await vault.arquivos('Prompts/Planejamento')).toEqual(['Plano 2.md', 'Plano.md']);
  });

  it('criar com título com caracteres proibidos e Coleção nova', async () => {
    const { acervo } = await montar();
    const p = await acervo.criar({
      titulo: 'a/b: c?',
      corpo: '',
      colecao: 'Nova',
      motivo: 'captura',
    });
    expect(p.caminho).toBe('Nova/ab c.md');
    expect(p.titulo).toBe('a/b: c?');
    expect((await acervo.listarVersoes(p.id))[0]?.motivo).toBe('captura');
  });

  it('salvar aplica alterações, renomeia ao mudar o título e preserva o resto', async () => {
    const { vault, acervo } = await montar();
    const p = await acervo.criar({ titulo: 'Antigo', corpo: 'v1', tags: ['x'], colecao: 'C' });
    await acervo.favoritar(p.id, true);
    const base = await acervo.ler(p.id);
    const texto = (await vault.ler('Prompts/C/Antigo.md')).replace(
      'favorito: true',
      'favorito: true\nextra: mantido',
    );
    await vault.escrever('Prompts/C/Antigo.md', texto);
    const atual = await acervo.ler(p.id);
    expect(atual.hash).not.toBe(base.hash);

    const salvo = await acervo.salvar(
      p.id,
      { titulo: 'Novo', tags: ['y'], corpo: 'v2' },
      atual.hash,
    );
    expect(salvo).toMatchObject({
      titulo: 'Novo',
      tags: ['y'],
      corpo: 'v2',
      favorito: true,
      caminho: 'C/Novo.md',
    });
    expect(await vault.existe('Prompts/C/Antigo.md')).toBe(false);
    expect(await vault.ler('Prompts/C/Novo.md')).toBe(
      `---\nid: ${p.id}\ntitulo: Novo\ntags: [y]\nfavorito: true\nextra: mantido\n---\nv2`,
    );
    expect((await acervo.listarVersoes(p.id)).map((v) => v.motivo)).toEqual(['manual', 'criacao']);
    expect(await vault.arquivos('Prompts/C')).toEqual(['Novo.md']);
  });

  it('salvar sem mudança não cria Versão', async () => {
    const { acervo } = await montar();
    const p = await acervo.criar({ titulo: 'T', corpo: 'c' });
    expect(await acervo.salvar(p.id, { titulo: 'T', corpo: 'c', tags: [] }, p.hash)).toEqual(p);
    expect(await acervo.listarVersoes(p.id)).toHaveLength(1);
  });

  it('salvar com título de outro arquivo existente usa sufixo', async () => {
    const { acervo } = await montar({ 'Prompts/Ocupado.md': '---\nid: ocupado\n---\n' });
    const p = await acervo.criar({ titulo: 'Livre', corpo: '' });
    const salvo = await acervo.salvar(p.id, { titulo: 'Ocupado' }, p.hash);
    expect(salvo.caminho).toBe('Ocupado 2.md');
  });

  it('favoritar e mover não criam Versão', async () => {
    const { vault, acervo } = await montar({ 'Prompts/Destino/X.md': '---\nid: outro\n---\n' });
    const p = await acervo.criar({ titulo: 'X', corpo: 'c' });
    const fav = await acervo.favoritar(p.id, true);
    expect(fav.favorito).toBe(true);
    expect(fav.corpo).toBe('c');

    const movido = await acervo.mover(p.id, 'Destino');
    expect(movido).toMatchObject({ colecao: 'Destino', caminho: 'Destino/X 2.md', favorito: true });
    // o nome volta a acompanhar o título ao mudar de pasta
    const nova = await acervo.mover(p.id, 'Criada');
    expect(nova.caminho).toBe('Criada/X.md');
    const raiz = await acervo.mover(p.id, null);
    expect(raiz).toMatchObject({ colecao: null, caminho: 'X.md' });
    expect(await vault.existe('Prompts/Criada')).toBe(true);
    expect(await acervo.listarVersoes(p.id)).toHaveLength(1);
    await expect(acervo.mover(p.id, '.oculta')).rejects.toThrow(ColecaoInvalidaError);
  });

  it('excluir move para .trash/ com colisão e mantém as Versões', async () => {
    const { vault, acervo } = await montar({ '.trash/X.md': 'antigo' });
    const p = await acervo.criar({ titulo: 'X', corpo: 'c' });
    await acervo.excluir(p.id);
    expect(await vault.existe('Prompts/X.md')).toBe(false);
    expect(await vault.ler('.trash/X.md')).toBe('antigo');
    expect(await vault.ler('.trash/X 2.md')).toContain(`id: ${p.id}`);
    expect(await acervo.listarVersoes(p.id)).toHaveLength(1);
    await expect(acervo.ler(p.id)).rejects.toThrow(PromptNaoEncontradoError);
  });

  it('nenhum temporário sobra depois das escritas', async () => {
    const { vault, acervo } = await montar({ 'Prompts/Obs.md': 'corpo' });
    const p = await acervo.criar({ titulo: 'T', corpo: 'c' });
    await acervo.salvar(p.id, { corpo: 'd' }, p.hash);
    await acervo.favoritar(p.id, true);
    expect((await vault.arquivos()).filter((a) => a.includes('.tmp-'))).toEqual([]);
  });
});

describe('conflito', () => {
  it('arquivo editado por fora entre ler e salvar → ConflitoError e disco inalterado', async () => {
    const { vault, acervo } = await montar();
    const p = await acervo.criar({ titulo: 'T', corpo: 'original' });
    const editado = (await vault.ler('Prompts/T.md')).replace('original', 'editado no Obsidian');
    await vault.escrever('Prompts/T.md', editado);

    const erro = await acervo.salvar(p.id, { corpo: 'do app' }, p.hash).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoError);
    const conflito = erro as ConflitoError;
    expect(conflito.atual.corpo).toBe('editado no Obsidian');
    expect(conflito.hashNoDisco).toBe(conflito.atual.hash);
    expect(await vault.ler('Prompts/T.md')).toBe(editado);
    expect(await acervo.listarVersoes(p.id)).toHaveLength(1);
  });

  it('id inexistente → PromptNaoEncontradoError', async () => {
    const { acervo } = await montar();
    await expect(acervo.salvar('naoexiste', {}, 'x')).rejects.toThrow(PromptNaoEncontradoError);
    await expect(acervo.ler('../x')).rejects.toThrow(PromptNaoEncontradoError);
  });
});

describe('Coleções', () => {
  it('cria, lista (inclusive vazias) e renomeia', async () => {
    const { vault, acervo } = await montar({
      'Prompts/Beta/X.md': '---\nid: x\n---\n',
      'Prompts/_privado/a.md': '',
    });
    expect(await acervo.criarColecao('  Álfa/1  ')).toBe('Álfa1');
    expect(await acervo.listarColecoes()).toEqual(['Álfa1', 'Beta']);
    expect(await acervo.renomearColecao('Beta', 'Gama')).toBe('Gama');
    expect(await acervo.listarColecoes()).toEqual(['Álfa1', 'Gama']);
    expect((await acervo.ler('x')).colecao).toBe('Gama');
    expect(await vault.existe('Prompts/Gama/X.md')).toBe(true);
  });

  it('rejeita nomes inválidos e destino existente', async () => {
    const { acervo } = await montar({ 'Prompts/A/x.md': '', 'Prompts/B/y.md': '' });
    for (const nome of ['_x', '.x', '  .x', '', '///']) {
      await expect(acervo.criarColecao(nome)).rejects.toThrow(ColecaoInvalidaError);
    }
    await expect(acervo.criarColecao('A')).rejects.toThrow(ColecaoJaExisteError);
    await expect(acervo.renomearColecao('A', 'B')).rejects.toThrow(ColecaoJaExisteError);
    await expect(acervo.renomearColecao('A', '_B')).rejects.toThrow(ColecaoInvalidaError);
    await expect(acervo.renomearColecao('Z', 'W')).rejects.toThrow(ColecaoNaoEncontradaError);
    await expect(acervo.renomearColecao('../A', 'W')).rejects.toThrow(ColecaoNaoEncontradaError);
    await expect(acervo.criar({ titulo: 't', corpo: '', colecao: '_x' })).rejects.toThrow(
      ColecaoInvalidaError,
    );
  });
});
