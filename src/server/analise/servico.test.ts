import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ConflitoError,
  criarAcervo,
  criarArmazenamentoAnalises,
  criarDiretrizes,
  type Analise,
} from '../../core/index.js';
import {
  criarVaultTemporario,
  limparVaultsTemporarios,
} from '../../core/teste/vault-temporario.js';
import { criarEventos, type Evento } from '../eventos.js';
import type { ExecutorClaude, PedidoClaude, RespostaClaude } from './claude.js';
import { ExecucaoCanceladaError, ExecucaoClaudeError } from './claude.js';
import { criarServicoAnalise, MENSAGEM_INTERROMPIDA } from './servico.js';

afterEach(limparVaultsTemporarios);

const CORPO = 'Revise o código com muito cuidado. Aponte os erros.\n';
const PROMPT = `---\nid: p1\ntitulo: Revisor\n---\n${CORPO}`;

/** Executor falso controlado pelo teste: cada chamada fica pendente até `responder` ou `falhar`. */
function executorFalso() {
  const chamadas: {
    pedido: PedidoClaude;
    resolve: (r: RespostaClaude) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const executor: ExecutorClaude = (pedido) =>
    new Promise((resolve, reject) => {
      chamadas.push({ pedido, resolve, reject });
      pedido.sinal.addEventListener('abort', () => reject(new ExecucaoCanceladaError()));
    });
  const ultima = () => {
    const c = chamadas.at(-1);
    if (!c) throw new Error('nenhuma chamada');
    return c;
  };
  return {
    executor,
    chamadas,
    responder(sugestoes: { justificativa?: string; trechoOriginal: string; trechoNovo: string }[]) {
      ultima().resolve({
        saida: { sugestoes: sugestoes.map((s) => ({ justificativa: 'j', ...s })) },
        custoUsd: 0.02,
        duracaoMs: 1500,
        modelo: 'claude-sonnet-x',
      });
    },
    falhar(erro: unknown) {
      ultima().reject(erro);
    },
  };
}

async function montar() {
  const vault = await criarVaultTemporario({
    'Prompts/Revisor.md': PROMPT,
    'Prompts/_Diretrizes.md': 'Seja direto.',
  });
  const acervo = criarAcervo(vault.pastas);
  const eventos = criarEventos();
  const recebidos: Extract<Evento, { tipo: 'analise' }>['dados'][] = [];
  eventos.assinar((e) => {
    if (e.tipo === 'analise') recebidos.push(e.dados);
  });
  const falso = executorFalso();
  const novoServico = () =>
    criarServicoAnalise({
      acervo,
      diretrizes: criarDiretrizes(vault.pastas),
      armazenamento: criarArmazenamentoAnalises(vault.pastas),
      eventos,
      executor: falso.executor,
      pastas: vault.pastas,
    });
  const servico = novoServico();
  /** Espera o próximo evento que satisfaz `cond`. */
  const esperarEvento = (cond: (a: Analise | null) => boolean) =>
    vi.waitFor(() => {
      const ultimo = recebidos.at(-1);
      if (!ultimo || !cond(ultimo.analise)) throw new Error('ainda não');
      return ultimo.analise;
    });
  return { vault, acervo, eventos, recebidos, falso, servico, novoServico, esperarEvento };
}

describe('servico de Análise', () => {
  it('iniciar → evento com execucao → Sugestões prontas', async () => {
    const { servico, falso, recebidos, esperarEvento, vault } = await montar();
    const a = await servico.iniciar('p1', { instrucao: ' foque em concisão ', modelo: 'sonnet' });
    expect(a).toMatchObject({
      rascunho: CORPO,
      corpoOriginal: CORPO,
      instrucao: 'foque em concisão',
      modelo: 'sonnet',
      execucao: { tipo: 'analise' },
    });
    expect(recebidos[0]?.analise?.execucao?.tipo).toBe('analise');
    expect(await vault.existe('Prompts/.analises/p1.json')).toBe(true);

    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    const { pedido } = falso.chamadas[0]!;
    expect(pedido.modelo).toBe('sonnet');
    expect(pedido.cwd).toBe(vault.pastas.prompts);
    expect(pedido.prompt).toContain('Seja direto.');
    expect(pedido.prompt).toContain('foque em concisão');
    expect(pedido.prompt).toContain('Revisor.md');

    falso.responder([
      { trechoOriginal: 'com muito cuidado', trechoNovo: 'com cuidado' },
      { trechoOriginal: 'inexistente', trechoNovo: 'x' },
    ]);
    const pronta = await esperarEvento((x) => x?.execucao === null);
    expect(pronta?.sugestoes).toHaveLength(1);
    expect(pronta?.sugestoes[0]).toMatchObject({
      status: 'pendente',
      inicio: CORPO.indexOf('com muito'),
    });
    expect(pronta?.ultimaExecucao).toEqual({
      custoUsd: 0.02,
      duracaoMs: 1500,
      modelo: 'claude-sonnet-x',
      descartadas: 1,
    });
    expect(await servico.ler('p1')).toEqual(pronta);
  });

  it('erro do Claude fica em `erro`; iniciar de novo dá 409 analise_existente', async () => {
    const { servico, falso, esperarEvento } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.falhar(new ExecucaoClaudeError('Claude Code não encontrado (instale…)'));
    const com = await esperarEvento((x) => x?.erro !== null);
    expect(com?.erro).toMatch(/não encontrado/);
    expect(com?.execucao).toBeNull();
    await expect(servico.iniciar('p1')).rejects.toMatchObject({ codigo: 'analise_existente' });
  });

  it('409 analise_em_execucao com um job rodando', async () => {
    const { servico, falso, esperarEvento } = await montar();
    await servico.iniciar('p1');
    await expect(servico.regenerar('p1')).rejects.toMatchObject({
      status: 409,
      codigo: 'analise_em_execucao',
    });
    await expect(servico.concluir('p1')).rejects.toMatchObject({ codigo: 'analise_em_execucao' });
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.responder([{ trechoOriginal: 'Aponte os erros', trechoNovo: 'Liste os erros' }]);
    const pronta = await esperarEvento((x) => x?.execucao === null);
    const sid = pronta!.sugestoes[0]!.id;
    await servico.regenerarSugestao('p1', sid);
    await expect(servico.regenerarSugestao('p1', sid)).rejects.toMatchObject({
      codigo: 'analise_em_execucao',
    });
  });

  it('cancelar aborta o job e limpa a execucao', async () => {
    const { servico, falso } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    const a = await servico.cancelar('p1');
    expect(a.execucao).toBeNull();
    expect(falso.chamadas[0]!.pedido.sinal.aborted).toBe(true);
    // O fim (abortado) do job é ignorado: nada de erro gravado.
    await new Promise((r) => setTimeout(r, 20));
    expect((await servico.ler('p1'))?.erro).toBeNull();
  });

  it('emite a atividade do Claude: null ao iniciar, os tool_use e nada depois de cancelar', async () => {
    const { servico, falso, eventos } = await montar();
    const atividades: Extract<Evento, { tipo: 'atividade' }>['dados'][] = [];
    eventos.assinar((e) => {
      if (e.tipo === 'atividade') atividades.push(e.dados);
    });
    await servico.iniciar('p1');
    expect(atividades).toEqual([{ promptId: 'p1', atividade: null }]);
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    const { aoAtivar } = falso.chamadas[0]!.pedido;
    aoAtivar?.({ tipo: 'ler', caminho: 'Revisor.md' });
    expect(atividades.at(-1)).toEqual({
      promptId: 'p1',
      atividade: { tipo: 'ler', caminho: 'Revisor.md' },
    });
    await servico.cancelar('p1');
    aoAtivar?.({ tipo: 'buscar', termo: 'x' });
    expect(atividades).toHaveLength(2);
  });

  it('descartar durante o job: o resultado é ignorado e o Prompt fica intacto', async () => {
    const { servico, falso, vault, recebidos } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    expect(await servico.descartar('p1')).toBe(true);
    expect(recebidos.at(-1)).toEqual({ promptId: 'p1', analise: null });
    falso.chamadas[0]!.resolve({
      saida: { sugestoes: [] },
      custoUsd: 0,
      duracaoMs: 0,
      modelo: 'x',
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(await vault.existe('Prompts/.analises/p1.json')).toBe(false);
    expect(await vault.ler('Prompts/Revisor.md')).toBe(PROMPT);
    expect(await servico.ler('p1')).toBeNull();
  });

  it('execução de antes de um reinício vira erro "interrompida", e tentar de novo funciona', async () => {
    const { servico, novoServico, falso, esperarEvento } = await montar();
    await servico.iniciar('p1');
    const reiniciado = novoServico();
    const lida = await reiniciado.ler('p1');
    expect(lida?.execucao).toBeNull();
    expect(lida?.erro).toBe(MENSAGEM_INTERROMPIDA);

    await reiniciado.regenerar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(2));
    falso.responder([{ trechoOriginal: 'Aponte', trechoNovo: 'Mostre' }]);
    const pronta = await esperarEvento((x) => x?.execucao === null && x.sugestoes.length > 0);
    expect(pronta?.erro).toBeNull();
  });

  it('aceitar, rejeitar e editar o Rascunho; concluir cria uma Versão analise e apaga o JSON', async () => {
    const { servico, falso, esperarEvento, vault, acervo, recebidos } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.responder([
      { trechoOriginal: 'com muito cuidado', trechoNovo: 'com cuidado' },
      { trechoOriginal: 'Aponte os erros', trechoNovo: 'Liste os erros' },
    ]);
    const pronta = await esperarEvento((x) => x?.execucao === null);
    const [s1, s2] = pronta!.sugestoes;

    const aceita = await servico.aceitar('p1', s1!.id);
    expect(aceita.rascunho).toBe('Revise o código com cuidado. Aponte os erros.\n');
    await expect(servico.aceitar('p1', s1!.id)).rejects.toThrow(/decidida/);

    const editada = await servico.salvarRascunho('p1', aceita.rascunho.replace('Aponte', 'Mostre'));
    expect(editada.sugestoes[1]?.status).toBe('desatualizada');
    await servico.rejeitar('p1', s2!.id);

    const versoesAntes = await vault.arquivos('Prompts/.versoes/p1');
    const prompt = await servico.concluir('p1');
    expect(prompt.corpo).toBe('Revise o código com cuidado. Mostre os erros.\n');
    const novas = (await vault.arquivos('Prompts/.versoes/p1')).filter(
      (v) => !versoesAntes.includes(v),
    );
    expect(novas.filter((v) => v.endsWith('-analise.md'))).toHaveLength(1);
    expect(await vault.existe('Prompts/.analises/p1.json')).toBe(false);
    expect(recebidos.at(-1)).toEqual({ promptId: 'p1', analise: null });
    expect((await acervo.ler('p1')).corpo).toBe(prompt.corpo);
  });

  it('concluir com o Prompt alterado fora: ConflitoError; com o baseHash do disco, sobrescreve', async () => {
    const { servico, falso, esperarEvento, vault } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.responder([]);
    await esperarEvento((x) => x?.execucao === null);
    await servico.salvarRascunho('p1', 'Texto da Análise.\n');
    await vault.escrever('Prompts/Revisor.md', PROMPT + 'Linha do Obsidian.\n');

    const erro = await servico.concluir('p1').catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ConflitoError);
    expect(await vault.existe('Prompts/.analises/p1.json')).toBe(true);

    const prompt = await servico.concluir('p1', { baseHash: (erro as ConflitoError).hashNoDisco });
    expect(prompt.corpo).toBe('Texto da Análise.\n');
  });

  it('concluir com só os metadados mudados fora (Favorito) não dá conflito', async () => {
    const { servico, falso, esperarEvento, acervo } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.responder([]);
    await esperarEvento((x) => x?.execucao === null);
    await acervo.favoritar('p1', true);
    await servico.salvarRascunho('p1', 'Novo.\n');
    const prompt = await servico.concluir('p1');
    expect(prompt).toMatchObject({ corpo: 'Novo.\n', favorito: true });
  });

  it('regenerar uma Sugestão manda o alvo e as rejeitadas, e a troca na mesma posição', async () => {
    const { servico, falso, esperarEvento } = await montar();
    await servico.iniciar('p1');
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(1));
    falso.responder([
      { trechoOriginal: 'Revise', trechoNovo: 'Analise' },
      { trechoOriginal: 'muito cuidado', trechoNovo: 'cuidado' },
      { trechoOriginal: 'Aponte', trechoNovo: 'Liste' },
    ]);
    const pronta = await esperarEvento((x) => x?.execucao === null);
    const [a, b, c] = pronta!.sugestoes;
    await servico.rejeitar('p1', a!.id);
    await servico.regenerarSugestao('p1', b!.id);
    await vi.waitFor(() => expect(falso.chamadas).toHaveLength(2));
    const texto = falso.chamadas[1]!.pedido.prompt;
    expect(texto).toMatch(/já rejeitadas[\s\S]*"Revise"/);
    expect(texto).toMatch(/regenerar esta Sugestão[\s\S]*"muito cuidado"/);
    falso.responder([{ trechoOriginal: 'com muito cuidado', trechoNovo: 'com atenção' }]);
    const nova = await esperarEvento((x) => x?.execucao === null && x.sugestoes[1]?.id !== b!.id);
    expect(nova?.sugestoes.map((s) => s.trechoNovo)).toEqual(['Analise', 'com atenção', 'Liste']);
    expect(nova?.sugestoes[2]?.id).toBe(c!.id);
  });
});
