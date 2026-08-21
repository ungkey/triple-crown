'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

// helpers/ 는 e2e/contract/ 아래이므로 저장소 루트는 세 단계 위다.
const ROOT = path.join(__dirname, '..', '..', '..');

// 복사 제외 목록. .git 과 node_modules 는 복사 비용의 대부분이고 어느 테스트도
// 이력이나 의존성을 보지 않는다. .superpowers 는 계획·리뷰 스크래치(수백 KB)라
// 제품 트리가 아니다 — 한 번 도는 데 스무 번 넘게 복사되던 순수 낭비였다.
const EXCLUDED = new Set(['.git', 'node_modules', '.superpowers']);

// 만든 임시 디렉터리는 프로세스가 끝날 때 전부 지운다. 이 훅이 없던 동안 한 번의
// test:l1 이 저장소 사본 27개(약 40MB)를 /tmp 에 남겼고, 실측에서 650개가 쌓여
// 파일시스템을 거의 채웠다. node --test 는 테스트 파일마다 자식 프로세스를 띄우므로
// 'exit' 훅은 파일 단위로 정확히 한 번 돈다.
const created = [];
process.on('exit', () => {
  for (const dir of created.splice(0)) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* 청소는 최선 노력 */ }
  }
});

// 테스트가 만드는 **모든** 임시 디렉터리를 같은 대장에 올린다. copyRepo 만 고치면 용량의
// 거의 전부인 저장소 사본은 사라지지만 픽스처 디렉터리는 계속 쌓인다 — 실측으로 /tmp 에
// crew-fake-home-* 2,666개, crew-proj-* 416개가 남아 있었다.
function tempDir(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

// 저장소를 통째로 임시 디렉터리에 복사한다. drift·hand-edit 시나리오는 트리를
// 더럽히므로 원본에서 재현할 수 없다.
function copyRepo(prefix = 'crew-repo-') {
  const dest = tempDir(prefix);
  fs.cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => !src.split(path.sep).some((part) => EXCLUDED.has(part)),
  });
  return dest;
}

// copyRepo 의 사본을 **진짜 git 저장소**로 만든다(일회용, 원본 이력과 무관).
//
// 필요한 이유: prepublishOnly 의 3단계는 `git status --porcelain` 을 돌린다. .git 을
// 제외한 평범한 copyRepo 사본에서는 그 명령이 `fatal: not a git repository` 로 죽으므로
// 3단계는 **어떤 기존 픽스처에서도 실행될 수 없었다**(실측). 게이트를 테스트하기 쉽게
// 약화시키는 대신, 픽스처 쪽을 정직하게 만든다.
//
// 커밋 신원과 훅은 실행 환경에서 끊어 온다 — 전역 user.name 이 없는 CI 나 전역
// pre-commit 훅이 있는 개발 머신에서 픽스처가 흔들리면 안 된다.
function initGitRepo(dir) {
  const git = (...args) => {
    const r = cp.spawnSync('git', [
      '-c', 'init.defaultBranch=main',
      '-c', 'user.name=triple-crown-test',
      '-c', 'user.email=test@example.invalid',
      '-c', 'commit.gpgsign=false',
      '-C', dir, ...args,
    ], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`);
    return r;
  };
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '--no-verify', '-m', 'fixture baseline');
  return git;
}

// 임시 git 저장소가 된 사본을 만든다. { dir, git } 을 돌려주며 git() 은 같은 신원으로
// 뒤이어 커밋할 때 쓴다(예: 릴리스 VERSION 을 커밋해 트리를 다시 깨끗하게 만들 때).
function copyRepoAsGit(prefix = 'crew-gitrepo-') {
  const dir = copyRepo(prefix);
  return { dir, git: initGitRepo(dir) };
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

module.exports = { ROOT, tempDir, copyRepo, copyRepoAsGit, walkFiles };
