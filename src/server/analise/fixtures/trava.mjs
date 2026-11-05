#!/usr/bin/env node
// Claude falso: grava o próprio pid em PID_FALSO e fica parado até ser morto.
import fs from 'node:fs';

if (process.env.PID_FALSO) fs.writeFileSync(process.env.PID_FALSO, String(process.pid));
setInterval(() => undefined, 1000);
