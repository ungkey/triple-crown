'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');
const { ROOT, copyRepo, walkFiles } = require('./helpers/repo.cjs');
const { LIB_MAP } = require('../../scripts/build-capabilities.cjs');

// 도구는 자기 위치(__dirname/..)를 저장소 루트로 삼는다. 그래서 복사본의 스크립트를
// 실행하면 복사본이 대상이 된다 — cwd 나 환경변수에 기대지 않는다.
function build(repo, args = []) {
  return cp.spawnSync(process.execPath,
    [path.join(repo, 'scripts', 'build-capabilities.cjs'), ...args], { encoding: 'utf8' });
}
const canonical = (repo, f) => path.join(repo, 'lib', f);
const copyOf = (repo, id, f) => path.join(repo, 'capabilities', id, 'checks', 'lib', f);

test('the committed tree is already in sync', () => {
  const r = build(ROOT, ['--check']);
  assert.strictEqual(r.status, 0, r.stderr);
});

test('editing canonical fails --check, and one build fixes it (§4.4 rows 1-2)', () => {
  const repo = copyRepo('crew-drift-');
  fs.appendFileSync(canonical(repo, 'repo-state-lib.cjs'), '\n// drift\n');

  const drifted = build(repo, ['--check']);
  assert.notStrictEqual(drifted.status, 0, 'drift must be detected without running a build');
  assert.match(drifted.stderr, /build:caps/, 'the failure must name the fix');

  assert.strictEqual(build(repo).status, 0, 'a normally modified canonical must build');
  assert.strictEqual(build(repo, ['--check']).status, 0, 'the build must leave the tree in sync');
  assert.deepStrictEqual(
    fs.readFileSync(copyOf(repo, 'crew-quality', 'repo-state-lib.cjs')),
    fs.readFileSync(canonical(repo, 'repo-state-lib.cjs')));
});

test('canonical can be modified twice in a row without blocking (§4.4 row 4)', () => {
  // prev 를 제3의 기준점으로 쓰는 이유가 정확히 이것이다. canonical 과만 비교하면
  // 2회차에서 사본이 1회차 결과와 달라 "손댔다"로 오판하고 빌드가 영영 막힌다.
  const repo = copyRepo('crew-twice-');
  for (const n of [1, 2]) {
    fs.appendFileSync(canonical(repo, 'evidence-store.cjs'), `\n// pass ${n}\n`);
    const r = build(repo);
    assert.strictEqual(r.status, 0, `pass ${n} must build: ${r.stderr}`);
  }
  assert.strictEqual(build(repo, ['--check']).status, 0);
});

test('hand-editing a copy is refused with a restore command (§4.4 row 5)', () => {
  const repo = copyRepo('crew-handedit-');
  fs.appendFileSync(copyOf(repo, 'crew-quality', 'repo-state-lib.cjs'), '\n// sneaky\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0, 'a hand-edited copy must never be silently overwritten');
  assert.match(r.stderr, /hand-edited/);
  assert.match(r.stderr, /git restore capabilities\/crew-quality\/checks\/lib\/repo-state-lib\.cjs/);
});

test('a missing record over untouched copies is regenerated (bootstrap)', () => {
  // 사본이 전부 canonical 과 같으면 기록은 유도 가능하다. 여기서 거부하면 Task 2 가
  // 심어 놓은 사본 위에서 도는 최초 빌드가 영영 불가능해진다.
  const repo = copyRepo('crew-bootstrap-');
  const rec = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib', 'LIB-HASH.json');
  fs.rmSync(rec);
  const r = build(repo);
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stderr, /recorded /);   // 도구 출력은 전부 stderr (prepack 이 npm --json 을 오염시키지 않도록)
  assert.ok(fs.existsSync(rec));
});

