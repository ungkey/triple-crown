#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

try {
  const [phaseArg, status = 'skipped', ...noteParts] = process.argv.slice(2);
  if (!phaseArg) throw new Error('usage: retro-record.cjs <phaseDir> [status] [note...]');
  const phaseDir = path.resolve(phaseArg);
  const allowed = ['pass','skipped','blocked','unavailable','deferred'];
  if (!allowed.includes(status)) throw new Error(`invalid status ${status}`);
  const data = {
    schema: 1,
    runner: 'gstack/retro',
    status,
    recordedAt: new Date().toISOString(),
    note: noteParts.join(' ') || null,
  };
  fs.writeFileSync(path.join(phaseDir, 'GSTACK-RETRO.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify(data, null, 2));
} catch (err) {
  console.error(`retro-record: ${err.message}`);
  process.exit(1);
}
