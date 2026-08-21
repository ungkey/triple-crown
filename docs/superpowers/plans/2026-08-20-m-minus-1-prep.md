# M-1 준비 커밋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.7 재구성(M0~M7) 착수 전 안전장치 4종 — 프리릴리스 설치 거부, `$HOME` 루트 설치 거부, 레거시 백업/복구 도구, 부트스트랩 자기일관 태그 `v0.6.5` — 를 `main`에 커밋하고, 백업·레거시 제거 런북을 준비한다.

**Architecture:** 설계서 [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) v1.3 §2.0(M-1)·§2.1~2.5(백업/제거)·§4.5(부트스트랩 자기일관성)의 실행 계획이다. 개명도 capability 분해도 하지 않는다 — 그것은 M1a/M1b다. 신규 코드는 `bin/triple-crown.cjs`의 거부 2건, `scripts/legacy-backup.cjs`, `e2e/contract/` L1 계약 테스트뿐이다.

**Tech Stack:** Node.js ≥24 (실측 24.18.0), `node:test` 러너, Node stdlib만 (외부 npm 의존성 0), 시스템 `tar`·`git`.

## Global Constraints

- 외부 npm 의존성 추가 금지. 설치자는 stdlib + 시스템 `tar`/`git`만 쓴다 (`package.json`에 dependencies 없음 유지).
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green (Task 1이 이 스크립트를 만든다).
- **push 금지.** 커밋·태그는 로컬에만. push는 사용자 승인 후 별도.
- M-1은 개명 단계가 아니다. `crew` 명명은 백업 디렉터리 `~/.crew-legacy-backup` 하나뿐 (설계 §2.1 명시값). 코드 식별자·스킬명·환경변수는 전부 `triple-crown`/`TRIPLE_CROWN_*` 유지.
- 파일 800줄 이하. `scripts/legacy-backup.cjs` 목표 ~450줄.
- Task 8(릴리스 커밋)은 **스크립트 상수 + 문서 예시 + VERSION을 한 커밋**으로 만들고 **그 커밋에** `v0.6.5` 태그를 찍는다. 순서 뒤집기 금지 (§4.5 불변식).
- Task 9는 수동·파괴적 작업. **실행 전 반드시 사용자 확인.** 자동 실행 금지.
- **머신·폴더 종속 금지.** 설계서의 `$HOME` 관측치(`/home/devkey`, `CLAUDE_PROJECT_DIR == /home/devkey`, `~/.local/bin/claude`, `~/CLAUDE.md` 1~150행 마커)는 *한 머신의 스냅샷*이지 계약이 아니다. 도구·런북·테스트는 어느 PC에서든, 어느 cwd에서든, 레거시가 아예 없는 홈에서도 올바르게 동작해야 한다. 저장소 경로는 `git rev-parse --show-toplevel`로, 홈 상태는 `legacy-backup.cjs detect`로 얻는다. 하드코딩된 절대 경로를 새로 만들지 않는다.

## File Structure

```
bin/triple-crown.cjs            수정 — Task 1: parse()에 --allow-prerelease, install() 상단 거부 2건 (+~15줄)
                                수정 — Task 8: help() tgz 예시 0.6.3 → 0.6.5 (1줄)
scripts/legacy-backup.cjs       신규 — backup / verify / restore CLI (~450줄)
e2e/contract/                   신규 — L1 계약 테스트 (node --test)
  prerelease-fence.test.cjs       Task 1
  home-root-refusal.test.cjs      Task 2
  legacy-backup.test.cjs          Task 3~6
  install-entrypoints.test.cjs    Task 8 (릴리스 커밋에 포함)
  helpers/fake-home.cjs           Task 3 — 가짜 HOME 픽스처 빌더
package.json                    수정 — scripts["test:l1"], version 0.6.5 (Task 8)
install.sh / install.ps1        수정 — 기본 ref v0.6.5 (Task 8, 한 커밋)
README.md / docs/INSTALLER.md   수정 — 모든 github:/curl 예시 v0.6.5 고정 (Task 8, 같은 커밋)
VERSION                         수정 — 0.6.5 (Task 8, 같은 커밋)
tests/run_installer_smoke.py    수정 — 버전 하드코딩 제거 (Task 7)
tests/run_npx_tarball_smoke.py  수정 — 동일 (Task 7)
```

실측 기준점 (2026-08-20 확인):

- `install.sh:34` → `REF="${TRIPLE_CROWN_REF:-main}"` · `install.sh:11` 주석 curl 예시 `/main/`
- `install.ps1:22` → `$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "main" }`
- `bin/triple-crown.cjs:11` `VERSION` 파일 읽음 · `:85 parse()` · `:510 install()` 첫 줄이 root 존재 검사
- ref 미고정 예시: `README.md:29,35,41,48,67,73,85,112,127,128` · `docs/INSTALLER.md:93,99,106,113`
- 버전 하드코딩: `tests/run_installer_smoke.py:48` · `tests/run_npx_tarball_smoke.py:6,46`
- 버전 드리프트: `bin/triple-crown.cjs:629` help() 예시가 `triple-crown-workflow-installer-0.6.3.tgz` — 소스가 0.6.4인데 두 버전 뒤처짐. `README.md:84,85`·`docs/INSTALLER.md:16,24,30,38,380`은 `0.6.4`
- `package.json`: `engines.node` `">=18.0.0"` / 런타임 강제는 `bin/triple-crown.cjs:189,525`에서 Node `>=24` — 불일치
- `npm test` = `run_installer_smoke.py && run_v061_l0.py`. `run_npx_tarball_smoke.py`는 포함되지 않는다. `.github/workflows/` 없음 — CI 없음, L1 green은 수작업 규율

**아래 두 줄은 계약이 아니라 한 머신(설계 작성 시점, 홈 `/home/devkey`)의 관측치다. 다른 홈에서는 형태도 존재 여부도 다르다 — 코드·런북은 이 값에 의존하지 않는다:**

- 관측된 레거시 훅 그룹 (`~/.claude/settings.json`): `{"matcher":"Bash","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/triple-crown-ship-guard.cjs"}]}`
- 관측된 `~/CLAUDE.md` 마커: 1행 start, 150행 end
- 이 계획을 쓰는 머신(`$HOME=/home/dev`)에는 제거 대상 6곳 중 **0곳**이 존재한다. Task 9는 이 경우를 정상 통과 경로로 처리한다

---

### Task 1: 프리릴리스 설치 거부 + L1 러너 신설

**Files:**
- Create: `e2e/contract/prerelease-fence.test.cjs`
- Modify: `bin/triple-crown.cjs` (`parse()` ~85행, `install()` ~510행)
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Produces: `npm run test:l1` = `node --test "e2e/contract/**/*.test.cjs"` (이후 모든 태스크가 사용). `triple-crown install`은 `VERSION`에 하이픈이 있으면 exit 4 + stderr에 `prerelease` 포함, `--allow-prerelease`면 진행.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/prerelease-fence.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function copyPackage() {
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-prerelease-'));
  fs.cpSync(ROOT, pkg, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules');
    },
  });
  return pkg;
}

test('prerelease VERSION refuses install without --allow-prerelease', () => {
  const pkg = copyPackage();
  fs.writeFileSync(path.join(pkg, 'VERSION'), '0.7.0-test\n');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const run = (args) => cp.spawnSync(
    process.execPath, [path.join(pkg, 'bin', 'triple-crown.cjs'), ...args],
    { encoding: 'utf8' }
  );

  const refused = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.notStrictEqual(refused.status, 0, 'prerelease install must be refused');
  assert.match(refused.stderr, /prerelease/i);

  const allowed = run(['install', '--yes', '--dry-run', '--project', proj, '--allow-prerelease']);
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /DRY RUN/);
});

test('repo tree install behavior matches its own VERSION prerelease state', () => {
  // M0 이후 main의 VERSION은 0.7.0-dev가 되므로, 이 테스트는 상태에 따라
  // 기대를 뒤집는다 — 안정판이면 무플래그 설치 진행, 프리릴리스면 거부.
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const r = cp.spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'triple-crown.cjs'), 'install', '--yes', '--dry-run', '--project', proj],
    { encoding: 'utf8' }
  );
  if (version.includes('-')) {
    assert.notStrictEqual(r.status, 0, 'prerelease tree must refuse plain install');
    assert.match(r.stderr, /prerelease/i);
  } else {
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
  }
});
```

`package.json`의 `scripts`에 추가 (기존 `test`·`pack:check`는 그대로):

```jsonc
"test:l1": "node -e \"const n=require('fs').readdirSync('e2e/contract',{recursive:true}).filter(f=>String(f).endsWith('.test.cjs')).length;if(!n)throw new Error('L1 gate found no *.test.cjs under e2e/contract - refusing to report a vacuous pass')\" && node --test \"e2e/contract/**/*.test.cjs\""
```

> **디렉터리 인자를 쓰지 않는다.** 실측(Node v24.14.0): `node --test e2e/contract/` 는 그 경로를
> 테스트 *파일* 로 취급해 `Cannot find module '…/e2e/contract'` 로 죽는다 — Node 22 부터 러너가
> glob 기반으로 바뀌었기 때문이다.
>
> **따옴표는 쌍따옴표여야 한다.** npm 의 기본 script-shell 은 Windows 에서 `cmd.exe` 이고, `cmd.exe`
> 는 홑따옴표를 벗겨내지 않는다 — `'e2e/contract/**/*.test.cjs'` 로 쓰면 따옴표째 Node 에 넘어가
> 0 개 매치가 된다. 쌍따옴표는 POSIX `sh` 와 `cmd.exe` 가 모두 벗겨내므로 Node 가 자체 glob 을
> 전개한다. `helpers/` 안의 비-테스트 파일은 패턴에 안 걸린다.
>
> **0 매치는 exit 0 이다** (실측). 그래서 러너 앞에 계약 테스트 존재 여부를 세는 사전 검사를 둔다 —
> 이 게이트가 8 개 태스크 전부의 인증 근거이므로, 디렉터리가 사라지면 조용히 green 이 되는 대신
> 시끄럽게 죽어야 한다.

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `unknown option: --allow-prerelease` (parse가 모르는 플래그) 그리고/또는 거부 미구현으로 refused.status가 0.

- [ ] **Step 3: 최소 구현**

`bin/triple-crown.cjs` `parse()`의 `out` 초기값에 `allowPrerelease:false` 추가, 옵션 루프에 한 줄 추가:

```js
    else if(a==='--allow-prerelease') out.allowPrerelease=true;
