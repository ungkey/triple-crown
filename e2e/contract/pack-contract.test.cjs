'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { copyRepo, copyRepoAsGit } = require('./helpers/repo.cjs');
const { LIB_MAP } = require('../../scripts/build-capabilities.cjs');

// npm 은 Windows 에서 npm.cmd 다. 이 계약 테스트는 L1 중 유일하게 외부 프로세스를
// 오래 붙잡으므로 파일을 분리해 두었다.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function pack(repo) {
  return cp.spawnSync(NPM, ['pack', '--dry-run', '--json'], { cwd: repo, encoding: 'utf8' });
}
// 레지스트리를 도달 불가 주소로 못 박는다. 계획 단계에서 `--dry-run` 은 네트워크를 타지
// 않는 것으로 실측됐고 이 주소로도 exit 0 이므로 비용은 0 이다. 얻는 것은 구조적 보장이다:
// 누가 `--dry-run` 을 실수로 지우면 이 스위트가 **진짜 배포를 시도하는 대신** 연결 거부로
// 죽는다. 테스트 스위트에서 실제 publish 가 나갈 경로 자체를 없앤다.
// `--fetch-retries=0` 은 속도가 아니라 실행 가능성의 문제다. 게이트가 **열리는** 경로는
// npm 이 레지스트리에 로그인 여부를 물으러 가고, 거부된 연결을 기본 백오프로 재시도한다 —
// 실측 74.7s. 재시도를 끄면 같은 판정이 0.32s 에 끝나고 종료 코드도 그대로 0 이다.
const DEAD_REGISTRY = 'http://127.0.0.1:1';
function publish(repo, extra = []) {
  return cp.spawnSync(NPM,
    ['publish', '--dry-run', '--registry', DEAD_REGISTRY, '--fetch-retries=0', ...extra],
    { cwd: repo, encoding: 'utf8' });
}
// prepublishOnly 2·3단계에 닿으려면 1단계(프리릴리스 거부)가 **열려** 있어야 하고,
// 3단계는 `git status --porcelain` 을 돌리므로 진짜 git 저장소가 있어야 한다. 릴리스
// VERSION 을 커밋한 일회용 git 사본을 만든다.
function releaseFixture(prefix) {
  const { dir, git } = copyRepoAsGit(prefix);
  fs.writeFileSync(path.join(dir, 'VERSION'), '0.7.0\n');
  git('add', '-A');
  git('commit', '-q', '--no-verify', '-m', 'release VERSION');
  return { dir, git };
}

test('prepack refreshes the copies so a normally modified canonical still packs (§4.4 row 3)', () => {
  const repo = copyRepo('crew-pack-drift-');
  fs.appendFileSync(path.join(repo, 'lib', 'repo-state-lib.cjs'), '\n// drift\n');

  const r = pack(repo);
  assert.strictEqual(r.status, 0, `pack must not be blocked by a normal canonical edit:\n${r.stderr}`);

  // 종료 코드만 보면 "prepack 이 안 돌았다"와 구분되지 않는다. 실제로 사본이
  // 갱신됐는지 별도로 판정한다.
  const check = cp.spawnSync(process.execPath,
    [path.join(repo, 'scripts', 'build-capabilities.cjs'), '--check'], { encoding: 'utf8' });
  assert.strictEqual(check.status, 0, `prepack did not refresh the copies:\n${check.stderr}`);
});

