#!/usr/bin/env node
// Claude falso: devolve os argumentos, o cwd e o stdin recebidos dentro do structured_output.
import fs from 'node:fs';

// Com stdio 'ignore', o fd 0 é o /dev/null (não um pipe à espera de dados).
const stdin = fs.fstatSync(0).isFIFO() ? 'pipe' : 'sem-dados';
const sugestoes = [
  {
    justificativa: JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd(), stdin }),
    trechoOriginal: 'x',
    trechoNovo: 'y',
  },
];
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: { sugestoes },
  }) + '\n',
);
