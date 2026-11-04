import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  capturar,
  localizarTranscript,
  mensagensDigitadas,
  origemDe,
  reconstruirColagens,
  slugDoCwd,
  type MensagemDigitada,
} from './transcript.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
const DIR_CLAUDE = path.join(FIXTURES, 'claude');
const SESSAO = '11111111-2222-3333-4444-555555555555';
const CWD = '/home/usuario/projetos/exemplo';
const TRANSCRIPT = path.join(DIR_CLAUDE, 'projects', slugDoCwd(CWD), `${SESSAO}.jsonl`);

const temporarios: string[] = [];
afterEach(async () => {
  await Promise.all(temporarios.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function dirTemporario(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'prompt-library-claude-'));
  temporarios.push(dir);
  return dir;
}

async function mensagensDaFixture(): Promise<MensagemDigitada[]> {
  return mensagensDigitadas(await fs.readFile(TRANSCRIPT, 'utf8'));
}

describe('mensagensDigitadas', () => {
  it('fica só com os prompts digitados, em ordem', async () => {
    const textos = (await mensagensDaFixture()).map((m) => m.texto);
    expect(textos).toEqual([
      'Primeira mensagem digitada.',
      'Veja esta tela\ne diga o que acha.',
      'Antes do texto.\n[Pasted text #1 +11 lines]\nDepois do texto.',
      '[Pasted text #2 +40 lines]',
      'Revise o código\n\ncom atenção às exceções.\n',
    ]);
  });

  it('conta as imagens dos blocos e junta só o texto', async () => {
    const [, comImagem] = await mensagensDaFixture();
    expect(comImagem).toMatchObject({ texto: 'Veja esta tela\ne diga o que acha.', imagens: 1 });
  });

  it('ignora blocos injetados pela IDE e mensagens duplicadas', () => {
    const linha = {
      type: 'user',
      uuid: 'u1',
      timestamp: '2026-11-04T10:00:00.000Z',
      cwd: CWD,
      sessionId: SESSAO,
      message: {
        role: 'user',
        content: [
          { type: 'text', text: '<ide_opened_file>arquivo.ts</ide_opened_file>' },
          { type: 'text', text: 'Explique este arquivo' },
        ],
      },
    };
    const conteudo = [JSON.stringify(linha), JSON.stringify(linha)].join('\n');
    expect(mensagensDigitadas(conteudo).map((m) => m.texto)).toEqual(['Explique este arquivo']);
  });

  it('não falha com conteúdo vazio ou só com linhas inválidas', () => {
    expect(mensagensDigitadas('')).toEqual([]);
    expect(mensagensDigitadas('{x\nnull\n[1]\n"texto"\n')).toEqual([]);
  });
});

describe('capturar', () => {
  it('N = 1 pega a última e /save 3 pega a terceira mais recente', async () => {
    const mensagens = await mensagensDaFixture();
    expect(capturar(mensagens).texto).toBe('Revise o código\n\ncom atenção às exceções.\n');
    expect(capturar(mensagens, 3).texto).toBe(
      'Antes do texto.\n[Pasted text #1 +11 lines]\nDepois do texto.',
    );
    expect(capturar(mensagens, 5).texto).toBe('Primeira mensagem digitada.');
  });

  it('dá erro claro com N fora do intervalo', async () => {
    const mensagens = await mensagensDaFixture();
    expect(() => capturar(mensagens, 6)).toThrow(/Só há 5 mensagens digitadas nesta sessão/);
    expect(() => capturar(mensagens, 0)).toThrow(/inteiro positivo/);
    expect(() => capturar([], 1)).toThrow(/Não há mensagens digitadas/);
  });

  it('monta a Origem com o cwd, a data e a sessão da mensagem', async () => {
    expect(origemDe(capturar(await mensagensDaFixture()))).toEqual({
      projeto: CWD,
      data: '2026-11-04T10:05:00.000Z',
      sessao: SESSAO,
    });
  });
});

describe('reconstruirColagens', () => {
  it('não mexe em texto sem marcador', async () => {
    const mensagem = capturar(await mensagensDaFixture());
    expect(await reconstruirColagens(mensagem, DIR_CLAUDE)).toEqual({
      texto: mensagem.texto,
      colagens: 0,
    });
  });

  it('usa o content inline do history.jsonl da mesma sessão', async () => {
    const mensagem = capturar(await mensagensDaFixture(), 3);
    const colado = await fs.readFile(path.join(FIXTURES, 'colagem-1.txt'), 'utf8');
    expect(await reconstruirColagens(mensagem, DIR_CLAUDE)).toEqual({
      texto: `Antes do texto.\n${colado}\nDepois do texto.`,
      colagens: 1,
    });
  });

  it('lê do paste-cache quando o history.jsonl só tem o contentHash', async () => {
    const mensagem = capturar(await mensagensDaFixture(), 2);
    const colado = await fs.readFile(path.join(FIXTURES, 'colagem-2.txt'), 'utf8');
    expect(await reconstruirColagens(mensagem, DIR_CLAUDE)).toEqual({
      texto: colado,
      colagens: 1,
    });
  });

  it('dá erro quando o conteúdo colado não é encontrado', async () => {
    const mensagens = await mensagensDaFixture();
    const vazio = await dirTemporario();
    await expect(reconstruirColagens(capturar(mensagens, 3), vazio)).rejects.toThrow(
      /não foi encontrado em history\.jsonl/,
    );

    // Entrada no histórico, mas sem o arquivo no paste-cache.
    await fs.copyFile(path.join(DIR_CLAUDE, 'history.jsonl'), path.join(vazio, 'history.jsonl'));
    await expect(reconstruirColagens(capturar(mensagens, 2), vazio)).rejects.toThrow(
      /texto colado #2 não foi encontrado/,
    );
  });
});

describe('localizarTranscript', () => {
  it('encontra pelo id da sessão, mesmo com outro cwd', async () => {
    expect(
      await localizarTranscript({ sessao: SESSAO, cwd: '/outro/lugar', dirClaude: DIR_CLAUDE }),
    ).toBe(TRANSCRIPT);
  });

  it('dá erro com id de sessão sem transcript', async () => {
    await expect(
      localizarTranscript({ sessao: 'nao-existe', cwd: CWD, dirClaude: DIR_CLAUDE }),
    ).rejects.toThrow(/não encontrado/);
  });

  it('sem id de sessão, usa o .jsonl mais recente da pasta do cwd', async () => {
    const dir = await dirTemporario();
    const pasta = path.join(dir, 'projects', slugDoCwd('/home/x/meu_projeto.v2'));
    expect(pasta.endsWith('-home-x-meu-projeto-v2')).toBe(true);
    await fs.mkdir(pasta, { recursive: true });
    const antigo = path.join(pasta, 'antigo.jsonl');
    const novo = path.join(pasta, 'novo.jsonl');
    await fs.writeFile(antigo, '');
    await fs.writeFile(novo, '');
    await fs.utimes(antigo, new Date(2026, 0, 2), new Date(2026, 0, 2));
    await fs.utimes(novo, new Date(2026, 0, 1), new Date(2026, 0, 1));
    expect(
      await localizarTranscript({
        sessao: undefined,
        cwd: '/home/x/meu_projeto.v2',
        dirClaude: dir,
      }),
    ).toBe(antigo);
    await expect(
      localizarTranscript({ sessao: undefined, cwd: '/sem/transcripts', dirClaude: dir }),
    ).rejects.toThrow(/nenhum transcript/);
  });
});
