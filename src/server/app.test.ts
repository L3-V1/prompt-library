import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  criarAcervo,
  criarArmazenamentoAnalises,
  criarDiretrizes,
  type Analise,
  type Prompt,
} from '../core/index.js';
import { criarVaultTemporario, limparVaultsTemporarios } from '../core/teste/vault-temporario.js';
import type { ExecutorClaude } from './analise/claude.js';
import { criarServicoAnalise } from './analise/servico.js';
import { criarApp } from './app.js';
import { criarEventos } from './eventos.js';
import { criarIndice } from './indice.js';

afterEach(limparVaultsTemporarios);

const BASE = 'http://127.0.0.1:5174';

async function montar(arquivos: Record<string, string> = {}) {
  const vault = await criarVaultTemporario(arquivos);
  const acervo = criarAcervo(vault.pastas);
  const indice = criarIndice(acervo);
  await indice.atualizar();
  const eventos = criarEventos();
  const diretrizes = criarDiretrizes(vault.pastas);
  // Executor falso: responde as Sugestões de `respostaClaude` na hora.
  const respostaClaude = {
    sugestoes: [] as { justificativa: string; trechoOriginal: string; trechoNovo: string }[],
  };
  const executor: ExecutorClaude = () =>
    Promise.resolve({ saida: respostaClaude, custoUsd: 0.01, duracaoMs: 10, modelo: 'falso' });
  const analises = criarServicoAnalise({
    acervo,
    diretrizes,
    armazenamento: criarArmazenamentoAnalises(vault.pastas),
    eventos,
    executor,
    pastas: vault.pastas,
  });
  const app = criarApp({ acervo, indice, diretrizes, eventos, analises });
  const pedir = (rota: string, init: RequestInit = {}) => app.request(`${BASE}${rota}`, init);
  const json = (
    metodo: string,
    rota: string,
    corpo: unknown,
    headers: Record<string, string> = {},
  ) =>
    pedir(rota, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(corpo),
    });
  return { vault, acervo, indice, eventos, analises, respostaClaude, app, pedir, json };
}

const PROMPT_A = '---\nid: a\ntitulo: Revisão de código\ntags: [code]\n---\nRevise o código.\n';

