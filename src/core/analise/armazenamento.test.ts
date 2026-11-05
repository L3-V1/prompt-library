import { afterEach, describe, expect, it } from 'vitest';

import { AnaliseInvalidaError } from '../erros.js';
import { criarVaultTemporario, limparVaultsTemporarios } from '../teste/vault-temporario.js';
import type { Analise } from '../tipos.js';
import { criarArmazenamentoAnalises } from './armazenamento.js';

afterEach(limparVaultsTemporarios);

const ANALISE: Analise = {
  promptId: 'abc',
  baseHash: 'h',
  corpoOriginal: 'texto',
  rascunho: 'texto novo',
  instrucao: 'foque em concisão',
  modelo: 'sonnet',
  sugestoes: [
    {
      id: 's1',
      justificativa: 'j',
      trechoOriginal: 'texto',
      trechoNovo: 'prompt',
      status: 'pendente',
      inicio: 0,
    },
  ],
  execucao: { tipo: 'sugestao', sugestaoId: 's1', iniciadaEm: '2026-11-04T00:00:00.000Z' },
  erro: null,
  ultimaExecucao: { custoUsd: 0.01, duracaoMs: 900, modelo: 'claude-sonnet', descartadas: 0 },
  criadaEm: '2026-11-04T00:00:00.000Z',
  atualizadaEm: '2026-11-04T00:00:01.000Z',
};

describe('armazenamento de Análises', () => {
  it('listar: pasta ausente devolve [], e só os .json de ids válidos entram', async () => {
    const vault = await criarVaultTemporario();
    const arm = criarArmazenamentoAnalises(vault.pastas);
    expect(await arm.listar()).toEqual([]);
    await arm.gravar({ ...ANALISE, promptId: 'zeta' });
    await arm.gravar(ANALISE);
    await vault.escrever('Prompts/.analises/notas.txt', 'x');
    await vault.escrever('Prompts/.analises/.abc.json.tmp-123', '{}');
    expect(await arm.listar()).toEqual(['abc', 'zeta']);
    await arm.apagar('abc');
    expect(await arm.listar()).toEqual(['zeta']);
  });

  it('ida e volta em Prompts/.analises/<id>.json', async () => {
    const vault = await criarVaultTemporario();
    const arm = criarArmazenamentoAnalises(vault.pastas);
    expect(await arm.ler('abc')).toBeNull();
    await arm.gravar(ANALISE);
    expect(await vault.arquivos('Prompts/.analises')).toEqual(['abc.json']);
    expect(await arm.ler('abc')).toEqual(ANALISE);

    const semUltima: Analise = { ...ANALISE, execucao: null };
    delete semUltima.ultimaExecucao;
    await arm.gravar(semUltima);
    const lida = await arm.ler('abc');
    expect(lida).not.toHaveProperty('ultimaExecucao');
    expect(lida?.execucao).toBeNull();
  });

  it('JSON inválido ou fora do formato: erro claro, e o arquivo fica', async () => {
    const vault = await criarVaultTemporario({
      'Prompts/.analises/abc.json': '{ quebrado',
      'Prompts/.analises/def.json': JSON.stringify({ ...ANALISE, promptId: 'def', sugestoes: 3 }),
    });
    const arm = criarArmazenamentoAnalises(vault.pastas);
    await expect(arm.ler('abc')).rejects.toBeInstanceOf(AnaliseInvalidaError);
    await expect(arm.ler('abc')).rejects.toThrow(/JSON inválido/);
    await expect(arm.ler('def')).rejects.toThrow(/sugestoes/);
    expect(await vault.ler('Prompts/.analises/abc.json')).toBe('{ quebrado');
  });

  it('apagar devolve se havia; ids inválidos não tocam no disco', async () => {
    const vault = await criarVaultTemporario();
    const arm = criarArmazenamentoAnalises(vault.pastas);
    await arm.gravar(ANALISE);
    expect(await arm.apagar('abc')).toBe(true);
    expect(await arm.apagar('abc')).toBe(false);
    expect(await arm.ler('../x')).toBeNull();
    expect(await arm.apagar('../x')).toBe(false);
  });
});