```

`install(root,opts)` 첫 줄(root 존재 검사) **바로 다음**에:

```js
  if(VERSION.includes('-') && !opts.allowPrerelease) {
    fail(`Triple Crown v${VERSION} is a prerelease build from a development branch. Install a tagged release instead, or pass --allow-prerelease to proceed anyway.`,4);
  }
```

`help()`의 Install options 목록에 한 줄 추가:

```
  --allow-prerelease   Install even when VERSION is a prerelease build
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (2 tests)

- [ ] **Step 5: 기존 스모크 회귀 확인**

Run: `npm test`
Expected: PASS — 스모크는 `--allow-prerelease`를 쓰지 않고 VERSION=0.6.4는 프리릴리스가 아니므로 영향 없음.

- [ ] **Step 6: 커밋**

```bash
git add e2e/contract/prerelease-fence.test.cjs bin/triple-crown.cjs package.json
git commit -m "feat: refuse installing prerelease builds unless --allow-prerelease"
```

---

### Task 2: `$HOME` 루트 설치 거부

**Files:**
- Create: `e2e/contract/home-root-refusal.test.cjs`
- Modify: `bin/triple-crown.cjs` (`install()` 상단)

**Interfaces:**
- Consumes: Task 1의 `npm run test:l1`.
- Produces: `install`은 프로젝트 루트가 `os.homedir()`와 같으면(realpath 비교) exit 4 + stderr에 `$HOME` 포함. D13 재발 방지의 사전 거부 (설계 §2.0 4번).

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/home-root-refusal.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'triple-crown.cjs');

test('installer refuses $HOME as project root', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-home-'));
  const run = (args) => cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });

  const refused = run(['install', '--yes', '--dry-run', '--project', fakeHome]);
  assert.notStrictEqual(refused.status, 0, 'installing into $HOME must be refused');
  assert.match(refused.stderr, /\$HOME/);

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const ok = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DRY RUN/);
});
```

(POSIX에서 `os.homedir()`는 `HOME` 환경변수를 우선한다 — 자식 프로세스에 `HOME`만 바꿔 넘기면 된다.)

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `refused.status`가 0 (거부 미구현, dry-run이 그냥 성공).

- [ ] **Step 3: 최소 구현**

`bin/triple-crown.cjs` — `versionTuple` 근처 유틸 영역에 추가:

```js
function sameRealPath(a,b) {
  try { return fs.realpathSync(a)===fs.realpathSync(b); }
  catch { return path.resolve(a)===path.resolve(b); }
}
```

`install()`의 프리릴리스 거부(Task 1) **바로 다음**에:

```js
  if(sameRealPath(root, os.homedir())) {
    fail(`Refusing to install with the home directory as project root ($HOME = ${os.homedir()}). A $HOME-rooted install collapses project scope into global scope. Run from inside a project, or pass --project <project path>.`,4);
  }
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add e2e/contract/home-root-refusal.test.cjs bin/triple-crown.cjs
git commit -m "feat: refuse \$HOME as project root to prevent scope collapse"
```

---

### Task 3: `legacy-backup.cjs backup` + fake-home 헬퍼

**Files:**
- Create: `e2e/contract/helpers/fake-home.cjs`
- Create: `e2e/contract/legacy-backup.test.cjs`
- Create: `scripts/legacy-backup.cjs`

**Interfaces:**
- Produces:
  - `node scripts/legacy-backup.cjs detect` — **현재 머신의 실제 레거시 인벤토리를 출력하고 항상 exit 0.** 설계 §1.2/§1.3의 관측치는 *한 머신의 스냅샷*이지 계약이 아니다. 다른 PC·다른 `$HOME`에는 6곳 중 0곳만 있을 수도 있고, 그건 오류가 아니라 "정리할 레거시 없음"이다. Task 9는 이 명령의 출력으로 파괴적 단계 진입 여부를 정하므로, 판정용 명령이 부재를 실패로 취급해선 안 된다. 마지막 줄에 `legacy targets: <N>`를 출력한다 (N=0이면 그대로 통과). **N은 파일 존재 수가 아니라 Triple Crown이 심은 것의 수다** — 소유 대상(`.triple-crown`, `.gsd/capabilities/<id>`, ship-guard 훅 파일, 마커 달린 스킬 디렉터리) + `~/CLAUDE.md`의 라우팅 마커 블록 + `settings.json`의 ship-guard 훅 그룹. `~/.claude/settings.json`·`~/CLAUDE.md`는 사용자 파일이라 존재 자체를 세면 Claude Code가 깔린 거의 모든 머신에서 N≥1이 되어 "0이면 스킵" 분기가 영영 안 걸린다.
  - `node scripts/legacy-backup.cjs backup [--dest DIR]` — 기본 dest `~/.crew-legacy-backup/<YYYY-MM-DD>/`. 산출물: `archive.tar.gz`, `MANIFEST.json`, `CLAUDE.md.fragment`, `settings.json.hookgroup`, `restore.sh`, `legacy-backup.cjs`(자기 사본 — 백업만으로 복구 가능해야 하므로). `detect`와 달리 `backup`은 대상 0개를 **실패로 유지**한다 — "백업했다"는 착각을 만들지 않기 위한 계약이며, 부재 분기는 `detect`가 담당한다. 두 명령은 같은 술어(`legacySignals`)를 쓴다 — 갈라지면 `detect`가 0이라 스킵한 홈에서 `backup`이 성공해버리거나 그 반대가 된다.
  - **날짜 규약: 기본 dest의 `<YYYY-MM-DD>`는 로컬 시간대 기준** — 셸 `date +%F`와 같은 값이어야 한다. `toISOString().slice(0,10)`(UTC)을 쓰면 KST(UTC+9) 기준 00:00–09:00 구간에 백업 디렉터리와 Task 9 런북의 조회 경로가 하루 어긋나 `verify`가 실패한다. `MANIFEST.json`의 `createdAt`만 ISO-8601 UTC를 유지한다 (기계 판독용, 경로에 쓰이지 않음).
  - `MANIFEST.json` 스키마: `{schema:1, createdAt, home, restoreOrder:[rel...], targets:[{rel,kind}], files:[{path,kind,sha256,bytes,mode}], claudeMd:{present,startLine,endLine,fragmentSha256}, settings:{present,sha256,hasHookGroup}}`
  - 헬퍼 `mkFakeHome()` → 레거시 6곳이 심어진 임시 HOME 경로. `runBackupTool(args, env)` → `spawnSync` 결과. Task 4~6이 사용.

- [ ] **Step 1: 헬퍼 작성**

`e2e/contract/helpers/fake-home.cjs`:

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROUTING_BLOCK = [
  '<!-- triple-crown:managed-routing:start -->',
  '## Triple Crown routing (legacy fixture)',
  'routing body line',
  '<!-- triple-crown:managed-routing:end -->',
].join('\n') + '\n';

const HOOK_GROUP = {
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/triple-crown-ship-guard.cjs',
  }],
};

const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];

function mkFakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-fake-home-'));
  const w = (rel, content) => {
    const p = path.join(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  for (const id of CAPABILITIES) {
    w(`.gsd/capabilities/${id}/capability.json`, JSON.stringify({ id }) + '\n');
  }
  w('.triple-crown/VERSION', '0.6.3\n');
  w('.triple-crown/INSTALL-MANIFEST.json', '{}\n');
  w('.claude/hooks/triple-crown-ship-guard.cjs', '#!/usr/bin/env node\nprocess.exit(0);\n');
  w('CLAUDE.md', ROUTING_BLOCK + '\n# user content\nuser line kept\n');
  w('.claude/settings.json',
    JSON.stringify({ hooks: { PreToolUse: [HOOK_GROUP] }, userSetting: true }, null, 2) + '\n');
  w('.claude/skills/gsd-triple-crown/SKILL.md', '---\nname: gsd-triple-crown\n---\n');
  w('.claude/skills/gsd-triple-crown/.triple-crown-skill', '');
  return home;
}

function runBackupTool(args, env) {
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'legacy-backup.cjs');
  return cp.spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

module.exports = { mkFakeHome, runBackupTool, ROUTING_BLOCK, HOOK_GROUP, CAPABILITIES };
```

- [ ] **Step 2: 실패하는 테스트 작성**

`e2e/contract/legacy-backup.test.cjs`:

```js
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
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `scripts/legacy-backup.cjs` 부재로 spawn 실패(status ≠ 0), MANIFEST 부재로 readFileSync throw.

- [ ] **Step 4: 구현**

`scripts/legacy-backup.cjs` (신규 — backup 부분. verify/restore는 Task 4~6에서 추가):

```js
#!/usr/bin/env node
'use strict';

// Legacy Triple Crown installation backup / verify / restore.
// Self-contained: a copy of this file is placed inside every backup so the
// backup alone can restore the machine (design doc §2.1, §2.5).

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROUTING_START = '<!-- triple-crown:managed-routing:start -->';
const ROUTING_END = '<!-- triple-crown:managed-routing:end -->';
const SHIP_GUARD = 'triple-crown-ship-guard.cjs';
const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];
const SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill'];
// Triple Crown이 '소유'하지 않고 '일부 구간만 편집'하는 사용자 파일. 백업은 하되 통째로 지우거나
// 되돌리지 않는다 (restoreOrder에서 제외 — 설계 §2.5.1의 의미 기반 재삽입 대상).
const SEMANTIC = new Set(['CLAUDE.md', '.claude/settings.json']);

function log(m = '') { process.stdout.write(String(m) + '\n'); }
function fail(msg, code = 1) { process.stderr.write(`legacy-backup: ${msg}\n`); process.exit(code); }
function sha256(buf) { return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); }
function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

// 백업 디렉터리 이름은 셸 `date +%F`와 같은 로컬 날짜여야 한다 (설계 §2.1 런북과 동일 규약).
// toISOString()은 UTC라 KST 00:00-09:00 구간에서 런북 조회 경로와 하루 어긋난다.
function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function walkFiles(abs, rel, out) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) {
    out.push({ path: rel, kind: 'symlink',
      sha256: sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))), bytes: 0, mode: st.mode & 0o777 });
    return;
  }
  if (st.isFile()) {
    const buf = fs.readFileSync(abs);
    out.push({ path: rel, kind: 'file', sha256: sha256(buf), bytes: buf.length, mode: st.mode & 0o777 });
    return;
  }
  if (st.isDirectory()) {
    out.push({ path: rel, kind: 'dir', sha256: null, bytes: 0, mode: st.mode & 0o777 });
    for (const e of fs.readdirSync(abs).sort()) walkFiles(path.join(abs, e), `${rel}/${e}`, out);
  }
}

