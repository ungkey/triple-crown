import assert from 'node:assert/strict';
const src = await (await import('node:fs/promises')).readFile(new URL('./server.mjs', import.meta.url), 'utf8');
assert.match(src,/server\.listen/);
console.log('fixture smoke pass');
