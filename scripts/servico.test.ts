import { describe, expect, it } from 'vitest';

import {
  CABECALHO,
  caminhoUnidade,
  gerarUnidade,
  montarPath,
  unidadeNossa,
} from './servico-unidade.mjs';

const base = {
  repo: '/home/u/prompt-library',
  node: '/opt/node-v22.14.0-linux-x64/bin/node',
  claude: '/home/u/.local/bin/claude',
};

describe('gerarUnidade', () => {
  it('sem vault: caminhos absolutos, cabeçalho de posse e sem PROMPT_LIBRARY_VAULT', () => {
    expect(gerarUnidade(base)).toBe(
      [
        CABECALHO,
        '[Unit]',
        'Description=Biblioteca de Prompts (127.0.0.1:5174)',
        '',
        '[Service]',
        'WorkingDirectory=/home/u/prompt-library',
        'Environment=NODE_ENV=production',
        'Environment=PATH=/opt/node-v22.14.0-linux-x64/bin:/home/u/.local/bin:/usr/local/bin:/usr/bin:/bin',
        'Environment=PROMPT_LIBRARY_CLAUDE=/home/u/.local/bin/claude',
        'ExecStart=/opt/node-v22.14.0-linux-x64/bin/node /home/u/prompt-library/dist/server/main.js',
        'Restart=on-failure',
        '',
        '[Install]',
        'WantedBy=default.target',
        '',
      ].join('\n'),
    );
  });

  it('com vault: acrescenta PROMPT_LIBRARY_VAULT', () => {
    const texto = gerarUnidade({ ...base, vault: '/home/u/vault' });
    expect(texto).toContain('Environment=PROMPT_LIBRARY_VAULT=/home/u/vault\n');
  });

  it('sem claude: o PATH fica com o node e o sistema, e a variável sai', () => {
    const texto = gerarUnidade({ ...base, claude: null });
    expect(texto).toContain(
      'Environment=PATH=/opt/node-v22.14.0-linux-x64/bin:/usr/local/bin:/usr/bin:/bin\n',
    );
    expect(texto).not.toContain('PROMPT_LIBRARY_CLAUDE');
  });

  it('escapa espaços e % para o systemd', () => {
    const texto = gerarUnidade({ ...base, repo: '/home/u/meus prompts', vault: '/v/100%' });
    expect(texto).toContain('Environment=PROMPT_LIBRARY_VAULT=/v/100%%\n');
    expect(texto).toContain(
      'ExecStart=/opt/node-v22.14.0-linux-x64/bin/node "/home/u/meus prompts/dist/server/main.js"',
    );
  });
});

describe('montarPath', () => {
  it('não repete o dir quando node e claude estão juntos', () => {
    expect(montarPath({ node: '/usr/bin/node', claude: '/usr/bin/claude' })).toBe(
      '/usr/bin:/usr/local/bin:/bin',
    );
  });
});

describe('unidadeNossa', () => {
  it('reconhece só o cabeçalho gerado aqui', () => {
    expect(unidadeNossa(gerarUnidade(base))).toBe(true);
    expect(unidadeNossa('[Unit]\nDescription=outra coisa\n')).toBe(false);
  });
});

describe('caminhoUnidade', () => {
  it('sem XDG_CONFIG_HOME: ~/.config/systemd/user', () => {
    expect(caminhoUnidade({ xdgConfigHome: undefined, home: '/home/u' })).toBe(
      '/home/u/.config/systemd/user/prompt-library.service',
    );
    expect(caminhoUnidade({ xdgConfigHome: '', home: '/home/u' })).toBe(
      '/home/u/.config/systemd/user/prompt-library.service',
    );
  });

  it('com XDG_CONFIG_HOME', () => {
    expect(caminhoUnidade({ xdgConfigHome: '/tmp/cfg', home: '/home/u' })).toBe(
      '/tmp/cfg/systemd/user/prompt-library.service',
    );
  });
});