function collectTargets(home) {
  const targets = [];
  const dir = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'dir' }); };
  const file = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'file' }); };
  dir('.triple-crown');
  for (const id of CAPABILITIES) dir(`.gsd/capabilities/${id}`);
  file(`.claude/hooks/${SHIP_GUARD}`);
  const skillsRoot = path.join(home, '.claude', 'skills');
  if (exists(skillsRoot)) {
    for (const e of fs.readdirSync(skillsRoot).sort()) {
      const d = path.join(skillsRoot, e);
      if (fs.statSync(d).isDirectory() && SKILL_MARKERS.some((m) => exists(path.join(d, m)))) {
        targets.push({ rel: `.claude/skills/${e}`, kind: 'dir' });
      }
    }
  }
  file('CLAUDE.md');
  file('.claude/settings.json');
  return targets;
}

function extractFragment(home) {
  const p = path.join(home, 'CLAUDE.md');
  if (!exists(p)) return { present: false };
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.trim() === ROUTING_START);
  const e = lines.findIndex((l) => l.trim() === ROUTING_END);
  if (s === -1 || e === -1 || e < s) return { present: false };
  const fragment = lines.slice(s, e + 1).join('\n') + '\n';
  return { present: true, startLine: s + 1, endLine: e + 1, fragment,
    fragmentSha256: sha256(Buffer.from(fragment)) };
}

function extractHookGroup(home) {
  const p = path.join(home, '.claude', 'settings.json');
  if (!exists(p)) return { present: false };
  const raw = fs.readFileSync(p);
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch (err) { fail(`~/.claude/settings.json is not valid JSON: ${err.message}`, 2); }
  const pre = parsed && parsed.hooks && parsed.hooks.PreToolUse;
  const groups = Array.isArray(pre) ? pre.filter((g) =>
    Array.isArray(g && g.hooks) &&
    g.hooks.some((h) => String((h && h.command) || '').includes(SHIP_GUARD))) : [];
  if (groups.length > 1) fail(`unexpected: ${groups.length} ship-guard hook groups in settings.json`, 2);
  return { present: true, sha256: sha256(raw), group: groups[0] || null };
}

// "레거시가 설치돼 있는가"의 판정. 파일 존재가 아니라 **Triple Crown이 심은 것**을 센다.
// ~/.claude/settings.json은 Claude Code가 깔린 거의 모든 머신에 있다 — 그걸 세면 레거시를
// 설치한 적 없는 PC에서도 0이 안 나오고, Task 9의 "0이면 스킵" 분기가 영영 안 걸린다.
function legacySignals(home, targets, frag, hook) {
  const owned = targets.filter((t) => !SEMANTIC.has(t.rel));
  return {
    owned,
    count: owned.length + (frag.present ? 1 : 0) + (hook.present && hook.group ? 1 : 0),
  };
}

function backup(opts) {
  const home = os.homedir();
  const dest = opts.dest || path.join(home, '.crew-legacy-backup', localDate());
  if (exists(dest) && fs.readdirSync(dest).length) {
    fail(`backup destination already exists and is not empty: ${dest}`, 2);
  }
  const targets = collectTargets(home);
  const frag = extractFragment(home);
  const hook = extractHookGroup(home);
  // 판정은 detect와 같은 술어를 쓴다. stock settings.json 하나만 있는 홈을 "백업했다"고
  // 말하면 그게 가장 위험한 거짓 안심이다.
  if (!legacySignals(home, targets, frag, hook).count) {
    fail('nothing to back up: no legacy installation found', 2);
  }
  const files = [];
  for (const t of targets) walkFiles(path.join(home, t.rel), t.rel, files);

  fs.mkdirSync(dest, { recursive: true });
  const tar = cp.spawnSync('tar',
    ['-czf', path.join(dest, 'archive.tar.gz'), '-C', home, '--', ...targets.map((t) => t.rel)],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (tar.error || tar.status !== 0) {
    fail(`tar failed: ${(tar.stderr || (tar.error && tar.error.message) || '').trim()}`, 2);
  }
  if (frag.present) fs.writeFileSync(path.join(dest, 'CLAUDE.md.fragment'), frag.fragment);
  if (hook.present && hook.group) {
    fs.writeFileSync(path.join(dest, 'settings.json.hookgroup'), JSON.stringify(hook.group, null, 2) + '\n');
  }
  const manifest = {
    schema: 1,
    createdAt: new Date().toISOString(),
    home,
    restoreOrder: targets.filter((t) => !SEMANTIC.has(t.rel)).map((t) => t.rel),
    targets,
    files,
    claudeMd: frag.present
      ? { present: true, startLine: frag.startLine, endLine: frag.endLine, fragmentSha256: frag.fragmentSha256 }
      : { present: false },
    settings: hook.present
      ? { present: true, sha256: hook.sha256, hasHookGroup: !!hook.group }
      : { present: false },
  };
  fs.writeFileSync(path.join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(__filename, path.join(dest, 'legacy-backup.cjs'));
  fs.writeFileSync(path.join(dest, 'restore.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\n' +
    'exec node "$HERE/legacy-backup.cjs" restore --from "$HERE" "$@"\n',
    { mode: 0o755 });
  log(`backup complete: ${dest}`);
  log(`targets: ${targets.length}, files: ${files.length}`);
}

// 판정용 — 이 머신에 실제로 뭐가 있는지만 보고한다. 부재는 오류가 아니므로 항상 exit 0.
// Task 9 런북이 파괴적 단계로 갈지 말지를 이 출력 하나로 결정한다.
function detect() {
  const home = os.homedir();
  const targets = collectTargets(home);
  const frag = extractFragment(home);
  const hook = extractHookGroup(home);
  const { owned, count } = legacySignals(home, targets, frag, hook);
  log(`home: ${home}`);
  for (const t of owned) log(`  owned  ${t.kind === 'dir' ? 'dir ' : 'file'} ~/${t.rel}`);
  log(`  CLAUDE.md routing marker: ${frag.present ? `lines ${frag.startLine}-${frag.endLine}` : 'absent'}`);
  log(`  settings.json ship-guard group: ${hook.present && hook.group ? 'present' : 'absent'}`);
  log(`legacy targets: ${count}`);
}

function parseArgs(argv) {
  const out = { command: argv[0], dest: null, from: null, dryRun: false };
  const rest = argv.slice(1);
  while (rest.length) {
    const a = rest.shift();
    if (a === '--dest') out.dest = rest.shift() || fail('--dest requires a path', 2);
    else if (a === '--from') out.from = rest.shift() || fail('--from requires a path', 2);
    else if (a === '--dry-run') out.dryRun = true;
    else fail(`unknown option: ${a}`, 2);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.command === 'detect') detect();
else if (opts.command === 'backup') backup(opts);
else fail('usage: legacy-backup.cjs detect | backup [--dest DIR] | verify --from DIR | restore --from DIR [--dry-run]', 2);
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (7 tests)

- [ ] **Step 6: 커밋**

```bash
git add e2e/contract/helpers/fake-home.cjs e2e/contract/legacy-backup.test.cjs scripts/legacy-backup.cjs
git commit -m "feat: legacy-backup backup subcommand with manifest + archive"
```

---

### Task 4: `legacy-backup.cjs verify` + `restore --dry-run`

**Files:**
- Modify: `scripts/legacy-backup.cjs`
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 3의 `backup`, 헬퍼 `mkFakeHome()`/`runBackupTool()`.
- Produces:
  - `verify --from DIR` — 아카이브를 임시 디렉터리에 풀어 `MANIFEST.json`의 `files[]` sha256 전수 대조. 불일치 목록 출력 + exit 2, 전부 일치 시 exit 0.
  - `restore --from DIR --dry-run` — verify를 먼저 수행한 뒤 복구 대상·충돌 목록만 출력. **쓰기 없음.** exit 0.
  - 내부 함수 `verifyArchive(from)` → `{manifest, problems}` (Task 5의 restore가 §2.5 1단계로 재사용). `restoreClaudeMd(home, from, manifest, actions, dryRun)`/`restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처를 스텁으로 고정 (Task 5·6이 본문 교체).

**restore 안전 계약 (파괴적 경로 — 이 계약이 restore의 핵심 산출물이다):**

1. **홈 일치 요구.** `manifest.home`과 현재 `os.homedir()`를 realpath로 비교해 다르면 **아무것도 건드리지 않고 exit 4**. `--allow-foreign-home`을 명시해야만 진행하고, 진행 시 경고를 출력한다. `--dry-run`도 이 거부를 우회하지 못한다.
   근거: `restore`는 대상 경로를 지우고 아카이브로 덮어쓴다. 다른 계정/머신에서 뜬 백업을 그대로 받으면 현재 홈의 capability·훅·벤더·마킹 스킬이 **삭제되고 남의 상태로 대체된다.** 아카이브 sha256 검증은 "아카이브가 온전한가"만 보증하지 "이 홈이 맞는가"는 전혀 보지 않는다.
2. **선검증 후 쓰기.** 실제 쓰기 전에 `restoreOrder`의 모든 항목이 풀린 아카이브에 존재하는지 확인한다. 하나라도 없으면 쓰기 전에 중단 (exit 2).
3. **롤백 가능한 교체.** 기존 대상을 `rmSync`로 즉시 삭제하지 않는다. `$HOME` 하위 임시 롤백 디렉터리로 **rename**해 옮긴 뒤 아카이브에서 복사한다 (`$HOME` 내부라 cross-device rename 불가 문제가 없다). 중간에 실패하면 옮긴 것을 전부 되돌리고 exit 2 — **홈은 시작 상태 그대로.** 성공 시 롤백 디렉터리 경로를 출력하고 남겨 둔다 (사용자가 확인 후 삭제).
- 종료 코드: 2 = 사용 오류·검증 실패·복구 중단(롤백 완료), 3 = settings.json 수동 병합 필요(Task 6), 4 = 다른 홈의 백업 거부.

- [ ] **Step 1: 실패하는 테스트 추가**

`e2e/contract/legacy-backup.test.cjs`에 추가:

```js
test('verify passes on intact backup and fails on tampered manifest', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  assert.strictEqual(runBackupTool(['verify', '--from', dest], { HOME: home }).status, 0);

  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const target = manifest.files.find((f) => f.kind === 'file');
  target.sha256 = 'sha256:' + '0'.repeat(64);
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');
  const bad = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /mismatch/i);
});

test('restore --dry-run reports actions without writing', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 벤더 디렉터리와 훅 파일 삭제
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  const claudeMdBefore = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.match(r.stdout, /\.triple-crown/);

  assert.strictEqual(fs.existsSync(path.join(home, '.triple-crown')), false, 'dry-run must not write');
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), claudeMdBefore);
});