test('the packed tarball carries every lib copy and its hash record (§4.4 row 6)', () => {
  const repo = copyRepo('crew-pack-list-');
  const r = pack(repo);
  assert.strictEqual(r.status, 0, r.stderr);
  const files = JSON.parse(r.stdout)[0].files.map((f) => f.path);

  for (const [id, libs] of Object.entries(LIB_MAP)) {
    assert.ok(files.includes(`capabilities/${id}/checks/lib/LIB-HASH.json`),
      `${id}: LIB-HASH.json missing from the tarball`);
    for (const f of libs) {
      assert.ok(files.includes(`capabilities/${id}/checks/lib/${f}`),
        `${id}/${f} missing from the tarball`);
    }
  }

  // canonical 은 일부러 싣지 않는다. **이유는 변조 저항이 아니다** — 기록(LIB-HASH.json)도
  // 같은 tarball 안에 있으므로 사본과 기록을 둘 다 고치면 그대로 통과하고, 그건 원본을
  // 같이 싣는 경우와 똑같은 한계다. 대조가 실제로 주는 성질은 (1) 사고성 drift 검출,
  // (2) 사본만 고치고 기록은 안 고친 한쪽 편집 검출, 이 둘뿐이다.
  // 안 싣는 진짜 이유는 단일 소스 규율이다: 배포본에 원본이 같이 있으면 설치 시점 검사가
  // "사본 대 원본"으로 흘러갈 여지가 생기고, 그 순간 배포본만 보고는 어느 쪽이 canonical
  // 인지 알 수 없게 된다. 배포 크기가 주는 것은 부수 효과다.
  assert.ok(!files.some((f) => f === 'lib' || f.startsWith('lib/')),
    'canonical lib/ must not be published');
});

test('a hand-edited copy blocks npm pack — prepack is a gate, not a formality', () => {
  // 실측: prepack 이 non-zero 로 끝나면 npm pack 은 exit 1 이고 --json 출력도 배열이
  // 아니라 {"error":…} 가 된다. 누가 prepack 을 "… || true" 로 바꾸면 손편집된 사본이
  // 그대로 배포되는데, 그 회귀를 잡는 것은 이 단언뿐이다.
  const repo = copyRepo('crew-pack-blocked-');
  fs.appendFileSync(
    path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib', 'repo-state-lib.cjs'),
    '\n// hand edit\n');
  const r = pack(repo);
  assert.notStrictEqual(r.status, 0, 'npm pack must not succeed when prepack refuses');
  assert.match(`${r.stdout}${r.stderr}`, /hand-edited/);
});

test('a prerelease VERSION is refused by the publish gate, even behind --tag', () => {
  // 실측 세 가지. (1) `npm publish --dry-run` 은 prepublishOnly 를 **실제로** 돌린다.
  // (2) 도달 불가 레지스트리(--registry http://127.0.0.1:1)로도 exit 0 이므로 dry-run 은
  //     네트워크를 타지 않는다 — 인증도 오프라인 CI 도 문제되지 않는다.
  // (3) npm 자체는 프리릴리스의 latest 배포만 막고 `--tag next` 로는 exit 0 이다.
  //     그래서 --tag 를 명시적으로 넣어 우리 게이트만 남긴 상태로 판정한다.
  // `Error: ` 접두사가 **반드시** 필요하다. npm 은 실패한 스크립트의 명령줄을 그대로
  // 되울리는데 그 줄에 `'refusing to publish prerelease VERSION '+v` 라는 소스가 들어
  // 있어서, 접두사 없는 정규식은 게이트가 **열린** 경우에도 매치된다 — 실측에서 거짓
  // 통과가 실제로 났다(릴리스 버전 판정에 2줄 매치).
  const repo = copyRepo('crew-publish-fence-');
  const refused = publish(repo, ['--tag', 'next']);
  assert.notStrictEqual(refused.status, 0, 'a prerelease VERSION must not publish, not even behind --tag');
  assert.match(`${refused.stdout}${refused.stderr}`,
    /Error: refusing to publish prerelease VERSION 0\.7\.0-dev/);

  // 릴리스 버전에서 펜스가 **열리는지**도 본다. 여기서는 1단계만 판정한다 — copyRepo 는
  // .git 을 제외하므로 이 사본에서는 3단계가 `fatal: not a git repository` 로 죽는다(실측).
  // 2·3단계는 아래 releaseFixture() 기반 테스트들이 맡는다.
  const released = copyRepo('crew-publish-release-');
  fs.writeFileSync(path.join(released, 'VERSION'), '0.7.0\n');
  const opened = publish(released, ['--tag', 'next']);
  assert.doesNotMatch(`${opened.stdout}${opened.stderr}`, /Error: refusing to publish prerelease/,
    'a release VERSION must clear the prerelease fence');
});

