import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { criarAcervo } from '../../src/core/index.js';
import { separar } from '../../src/core/frontmatter.js';
import {
  criarVaultTemporario,
  limparVaultsTemporarios,
  type VaultTemporario,
} from '../../src/core/teste/vault-temporario.js';
import { rodar, type Ambiente } from './capture.js';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DIR_CLAUDE = path.join(AQUI, 'fixtures', 'claude');
const SESSAO = '11111111-2222-3333-4444-555555555555';
const CWD = '/home/usuario/projetos/exemplo';

const temporarios: string[] = [];
afterEach(async () => {
  await limparVaultsTemporarios();
  await Promise.all(temporarios.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function montar(arquivos: Record<string, string> = {}) {
  const vault = await criarVaultTemporario(arquivos);
  const dirCapturas = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-library-capturas-teste-'));
  temporarios.push(dirCapturas);
  const amb: Ambiente = {
    env: {
      CLAUDE_CONFIG_DIR: DIR_CLAUDE,
      CLAUDE_CODE_SESSION_ID: SESSAO,
      PROMPT_LIBRARY_VAULT: vault.pastas.vault,
    },
    cwd: CWD,
    dirCapturas,
  };
  const executar = async (...argv: string[]) => {
    const r = await rodar(argv, amb);
    return r as { codigo: number; saida: Record<string, unknown> & { erro?: string } };
  };
  return { vault, dirCapturas, executar, acervo: criarAcervo(vault.pastas) };
}

async function extrair(executar: Awaited<ReturnType<typeof montar>>['executar'], n?: string) {
  const r = await executar('extract', ...(n ? [n] : []));
  expect(r.codigo, JSON.stringify(r.saida)).toBe(0);
  return r.saida as { captura: string } & Record<string, unknown>;
}

async function corpoGravado(vault: VaultTemporario, caminho: string): Promise<string> {
  return separar(await fs.readFile(caminho, 'utf8')).corpo;
}

describe('capture extract', () => {
  it('devolve prévia, contagens e Origem, sem o texto completo', async () => {
    const { executar, dirCapturas } = await montar();
    const saida = await extrair(executar, '2');
    const colado = await fs.readFile(path.join(AQUI, 'fixtures', 'colagem-2.txt'), 'utf8');
    expect(saida).toEqual({
      captura: expect.stringMatching(/^[0-9a-z]{12}$/),
      previa: colado.slice(0, 500),
      caracteres: Array.from(colado).length,
      linhas: 40,
      imagens: 0,
      colagens: 1,
      origem: { projeto: CWD, data: '2026-11-04T10:04:00.000Z', sessao: SESSAO },
    });
    expect(JSON.stringify(saida)).not.toContain(colado);
    const arquivo = path.join(dirCapturas, `${saida.captura}.json`);
    expect((await fs.stat(arquivo)).mode & 0o777).toBe(0o600);
  });

  it('valida o N e repassa o erro de N grande demais', async () => {
    const { executar } = await montar();
    expect(await executar('extract', 'abc')).toEqual({
      codigo: 1,
      saida: { erro: expect.stringMatching(/inteiro positivo/) },
    });
    expect((await executar('extract', '9')).saida.erro).toMatch(/Só há 5 mensagens/);
    expect((await executar('nada')).saida.erro).toMatch(/^Uso:/);
  });

  it('apaga Capturas com mais de 24 h', async () => {
    const { executar, dirCapturas } = await montar();
    const velha = path.join(dirCapturas, 'aaaaaaaaaaaa.json');
    await fs.writeFile(velha, '{}');
    const ontem = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await fs.utimes(velha, ontem, ontem);
    await extrair(executar);
    await expect(fs.access(velha)).rejects.toThrow();
  });
});

describe('capture extract → context → write', () => {
  it('cria o Prompt com o texto byte a byte, a Origem e a Versão captura', async () => {
    const { vault, executar, dirCapturas, acervo } = await montar({
      'Prompts/Code review/Existente.md':
        '---\nid: existente\ntags: [review, go]\n---\nOutro texto\n',
      'Prompts/Solto.md': '---\nid: solto\ntags: [review]\n---\nmais um\n',
    });
    const { captura } = await extrair(executar, '3');

    const contexto = await executar('context', captura);
    expect(contexto).toEqual({
      codigo: 0,
      saida: {
        colecoes: ['Code review'],
        tags: [
          { tag: 'review', quantidade: 2 },
          { tag: 'go', quantidade: 1 },
        ],
        parecidos: [],
      },
    });

    const escrito = await executar(
      'write',
      captura,
      '--titulo',
      'Texto com colagem',
      '--colecao',
      'Code review',
      '--tag',
      'review',
      '--tag',
      'colagem',
    );
    expect(escrito.codigo, JSON.stringify(escrito.saida)).toBe(0);
    const caminho = path.join(vault.pastas.prompts, 'Code review', 'Texto com colagem.md');
    expect(escrito.saida).toEqual({
      id: expect.any(String),
      titulo: 'Texto com colagem',
      caminho,
      novaVersao: false,
    });

    const colado = await fs.readFile(path.join(AQUI, 'fixtures', 'colagem-1.txt'), 'utf8');
    expect(Buffer.from(await corpoGravado(vault, caminho))).toEqual(
      Buffer.from(`Antes do texto.\n${colado}\nDepois do texto.`),
    );

    const id = escrito.saida['id'] as string;
    const prompt = await acervo.ler(id);
    expect(prompt).toMatchObject({
      titulo: 'Texto com colagem',
      tags: ['review', 'colagem'],
      colecao: 'Code review',
      origem: { projeto: CWD, data: '2026-11-04T10:03:00.000Z', sessao: SESSAO },
    });
    expect((await acervo.listarVersoes(id)).map((v) => v.motivo)).toEqual(['captura']);
    expect(await fs.readdir(dirCapturas)).toEqual([]);
  });

  it('acusa o Prompt idêntico no context', async () => {
    const { executar } = await montar({
      'Prompts/Revisão.md': '---\nid: revisao\n---\nRevise o código\n\ncom atenção às exceções.',
    });
    const { captura } = await extrair(executar);
    const { saida } = await executar('context', captura);
    expect(saida['parecidos']).toEqual([
      expect.objectContaining({ id: 'revisao', identico: true, pontuacao: 1 }),
    ]);
  });

  it('--versao-de grava só o corpo como nova Versão do parecido', async () => {
    const original =
      '---\nid: revisao\ntitulo: Revisão\ntags: [review]\nfavorito: true\norigem:\n  projeto: /antigo\n  data: 2026-01-01T00:00:00.000Z\n  sessao: s0\n---\nRevise o código com atenção.\n';
    const { vault, executar, acervo } = await montar({ 'Prompts/Rev/Revisão.md': original });
    const { captura } = await extrair(executar);
    const { saida } = await executar('context', captura);
    expect(saida['parecidos']).toEqual([
      expect.objectContaining({ id: 'revisao', identico: false }),
    ]);

    const escrito = await executar('write', captura, '--versao-de', 'revisao');
    const caminho = path.join(vault.pastas.prompts, 'Rev', 'Revisão.md');
    expect(escrito).toEqual({
      codigo: 0,
      saida: { id: 'revisao', titulo: 'Revisão', caminho, novaVersao: true },
    });
    expect(await vault.ler('Prompts/Rev/Revisão.md')).toBe(
      original.replace(
        'Revise o código com atenção.\n',
        'Revise o código\n\ncom atenção às exceções.\n',
      ),
    );
    expect((await acervo.listarVersoes('revisao')).map((v) => v.motivo)).toEqual([
      'captura',
      'criacao',
    ]);
  });

  it('--versao-de com o Prompt alterado depois do context dá conflito', async () => {
    const { vault, executar, dirCapturas } = await montar({
      'Prompts/Revisão.md': '---\nid: revisao\n---\nRevise o código com atenção.\n',
    });
    const { captura } = await extrair(executar);
    await executar('context', captura);
    await vault.escrever('Prompts/Revisão.md', '---\nid: revisao\n---\nEditado no Obsidian.\n');

    const r = await executar('write', captura, '--versao-de', 'revisao');
    expect(r).toEqual({
      codigo: 1,
      saida: { erro: 'O Prompt mudou desde a análise; rode o /save de novo.' },
    });
    expect(await vault.ler('Prompts/Revisão.md')).toContain('Editado no Obsidian.');
    expect(await fs.readdir(dirCapturas)).toEqual([`${captura}.json`]);
  });

  it('recusa --versao-de fora dos parecidos, combinações inválidas e write sem título', async () => {
    const { executar } = await montar();
    const { captura } = await extrair(executar);
    expect((await executar('write', captura, '--versao-de', 'x')).saida.erro).toMatch(
      /não está entre os parecidos/,
    );
    expect(
      (await executar('write', captura, '--versao-de', 'x', '--titulo', 't')).saida.erro,
    ).toMatch(/não aceita --titulo/);
    expect((await executar('write', captura)).saida.erro).toMatch(/Informe --titulo/);
    expect((await executar('write', 'naoexiste123')).saida.erro).toMatch(/não encontrada/);
    expect((await executar('write', '../../etc')).saida.erro).toMatch(/inválido/);
  });
});

describe('wrapper capture', () => {
  it('roda o capture.ts pelo tsx do repositório e devolve JSON', async () => {
    const { vault } = await montar();
    const exec = promisify(execFile);
    const r = await exec(path.join(AQUI, 'capture'), ['extract', '5'], {
      cwd: os.tmpdir(),
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: DIR_CLAUDE,
        CLAUDE_CODE_SESSION_ID: SESSAO,
        PROMPT_LIBRARY_VAULT: vault.pastas.vault,
      },
    });
    const saida = JSON.parse(r.stdout) as { captura: string; previa: string };
    expect(saida.previa).toBe('Primeira mensagem digitada.');
    await fs.rm(path.join(os.tmpdir(), 'prompt-library-capturas', `${saida.captura}.json`));

    const erro = await exec(path.join(AQUI, 'capture'), ['extract', '0'], {
      env: { ...process.env, CLAUDE_CONFIG_DIR: DIR_CLAUDE, CLAUDE_CODE_SESSION_ID: SESSAO },
    }).catch((e: { code: number; stdout: string }) => e);
    expect(erro).toMatchObject({ code: 1 });
    expect(JSON.parse(erro.stdout)).toEqual({ erro: expect.stringMatching(/inteiro positivo/) });
  }, 20_000);
});
