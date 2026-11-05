#!/usr/bin/env node
// Claude falso: sai com código 2 e uma mensagem no stderr.
process.stderr.write('Erro: opção desconhecida --foo\n');
process.exit(2);