describe('prompts', () => {
  it('GET /api/prompts lista resumos (sem corpo) e problemas, com filtros', async () => {
    const { pedir } = await montar({
      'Prompts/A.md': PROMPT_A,
      'Prompts/Escrita/B.md': '---\nid: b\nfavorito: true\n---\nTexto',
      'Prompts/Quebrado.md': '---\n: [\n---\n',
    });
    const r = await pedir('/api/prompts');
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { prompts: Prompt[]; problemas: unknown[] };
    expect(corpo.prompts.map((p) => p.id)).toEqual(['b', 'a']);
    expect(corpo.prompts[0]).not.toHaveProperty('corpo');
    expect(corpo.problemas).toHaveLength(1);

    const busca = async (q: string) =>
      ((await (await pedir(`/api/prompts?${q}`)).json()) as { prompts: Prompt[] }).prompts.map(
        (p) => p.id,
      );
    expect(await busca('q=codigo')).toEqual(['a']);
    expect(await busca('colecao=')).toEqual(['a']);
    expect(await busca('colecao=Escrita')).toEqual(['b']);
    expect(await busca('tag=code')).toEqual(['a']);
    expect(await busca('favorito=true')).toEqual(['b']);
  });

  it('GET /api/prompts com favorito inválido responde 400 em pt-BR', async () => {
    const { pedir } = await montar();
    const r = await pedir('/api/prompts?favorito=talvez');
    expect(r.status).toBe(400);
    const corpo = (await r.json()) as { erro: string; codigo: string };
    expect(corpo.codigo).toBe('validacao');
    expect(corpo.erro).toMatch(/^favorito: /);
    expect(corpo.erro).toMatch(/inválid/i);
  });

  it('GET /api/prompts/:id e 404', async () => {
    const { pedir } = await montar({ 'Prompts/A.md': PROMPT_A });
    const r = await pedir('/api/prompts/a');
    expect(r.status).toBe(200);
    expect(((await r.json()) as Prompt).corpo).toBe('Revise o código.\n');

    const nao = await pedir('/api/prompts/zzz');
    expect(nao.status).toBe(404);
    expect(await nao.json()).toEqual({
      erro: 'Prompt não encontrado: zzz',
      codigo: 'prompt_nao_encontrado',
    });
  });

  it('GET /api/prompts/:id/copia devolve só o corpo em text/plain', async () => {
    const { pedir } = await montar({ 'Prompts/A.md': PROMPT_A });
    const r = await pedir('/api/prompts/a/copia');
    expect(r.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(await r.text()).toBe('Revise o código.\n');
  });

  it('POST cria (201) e o índice já vê o novo Prompt', async () => {
    const { json, pedir, vault } = await montar();
    const r = await json('POST', '/api/prompts', {
      titulo: 'Novo',
      corpo: 'oi',
      tags: ['t'],
      colecao: 'Col',
    });
    expect(r.status).toBe(201);
    const criado = (await r.json()) as Prompt;
    expect(criado).toMatchObject({ titulo: 'Novo', corpo: 'oi', tags: ['t'], colecao: 'Col' });
    expect(await vault.existe('Prompts/Col/Novo.md')).toBe(true);
    expect((await pedir(`/api/prompts/${criado.id}`)).status).toBe(200);
  });

  it('POST sem titulo responde 400; JSON malformado também', async () => {
    const { json, pedir } = await montar();
    const r = await json('POST', '/api/prompts', { corpo: 'x' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/^titulo: /);

    const malformado = await pedir('/api/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(malformado.status).toBe(400);
    expect(((await malformado.json()) as { codigo: string }).codigo).toBe('requisicao_invalida');
  });

  it('PUT salva com o hash atual e cria Versão', async () => {
    const { json, vault, acervo } = await montar({ 'Prompts/A.md': PROMPT_A });
    const atual = await acervo.ler('a');
    const r = await json('PUT', '/api/prompts/a', { corpo: 'novo corpo\n', baseHash: atual.hash });
    expect(r.status).toBe(200);
    expect(((await r.json()) as Prompt).corpo).toBe('novo corpo\n');
    expect(await vault.arquivos('Prompts/.versoes/a')).toHaveLength(2);
  });

  it('PUT com baseHash antigo responde 409 com atual e diff do corpo enviado', async () => {
    const { json, vault, acervo } = await montar({ 'Prompts/A.md': PROMPT_A });
    const { hash } = await acervo.ler('a');
    await vault.escrever('Prompts/A.md', PROMPT_A + 'Linha do Obsidian.\n');

    const r = await json('PUT', '/api/prompts/a', { corpo: 'Meu texto.\n', baseHash: hash });
    expect(r.status).toBe(409);
    const corpo = (await r.json()) as {
      codigo: string;
      atual: Prompt;
      diff: { value: string; added: boolean; removed: boolean }[];
    };
    expect(corpo.codigo).toBe('conflito');
    expect(corpo.atual.corpo).toBe('Revise o código.\nLinha do Obsidian.\n');
    expect(corpo.diff.filter((d) => d.removed).map((d) => d.value)).toEqual(['Meu texto.\n']);
    expect(corpo.diff.filter((d) => d.added).map((d) => d.value)).toEqual([
      'Revise o código.\nLinha do Obsidian.\n',
    ]);

    const semCorpo = await json('PUT', '/api/prompts/a', { titulo: 'X', baseHash: hash });
    expect(semCorpo.status).toBe(409);
    expect(((await semCorpo.json()) as { diff: unknown[] }).diff).toEqual([]);
  });

  it('PUT colecao, favorito e DELETE', async () => {
    const { json, pedir, vault } = await montar({ 'Prompts/A.md': PROMPT_A });
    const movido = await json('PUT', '/api/prompts/a/colecao', { colecao: 'Code' });
    expect(((await movido.json()) as Prompt).colecao).toBe('Code');

    const fav = await json('PUT', '/api/prompts/a/favorito', { favorito: true });
    expect(((await fav.json()) as Prompt).favorito).toBe(true);
    expect(
      ((await (await pedir('/api/prompts?favorito=true')).json()) as { prompts: Prompt[] }).prompts,
    ).toHaveLength(1);

    const excluido = await pedir('/api/prompts/a', { method: 'DELETE' });
    expect(excluido.status).toBe(204);
    expect(await vault.arquivos('.trash')).toEqual(['Revisão de código.md']);
    expect((await pedir('/api/prompts/a')).status).toBe(404);
  });

  it('Coleção inválida responde 400', async () => {
    const { json } = await montar({ 'Prompts/A.md': PROMPT_A });
    const r = await json('PUT', '/api/prompts/a/colecao', { colecao: '.oculta' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { codigo: string }).codigo).toBe('colecao_invalida');
  });

  it('.md sem id criado no disco aparece com id depois de indice.atualizar()', async () => {
    const { pedir, vault, indice } = await montar();
    await vault.escrever('Prompts/Solto.md', 'oi');
    await indice.atualizar();
    const { prompts } = (await (await pedir('/api/prompts?q=oi')).json()) as { prompts: Prompt[] };
    expect(prompts).toHaveLength(1);
    const id = prompts[0]?.id ?? '';
    expect(id).not.toBe('');
    expect(await vault.ler('Prompts/Solto.md')).toContain(`id: ${id}`);
  });
});

describe('versões', () => {
  async function comVersoes() {
    const ctx = await montar({ 'Prompts/A.md': PROMPT_A });
    const { hash } = await ctx.acervo.ler('a');
    const salvo = await ctx.json('PUT', '/api/prompts/a', { corpo: 'v2\n', baseHash: hash });
    const prompt = (await salvo.json()) as Prompt;
    const versoes = (await (await ctx.pedir('/api/prompts/a/versoes')).json()) as { id: string }[];
    return { ...ctx, prompt, versoes };
  }

  it('lista, lê, faz diff e restaura', async () => {
    const { pedir, json, prompt, versoes } = await comVersoes();
    expect(versoes).toHaveLength(2);
    const criacao = versoes[1]?.id ?? '';

    const lida = await pedir(`/api/prompts/a/versoes/${criacao}`);
    expect(((await lida.json()) as { conteudo: string }).conteudo).toBe(PROMPT_A);

    const diff = (await (await pedir(`/api/prompts/a/versoes/${criacao}/diff`)).json()) as {
      value: string;
      added?: boolean;
    }[];
    expect(diff.filter((d) => d.added).map((d) => d.value)).toEqual(['v2\n']);

    const entreVersoes = await pedir(
      `/api/prompts/a/versoes/${criacao}/diff?para=${versoes[0]?.id ?? ''}`,
    );
    expect(await entreVersoes.json()).toEqual(diff);

    const restaurado = await json('POST', `/api/prompts/a/versoes/${criacao}/restaurar`, {
      baseHash: prompt.hash,
    });
    expect(restaurado.status).toBe(200);
    expect(((await restaurado.json()) as Prompt).corpo).toBe('Revise o código.\n');
    expect(((await (await pedir('/api/prompts/a')).json()) as Prompt).corpo).toBe(
      'Revise o código.\n',
    );
  });

  it('restaurar com hash antigo responde 409 com diff vazio', async () => {
    const { json, versoes } = await comVersoes();
    const r = await json('POST', `/api/prompts/a/versoes/${versoes[1]?.id ?? ''}/restaurar`, {
      baseHash: 'antigo',
    });
    expect(r.status).toBe(409);
    const corpo = (await r.json()) as { atual: Prompt; diff: unknown[] };
    expect(corpo.atual.corpo).toBe('v2\n');
    expect(corpo.diff).toEqual([]);
  });

  it('versão inexistente responde 404', async () => {
    const { pedir } = await comVersoes();
    const r = await pedir('/api/prompts/a/versoes/20200101T000000000Z-manual');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { codigo: string }).codigo).toBe('versao_nao_encontrada');
    expect((await pedir('/api/prompts/zzz/versoes')).status).toBe(404);
  });
});

describe('coleções e tags', () => {
  it('lista, cria e renomeia Coleções', async () => {
    const { pedir, json } = await montar({ 'Prompts/A.md': PROMPT_A });
    const criada = await json('POST', '/api/colecoes', { nome: 'Escrita' });
    expect(criada.status).toBe(201);
    expect(await criada.json()).toEqual({ nome: 'Escrita' });
    expect(await (await pedir('/api/colecoes')).json()).toEqual([
      { nome: null, total: 1 },
      { nome: 'Escrita', total: 0 },
    ]);

    const repetida = await json('POST', '/api/colecoes', { nome: 'Escrita' });
    expect(repetida.status).toBe(409);
    expect(((await repetida.json()) as { codigo: string }).codigo).toBe('colecao_ja_existe');

    const renomeada = await json('PUT', `/api/colecoes/${encodeURIComponent('Escrita')}`, {
      novoNome: 'Redação técnica',
    });
    expect(await renomeada.json()).toEqual({ nome: 'Redação técnica' });

    const inexistente = await json('PUT', '/api/colecoes/Nada', { novoNome: 'X' });
    expect(inexistente.status).toBe(404);
  });

  it('GET /api/tags', async () => {
    const { pedir } = await montar({
      'Prompts/A.md': PROMPT_A,
      'Prompts/B.md': '---\nid: b\ntags: [code, py]\n---\n',
    });
    expect(await (await pedir('/api/tags')).json()).toEqual([
      { tag: 'code', total: 2 },
      { tag: 'py', total: 1 },
    ]);
  });
});

describe('diretrizes', () => {
  it('GET vazio, PUT cria, PUT com hash antigo dá 409 com diff', async () => {
    const { pedir, json, vault } = await montar();
    expect(await (await pedir('/api/diretrizes')).json()).toEqual({ conteudo: '', hash: null });

    const salvo = await json('PUT', '/api/diretrizes', {
      conteudo: 'Seja breve.\n',
      baseHash: null,
    });
    expect(salvo.status).toBe(200);
    const { hash } = (await salvo.json()) as { hash: string };

    await vault.escrever('Prompts/_Diretrizes.md', 'Seja direto.\n');
    const conflito = await json('PUT', '/api/diretrizes', { conteudo: 'Outra.\n', baseHash: hash });
    expect(conflito.status).toBe(409);
    const corpo = (await conflito.json()) as {
      codigo: string;
      atual: { conteudo: string };
      diff: { value: string; added?: boolean; removed?: boolean }[];
    };
    expect(corpo.codigo).toBe('conflito');
    expect(corpo.atual.conteudo).toBe('Seja direto.\n');
    expect(corpo.diff.map((d) => [d.added ?? false, d.removed ?? false, d.value])).toEqual([
      [false, true, 'Outra.\n'],
      [true, false, 'Seja direto.\n'],
    ]);
  });
});

describe('proteção do loopback', () => {
  it('aceita 127.0.0.1 e localhost nas portas 5173 e 5174', async () => {
    const { app } = await montar();
    for (const host of ['127.0.0.1:5174', 'localhost:5174', '127.0.0.1:5173', 'localhost:5173']) {
      expect((await app.request(`http://${host}/api/health`)).status).toBe(200);
    }
  });

  it('recusa outro Host (DNS rebinding) com 403', async () => {
    const { app } = await montar();
    for (const url of [
      'http://evil.com/api/health',
      'http://127.0.0.1/api/health',
      'http://127.0.0.1:8080/api/health',
    ]) {
      const r = await app.request(url);
      expect(r.status).toBe(403);
      expect(((await r.json()) as { codigo: string }).codigo).toBe('host_recusado');
    }
    const comHeader = await app.request(`${BASE}/api/health`, { headers: { Host: 'evil.com' } });
    expect(comHeader.status).toBe(403);
  });

  it('recusa escrita com Origin de outra página', async () => {
    const { json } = await montar();
    const r = await json('POST', '/api/colecoes', { nome: 'X' }, { Origin: 'https://evil.com' });
    expect(r.status).toBe(403);
    expect(((await r.json()) as { codigo: string }).codigo).toBe('origem_recusada');

    const ok = await json(
      'POST',
      '/api/colecoes',
      { nome: 'X' },
      { Origin: 'http://127.0.0.1:5173' },
    );
    expect(ok.status).toBe(201);
  });

  it('recusa escrita sem Content-Type JSON com 415', async () => {
    const { pedir } = await montar();
    const r = await pedir('/api/colecoes', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ nome: 'X' }),
    });
    expect(r.status).toBe(415);
    expect(((await r.json()) as { codigo: string }).codigo).toBe('tipo_de_conteudo');
  });

  it('GET não exige Content-Type nem Origin conhecida', async () => {
    const { pedir } = await montar();
    expect((await pedir('/api/tags', { headers: { Origin: 'https://evil.com' } })).status).toBe(
      200,
    );
  });
});

