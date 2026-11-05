#!/usr/bin/env node
// Claude falso: stream-json com tool_use de Glob, Grep e Read (caminho absoluto, como o real),
// um StructuredOutput, uma linha inválida e uma linha partida em dois write. O result vem na
// última linha, sem `\n` no fim.
import path from 'node:path';

const linha = (o) => JSON.stringify(o) + '\n';
const ferramenta = (id, name, input) =>
  linha({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  });
const resultado = (id) =>
  linha({
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] },
  });
const sugestoes = [
  { justificativa: 'mais curto', trechoOriginal: 'muito longo', trechoNovo: 'curto' },
];

process.stdout.write(linha({ type: 'system', subtype: 'init' }));
process.stdout.write(ferramenta('t1', 'Glob', { pattern: '**/*.md' }));
process.stdout.write(resultado('t1'));
process.stdout.write('{isto não é json\n');
process.stdout.write(
  ferramenta('t2', 'Grep', { pattern: 'revis', output_mode: 'content', '-n': true }),
);
process.stdout.write(resultado('t2'));

const partida = ferramenta('t3', 'Read', {
  file_path: path.join(process.cwd(), 'Code review/x.md'),
});
const meio = Math.floor(partida.length / 2);
process.stdout.write(partida.slice(0, meio));
setTimeout(() => {
  process.stdout.write(partida.slice(meio));
  process.stdout.write(resultado('t3'));
  process.stdout.write(ferramenta('t4', 'StructuredOutput', { sugestoes }));
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'success',
      is_error: false,
      structured_output: { sugestoes },
      total_cost_usd: 0.001,
      duration_ms: 100,
      modelUsage: { 'claude-haiku-x': { costUSD: 0.001 } },
    }),
  );
}, 50);
