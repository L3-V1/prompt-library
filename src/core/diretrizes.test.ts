import { afterEach, describe, expect, it } from 'vitest';

import { hashDe } from './arquivos.js';
import { criarDiretrizes } from './diretrizes.js';
import { DiretrizesConflitoError } from './erros.js';
import { criarVaultTemporario, limparVaultsTemporarios } from './teste/vault-temporario.js';

afterEach(limparVaultsTemporarios);

describe('criarDiretrizes', () => {
  it('arquivo ausente vale conteúdo vazio e hash null', async () => {
    const vault = await criarVaultTemporario();
    expect(await criarDiretrizes(vault.pastas).ler()).toEqual({ conteudo: '', hash: null });
  });

  it('salvar com baseHash null cria o arquivo (e a pasta Prompts/)', async () => {
    const vault = await criarVaultTemporario();
    const diretrizes = criarDiretrizes(vault.pastas);
    const salvo = await diretrizes.salvar('Seja breve.\n', null);
    expect(salvo).toEqual({ conteudo: 'Seja breve.\n', hash: hashDe('Seja breve.\n') });
    expect(await vault.ler('Prompts/_Diretrizes.md')).toBe('Seja breve.\n');
    expect(await diretrizes.ler()).toEqual(salvo);
  });

  it('salvar com o hash atual sobrescreve', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/_Diretrizes.md': 'v1' });
    const diretrizes = criarDiretrizes(vault.pastas);
    const { hash } = await diretrizes.ler();
    await diretrizes.salvar('v2', hash);
    expect(await vault.ler('Prompts/_Diretrizes.md')).toBe('v2');
  });

  it('conflito com hash antigo traz o estado do disco', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/_Diretrizes.md': 'v1' });
    const diretrizes = criarDiretrizes(vault.pastas);
    const { hash } = await diretrizes.ler();
    await vault.escrever('Prompts/_Diretrizes.md', 'editado no Obsidian');
    const erro = await diretrizes.salvar('v2', hash).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(DiretrizesConflitoError);
    expect((erro as DiretrizesConflitoError).atual).toEqual({
      conteudo: 'editado no Obsidian',
      hash: hashDe('editado no Obsidian'),
    });
    expect(await vault.ler('Prompts/_Diretrizes.md')).toBe('editado no Obsidian');
  });

  it('conflito com baseHash null quando o arquivo já existe', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/_Diretrizes.md': 'já existe' });
    await expect(criarDiretrizes(vault.pastas).salvar('novo', null)).rejects.toBeInstanceOf(
      DiretrizesConflitoError,
    );
    expect(await vault.ler('Prompts/_Diretrizes.md')).toBe('já existe');
  });
});