test('restore refuses a backup taken from a different home', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 다른 계정/머신을 흉내: 자기 레거시 설치가 있는 별개의 홈
  const other = mkFakeHome();
  const otherVersion = fs.readFileSync(path.join(other, '.triple-crown/VERSION'), 'utf8');

  const refused = runBackupTool(['restore', '--from', dest], { HOME: other });
  assert.notStrictEqual(refused.status, 0, 'foreign-home restore must be refused');
  assert.match(refused.stderr, /different home/i);
  assert.strictEqual(fs.readFileSync(path.join(other, '.triple-crown/VERSION'), 'utf8'), otherVersion,
    'refusal must not touch the current home');

  const refusedDry = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: other });
  assert.notStrictEqual(refusedDry.status, 0, '--dry-run must not bypass the refusal');

  const allowed = runBackupTool(
    ['restore', '--from', dest, '--dry-run', '--allow-foreign-home'], { HOME: other });
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout + allowed.stderr, /WARNING/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `verify`/`restore` 분기 부재로 usage 오류 (exit 2). foreign-home 테스트도 같은 이유로 FAIL (거부 메시지가 아니라 usage 오류).

- [ ] **Step 3: 구현**

먼저 Task 3의 `fail()`을 교체한다. `fail()`은 `process.exit`이라 호출 지점의 `finally`가 실행되지 않는다 — verify/restore가 만드는 임시 추출 디렉터리는 **모든** 실패 경로(Task 6의 exit 3 포함)에서 새므로, 정리 책임을 호출부에 흩뿌리지 말고 `fail()` 한 곳에 모은다:

```js
const CLEANUP = [];
function cleanup() {
  while (CLEANUP.length) {
    try { fs.rmSync(CLEANUP.pop(), { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
function fail(msg, code = 1) { cleanup(); process.stderr.write(`legacy-backup: ${msg}\n`); process.exit(code); }
```

그 뒤 `backup()` 뒤에 추가:

```js
function extractArchive(from) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-legacy-x-'));
  CLEANUP.push(tmp);                       // 어느 실패 경로로 빠져도 fail()이 지운다
  const r = cp.spawnSync('tar', ['-xzf', path.join(from, 'archive.tar.gz'), '-C', tmp],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fail(`tar extract failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}`, 2);
  }
  return tmp;
}

function verifyArchive(from) {
  if (!exists(path.join(from, 'MANIFEST.json'))) fail(`no MANIFEST.json in ${from}`, 2);
  const manifest = readJson(path.join(from, 'MANIFEST.json'));
  if (manifest.schema !== 1) fail(`unsupported manifest schema: ${manifest.schema}`, 2);
  const tmp = extractArchive(from);
  const problems = [];
  try {
    for (const f of manifest.files) {
      const abs = path.join(tmp, f.path);
      if (!exists(abs)) { problems.push(`missing in archive: ${f.path}`); continue; }
      if (f.kind === 'file') {
        if (sha256(fs.readFileSync(abs)) !== f.sha256) problems.push(`sha256 mismatch: ${f.path}`);
      } else if (f.kind === 'symlink') {
        const st = fs.lstatSync(abs);
        if (!st.isSymbolicLink() ||
            sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))) !== f.sha256) {
          problems.push(`symlink mismatch: ${f.path}`);
        }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { manifest, problems };
}

function verify(opts) {
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail(`${problems.length} mismatch(es) between MANIFEST.json and archive`, 2);
  }
  log(`verify OK: ${manifest.files.length} entries match archive`);
}

function restoreClaudeMd(home, from, manifest, actions, dryRun) {
  actions.push('CLAUDE.md: (not implemented yet)');
}

function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  actions.push('settings.json: (not implemented yet)');
}

function samePath(a, b) {
  try { return fs.realpathSync(a) === fs.realpathSync(b); }
  catch { return path.resolve(a) === path.resolve(b); }
}

// 안전 계약 1: 다른 홈에서 뜬 백업을 이 홈에 쏟지 않는다.
function assertRestoreHome(home, manifest, allowForeignHome) {
  if (!manifest.home || samePath(home, manifest.home)) return;
  if (!allowForeignHome) {
    fail(`this backup was taken from a different home (manifest.home=${manifest.home}, ` +
      `current HOME=${home}). Restoring it here would delete this home's Triple Crown state ` +
      `and replace it with another machine's. Pass --allow-foreign-home only if that is ` +
      `exactly what you intend.`, 4);
  }
  log(`WARNING: restoring a backup taken from ${manifest.home} into ${home} (--allow-foreign-home)`);
}

// 안전 계약 3: rename 후 복사, 실패 시 전량 롤백. 어떤 대상도 선삭제하지 않는다.
function applyRestore(home, tmp, restoreOrder, actions) {
  const rollback = fs.mkdtempSync(path.join(home, '.crew-legacy-rollback-'));
  const moved = [];
  try {
    for (const rel of restoreOrder) {
      const dst = path.join(home, rel);
      if (exists(dst)) {
        const saved = path.join(rollback, rel);
        fs.mkdirSync(path.dirname(saved), { recursive: true });
        fs.renameSync(dst, saved);                 // $HOME 내부 — cross-device 아님
        moved.push({ dst, saved });
      }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.cpSync(path.join(tmp, rel), dst, { recursive: true });
    }
  } catch (err) {
    for (const m of moved.reverse()) {
      fs.rmSync(m.dst, { recursive: true, force: true });
      fs.renameSync(m.saved, m.dst);
    }
    fs.rmSync(rollback, { recursive: true, force: true });   // 롤백 완료 — 남길 이유 없음
    fail(`restore failed (${err.message}) — rolled back, home is unchanged`, 2);
  }
  actions.push(`replaced targets kept for rollback at ~/${path.basename(rollback)} (delete when satisfied)`);
}

function restore(opts) {
  const home = os.homedir();
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);   // 설계 §2.5 1단계
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail('archive does not match MANIFEST.json — aborting restore', 2);
  }
  assertRestoreHome(home, manifest, opts.allowForeignHome);   // 안전 계약 1 — 쓰기 전, dry-run도 동일
  const tmp = extractArchive(opts.from);
  const actions = [];
  try {
    // 안전 계약 2: 전량 존재 확인 후에만 쓰기 단계로 넘어간다.
    const missing = manifest.restoreOrder.filter((rel) => !exists(path.join(tmp, rel)));
    if (missing.length) {
      fail(`archive is missing restore targets: ${missing.join(', ')} — nothing was changed`, 2);
    }
    for (const rel of manifest.restoreOrder) {
      actions.push(`${exists(path.join(home, rel)) ? 'overwrite' : 'create'}: ~/${rel}`);
    }
    if (!opts.dryRun) applyRestore(home, tmp, manifest.restoreOrder, actions);
    restoreClaudeMd(home, opts.from, manifest, actions, opts.dryRun);
    restoreSettings(home, tmp, opts.from, manifest, actions, opts.dryRun);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const a of actions) log((opts.dryRun ? '[dry-run] ' : '') + a);
  if (opts.dryRun) { log('dry-run: no writes performed'); return; }
  log('restore complete. Verify capability registrations with: gsd-tools capability list');
}
```

`parseArgs`에 플래그 추가 (`out` 초기값 + 옵션 루프 한 줄):

```js
  const out = { command: argv[0], dest: null, from: null, dryRun: false, allowForeignHome: false };
  // ...
    else if (a === '--allow-foreign-home') out.allowForeignHome = true;
