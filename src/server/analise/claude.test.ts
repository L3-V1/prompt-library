import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
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
          'json',
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
