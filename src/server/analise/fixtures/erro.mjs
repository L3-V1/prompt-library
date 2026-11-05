#!/usr/bin/env node
// Claude falso: envelope com is_error.
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'error_during_execution',
    is_error: true,
    result: 'Limite de uso atingido',
  }),
);