```

(임시 추출 디렉터리는 `extractArchive`가 `CLEANUP`에 등록하고 `fail()`이 지운다 — 위 실패 경로들은 `tmp`를 직접 정리하지 않는다. 성공 경로만 `restore()`의 `finally`가 지운다. 성공 시 남기는 것은 롤백 디렉터리 하나뿐이며, 이건 의도된 산출물이다.)

디스패처 마지막 분기 교체:

```js
if (opts.command === 'detect') detect();            // Task 3 — 여기서 빠뜨리면 Task 9 Step 1이 죽는다
else if (opts.command === 'backup') backup(opts);
else if (opts.command === 'verify') verify(opts);
else if (opts.command === 'restore') restore(opts);
else fail('usage: legacy-backup.cjs detect | backup [--dest DIR] | verify --from DIR | ' +
  'restore --from DIR [--dry-run] [--allow-foreign-home]', 2);
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (10 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup verify, restore --dry-run, and foreign-home refusal"
```

---

### Task 5: `restore` 실쓰기 — 파일·디렉터리 원복 + CLAUDE.md 마커 재삽입

**Files:**
- Modify: `scripts/legacy-backup.cjs` (`restoreClaudeMd` 스텁 교체)
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 4의 `restore()` 골격과 `applyRestore()` (restoreOrder 복사·롤백은 이미 동작), `restoreClaudeMd` 시그니처.
- Produces: `restoreClaudeMd` 의미론 —
  - `~/CLAUDE.md` 부재 → fragment로 새로 생성
  - 마커 쌍이 이미 있음 → 무동작 (멱등)
  - 마커 없음 + 원래 startLine이 1 → fragment를 파일 앞에 삽입, 그 외 → 끝에 추가
  - 사용자 작성분은 어떤 경우에도 보존. **위치가 아니라 정체(마커)로 판단** (설계 §2.5 3항)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('restore puts back removed targets and reinserts CLAUDE.md fragment', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 디렉터리·훅 삭제 + CLAUDE.md에서 마커 블록만 제거
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.gsd/capabilities/triple-gstack'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), '# user content\nuser line kept\nuser added later\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  assert.ok(fs.existsSync(path.join(home, '.triple-crown/VERSION')));
  assert.ok(fs.existsSync(path.join(home, '.gsd/capabilities/triple-gstack/capability.json')));
  assert.ok(fs.existsSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs')));

  const md = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  assert.match(md, /triple-crown:managed-routing:start/);
  assert.match(md, /user added later/, 'user content must survive');
  assert.ok(md.indexOf('managed-routing:start') < md.indexOf('# user content'),
    'fragment restored at original position (line 1 -> prepend)');
});

test('restore is idempotent for CLAUDE.md when markers already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  const before = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), before);
});

test('restore rolls back and leaves home unchanged when a copy fails midway', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 백업 이후 현재 홈을 아카이브와 다르게 만든다 — 롤백이 '아카이브 내용'이 아니라
  // '복구 직전 상태'를 되돌리는지 구분하기 위해.
  const versionBefore = '9.9.9-local\n';
  fs.writeFileSync(path.join(home, '.triple-crown/VERSION'), versionBefore);

  // restoreOrder 중간 항목(.claude/hooks/... )에서 mkdir이 실패하도록 디렉터리 자리에 파일을 둔다.
  fs.rmSync(path.join(home, '.claude/hooks'), { recursive: true, force: true });
  fs.writeFileSync(path.join(home, '.claude/hooks'), 'not a directory\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0, 'mid-copy failure must abort');
  assert.match(r.stderr, /rolled back/i);
  assert.strictEqual(fs.readFileSync(path.join(home, '.triple-crown/VERSION'), 'utf8'), versionBefore,
    'targets replaced before the failure must be back at their pre-restore state');
  assert.deepStrictEqual(
    fs.readdirSync(home).filter((e) => e.startsWith('.crew-legacy-rollback-')), [],
    'failed restore must not leave a rollback directory behind');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — 첫 테스트의 `assert.match(md, /triple-crown:managed-routing:start/)` (스텁이라 재삽입 안 됨). 롤백 테스트는 Task 4의 `applyRestore` 덕에 이미 PASS여야 한다 — FAIL이면 롤백 경로가 깨진 것이니 Task 4로 돌아간다.

- [ ] **Step 3: 구현 — `restoreClaudeMd` 스텁 교체**

```js
function restoreClaudeMd(home, from, manifest, actions, dryRun) {
  if (!manifest.claudeMd.present) { actions.push('CLAUDE.md: no fragment in backup — skip'); return; }
  const p = path.join(home, 'CLAUDE.md');
  const fragment = fs.readFileSync(path.join(from, 'CLAUDE.md.fragment'), 'utf8');
  if (!exists(p)) {
    actions.push('CLAUDE.md: missing — create with fragment');
    if (!dryRun) fs.writeFileSync(p, fragment);
    return;
  }
  const text = fs.readFileSync(p, 'utf8');
  if (text.includes(ROUTING_START) && text.includes(ROUTING_END)) {
    actions.push('CLAUDE.md: marker block already present — no-op');
    return;
  }
  if (manifest.claudeMd.startLine === 1) {
    actions.push('CLAUDE.md: prepend fragment (original position: line 1)');
    if (!dryRun) fs.writeFileSync(p, fragment + text);
  } else {
    actions.push('CLAUDE.md: append fragment');
    if (!dryRun) fs.writeFileSync(p, text.replace(/\n?$/, '\n') + fragment);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (13 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup restore with marker-based CLAUDE.md reinsertion"
```

---

### Task 6: `restore` settings.json 의미 기반 재삽입 (§2.5.1)

**Files:**
- Modify: `scripts/legacy-backup.cjs` (`restoreSettings` 스텁 교체)
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 3의 `settings.json.hookgroup` 산출물, Task 4의 `restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처.
- Produces: `restoreSettings` 의미론 (설계 §2.5.1 그대로) —
  1. 현재 sha256 == 백업 sha256 → 파일 전체 복원 (안전)
  2. 다르면 덮어쓰지 않고 의미 기반 재삽입: (a) JSON 파싱 실패 또는 `hooks`/`hooks.PreToolUse`가 존재하는데 타입 불일치 → 충돌 보고 + exit 3, 자동 쓰기 없음, 수동 복구 안내 (b) ship-guard command 포함 그룹 존재 → 무동작 (c) 없으면 hookgroup 객체를 배열 끝에 push
- exit 3의 종료 상태는 "부분 실패"가 아니라 **정의된 상태**다: `restoreOrder` 대상(벤더·capability·훅 파일·스킬)은 이미 복원됐고 `~/.claude/settings.json` 하나만 수동 병합 대기다. 안내 메시지가 그 두 사실을 다 말해야 사용자가 재실행할지 손으로 고칠지 정할 수 있다. 임시 추출 디렉터리는 Task 4의 `CLEANUP`/`fail()`이 정리하므로 이 경로에서도 누수 없음.
  3. 다른 배열 요소 불변. 인덱스 미참조
- 설계 결정: `hooks`/`hooks.PreToolUse` 키 자체가 **없으면** 생성 후 push한다. §2.5.1 2a의 "배열이 아님"은 존재하는 값의 타입 불일치를 뜻하며, 부재는 불일치가 아니다 — `scripts/install-claude-ship-guard.cjs`가 설치 시 같은 의미론으로 구조를 만든다.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('settings restore: predicate-based reinsert preserves user hooks', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거 흉내(그룹 삭제) + 사용자가 자기 훅 추가
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.hooks.PreToolUse = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-user-hook.sh' }] }];
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(after.userSetting, true, 'unrelated keys preserved');
  assert.strictEqual(after.hooks.PreToolUse.length, 2);
  assert.strictEqual(after.hooks.PreToolUse[0].hooks[0].command, 'my-user-hook.sh',
    'user hook untouched, index not referenced');
  assert.match(after.hooks.PreToolUse[1].hooks[0].command, /triple-crown-ship-guard\.cjs/);
});

test('settings restore: no duplicate when group already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // sha를 어긋나게 하되 그룹은 그대로 둠
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.newUserKey = 1;
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const guardGroups = after.hooks.PreToolUse.filter((g) =>
    g.hooks.some((h) => String(h.command || '').includes('triple-crown-ship-guard.cjs')));
  assert.strictEqual(guardGroups.length, 1, 'idempotent — no duplicate');
  assert.strictEqual(after.newUserKey, 1);
});

test('settings restore: aborts without writing when current file is invalid JSON', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const sp = path.join(home, '.claude/settings.json');
  fs.writeFileSync(sp, '{ broken json\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /manual/i);
  assert.strictEqual(fs.readFileSync(sp, 'utf8'), '{ broken json\n', 'no automatic write on conflict');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — 첫 테스트 `after.hooks.PreToolUse.length` 1 ≠ 2 (스텁이라 재삽입 안 됨).

- [ ] **Step 3: 구현 — `restoreSettings` 스텁 교체**

```js
function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  if (!manifest.settings.present) { actions.push('settings.json: not in backup — skip'); return; }
  const dst = path.join(home, '.claude', 'settings.json');
  const backupRaw = fs.readFileSync(path.join(tmp, '.claude', 'settings.json'));
  if (!exists(dst)) {
    actions.push('settings.json: missing — restore full file from backup');
    if (!dryRun) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, backupRaw); }
    return;
  }
  const currentRaw = fs.readFileSync(dst);
  if (sha256(currentRaw) === manifest.settings.sha256) {
    actions.push('settings.json: unchanged since backup — full restore is safe');
    if (!dryRun) fs.writeFileSync(dst, backupRaw);
    return;
  }
  if (!manifest.settings.hasHookGroup) {
    actions.push('settings.json: changed since backup, no hook group to reinsert — leaving as is');
    return;
  }
  const manual = `settings.json changed since backup and cannot be merged automatically. ` +
    `No write performed. Reinsert the group from ${path.join(from, 'settings.json.hookgroup')} ` +
    `into hooks.PreToolUse manually.`;
  let parsed;
  try { parsed = JSON.parse(currentRaw.toString('utf8')); }
  catch (err) { fail(`${manual} (parse error: ${err.message})`, 3); }
  if (parsed.hooks !== undefined && (typeof parsed.hooks !== 'object' || parsed.hooks === null)) fail(manual, 3);
  if (parsed.hooks && parsed.hooks.PreToolUse !== undefined && !Array.isArray(parsed.hooks.PreToolUse)) {
    fail(manual, 3);
  }
  parsed.hooks = parsed.hooks || {};
  parsed.hooks.PreToolUse = parsed.hooks.PreToolUse || [];
  const present = parsed.hooks.PreToolUse.some((g) =>
    Array.isArray(g && g.hooks) &&
    g.hooks.some((h) => String((h && h.command) || '').includes(SHIP_GUARD)));
  if (present) { actions.push('settings.json: ship-guard group already present — no-op'); return; }
  const group = readJson(path.join(from, 'settings.json.hookgroup'));
  parsed.hooks.PreToolUse.push(group);
  actions.push('settings.json: reinserted ship-guard hook group (predicate match, appended)');
  if (!dryRun) fs.writeFileSync(dst, JSON.stringify(parsed, null, 2) + '\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (16 tests)

- [ ] **Step 5: 줄 수 확인**

Run: `wc -l scripts/legacy-backup.cjs`
Expected: 800줄 미만 (목표 ~450 — restore 안전 계약 3종 포함).

- [ ] **Step 6: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup settings restore via semantic predicate merge"
```

---

### Task 7: 스모크 테스트 버전 하드코딩 제거

**Files:**
- Modify: `tests/run_installer_smoke.py:48`
- Modify: `tests/run_npx_tarball_smoke.py:6,46`

**Interfaces:**
- Produces: 스모크가 기대 버전을 저장소 `VERSION` 파일에서 읽는다. Task 8의 0.6.5 범프가 테스트를 깨지 않게 하는 선행 조건.

- [ ] **Step 1: 수정**

`tests/run_installer_smoke.py` — 기존:

```python
        assert (project/".triple-crown"/"VERSION").read_text().strip()=="0.6.4"
```

교체 (이 파일의 저장소 루트 변수를 그대로 사용 — `ROOT`가 이미 정의돼 있으면 그것, 없으면 `Path(__file__).resolve().parents[1]`):

```python
        expected_version=(ROOT/"VERSION").read_text().strip()
        assert (project/".triple-crown"/"VERSION").read_text().strip()==expected_version
```

`tests/run_npx_tarball_smoke.py` — 기존 6행·46행:

```python
TGZ=ROOT/"triple-crown-workflow-installer-0.6.4.tgz"
        assert (project/".triple-crown"/"VERSION").read_text().strip()=="0.6.4"
```

교체:

```python
EXPECTED_VERSION=(ROOT/"VERSION").read_text().strip()
TGZ=ROOT/f"triple-crown-workflow-installer-{EXPECTED_VERSION}.tgz"
        assert (project/".triple-crown"/"VERSION").read_text().strip()==EXPECTED_VERSION
```

- [ ] **Step 2: 확인**

`npm test`는 `run_installer_smoke.py`와 `run_v061_l0.py`만 부른다 — **이 태스크가 고치는 `run_npx_tarball_smoke.py`는 `npm test`로 한 번도 실행되지 않는다.** 수정이 실제로 도는지 보려면 직접 부른다 (tgz가 필요하므로 `npm pack` 선행):

```bash
npm run test:l1
npm test
npm pack && python tests/run_npx_tarball_smoke.py
```

Expected: 셋 다 PASS (VERSION은 아직 0.6.4이므로 동작 동일 — 리팩터링만). 세 번째가 실패하면 `EXPECTED_VERSION`/`TGZ` 치환이 잘못된 것이다.

- [ ] **Step 3: 커밋**

```bash
git add tests/run_installer_smoke.py tests/run_npx_tarball_smoke.py
git commit -m "test: read expected version from VERSION file in smoke tests"
```

---

### Task 8: v0.6.5 릴리스 커밋 + 태그 — 부트스트랩 자기일관성

이 태스크의 산출물 전체가 **한 커밋**이어야 한다 (설계 §4.5 계층 1). 테스트가 먼저 RED가 되고, 상수·문서 갱신으로 GREEN이 된 뒤, **그 커밋에** 태그를 찍는다.

**Files:**
- Create: `e2e/contract/install-entrypoints.test.cjs`
- Modify: `install.sh:11,34` · `install.ps1:22`
- Modify: `README.md:29,35,41,48,67,73,84,85,112,127,128` · `docs/INSTALLER.md:16,24,30,38,93,99,106,113,380`
- Modify: `bin/triple-crown.cjs:629` — `help()` 출력의 tgz 예시가 실측 `0.6.3`. 이미 두 버전 뒤처져 있고, CLI가 스스로 안내하는 설치 명령이 존재하지 않는 파일을 가리킨다.
- Modify: `VERSION` (0.6.4 → 0.6.5) · `package.json` (`"version": "0.6.5"`, `engines.node` `>=18.0.0` → `>=24.0.0`)

**Interfaces:**
- Produces: 불변식 — **`VERSION`이 프리릴리스가 아니면 install.sh/ps1 기본 ref == `v<VERSION>` 이고, 문서의 모든 `github:ungkey/triple-crown` 예시와 raw curl 경로가 그 태그로 고정.** 태그 `v0.6.5`는 이 불변식을 만족하는 커밋 자신을 가리킨다. M0 첫 커밋이 VERSION을 `0.7.0-dev`로 올리면 이후 `main`의 어떤 진입점 설치도 Task 1의 fence가 거부한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/install-entrypoints.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function shDefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
    .match(/^REF="\$\{TRIPLE_CROWN_REF:-([^}]+)\}"/m);
  assert.ok(m, 'install.sh default ref constant not found');
  return m[1];
}

function ps1DefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8')
    .match(/\$ref = if \(\$env:TRIPLE_CROWN_REF\) \{ \$env:TRIPLE_CROWN_REF \} else \{ "([^"]+)" \}/);
  assert.ok(m, 'install.ps1 default ref constant not found');
  return m[1];
}

test('default bootstrap ref is not a branch name', () => {
  for (const ref of [shDefaultRef(), ps1DefaultRef()]) {
    assert.ok(!['main', 'master'].includes(ref), `default ref is a branch: ${ref}`);
  }
});

test('release tree: default ref equals the tag this tree ships as', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  if (version.includes('-')) return; // prerelease tree: ref stays on the last stable tag
  assert.strictEqual(shDefaultRef(), `v${version}`);
  assert.strictEqual(ps1DefaultRef(), `v${version}`);
});

test('every documented github install example pins the bootstrap tag', () => {
  const ref = shDefaultRef();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md', 'install.sh', 'install.ps1']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/github:ungkey\/triple-crown(#[\w.\-]+)?/g)) {
        if (m[1] !== `#${ref}`) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]}`);
      }
      for (const m of line.matchAll(/raw\.githubusercontent\.com\/ungkey\/triple-crown\/([^/]+)\//g)) {
        if (m[1] !== ref) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ref=${m[1]}`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'unpinned or mismatched install examples');
});

