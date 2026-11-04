import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarAcervo } from './acervo.js';
import { ConflitoError, VersaoNaoEncontradaError } from './erros.js';
import { criarVaultTemporario, limparVaultsTemporarios } from './teste/vault-temporario.js';
import { criarVersoes } from './versoes.js';

afterEach(async () => {
  vi.useRealTimers();
  await limparVaultsTemporarios();
});

describe('versoes', () => {
  it('nomeia pelo carimbo e motivo e incrementa em colisão de milissegundo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-04T16:30:12.123Z'));
    const vault = await criarVaultTemporario();
    const versoes = criarVersoes(vault.pastas);
    const a = await versoes.registrar('abc', 'um', 'criacao');
    const b = await versoes.registrar('abc', 'dois', 'manual');
    expect(a).toEqual({
      id: '20261104T163012123Z-criacao',
      promptId: 'abc',
      criadaEm: '2026-11-04T16:30:12.123Z',
      motivo: 'criacao',
      caminho: '.versoes/abc/20261104T163012123Z-criacao.md',
    });
    expect(b.id).toBe('20261104T163012124Z-manual');
    expect((await versoes.listar('abc')).map((v) => v.id)).toEqual([b.id, a.id]);
    expect(await vault.ler('Prompts/.versoes/abc/20261104T163012124Z-manual.md')).toBe('dois');
    expect((await versoes.ler('abc', a.id)).conteudo).toBe('um');
  });

  it('lista vazio e rejeita ids de Versão inválidos', async () => {
    const vault = await criarVaultTemporario();
    const versoes = criarVersoes(vault.pastas);
    expect(await versoes.listar('abc')).toEqual([]);
    await expect(versoes.ler('abc', '../../x')).rejects.toThrow(VersaoNaoEncontradaError);
    await expect(versoes.ler('abc', '20261104T163012123Z-manual')).rejects.toThrow(
      VersaoNaoEncontradaError,
    );
  });
});

describe('Versões no acervo', () => {
  it('primeiro save de Prompt do Obsidian registra a Versão-base', async () => {
    const original = 'escrito no Obsidian\n';
    const vault = await criarVaultTemporario({ 'Prompts/Obs.md': original });
    const acervo = criarAcervo(vault.pastas);
    const [p] = (await acervo.listar()).prompts;
    if (!p) throw new Error('sem prompt');
    expect(await acervo.listarVersoes(p.id)).toEqual([]);

    await acervo.salvar(p.id, { corpo: 'melhorado\n' }, p.hash);
    const versoes = await acervo.listarVersoes(p.id);
    expect(versoes.map((v) => v.motivo)).toEqual(['manual', 'criacao']);
    const base = await acervo.lerVersao(p.id, versoes[1]!.id);
    expect(base.conteudo).toBe(`---\nid: ${p.id}\n---\n${original}`);
  });

  it('diff contra o estado atual e entre Versões', async () => {
    const vault = await criarVaultTemporario();
    const acervo = criarAcervo(vault.pastas);
    const p = await acervo.criar({ titulo: 'T', corpo: 'a\nb\n' });
    const [v1] = await acervo.listarVersoes(p.id);
    const salvo = await acervo.salvar(p.id, { corpo: 'a\nc\n' }, p.hash);
    const [v2] = await acervo.listarVersoes(p.id);

    const atual = await acervo.diff(p.id, v1!.id, 'atual');
    expect(atual.filter((c) => c.removed).map((c) => c.value)).toEqual(['b\n']);
    expect(atual.filter((c) => c.added).map((c) => c.value)).toEqual(['c\n']);
    expect(await acervo.diff(p.id, v1!.id, v2!.id)).toEqual(atual);
    expect((await acervo.diff(p.id, v2!.id, 'atual')).every((c) => !c.added && !c.removed)).toBe(
      true,
    );
    expect(salvo.corpo).toBe('a\nc\n');
  });

  it('restaurar cria nova Versão e preserva favorito, Coleção e campos desconhecidos', async () => {
    const vault = await criarVaultTemporario();
    const acervo = criarAcervo(vault.pastas);
    const p = await acervo.criar({ titulo: 'Original', corpo: 'v1', tags: ['a'], colecao: 'C' });
    const [v1] = await acervo.listarVersoes(p.id);
    const salvo = await acervo.salvar(p.id, { titulo: 'Mudado', corpo: 'v2', tags: ['b'] }, p.hash);
    await acervo.favoritar(p.id, true);
    await acervo.mover(p.id, 'D');
    const caminho = `Prompts/${(await acervo.ler(p.id)).caminho}`;
    await vault.escrever(
      caminho,
      (await vault.ler(caminho)).replace('favorito: true', 'favorito: true\nextra: x'),
    );
    const antes = await acervo.ler(p.id);
    expect(salvo.hash).not.toBe(antes.hash);

    const restaurado = await acervo.restaurar(p.id, v1!.id, antes.hash);
    expect(restaurado).toMatchObject({
      titulo: 'Original',
      corpo: 'v1',
      tags: ['a'],
      favorito: true,
      colecao: 'D',
      caminho: 'D/Original.md',
    });
    expect(await vault.ler('Prompts/D/Original.md')).toContain('extra: x');
    expect((await acervo.listarVersoes(p.id)).map((v) => v.motivo)).toEqual([
      'restauracao',
      'manual',
      'criacao',
    ]);
  });

  it('restaurar respeita o conflito', async () => {
    const vault = await criarVaultTemporario();
    const acervo = criarAcervo(vault.pastas);
    const p = await acervo.criar({ titulo: 'T', corpo: 'v1' });
    const [v1] = await acervo.listarVersoes(p.id);
    await acervo.salvar(p.id, { corpo: 'v2' }, p.hash);
    await expect(acervo.restaurar(p.id, v1!.id, p.hash)).rejects.toThrow(ConflitoError);
  });
});
