import fs from 'node:fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { criarAcervo, criarDiretrizes } from '../core/index.js';
import { criarVaultTemporario, limparVaultsTemporarios } from '../core/teste/vault-temporario.js';
import { criarEventos, type Evento } from './eventos.js';
import { criarIndice } from './indice.js';
import { criarObservador, type Observador } from './observador.js';

const abertos: Observador[] = [];

afterEach(async () => {
  await Promise.all(abertos.splice(0).map((o) => o.fechar()));
  await limparVaultsTemporarios();
});

const ESPERA = { timeout: 5000, interval: 50 };

async function montar(arquivos: Record<string, string> = {}) {
  const vault = await criarVaultTemporario(arquivos);
  const acervo = criarAcervo(vault.pastas);
  const indice = criarIndice(acervo);
  const eventos = criarEventos();
  const recebidos: Evento[] = [];
  eventos.assinar((e) => recebidos.push(e));
  indice.ouvir((m) => eventos.emitir({ tipo: 'acervo', dados: m }));
  await indice.atualizar();
  const diretrizes = criarDiretrizes(vault.pastas);
  const observador = await criarObservador({ pastas: vault.pastas, indice, diretrizes, eventos });
  abertos.push(observador);
  return { vault, indice, recebidos };
}

describe('criarObservador', () => {
  it('cria Prompts/ na partida', async () => {
    const vault = await criarVaultTemporario();
    const observador = await criarObservador({
      pastas: vault.pastas,
      indice: { atualizar: vi.fn() },
      diretrizes: criarDiretrizes(vault.pastas),
      eventos: criarEventos(),
    });
    abertos.push(observador);
    expect(await vault.existe('Prompts')).toBe(true);
  });

  it('um .md escrito no vault gera o evento acervo e ganha id', async () => {
    const { vault, indice, recebidos } = await montar();
    await vault.escrever('Prompts/Teste.md', 'oi\n');
    await vi.waitFor(() => {
      const acervo = recebidos.find((e) => e.tipo === 'acervo');
      expect(acervo?.dados).toMatchObject({ criados: [expect.any(String)] });
    }, ESPERA);
    const [prompt] = indice.listar();
    expect(prompt?.corpo).toBe('oi\n');
    expect(await vault.ler('Prompts/Teste.md')).toContain(`id: ${prompt?.id ?? ''}`);
  });

  it('editar _Diretrizes.md gera o evento diretrizes com o novo hash', async () => {
    const { vault, recebidos } = await montar({ 'Prompts/_Diretrizes.md': 'v1' });
    await vault.escrever('Prompts/_Diretrizes.md', 'v2');
    await vi.waitFor(() => {
      expect(recebidos.filter((e) => e.tipo === 'diretrizes')).toEqual([
        { tipo: 'diretrizes', dados: { hash: expect.stringMatching(/^[0-9a-f]{64}$/) } },
      ]);
    }, ESPERA);
    expect(recebidos.some((e) => e.tipo === 'acervo')).toBe(false);
  });

  it('nada em .versoes/ nem em arquivos ocultos dispara releitura', async () => {
    const vault = await criarVaultTemporario({ 'Prompts/A.md': '---\nid: a\n---\na' });
    const atualizar = vi.fn(async () => ({ criados: [], alterados: [], removidos: [] }));
    const observador = await criarObservador({
      pastas: vault.pastas,
      indice: { atualizar },
      diretrizes: criarDiretrizes(vault.pastas),
      eventos: criarEventos(),
    });
    abertos.push(observador);

    await vault.escrever('Prompts/.versoes/a/20260101T000000000Z-manual.md', 'x');
    await vault.escrever('Prompts/.analises/a.md', 'x');
    await vault.escrever('Prompts/.A.md.tmp-123', 'x');
    await new Promise((r) => setTimeout(r, 600));
    expect(atualizar).not.toHaveBeenCalled();

    // Controle: um .md visível dispara.
    await vault.escrever('Prompts/B.md', 'b');
    await vi.waitFor(() => expect(atualizar).toHaveBeenCalled(), ESPERA);
  });

  it('criar uma pasta (Coleção) dispara releitura', async () => {
    const { vault, indice, recebidos } = await montar();
    await fs.mkdir(vault.caminho('Prompts/Nova'));
    await vi.waitFor(() => expect(recebidos.some((e) => e.tipo === 'acervo')).toBe(true), ESPERA);
    expect(indice.colecoes().map((c) => c.nome)).toEqual([null, 'Nova']);
  });
});
