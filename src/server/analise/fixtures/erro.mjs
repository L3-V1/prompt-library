#!/usr/bin/env node
// Claude falso: stream-json com um result is_error.
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: 'Limite de uso atingido',
  }) + '\n',
);