describe('eventos', () => {
  it('GET /api/eventos abre SSE, envia ping e repassa os eventos do hub', async () => {
    const { pedir, eventos } = await montar();
    const controle = new AbortController();
    const r = await pedir('/api/eventos', { signal: controle.signal });
    expect(r.headers.get('content-type')).toBe('text/event-stream');
    const leitor = r.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!leitor) throw new Error('sem corpo');

    let recebido = '';
    const lerAte = async (trecho: string) => {
      while (!recebido.includes(trecho)) {
        const { value, done } = await leitor.read();
        if (done) throw new Error(`stream acabou sem "${trecho}"`);
        recebido += value;
      }
    };
    await lerAte('event: ping');
    await vi.waitFor(() => expect(eventos.total()).toBe(1));

    eventos.emitir({ tipo: 'acervo', dados: { criados: ['a'], alterados: [], removidos: [] } });
    await lerAte('event: acervo');
    expect(recebido).toContain('data: {"criados":["a"],"alterados":[],"removidos":[]}');

    eventos.emitir({ tipo: 'diretrizes', dados: { hash: 'h' } });
    await lerAte('data: {"hash":"h"}');

    controle.abort();
    await leitor.cancel().catch(() => undefined);
    await vi.waitFor(() => expect(eventos.total()).toBe(0));
  });
});