// 위 테스트는 github:/raw 경로만 본다. tgz 파일명은 그 패턴에 안 걸려서 조용히 낡는다 —
// 실제로 bin/triple-crown.cjs:629의 help() 예시는 소스가 0.6.4일 때까지 0.6.3에 멈춰 있었다.
test('every documented tarball example names the version this tree ships as', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md',
    'install.sh', 'install.ps1', 'bin/triple-crown.cjs']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/triple-crown-workflow-installer-([\w.\-]+)\.tgz/g)) {
        if (m[1] !== version) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]} (VERSION=${version})`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'stale tarball filenames');
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `npm run test:l1`
Expected: FAIL — `default ref is a branch: main`, 문서 예시 다수가 `bad` 목록에 나열, 그리고 tgz 테스트가 최소 `bin/triple-crown.cjs:629: …-0.6.3.tgz (VERSION=0.6.4)`를 잡는다. **RED 시점에 tgz 실패가 안 뜨면 정규식이 잘못된 것이다** — 이 드리프트는 실측으로 확인된 상태다.

- [ ] **Step 3: 상수·문서·버전 갱신 (GREEN 재료 — 아직 커밋하지 않음)**

한 벌로 수정:

1. `install.sh:34` → `REF="${TRIPLE_CROWN_REF:-v0.6.5}"`
2. `install.sh:11` 주석 curl 예시의 `/main/` → `/v0.6.5/`
3. `install.ps1:22` → `$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "v0.6.5" }`
4. `README.md` — `github:ungkey/triple-crown` 전부(29,35,41,48,112,127,128행) `github:ungkey/triple-crown#v0.6.5`로, curl/irm의 `/main/`(67,73행) → `/v0.6.5/`, **84·85 두 행** tgz 파일명 `0.6.4` → `0.6.5` (84행은 `npm pack` 출력 주석, 85행은 `npx --package` 인자 — 한 쪽만 고치면 문서 안에서 두 버전이 공존한다)
5. `docs/INSTALLER.md` — 93행 `#v0.6.5` 부여, 99·113행 `/main/` → `/v0.6.5/`, 106행 `/v0.6.4/` → `/v0.6.5/`, **16·24·30·38·380행** tgz 파일명 `0.6.4` → `0.6.5` (16행은 "다운로드 후 이런 파일" 블록 — 문서 첫 등장이라 여기가 틀리면 나머지가 맞아도 사용자는 틀린 이름부터 본다)
6. `bin/triple-crown.cjs:629` — tgz 파일명 `0.6.3` → `0.6.5`
7. `VERSION` → `0.6.5`
8. `package.json` → `"version": "0.6.5"`, 그리고 `engines.node`를 `">=24.0.0"`으로. 현재 `">=18.0.0"`인데 `bin/triple-crown.cjs:189,525`가 런타임에 Node >=24를 강제한다 — `engines`가 거짓말을 하면 Node 18~23 사용자는 `npm`이 통과시킨 뒤 설치 중간에 거부당한다. 이 태스크가 `package.json`을 어차피 건드리므로 여기서 맞춘다.

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `npm run test:l1 && npm test`
Expected: 둘 다 PASS. install-entrypoints 3개 테스트 모두 통과 (VERSION=0.6.5, ref=v0.6.5). 스모크는 Task 7 덕에 버전 범프에도 통과.

- [ ] **Step 5: 한 커밋으로 커밋**

```bash
git add e2e/contract/install-entrypoints.test.cjs install.sh install.ps1 \
  README.md docs/INSTALLER.md bin/triple-crown.cjs VERSION package.json
git commit -m "chore: release v0.6.5 — pin bootstrap default ref and docs to the shipping tag"
```

- [ ] **Step 6: 그 커밋에 태그 + 자기일관 검증**

```bash
git tag -a v0.6.5 -m "v0.6.5: self-consistent bootstrap (ref pinned to own tag) + prerelease fence + legacy backup tool"
git show v0.6.5:install.sh | grep -F 'TRIPLE_CROWN_REF:-v0.6.5'
git show v0.6.5:README.md | grep -c 'triple-crown#v0.6.5'
```

Expected: 첫 grep이 상수 라인을 출력, README 카운트 ≥ 6. **태그 안 트리 자신이 자기 태그를 가리킨다** — §4.5 불변식 충족. push는 하지 않는다.

---

### Task 9: [수동 · 파괴적] 환경 감지 → 백업 → 레거시 제거 → 리허설

**이 태스크는 자동 실행 금지. 각 단계 앞에서 사용자 확인을 받는다.** 머신 전역 상태(`~/CLAUDE.md`, `~/.claude/settings.json`, 전역 라우팅·ship 가드)를 바꾼다. 제거 시점부터 M1a 완료까지 ship 가드 공백이 생긴다 (설계 §2.3).

**Files:** 저장소 변경 없음. `$HOME` 하위만.

**머신 독립 원칙 (이 태스크의 전제):**

설계 §1.2/§1.3의 레거시 인벤토리는 **한 대의 머신에서 2026-08-19에 관측된 스냅샷**이다 (홈 `/home/devkey`, 벤더 v0.6.3, capability 3개, `~/CLAUDE.md` 1~150행 마커, ship-guard 훅 그룹, `~/.local/bin/claude`). 계약이 아니다. 다른 PC·다른 계정에서 이 런북을 돌리면 6곳 중 0곳만 존재할 수 있고, 그건 오류가 아니라 "정리할 레거시 없음"이다. 실제로 이 계획을 쓰는 시점의 `$HOME=/home/dev` 머신에서는 6곳 중 0곳이 존재한다 — 원안대로면 Step 2의 `backup`이 `nothing to back up`(exit 2)로 죽고 M-1 게이트 전체가 막힌다. 따라서:

1. **하드코딩된 목록이 아니라 감지 결과로 움직인다.** Step 1의 `detect`가 0을 반환하면 Step 2~5를 통째로 건너뛰고 M-1이 통과한다. 관측 스냅샷을 재확인하는 단계는 없다.
2. **제거 대상은 Step 2가 만든 `MANIFEST.json`에서 읽는다.** 매니페스트가 그 머신의 실제 인벤토리이자 롤백 계약이므로, "백업하지 않은 것은 지우지 않는다"가 목록 관리 없이 성립한다.
3. **모든 제거 명령은 멱등·부재 관용이다.** 없는 파일에 걸려 중단되면 절반만 지운 상태가 남는다 — 그게 가장 나쁜 결과다.
4. **저장소 경로는 cwd가 아니라 저장소 루트에서 계산한다.** `node scripts/legacy-backup.cjs`는 cwd가 저장소 루트일 때만 맞는다. 어느 디렉터리에서 실행해도 같게 동작하도록 `git rev-parse --show-toplevel`로 고정한다.
5. **머신 전역 도구 경로를 가정하지 않는다.** `gsd-tools`는 `~/.claude/gsd-core/bin/gsd-tools.cjs`에 있을 수도, `PATH`에 있을 수도, 아예 없을 수도 있다.

- [ ] **Step 0: 공통 변수 (모든 스텝의 전제 — 새 셸이면 다시 실행)**

