#!/usr/bin/env node
// Claude falso: sucesso, mas o structured_output não segue o schema.
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    structured_output: { sugestoes: [{ trechoOriginal: '' }] },
  }) + '\n',
);