describe('análise', () => {
  const lerAnalise = async (r: Response) => (await r.json()) as Analise;

  async function pronta(pedir: (rota: string) => Response | Promise<Response>) {
    return vi.waitFor(async () => {
      const a = (await (await pedir('/api/prompts/a/analise')).json()) as Analise | null;
      if (!a || a.execucao) throw new Error('ainda gerando');
      return a;
    });
  }

  it('GET sem Análise é null; Prompt inexistente é 404', async () => {
    const { pedir } = await montar({ 'Prompts/A.md': PROMPT_A });
    const r = await pedir('/api/prompts/a/analise');
    expect(r.status).toBe(200);
    expect(await r.json()).toBeNull();
    expect((await pedir('/api/prompts/zzz/analise')).status).toBe(404);
  });

  it('fluxo: iniciar (202), aceitar, rascunho, concluir', async () => {
    const { json, pedir, respostaClaude, vault } = await montar({ 'Prompts/A.md': PROMPT_A });
    respostaClaude.sugestoes = [
      { justificativa: 'j', trechoOriginal: 'Revise', trechoNovo: 'Analise' },
    ];
    const r = await json('POST', '/api/prompts/a/analise', { instrucao: 'x', modelo: 'haiku' });
    expect(r.status).toBe(202);
    expect((await lerAnalise(r)).execucao?.tipo).toBe('analise');

    const dupla = await json('POST', '/api/prompts/a/analise', {});
    expect(dupla.status).toBe(409);

    const a = await pronta(pedir);
    expect(a.modelo).toBe('haiku');
    const sid = a.sugestoes[0]!.id;
    const aceita = await json('POST', `/api/prompts/a/analise/sugestoes/${sid}/aceitar`, {});
    expect(aceita.status).toBe(200);
    expect((await lerAnalise(aceita)).rascunho).toBe('Analise o código.\n');

    const outra = await json('POST', `/api/prompts/a/analise/sugestoes/${sid}/aceitar`, {});
    expect(outra.status).toBe(409);
    expect(((await outra.json()) as { codigo: string }).codigo).toBe('sugestao_indisponivel');

    const put = await json('PUT', '/api/prompts/a/analise/rascunho', { rascunho: 'Final.\n' });
    expect((await lerAnalise(put)).rascunho).toBe('Final.\n');

    const fim = await json('POST', '/api/prompts/a/analise/concluir', {});
    expect(fim.status).toBe(200);
    expect(((await fim.json()) as Prompt).corpo).toBe('Final.\n');
    expect(await (await pedir('/api/prompts/a/analise')).json()).toBeNull();
    expect(
      (await vault.arquivos('Prompts/.versoes/a')).some((v) => v.endsWith('-analise.md')),
    ).toBe(true);
  });

  it('modelo inválido responde 400; sem Análise, 404', async () => {
    const { json } = await montar({ 'Prompts/A.md': PROMPT_A });
    const r = await json('POST', '/api/prompts/a/analise', { modelo: 'gpt' });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toMatch(/^modelo: /);
    const sem = await json('POST', '/api/prompts/a/analise/cancelar', {});
    expect(sem.status).toBe(404);
    expect(((await sem.json()) as { codigo: string }).codigo).toBe('analise_nao_encontrada');
  });

  it('concluir com o Prompt alterado fora: 409 com atual e diff do Rascunho', async () => {
    const { json, pedir, vault } = await montar({ 'Prompts/A.md': PROMPT_A });
    await json('POST', '/api/prompts/a/analise', {});
    await pronta(pedir);
    await json('PUT', '/api/prompts/a/analise/rascunho', { rascunho: 'Meu.\n' });
    await vault.escrever('Prompts/A.md', PROMPT_A + 'Do Obsidian.\n');
    const r = await json('POST', '/api/prompts/a/analise/concluir', {});
    expect(r.status).toBe(409);
    const corpo = (await r.json()) as { codigo: string; atual: Prompt; diff: { value: string }[] };
    expect(corpo.codigo).toBe('conflito');
    expect(corpo.diff.map((d) => d.value).join('')).toContain('Meu.');
    const forcar = await json('POST', '/api/prompts/a/analise/concluir', {
      baseHash: corpo.atual.hash,
    });
    expect(forcar.status).toBe(200);
  });

  it('GET /api/analises lista os Prompts com Análise aberta', async () => {
    const { json, pedir } = await montar({ 'Prompts/A.md': PROMPT_A });
    const ids = async () =>
      ((await (await pedir('/api/analises')).json()) as { ids: string[] }).ids;
    expect(await ids()).toEqual([]);
    await json('POST', '/api/prompts/a/analise', {});
    await pronta(pedir);
    expect(await ids()).toEqual(['a']);
    await pedir('/api/prompts/a/analise', { method: 'DELETE' });
    expect(await ids()).toEqual([]);
  });

  it('DELETE descarta (204) e excluir o Prompt apaga a Análise', async () => {
    const { json, pedir, vault } = await montar({ 'Prompts/A.md': PROMPT_A });
    await json('POST', '/api/prompts/a/analise', {});
    await pronta(pedir);
    const d = await pedir('/api/prompts/a/analise', { method: 'DELETE' });
    expect(d.status).toBe(204);
    expect(await vault.existe('Prompts/.analises/a.json')).toBe(false);
    expect(await vault.ler('Prompts/A.md')).toBe(PROMPT_A);

    await json('POST', '/api/prompts/a/analise', {});
    await pronta(pedir);
    expect((await pedir('/api/prompts/a', { method: 'DELETE' })).status).toBe(204);
    expect(await vault.existe('Prompts/.analises/a.json')).toBe(false);
  });

  it('o SSE repassa o evento analise', async () => {
    const { pedir, eventos, json } = await montar({ 'Prompts/A.md': PROMPT_A });
    const controle = new AbortController();
    const r = await pedir('/api/eventos', { signal: controle.signal });
    const leitor = r.body?.pipeThrough(new TextDecoderStream()).getReader();
    if (!leitor) throw new Error('sem corpo');
    await vi.waitFor(() => expect(eventos.total()).toBe(1));
    await json('POST', '/api/prompts/a/analise', {});
    let recebido = '';
    while (!recebido.includes('event: analise')) {
      const { value, done } = await leitor.read();
      if (done) throw new Error('stream acabou');
      recebido += value;
    }
    expect(recebido).toMatch(/data: \{"promptId":"a","analise":\{/);
    await pronta(pedir);
    controle.abort();
    await leitor.cancel().catch(() => undefined);
  });
});

describe('erros genéricos', () => {
  it('rota inexistente responde 404 em JSON', async () => {
    const { pedir } = await montar();
    const r = await pedir('/api/nada');
    expect(r.status).toBe(404);
    expect(((await r.json()) as { codigo: string }).codigo).toBe('rota_nao_encontrada');
  });
});