```bash
set -euo pipefail
REPO_ROOT="$(git rev-parse --show-toplevel)"
BACKUP="node $REPO_ROOT/scripts/legacy-backup.cjs"

# gsd-tools 위치를 가정하지 않고 찾는다. 못 찾으면 빈 값 — Step 3-1이 그 분기를 처리한다.
GSD_TOOLS=""
if command -v gsd-tools >/dev/null 2>&1; then
  GSD_TOOLS="gsd-tools"
elif [ -f "$HOME/.claude/gsd-core/bin/gsd-tools.cjs" ]; then
  GSD_TOOLS="node $HOME/.claude/gsd-core/bin/gsd-tools.cjs"
fi
echo "repo=$REPO_ROOT  home=$HOME  gsd-tools=${GSD_TOOLS:-<not found>}"
```

- [ ] **Step 1: 환경 감지 + 다른 프로젝트 영향 (§2.1.1)**

```bash
DETECT="$($BACKUP detect)"; echo "$DETECT"
find "$HOME" -name STATE.md -path '*/.planning/*' -not -path '*/node_modules/*' 2>/dev/null

UNDET=$(printf '%s\n' "$DETECT" | sed -n 's/^undetermined: //p')
TARGETS=$(printf '%s\n' "$DETECT" | sed -n 's/^legacy targets: //p')
echo "undetermined=$UNDET  targets=$TARGETS"
```

**분기는 두 값을 함께 본다.** `detect`는 판정하지 못한 항목을 `UNDETERMINED`로 보고하고 그것을 `legacy targets`에 **세지 않는다** — 세면 "모른다"가 "있다"로 둔갑하기 때문이다. 그래서 `legacy targets: 0` 하나만 보면 *판정 불가 항목만 있는 홈*이 "제거할 것 없음"으로 조용히 통과한다.

| `undetermined` | `legacy targets` | 판정 |
|---|---|---|
| `0` | `0` | **Task 9 종료.** 제거할 v0.6.x 전역 설치가 없다. Step 2~5를 건너뛰고 M-1 완료로 판정한다. *백업 없이 파괴를 진행하는 것이 아니라, 파괴할 대상이 없어 파괴 단계 자체가 없는 것*이다. `detect` 출력을 M-1 증적으로 남긴다. |
| `0` | `N ≥ 1` | Step 2로 계속. |
| `≥ 1` | 무관 | **정지.** 판정 불가 항목을 먼저 해소한다 — `UNDETERMINED` 줄이 가리키는 경로의 권한·종류(디렉터리인지, 깨진 심볼릭 링크인지)를 사람이 확인해 읽을 수 있게 만든 뒤 `detect`를 다시 돌린다. 해소 전에는 백업도 제거도 하지 않는다: 백업에 안 들어간 것은 복원되지 않는다. |

계속하는 경우, `find` 결과가 비어 있지 않으면 각 `.planning/STATE.md`를 열어 진행 중 phase를 확인한다. **하나라도 진행 중이면 제거 보류** — 해당 프로젝트를 phase 경계까지 정리한 뒤 재개.

- [ ] **Step 2: 백업 + 검증**

```bash
BACKUP_DIR="$HOME/.crew-legacy-backup/$(date +%F)"
$BACKUP backup --dest "$BACKUP_DIR"
$BACKUP verify --from "$BACKUP_DIR"
mkdir -p "$HOME/.crew-legacy-backup"
echo "$BACKUP_DIR" > "$HOME/.crew-legacy-backup/LAST"   # 새 셸에서도 같은 경로를 찾도록
```

Expected: `backup complete: $BACKUP_DIR`, `verify OK`. 실패 시 여기서 중단 — 백업 없이는 제거 금지.

`--dest`를 명시하는 이유: 도구 기본값도 로컬 날짜(Task 3)지만, `backup`과 `verify` 사이에 자정을 넘기면 두 명령이 다른 경로를 가리킨다. 경로를 한 번 계산해 변수로 고정하면 그 창이 없어지고, **제거 이후 롤백 시 참조할 경로도 하나로 확정된다.** 포인터 파일을 `/tmp`가 아니라 `$HOME` 아래 두는 이유: `/tmp`는 재부팅으로 날아가고 정리 정책이 머신마다 다르다. 백업과 같은 곳에 두면 백업 디렉터리만 살아 있으면 경로를 복원할 수 있다.

- [ ] **Step 3: 제거 — 매니페스트 기반 (§2.2)**

지울 목록을 런북에 적지 않는다. Step 2가 뜬 `MANIFEST.json`이 이 머신의 실제 인벤토리다.

```bash
# 3-1. capability 등록 해제 — 매니페스트에 잡힌 것만, 도구를 찾았을 때만
CAPS="$(node -e '
const m=require(process.argv[1]+"/MANIFEST.json");
process.stdout.write(m.targets.filter(t=>t.rel.startsWith(".gsd/capabilities/"))
  .map(t=>t.rel.split("/")[2]).join(" "));' "$BACKUP_DIR")"
if [ -n "$CAPS" ] && [ -n "$GSD_TOOLS" ]; then
  for id in $CAPS; do
    $GSD_TOOLS capability remove "$id" || echo "capability remove $id 실패 — 수동 확인 필요"
  done
elif [ -n "$CAPS" ]; then
  echo "capability 등록은 있는데 gsd-tools를 못 찾음: $CAPS — 수동 해제 후 계속"
else
  echo "등록된 capability 없음 — 건너뜀"
fi

# 3-2. ~/CLAUDE.md 마커 블록만 제거 (사용자 작성분 보존). 파일/마커 부재는 무동작 exit 0.
node -e '
const fs=require("fs"),os=require("os"),p=os.homedir()+"/CLAUDE.md";
const S="<!-- triple-crown:managed-routing:start -->",E="<!-- triple-crown:managed-routing:end -->";
if(!fs.existsSync(p)){console.log("CLAUDE.md 없음 — 건너뜀");process.exit(0);}
const lines=fs.readFileSync(p,"utf8").split("\n");
const s=lines.findIndex(l=>l.trim()===S),e=lines.findIndex(l=>l.trim()===E);
if(s===-1||e===-1||e<s){console.log("marker block 없음 — 건너뜀");process.exit(0);}
fs.writeFileSync(p,[...lines.slice(0,s),...lines.slice(e+1)].join("\n").replace(/^\n+/,""));
console.log("removed lines",s+1,"-",e+1);'

# 3-3. 훅 파일 — 부재 관용
rm -f "$HOME/.claude/hooks/triple-crown-ship-guard.cjs"

# 3-4. settings.json 훅 그룹 — 술어 기반 제거 (bin/triple-crown.cjs removeShipGuard와 동일 의미론).
#      파일 부재 / PreToolUse 부재 / 매치 0은 전부 무동작 exit 0 — 매치가 없으면 파일을 쓰지 않는다.
node -e '
const fs=require("fs"),os=require("os"),p=os.homedir()+"/.claude/settings.json";
if(!fs.existsSync(p)){console.log("settings.json 없음 — 건너뜀");process.exit(0);}
let s;try{s=JSON.parse(fs.readFileSync(p,"utf8"));}
catch(e){console.error("settings.json 파싱 실패 — 수동 처리: "+e.message);process.exit(1);}
const pre=s.hooks&&Array.isArray(s.hooks.PreToolUse)?s.hooks.PreToolUse:null;
if(!pre){console.log("hooks.PreToolUse 없음 — 건너뜀");process.exit(0);}
const kept=pre.filter(g=>{
const hooks=Array.isArray(g&&g.hooks)?g.hooks:[];
return !hooks.some(h=>String(h&&h.command||"").includes("triple-crown-ship-guard.cjs"));});
if(kept.length===pre.length){console.log("ship-guard 그룹 없음 — 쓰기 없음");process.exit(0);}
s.hooks.PreToolUse=kept;
fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
console.log("ship-guard group removed:",pre.length-kept.length);'

# 3-5. 벤더 디렉터리 + 스킬 마커 디렉터리 — 매니페스트가 잡은 것만
node -e '
const m=require(process.argv[1]+"/MANIFEST.json");
process.stdout.write(m.targets
  .filter(t=>t.rel===".triple-crown"||t.rel.startsWith(".claude/skills/"))
  .map(t=>t.rel).join("\n"));' "$BACKUP_DIR" | while IFS= read -r rel; do
  [ -n "$rel" ] || continue
  rm -rf "$HOME/$rel" && echo "removed ~/$rel"
done
```

3-4가 exit 1(파싱 실패)로 죽으면 3-1~3-3은 이미 적용된 상태다. 그 경우 손으로 `settings.json`을 고치고 3-4만 재실행하거나, Step 5의 실제 롤백으로 되돌린다 — 어느 쪽이든 Step 2의 백업이 선행 조건이다.

- [ ] **Step 4: 완료 판정 (§2.4)**

부재를 확인하는 검사다. **한 번도 설치된 적 없던 항목도 통과해야 한다** — `grep`은 파일 부재(exit 2)와 매치 0(exit 1)을 구분하지 않으므로 `grep -c`를 그대로 쓰면 판정이 거짓 실패한다.

```bash
absent()  { if [ -e "$1" ]; then echo "FAIL still present: $1"; else echo "OK absent: $1"; fi; }
nomatch() { if [ -f "$1" ] && grep -q "$2" "$1"; then echo "FAIL still matches: $1 ~ $2"; else echo "OK no match: $1 ~ $2"; fi; }

absent  "$HOME/.triple-crown"
absent  "$HOME/.claude/hooks/triple-crown-ship-guard.cjs"
nomatch "$HOME/.claude/settings.json" 'triple-crown-ship-guard'
nomatch "$HOME/CLAUDE.md"             'triple-crown:managed-routing'
ls -A "$HOME/.gsd/capabilities/" 2>/dev/null || echo "OK absent: ~/.gsd/capabilities"
$BACKUP detect
```

Expected: `FAIL` 줄이 하나도 없고, `.gsd/capabilities/`가 비어 있거나 없고, 마지막 `detect`가 `undetermined: 0` **그리고** `legacy targets: 0`. `~/CLAUDE.md`의 마커 밖 사용자 작성분과 `settings.json`의 다른 훅·설정이 보존됐는지는 눈으로 확인한다.

- [ ] **Step 5: 복구 리허설 (§2.4 — 제거 직후 1회)**

```bash
BACKUP_DIR="${BACKUP_DIR:-$(cat "$HOME/.crew-legacy-backup/LAST")}"
$BACKUP verify --from "$BACKUP_DIR"
$BACKUP restore --from "$BACKUP_DIR" --dry-run
```

Expected: verify OK + dry-run이 복구 대상 목록을 출력하고 실제 쓰기 없음. 이것으로 M-1 완료 — M0 착수 가능.

