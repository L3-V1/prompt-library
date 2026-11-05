#!/usr/bin/env node
// Claude falso: stream-json sem o evento result, com código 0.
process.stdout.write(JSON.stringify({ type: 'system', subtype: 'init' }) + '\n');
process.stdout.write(
  JSON.stringify({
    type: 'assistant',
    message: { role: 'assistant', content: [{ type: 'text', text: 'pensando' }] },
  }) + '\n',
);
