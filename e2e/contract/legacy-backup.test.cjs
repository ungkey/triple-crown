'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { mkFakeHome, runBackupTool, CAPABILITIES } = require('./helpers/fake-home.cjs');

test('backup captures all legacy targets into manifest + archive', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  const rels = manifest.targets.map((t) => t.rel);
  assert.ok(rels.includes('.triple-crown'));
  for (const id of CAPABILITIES) assert.ok(rels.includes(`.gsd/capabilities/${id}`), id);
  assert.ok(rels.includes('.claude/hooks/triple-crown-ship-guard.cjs'));
  assert.ok(rels.includes('.claude/skills/gsd-triple-crown'));
  assert.ok(rels.includes('CLAUDE.md'));
  assert.ok(rels.includes('.claude/settings.json'));

  assert.strictEqual(manifest.claudeMd.present, true);
  assert.strictEqual(manifest.claudeMd.startLine, 1);
  assert.strictEqual(manifest.settings.hasHookGroup, true);
  assert.ok(manifest.files.some((f) => f.kind === 'file' && f.sha256.startsWith('sha256:')));

  const frag = fs.readFileSync(path.join(dest, 'CLAUDE.md.fragment'), 'utf8');
  assert.ok(frag.startsWith('<!-- triple-crown:managed-routing:start -->'));
  assert.ok(frag.trimEnd().endsWith('<!-- triple-crown:managed-routing:end -->'));

  const group = JSON.parse(fs.readFileSync(path.join(dest, 'settings.json.hookgroup'), 'utf8'));
  assert.strictEqual(group.matcher, 'Bash');
  assert.match(group.hooks[0].command, /triple-crown-ship-guard\.cjs/);

  assert.ok(fs.existsSync(path.join(dest, 'archive.tar.gz')));
  assert.ok(fs.existsSync(path.join(dest, 'legacy-backup.cjs')));
  assert.ok(fs.statSync(path.join(dest, 'restore.sh')).mode & 0o100, 'restore.sh must be executable');
});

test('backup refuses a non-empty destination and an empty home', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'existing'), 'x');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0);

  const emptyHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-empty-'));
  const r2 = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.notStrictEqual(r2.status, 0);
  assert.match(r2.stderr, /nothing to back up/i);
});

test('detect reports the inventory of any home and never fails on an absent install', () => {
  // 레거시가 설치된 적 없는 PC — Task 9가 여기서 막히면 안 된다.
  const emptyHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-empty-'));
  const empty = runBackupTool(['detect'], { HOME: emptyHome });
  assert.strictEqual(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /^legacy targets: 0$/m);

  // Claude Code만 깔린 평범한 홈 — 사용자 파일이 있다고 레거시로 세면 안 된다.
  // (파일 존재로 세던 초안은 이 홈에서 1을 반환해 Task 9의 스킵 분기를 죽였다.)
  fs.mkdirSync(path.join(emptyHome, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(emptyHome, '.claude/settings.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'other.cjs' }] }] } }, null, 2));
  fs.writeFileSync(path.join(emptyHome, 'CLAUDE.md'), '# my own notes\n');
  const stock = runBackupTool(['detect'], { HOME: emptyHome });
  assert.strictEqual(stock.status, 0, stock.stderr);
  assert.match(stock.stdout, /^legacy targets: 0$/m, 'user-owned files are not a legacy install');
  // 같은 술어를 공유하므로 backup도 여기서 거부해야 한다.
  const b = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.notStrictEqual(b.status, 0);
  assert.match(b.stderr, /nothing to back up/i);

  // 레거시가 설치된 PC — 같은 명령이 실제 인벤토리를 센다.
  const home = mkFakeHome();
  const full = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(full.status, 0, full.stderr);
  const n = Number(full.stdout.match(/^legacy targets: (\d+)$/m)[1]);
  assert.ok(n > 0, `fake home must report targets, got ${n}`);
  assert.match(full.stdout, new RegExp(`^home: ${home}$`, 'm'));
});

test('default backup directory uses the local date, not the UTC date', () => {
  // UTC+14 / UTC-12 두 시간대는 서로 1~2일 차이나므로, 어느 순간에 실행해도
  // 최소 한쪽은 UTC 날짜와 다르다 — toISOString().slice(0,10) 구현이면 반드시 깨진다.
  for (const tz of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
    const home = mkFakeHome();
    const r = runBackupTool(['backup'], { HOME: home, TZ: tz });
    assert.strictEqual(r.status, 0, r.stderr);

    // 같은 TZ에서 `date +%F`와 동일한 값 (Node는 TZ 환경변수를 존중한다)
    const expected = cp.execFileSync(process.execPath, ['-e',
      'const d=new Date(),p=(n)=>String(n).padStart(2,"0");' +
      'process.stdout.write(`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`);'],
      { encoding: 'utf8', env: { ...process.env, TZ: tz } });

    assert.deepStrictEqual(fs.readdirSync(path.join(home, '.crew-legacy-backup')), [expected],
      `TZ=${tz}: default dest must match local date`);
    assert.match(r.stdout, new RegExp(`backup complete: .*${expected}`),
      'stdout must print the actual dest so the runbook can reuse it');
  }
});

test('detect tolerates a corrupted settings.json (exit 0, UNDETERMINED) while backup still refuses it', () => {
  // 손상된 settings.json은 detect가 살아남아야 하는 바로 그 미지 상태다 — 반쯤 고친
  // 설정 파일을 가진 머신에서도 Task 9의 런북은 detect의 exit code로 진행 여부를 정한다.
  const home = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-corrupt-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/settings.json'), '{ this is not valid json');

  const d = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(d.status, 0, d.stderr);
  assert.match(d.stdout, /settings\.json ship-guard group: UNDETERMINED \(not valid JSON\)/);
  assert.match(d.stdout, /^legacy targets: 0$/m, 'an unparseable file must not be counted as a legacy signal');

  // backup must still fail loudly on the same corrupted file — a silent
  // hasHookGroup:false in the manifest would be a false backup.
  const b = runBackupTool(['backup', '--dest', path.join(home, 'b')], { HOME: home });
  assert.notStrictEqual(b.status, 0);
  assert.match(b.stderr, /not valid JSON/i);
});
