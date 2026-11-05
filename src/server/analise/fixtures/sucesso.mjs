#!/usr/bin/env node
// Claude falso: responde um envelope de sucesso.
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: '{}',
    structured_output: {
      sugestoes: [
        { justificativa: 'mais curto', trechoOriginal: 'muito longo', trechoNovo: 'curto' },
      ],
    },
    total_cost_usd: 0.0123,
    duration_ms: 4567,
    modelUsage: { 'claude-haiku-x': { costUSD: 0.001 }, 'claude-sonnet-x': { costUSD: 0.0113 } },
  }),
);