test('prepublishOnly stage 2 refuses a tree whose lib copies are out of sync', () => {
  // 실측(수정 전): prepublishOnly 의 값은 && 로 이어진 3단계인데 테스트가 걸려 있던 것은
  // 1단계뿐이었다. 값을 1단계만 남기고 잘라도 스위트는 74 pass / 0 fail 이었다. 그리고
  // 이 트리는 프리릴리스라 1단계에서 늘 단락되므로, 2·3단계는 M0–M7 구간 내내 한 번도
  // 실행되지 않는다 — 첫 실행이 M7 릴리스 당일이 된다.
  //
  // drift 를 **커밋해서** 트리를 깨끗하게 둔다. 그래야 3단계로는 잡히지 않고 2단계만
  // 판정 대상이 된다. 2단계를 지우면 뒤이어 도는 prepack 이 사본을 조용히 다시 만들어
  // publish 가 exit 0 로 끝난다(실측) — 그때 이 테스트가 빨개진다.
  const { dir, git } = releaseFixture('crew-publish-stage2-');
  fs.appendFileSync(path.join(dir, 'lib', 'repo-state-lib.cjs'), '\n// drift\n');
  git('add', '-A');
  git('commit', '-q', '--no-verify', '-m', 'canonical edit without a rebuild');
  assert.strictEqual(git('status', '--porcelain').stdout.trim(), '',
    'the fixture must be clean so only stage 2 can refuse it');

  const r = publish(dir, ['--tag', 'next']);
  assert.notStrictEqual(r.status, 0, 'a drifted tree must not publish');
  assert.match(`${r.stdout}${r.stderr}`, /shared lib copies are out of sync/,
    'the refusal must come from stage 2 (`build-capabilities --check`)');
});

test('prepublishOnly stage 3 refuses a dirty tree, and all three stages open on a clean release', () => {
  const { dir } = releaseFixture('crew-publish-stage3-');

  // 먼저 게이트가 **전부 열리는지** 본다. 이 단언이 없으면 아래 거부는 "원래 안 되는 것"
  // 으로도 통과한다. 도달 불가 레지스트리에서도 --dry-run 은 exit 0 다(실측).
  const opened = publish(dir, ['--tag', 'next']);
  assert.strictEqual(opened.status, 0,
    `a clean release tree must clear all three prepublishOnly stages:\n${opened.stdout}${opened.stderr}`);

  fs.appendFileSync(path.join(dir, 'README.md'), '\n<!-- uncommitted -->\n');
  const refused = publish(dir, ['--tag', 'next']);
  assert.notStrictEqual(refused.status, 0, 'a dirty tree must not publish');
  // `Error: ` 접두사가 반드시 필요하다 — npm 은 실패한 스크립트의 명령줄을 그대로 되울리고
  // 그 줄 안에 이 문구의 **소스**가 들어 있어서, 접두사 없는 정규식은 게이트가 열린
  // 경우에도 매치된다(1단계 테스트에서 실제로 거짓 통과가 났던 함정과 같다).
  assert.match(`${refused.stdout}${refused.stderr}`, /Error: refusing to publish from a dirty tree/);
});

test('the artifact npm test writes does not dirty the tree the publish gate inspects', () => {
  // 커밋 4가 클린 트리 단계를 추가하면서, `npm test` → `tests/run_v061_l0.py` →
  // `e2e/run-live.cjs --mock` 이 매번 갈아쓰는 e2e/E2E-RESULT.json 이 추적 파일이라
  // "테스트를 돌린 뒤 배포한다"는 평범한 릴리스 순서가 배포 게이트에서 막혔다.
  // 타임스탬프와 실행 머신의 절대 cwd 가 박히는 실행 산출물이므로 추적을 뗐다.
  const { dir, git } = releaseFixture('crew-publish-artifact-');
  fs.writeFileSync(path.join(dir, 'e2e', 'E2E-RESULT.json'),
    JSON.stringify({ schema: 1, mode: 'mock', startedAt: new Date().toISOString() }, null, 2) + '\n');

  assert.strictEqual(git('status', '--porcelain').stdout.trim(), '',
    'a test run must not leave the tree dirty for the publish gate');
  const r = publish(dir, ['--tag', 'next']);
  assert.strictEqual(r.status, 0,
    `writing the run artifact must not close the publish gate:\n${r.stdout}${r.stderr}`);
});
