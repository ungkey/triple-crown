'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { copyRepo } = require('./helpers/repo.cjs');
const { LIB_MAP } = require('../../scripts/build-capabilities.cjs');

// npm 은 Windows 에서 npm.cmd 다. 이 계약 테스트는 L1 중 유일하게 외부 프로세스를
// 오래 붙잡으므로 파일을 분리해 두었다.
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
function pack(repo) {
  return cp.spawnSync(NPM, ['pack', '--dry-run', '--json'], { cwd: repo, encoding: 'utf8' });
}
function publish(repo, extra = []) {
  return cp.spawnSync(NPM, ['publish', '--dry-run', ...extra], { cwd: repo, encoding: 'utf8' });
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

  // 릴리스 버전에서 펜스가 **열리는지**도 본다. 통과 여부 전체를 단언하지는 않는다 —
  // copyRepo 는 .git 을 제외하므로 사본에서는 뒤따르는 더티 트리 검사가
  // `fatal: not a git repository` 로 죽는다(실측). 이 테스트의 대상은 첫 단계다.
  const released = copyRepo('crew-publish-release-');
  fs.writeFileSync(path.join(released, 'VERSION'), '0.7.0\n');
  const opened = publish(released, ['--tag', 'next']);
  assert.doesNotMatch(`${opened.stdout}${opened.stderr}`, /Error: refusing to publish prerelease/,
    'a release VERSION must clear the prerelease fence');
});