실제 롤백이 필요해지면 `--dry-run` 없이 같은 명령을 쓴다. 이때 `restore`는 `manifest.home`이 현재 `$HOME`과 다르면 거부한다 (Task 4 안전 계약 1) — 다른 계정에서 뜬 백업을 잘못 붓는 사고를 막는 장치이므로, 거부가 뜨면 `--allow-foreign-home`으로 밀어붙이기 전에 백업 경로부터 확인한다.

`git push`가 차단되지 않는 것은 성공 지표가 아니라 보호 공백의 증상이다 (§2.4). 판정에 쓰지 않는다.

---

## 자기 검토 기록

- 설계 §2.0 6항 대응: 1번 → Task 3~6, 2번 → Task 8, 3번 → Task 1, 4번 → Task 2, 5번 → Task 1·2·8 테스트, 6번 → v1.2에서 선반영 완료 (작업 없음). §2.1~2.4 → Task 3~6 + Task 9. §4.5 L1 4단언 → install-entrypoints 3테스트(단언 1~3) + prerelease-fence(단언 4).
- §2.5.1 2a의 "배열이 아님"을 "존재하는데 타입 불일치"로 해석하고 부재 시 생성으로 결정 — Task 6 Interfaces에 근거 명시.
- 타입 일관성: `verifyArchive(from) → {manifest, problems}`를 Task 4에서 정의하고 restore가 동일 시그니처로 소비. `restoreClaudeMd(home, from, manifest, actions, dryRun)`/`restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처가 Task 4 스텁과 Task 5·6 구현에서 동일.
- 적대적 리뷰 반영 (2026-08-21): `restore`가 `manifest.home`을 무시하고 대상마다 `rmSync` 후 `cpSync`하던 원안은 (a) 다른 홈의 백업을 그대로 받아 현재 홈 상태를 파괴하고 (b) 중간 실패 시 부분 복구 상태를 남긴다. 아카이브 sha256 검증은 "아카이브 무결성"만 보증하고 "대상 홈이 맞는가"는 보지 않으므로 별도 게이트가 필요하다. → Task 4에 안전 계약 3종(홈 일치 요구 + `--allow-foreign-home`, 선검증, rename 기반 롤백)과 테스트 2종(foreign-home 거부 / 중간 실패 롤백) 추가. 종료 코드 4를 홈 불일치 거부에 배정.
- 적대적 리뷰 반영 (2026-08-21): 기본 백업 경로가 `toISOString().slice(0,10)`(UTC)인데 Task 9 런북은 `date +%F`(로컬)로 조회해, KST 기준 00:00–09:00에 백업 성공 후 `verify`가 없는 경로를 가리켜 실패한다. 제거 게이트가 이 verify에 걸려 있어 파괴적 단계 전체가 막히고, 사고 시 롤백 경로 안내도 틀린다. → 도구는 `localDate()`(로컬)로 통일하고 시간대 경계 테스트를 추가, 런북은 `BACKUP_DIR` 변수로 경로를 한 번만 계산해 backup·verify·리허설·롤백이 같은 값을 쓰게 했다.
- 실측 대조 반영 (2026-08-21, 최우선): **Task 9가 이 머신에서 실행 불가였다.** 설계 §1.2/§1.3의 인벤토리는 홈 `/home/devkey` 기준 스냅샷인데 현재 `$HOME=/home/dev`에는 제거 대상 6곳 중 0곳이 존재한다. 원안 Step 2의 `backup`이 `nothing to back up`(exit 2)로 죽어 M-1 게이트 전체가 막힌다. 근본 원인은 "관측 스냅샷을 계약으로 굳혔다"는 것 — 하드코딩 목록·고정 도구 경로(`~/.claude/gsd-core/bin/gsd-tools.cjs`)·cwd 상대 스크립트 경로(`node scripts/...`)·부재 시 죽는 제거 명령이 전부 같은 뿌리다. → Task 3에 `detect` 서브커맨드(항상 exit 0, 인벤토리 보고) 신설, Task 9를 감지 기반으로 재작성: Step 0에서 `git rev-parse --show-toplevel`·`gsd-tools` 탐색, Step 1의 `legacy targets: 0`이면 파괴 단계 전체 스킵하고 통과, Step 3은 `MANIFEST.json`을 인벤토리로 삼아 멱등·부재 관용 실행, Step 4는 `grep -c`(파일 부재 시 거짓 실패) 대신 `absent`/`nomatch` 헬퍼. Global Constraints에 머신·폴더 종속 금지 항목 추가. `backup`은 대상 0개를 실패로 유지 — 부재 분기는 `detect`가 맡고, "백업했다"는 착각은 만들지 않는다.
- 실측 대조 반영 (2026-08-21): Task 8 자기일관 불변식에 구멍 3개. (a) `README.md`의 tgz는 84·85 **두 줄**인데 계획은 85행만 지목 — 84행을 놓치면 v0.6.5 트리에 `0.6.4` 문자열이 남는다. (b) `docs/INSTALLER.md`도 16행부터인데 24행부터로 적혀 있었다. (c) `bin/triple-crown.cjs:629` help() 예시가 `0.6.3` — 이미 두 버전 뒤처졌고, Task 8 테스트가 `github:`/`raw.githubusercontent` 패턴만 검사해 tgz 파일명 드리프트를 구조적으로 못 잡는다. 즉 Task 8이 막으려는 그 버그가 CLI 안에 살아 있었다. → 행 목록 보정, `bin/triple-crown.cjs`를 Files·Step 3·`git add`에 추가, tgz 파일명이 `VERSION`과 일치하는지 보는 테스트 1개 추가(Task 8 테스트 3 → 4). RED 시점에 이 테스트가 반드시 실패해야 함을 Step 2에 명시.
- 실측 대조 반영 (2026-08-21): `npm test`는 `run_installer_smoke.py`·`run_v061_l0.py`만 부른다 — Task 7이 고치는 `run_npx_tarball_smoke.py`가 Task 7 Step 2의 검증 명령으로 **한 번도 실행되지 않았다.** 수정이 맞는지 확인 못 하는 검증은 검증이 아니다. → Step 2에 `npm pack && python tests/run_npx_tarball_smoke.py`를 명시적으로 추가.
- 실측 대조 반영 (2026-08-21): `package.json`의 `engines.node`가 `">=18.0.0"`인데 `bin/triple-crown.cjs:189,525`가 런타임에 Node >=24를 강제한다. `engines`가 거짓말을 하면 Node 18~23 사용자는 `npm`을 통과한 뒤 설치 중간에 거부당한다. Task 8이 `package.json`을 어차피 수정하므로 거기서 `">=24.0.0"`으로 맞춘다.
- 실측 대조 반영 (2026-08-21): `fail()`이 `process.exit`이라 호출부 `finally`가 안 돈다 — Task 6의 exit 3(settings 수동 병합) 경로에서 임시 추출 디렉터리가 샜다. 실패 경로마다 `rmSync`를 붙이는 방식은 새 실패 경로가 생길 때마다 다시 새므로, Task 4에서 `CLEANUP` 배열 + `fail()` 일괄 정리로 바꾸고 호출부의 수동 정리를 걷어냈다. exit 3은 "부분 실패"가 아니라 *파일은 복구·`settings.json`만 수동*이라는 정의된 종료 상태임을 Task 6 Interfaces에 명시.
- 실행 검증이 잡은 버그 (2026-08-21): 계획서 코드 블록을 그대로 조립해 실제 `$HOME=/home/dev`에 돌렸더니 `detect`가 `legacy targets: 1`을 반환했다. `collectTargets`가 `~/.claude/settings.json`을 존재만으로 대상에 넣기 때문 — 이 파일은 Claude Code가 깔린 거의 모든 머신에 있으므로, 원안대로면 **레거시를 설치한 적 없는 PC에서도 0이 안 나오고 Task 9의 "0이면 스킵" 분기가 영영 안 걸린다.** 감지 기반으로 바꿔놓고도 판정 술어가 파일 존재였으면 머신 종속을 못 벗은 것이다. → `SEMANTIC`(사용자 소유·구간 편집 대상)을 모듈 상수로 올리고 `legacySignals()`를 신설: 소유 대상 수 + 라우팅 마커 블록 존재 + ship-guard 훅 그룹 존재로 센다. `detect`와 `backup`이 같은 술어를 공유한다 — 갈라지면 `detect`가 0이라 스킵한 홈에서 `backup`이 성공해버린다. 테스트에 "stock settings.json + 사용자 CLAUDE.md만 있는 홈 → 0, backup 거부" 케이스 추가.
- 실행 검증이 잡은 버그 (2026-08-21): Task 4의 디스패처 블록이 Task 3의 디스패처를 통째로 교체하는데 `detect` 분기를 빠뜨려, Task 3에서 만든 서브커맨드가 Task 4 적용 후 사라졌다. Task 9 Step 1이 첫 명령에서 죽는다. → Task 4 디스패처에 `detect` 분기와 경고 주석 추가. 조립 없이 문서만 읽었으면 못 잡았을 종류의 결함이다.
- 검증 방법 (2026-08-21): 계획서의 Task 3+4 코드 블록을 스크래치패드에 조립해 `node --test` 실행 — 10 테스트 중 9 통과, 유일한 실패는 Task 5 Step 2가 예고한 RED(`restoreClaudeMd` 스텁)로 계획의 TDD 순서와 일치. 이어서 Task 9 Step 0·Step 1·Step 4 셸 스니펫을 실제 `$HOME`에서 그대로 실행: `detect` → `legacy targets: 0` exit 0, `backup` → `nothing to back up` exit 2, Step 1 분기 → "Step 2~5 스킵, M-1 통과", Step 4 판정 헬퍼 → `FAIL` 줄 0개.
- 미해결(범위 밖, M0 이후): `.github/workflows/` 부재로 CI가 없다. "매 태스크 커밋 전 `npm run test:l1` green"은 순수 수작업 규율이고, 이 계획은 push를 금지하므로 M-1에서 워크플로를 추가하지 않는다. L1 계약 테스트는 POSIX 전용(`restore.sh` mode 0o755, `os.homedir()`의 `HOME` 존중, 시스템 `tar`)이라 `install.ps1`을 유지하면서 Windows 커버리지는 0이다. 둘 다 M0 착수 시 우선 항목으로 이월.
- 테스트 수 누적: Task 1 → 2, Task 2 → 3, Task 3 → 7, Task 4 → 10, Task 5 → 13, Task 6 → 16, Task 8 → +4(별도 파일).
- M0 선행 호환성: Task 1의 repo-tree 테스트는 VERSION 프리릴리스 여부로 기대를 뒤집는다 — M0가 `0.7.0-dev`로 올려도 L1이 깨지지 않고, 오히려 fence 동작을 계속 검증한다. Task 8의 release-tree 테스트도 프리릴리스면 자동 skip.