test('a missing record over a changed copy is refused', () => {
  // 기록도 없고 사본도 다르면 도구가 만든 것인지 손으로 넣은 것인지 구분할 수단이 없다.
  // 그 상태에서 덮어쓰면 증거가 조용히 사라진다.
  const repo = copyRepo('crew-noprov-');
  const dir = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib');
  fs.rmSync(path.join(dir, 'LIB-HASH.json'));
  fs.appendFileSync(path.join(dir, 'evidence-store.cjs'), '\n// sneaky\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /provenance unknown/);
  assert.match(r.stderr, /evidence-store\.cjs/);
});

test('an unmapped file with no record is refused rather than deleted', () => {
  const repo = copyRepo('crew-unmapped-');
  const dir = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib');
  fs.rmSync(path.join(dir, 'LIB-HASH.json'));
  fs.writeFileSync(path.join(dir, 'stowaway.cjs'), 'module.exports = {};\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /stowaway\.cjs/);
});

test('a missing copy is rebuilt', () => {
  const repo = copyRepo('crew-missing-');
  fs.rmSync(copyOf(repo, 'crew-quality', 'resolve-phase-dir.cjs'));
  assert.notStrictEqual(build(repo, ['--check']).status, 0, '--check must report the gap');
  assert.strictEqual(build(repo).status, 0);
  assert.strictEqual(build(repo, ['--check']).status, 0);
});

test('LIB_MAP covers every shared lib a bundled script or skill reaches for', () => {
  // 표에서 빠진 참조는 런타임에만 터진다. M1b 가 capability 를 9개로 쪼갤 때
  // 표 갱신을 잊는 것이 가장 그럴듯한 실패다 — 정적으로 전수 확인한다.
  const bad = [];
  for (const id of fs.readdirSync(path.join(ROOT, 'capabilities'))) {
    const capDir = path.join(ROOT, 'capabilities', id);
    const mapped = LIB_MAP[id] || [];
    for (const f of walkFiles(capDir, ['.cjs', 'SKILL.md'])) {
      // 사본 디렉터리 안의 참조는 형제끼리다 — 표의 대상이 아니다.
      if (f.includes(`${path.sep}checks${path.sep}lib${path.sep}`)) continue;
      const body = fs.readFileSync(f, 'utf8');
      const hits = [
        ...body.matchAll(/require\(\s*['"]\.\/lib\/([A-Za-z0-9._-]+\.cjs)['"]\s*\)/g),
        ...body.matchAll(/checks\/lib\/([A-Za-z0-9._-]+\.cjs)/g),
      ];
      for (const m of hits) {
        if (!mapped.includes(m[1])) bad.push(`${path.relative(ROOT, f)}: ${m[1]} not in LIB_MAP['${id}']`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'LIB_MAP is incomplete');
});

test('an unmapped copy is refused by default and removed only with --prune', () => {
  const repo = copyRepo('crew-unmapped-mapped-');
  const dir = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib');
  fs.writeFileSync(path.join(dir, 'stowaway.cjs'), 'module.exports = {};\n');

  const refused = build(repo);
  assert.notStrictEqual(refused.status, 0, 'an unmapped copy must not be deleted without --prune');
  assert.match(refused.stderr, /not mapped in LIB_MAP/);
  assert.ok(fs.existsSync(path.join(dir, 'stowaway.cjs')), 'the refusing run must leave the file alone');

  const pruned = build(repo, ['--prune']);
  assert.strictEqual(pruned.status, 0, pruned.stderr);
  assert.match(pruned.stderr, /removed /);
  assert.ok(!fs.existsSync(path.join(dir, 'stowaway.cjs')));
});

test('a non-.cjs stowaway is refused too — the filter is by record, not by extension', () => {
  // require('./lib/helper.js') 는 CommonJS 에서 그대로 해석된다. 확장자로 거르면
  // 빌드 · --check · 설치 프리플라이트 세 검사를 전부 지나 tarball 까지 실린다.
  const repo = copyRepo('crew-stow-js-');
  const dir = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib');
  fs.writeFileSync(path.join(dir, 'helper.js'), 'module.exports = {};\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /helper\.js/);
});

test('--check writes nothing, even on a drifted tree', () => {
  // l1.yml 의 첫 스텝이 --check 다. 트리를 건드리면 뒤따르는 L1 결과가 오염된다.
  const repo = copyRepo('crew-checkpure-');
  fs.appendFileSync(canonical(repo, 'repo-state-lib.cjs'), '\n// drift\n');
  const snap = () => walkFiles(path.join(repo, 'capabilities'), ['.cjs', '.json'])
    .concat(walkFiles(path.join(repo, 'lib'), ['.cjs']))
    .sort()
    .map((p) => `${path.relative(repo, p)}:${fs.readFileSync(p).length}:${fs.statSync(p).mtimeMs}`);
  const before = snap();
  assert.notStrictEqual(build(repo, ['--check']).status, 0, '--check must report the drift');
  assert.deepStrictEqual(snap(), before, '--check must not touch the tree');
});

test('a mixed tree — one normal edit plus one hand-edited copy — is left untouched (2-pass)', () => {
  // 1-패스 구조라면 정상 수정분을 먼저 덮어쓴 뒤 손편집분에서 멈춘다. 사용자는
  // "빌드 실패"를 보지만 트리는 반쯤 바뀐 상태고, 손편집을 거부해 증거를 지키겠다는
  // 목적이 반쪽만 성립한다.
  const repo = copyRepo('crew-mixed-');
  fs.appendFileSync(canonical(repo, 'evidence-store.cjs'), '\n// normal edit\n');
  const victim = copyOf(repo, 'crew-quality', 'evidence-store.cjs');
  const before = fs.readFileSync(victim);
  fs.appendFileSync(copyOf(repo, 'crew-quality', 'repo-state-lib.cjs'), '\n// hand edit\n');

  const r = build(repo);
  assert.notStrictEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /hand-edited/);
  assert.deepStrictEqual(fs.readFileSync(victim), before,
    'a failed build must not have already applied the normal edit');
});

test('a missing canonical lib is reported, not silently skipped', () => {
  const repo = copyRepo('crew-nocanon-');
  fs.rmSync(canonical(repo, 'resolve-phase-dir.cjs'));
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /canonical lib\/resolve-phase-dir\.cjs is missing/);
});

test('a capability in LIB_MAP with no directory is reported', () => {
  const repo = copyRepo('crew-nocapdir-');
  fs.rmSync(path.join(repo, 'capabilities', 'crew-quality'), { recursive: true });
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /capability directory missing/);
});

test('reordering LIB_MAP does not make the record look stale', () => {
  // 자기 검토가 명시한 함정: JSON.stringify 비교면 키 순서가 바뀔 때 거짓 stale 이 난다.
  const repo = copyRepo('crew-order-');
  const tool = path.join(repo, 'scripts', 'build-capabilities.cjs');
  const src = fs.readFileSync(tool, 'utf8');
  const reversed = src.replace(
    "'crew-quality': ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs']",
    "'crew-quality': ['resolve-phase-dir.cjs', 'evidence-store.cjs', 'repo-state-lib.cjs']");
  assert.notStrictEqual(reversed, src, 'the LIB_MAP literal must be substitutable');
  fs.writeFileSync(tool, reversed);
  const r = build(repo, ['--check']);
  assert.strictEqual(r.status, 0, `key order must not affect the record comparison:\n${r.stderr}`);
});

test('a checks/lib outside LIB_MAP is refused, not invisible', () => {
  // 실측(수정 전): LIB_MAP 에 없는 id 아래에 사본을 하나 두면 `--check` 가 `in sync` 로
  // exit 0, lib-hash 테스트 16/16 통과, `npm pack --dry-run` 이 그 파일을 싣고,
  // 그런데 `bin/crew.cjs install` 은 "checks/lib exists without a readable
  // schema-1 LIB-HASH.json" 으로 거부했다 — 배포는 되는데 설치는 안 되는 tarball.
  // 설치 프리플라이트는 capabilities/ 디렉터리 자체를 검사 대상의 정의로 삼는데(결정 A3)
  // 도구만 표를 돌고 있었다. M1b 가 capability 를 아홉으로 쪼갤 때 파일이 먼저 놓이고
  // LIB_MAP 이 나중에 갱신되는 중간 상태가 정확히 이 사각지대다.
  const repo = copyRepo('crew-stray-cap-');
  const dir = path.join(repo, 'capabilities', 'crew-guide', 'checks', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(canonical(repo, 'repo-state-lib.cjs'), path.join(dir, 'repo-state-lib.cjs'));

  const checked = build(repo, ['--check']);
  assert.notStrictEqual(checked.status, 0, '--check must see a copy that lives outside LIB_MAP');
  assert.match(checked.stderr, /crew-guide/);
  assert.match(checked.stderr, /not a key of LIB_MAP/);

  const built = build(repo);
  assert.notStrictEqual(built.status, 0, 'a write-mode build must refuse it too');
  assert.ok(fs.existsSync(path.join(dir, 'repo-state-lib.cjs')),
    'the refusal must not delete the stray copy — deletion is --prune territory');
});

test('a stray checks/lib composes with the two-pass rule instead of half-applying', () => {
  // 표 밖 사본을 발견하는 즉시 exit 하면, 그 앞에서 계획된 정상 수정분이 이미 적용된
  // 뒤 멈추는 부분 적용이 되살아난다. 에러 수집 단계에 두었는지를 트리로 판정한다.
  const repo = copyRepo('crew-stray-2pass-');
  const dir = path.join(repo, 'capabilities', 'crew-guide', 'checks', 'lib');
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(canonical(repo, 'repo-state-lib.cjs'), path.join(dir, 'repo-state-lib.cjs'));
  fs.appendFileSync(canonical(repo, 'evidence-store.cjs'), '\n// normal edit\n');
  const victim = copyOf(repo, 'crew-quality', 'evidence-store.cjs');
  const before = fs.readFileSync(victim);

  const r = build(repo);
  assert.notStrictEqual(r.status, 0, r.stdout);
  assert.match(r.stderr, /not a key of LIB_MAP/);
  assert.deepStrictEqual(fs.readFileSync(victim), before,
    'a failed build must not have already applied the mapped capability\'s normal edit');
});

test('a directory under checks/lib is refused during planning, never rmSync-ed', () => {
  // 실측(수정 전): 하위 디렉터리가 "표에 없는 사본"으로 잡혀 --prune 이 remove op 를
  // 계획했고, 비재귀 fs.rmSync 가 **적용 단계 한가운데서** ERR_FS_EISDIR 스택으로 터졌다.
  // 앞선 copy op 는 이미 적용된 뒤라 사본은 새 canonical, LIB-HASH.json 은 옛 해시로 남았다
  // — 이 도구가 존재할 수 없다고 보장하는 사본/기록 불일치가 실제로 만들어졌다.
  const repo = copyRepo('crew-subdir-');
  const dir = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib');
  fs.mkdirSync(path.join(dir, 'nested'));
  fs.writeFileSync(path.join(dir, 'nested', 'stowaway.cjs'), 'module.exports = {};\n');
  fs.appendFileSync(canonical(repo, 'evidence-store.cjs'), '\n// normal edit\n');
  const victim = copyOf(repo, 'crew-quality', 'evidence-store.cjs');
  const before = fs.readFileSync(victim);

  const r = build(repo, ['--prune']);
  assert.notStrictEqual(r.status, 0, '--prune must not try to remove a directory');
  assert.match(r.stderr, /is a directory/);
  assert.doesNotMatch(r.stderr, /ERR_FS_EISDIR/, 'the refusal must be an explicit error, not a raw fs stack');
  assert.ok(fs.existsSync(path.join(dir, 'nested', 'stowaway.cjs')),
    'the tool must never delete a subtree — silent recursive removal is the worse default');

  // 부분 적용이 없었는지: 사본은 그대로고, 기록은 여전히 그 사본을 가리킨다.
  assert.deepStrictEqual(fs.readFileSync(victim), before, 'no copy op may have been applied');
  const record = JSON.parse(fs.readFileSync(path.join(dir, 'LIB-HASH.json'), 'utf8'));
  assert.strictEqual(record.files['evidence-store.cjs'],
    crypto.createHash('sha256').update(before).digest('hex'),
    'the copy and the record must never be left disagreeing');
});

test('an unknown flag is refused instead of performing a real build', () => {
  // 실측(수정 전): drift 된 트리에서 `--chek` 이 사본과 기록을 둘 다 쓰고 exit 0 였다.
  // 대표 계약이 "--check 는 아무것도 쓰지 않는다"인 도구에서 오타 한 글자가 모드를 뒤집는다.
  const repo = copyRepo('crew-badflag-');
  fs.appendFileSync(canonical(repo, 'repo-state-lib.cjs'), '\n// drift\n');
  const copy = copyOf(repo, 'crew-quality', 'repo-state-lib.cjs');
  const rec = path.join(repo, 'capabilities', 'crew-quality', 'checks', 'lib', 'LIB-HASH.json');
  const copyBefore = fs.readFileSync(copy);
  const recBefore = fs.readFileSync(rec);

  const r = build(repo, ['--chek']);
  assert.notStrictEqual(r.status, 0, 'a typo must not fall through to the default write mode');
  assert.match(r.stderr, /unknown argument/);
  assert.match(r.stderr, /--chek/);
  assert.deepStrictEqual(fs.readFileSync(copy), copyBefore, 'the refused run must not have written the copy');
  assert.deepStrictEqual(fs.readFileSync(rec), recBefore, 'the refused run must not have written the record');
});
