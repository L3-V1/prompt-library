import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import type { AtividadeClaude } from '../../core/index.js';
import {
  atividadeDe,
  criarExecutorClaude,
  ExecucaoCanceladaError,
  ExecucaoClaudeError,
  LIMITE_PROMPT_BYTES,
  type PedidoClaude,
} from './claude.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const falso = (nome: string) =>
  criarExecutorClaude({ binario: path.join(FIXTURES, `${nome}.mjs`) });

function pedido(extra: Partial<PedidoClaude> = {}): PedidoClaude {
  return {
    prompt: 'analise isto',
    modelo: null,
    cwd: os.tmpdir(),
    sinal: new AbortController().signal,
    timeoutMs: 10_000,
    ...extra,
  };
}

const vivo = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

async function esperar(cond: () => boolean | Promise<boolean>, ms = 3000) {
  const fim = Date.now() + ms;
  while (!(await cond())) {
    if (Date.now() > fim) throw new Error('tempo esgotado');
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('criarExecutorClaude', () => {
  it('sucesso: devolve a saída validada, o custo, a duração e o modelo mais caro', async () => {
    const r = await falso('sucesso')(pedido());
    expect(r).toEqual({
      saida: {
        sugestoes: [
          { justificativa: 'mais curto', trechoOriginal: 'muito longo', trechoNovo: 'curto' },
        ],
      },
      custoUsd: 0.0123,
      duracaoMs: 4567,
      modelo: 'claude-sonnet-x',
    });
  });

  it('passa as flags da decisão 41, o cwd e o stdin fechado; --model só quando há', async () => {
    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-eco-'));
    try {
      const ler = async (modelo: string | null) => {
        const r = await falso('eco')(pedido({ modelo, cwd }));
        const s = (r.saida as { sugestoes: { justificativa: string }[] }).sugestoes[0];
        return JSON.parse(s?.justificativa ?? '{}') as {
          args: string[];
          cwd: string;
          stdin: string;
        };
      };
      const sem = await ler(null);
      expect(sem.args.slice(0, 2)).toEqual(['-p', 'analise isto']);
      expect(sem.args).toEqual(
        expect.arrayContaining([
          '--output-format',
          'stream-json',
          '--verbose',
          '--tools',
          'Read Glob Grep',
          '--allowedTools',
          '--strict-mcp-config',
          '--no-session-persistence',
        ]),
      );
      const i = sem.args.indexOf('--permission-mode');
      expect(sem.args[i + 1]).toBe('default');
      const schema = JSON.parse(sem.args[sem.args.indexOf('--json-schema') + 1] ?? '') as {
        properties: { sugestoes: unknown };
      };
      expect(schema.properties.sugestoes).toBeDefined();
      expect(schema).not.toHaveProperty('$schema');
      expect(sem.args).not.toContain('--model');
      expect(await fs.realpath(sem.cwd)).toBe(await fs.realpath(cwd));
      expect(sem.stdin).toBe('sem-dados');

      const com = await ler('sonnet');
      expect(com.args.slice(-2)).toEqual(['--model', 'sonnet']);
    } finally {
      await fs.rm(cwd, { recursive: true, force: true });
    }
  });

  it('repassa os tool_use ao aoAtivar, na ordem, sem o StructuredOutput', async () => {
    const atividades: AtividadeClaude[] = [];
    const r = await falso('atividades')(pedido({ aoAtivar: (a) => atividades.push(a) }));
    expect(atividades).toEqual([
      { tipo: 'listar', padrao: '**/*.md' },
      { tipo: 'buscar', termo: 'revis' },
      { tipo: 'ler', caminho: 'Code review/x.md' },
    ]);
    expect(r).toMatchObject({
      saida: { sugestoes: [{ trechoOriginal: 'muito longo' }] },
      custoUsd: 0.001,
      modelo: 'claude-haiku-x',
    });
  });

  it('stream sem tool_use não chama o aoAtivar', async () => {
    const aoAtivar = vi.fn();
    await falso('sucesso')(pedido({ aoAtivar }));
    expect(aoAtivar).not.toHaveBeenCalled();
  });

  it('um aoAtivar que lança não quebra a execução', async () => {
    const erroConsole = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const aoAtivar = vi.fn(() => {
        throw new Error('falha no ouvinte');
      });
      const r = await falso('atividades')(pedido({ aoAtivar }));
      expect(aoAtivar).toHaveBeenCalledTimes(3);
      expect(r.custoUsd).toBe(0.001);
    } finally {
      erroConsole.mockRestore();
    }
  });

  it('sem o evento result vira erro', async () => {
    await expect(falso('sem-result')(pedido())).rejects.toThrow(/sem o evento result/);
  });

  it('is_error vira erro com o result', async () => {
    await expect(falso('erro')(pedido())).rejects.toThrow(/Limite de uso atingido/);
  });

  it('saída fora do schema vira erro', async () => {
    await expect(falso('fora-do-schema')(pedido())).rejects.toThrow(/formato de Sugestões/);
  });

  it('código diferente de 0 traz o fim do stderr', async () => {
    const erro = await falso('codigo')(pedido()).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ExecucaoClaudeError);
    expect((erro as Error).message).toMatch(/código 2.*opção desconhecida/s);
  });

  it('binário inexistente: "Claude Code não encontrado"', async () => {
    const executor = criarExecutorClaude({ binario: '/nao/existe/claude' });
    await expect(executor(pedido())).rejects.toThrow(/Claude Code não encontrado/);
  });

  it('prompt acima de 100 KB falha antes do spawn', async () => {
    const executor = criarExecutorClaude({ binario: '/nao/existe/claude' });
    await expect(executor(pedido({ prompt: 'x'.repeat(LIMITE_PROMPT_BYTES + 1) }))).rejects.toThrow(
      /grande demais/,
    );
  });

  it('timeout mata o processo', async () => {
    const pidArq = path.join(os.tmpdir(), `claude-pid-${process.pid}-${Date.now()}`);
    process.env['PID_FALSO'] = pidArq;
    try {
      const promessa = falso('trava')(pedido({ timeoutMs: 300 }));
      await expect(promessa).rejects.toThrow(/não respondeu/);
      const pid = Number(await fs.readFile(pidArq, 'utf8'));
      await esperar(() => !vivo(pid));
    } finally {
      delete process.env['PID_FALSO'];
      await fs.rm(pidArq, { force: true });
    }
  });

  it('abort mata o processo e rejeita como cancelado', async () => {
    const pidArq = path.join(os.tmpdir(), `claude-pid-${process.pid}-${Date.now()}-a`);
    process.env['PID_FALSO'] = pidArq;
    try {
      const controle = new AbortController();
      const promessa = falso('trava')(pedido({ sinal: controle.signal }));
      await esperar(async () => {
        try {
          return (await fs.readFile(pidArq, 'utf8')) !== '';
        } catch {
          return false;
        }
      });
      const pid = Number(await fs.readFile(pidArq, 'utf8'));
      expect(vivo(pid)).toBe(true);
      controle.abort();
      await expect(promessa).rejects.toBeInstanceOf(ExecucaoCanceladaError);
      await esperar(() => !vivo(pid));
    } finally {
      delete process.env['PID_FALSO'];
      await fs.rm(pidArq, { force: true });
    }
  });
});

describe('atividadeDe', () => {
  const cwd = '/vault/Prompts';

  it('Read: caminho relativo ao cwd; fora dele, como veio', () => {
    expect(
      atividadeDe({ name: 'Read', input: { file_path: '/vault/Prompts/a/b.md' } }, cwd),
    ).toEqual({ tipo: 'ler', caminho: 'a/b.md' });
    expect(atividadeDe({ name: 'Read', input: { file_path: '/etc/hosts' } }, cwd)).toEqual({
      tipo: 'ler',
      caminho: '/etc/hosts',
    });
    expect(atividadeDe({ name: 'Read', input: { file_path: '/vault/Outro/x.md' } }, cwd)).toEqual({
      tipo: 'ler',
      caminho: '/vault/Outro/x.md',
    });
  });

  it('Grep e Glob: o pattern', () => {
    expect(atividadeDe({ name: 'Grep', input: { pattern: 'x' } }, cwd)).toEqual({
      tipo: 'buscar',
      termo: 'x',
    });
    expect(atividadeDe({ name: 'Glob', input: { pattern: '*.md' } }, cwd)).toEqual({
      tipo: 'listar',
      padrao: '*.md',
    });
  });

  it('input sem o campo, ferramenta desconhecida ou bloco inválido: null', () => {
    expect(atividadeDe({ name: 'Read', input: {} }, cwd)).toBeNull();
    expect(atividadeDe({ name: 'Grep' }, cwd)).toBeNull();
    expect(atividadeDe({ name: 'Glob', input: { pattern: 3 } }, cwd)).toBeNull();
    expect(atividadeDe({ name: 'StructuredOutput', input: { sugestoes: [] } }, cwd)).toBeNull();
    expect(atividadeDe({ name: 'Bash', input: { command: 'ls' } }, cwd)).toBeNull();
    expect(atividadeDe(null, cwd)).toBeNull();
  });
});
