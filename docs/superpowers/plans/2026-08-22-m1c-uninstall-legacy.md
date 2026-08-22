# M1c — `crew uninstall-legacy` + M1 계열 이월 부채 상환 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 개명 전 Triple Crown 설치본을 제거하는 `crew uninstall-legacy` 명령을 만들고, M1a·M1b 가 M1c 소유로 이월한 부채 3건(구 ship guard 등록 병합, 비원자적 capability 업그레이드, Windows L1 잡 + `tc-*` 접두사)을 함께 갚는다. **M2 착수 시점에 M1 계열 이월 부채 0.**

**Architecture:** 레거시 어휘(구 capability id · 구 스킬 마커 · 구 훅 파일명 · 구 라우팅 마커)는 이미 [`scripts/legacy-backup.cjs`](../../../scripts/legacy-backup.cjs) 하나가 전부 소유하고 있고, 그 파일의 주석이 "backup 과 restore 가 반드시 같은 술어를 써야 한다"를 반복해서 못박는다. M1c 는 **제거를 그 술어 집합에 합류시킨다** — 새 어휘를 어디에도 복제하지 않는다. 그 파일을 require 가능하게 만들고(M1b 가 `bin/crew.cjs` 에 쓴 `require.main` 가드와 같은 수법), 제거 동작은 별도 모듈 `scripts/uninstall-legacy.cjs` 가 갖고, `bin/crew.cjs` 는 플래그 파싱과 동의만 한다.

**Tech Stack:** Node.js ≥24 (실측 v24.14.0), `node:test` 러너, Node stdlib 만 (외부 npm 의존성 0), 시스템 `npm` 11.11.0 · `git` 2.43.0 · `python3` 3.13.13. 러너 GSD: `~/.claude/gsd-core/bin/gsd-tools.cjs` **v1.11.0**.

**Spec:** [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §2.2(제거 대상 6곳) · §2.4(완료 판정) · §2.5.1(settings 의미 기반 술어) · §5(M1 분할 — M1c 행) · §6 L1(`uninstall-legacy` 행) · §8(커밋·태그) / [`docs/RESTRUCTURE-PLAN.md`](../../RESTRUCTURE-PLAN.md) §7.5

**선행 계획:** [`2026-08-21-m1b-capability-split.md`](2026-08-21-m1b-capability-split.md) — 완료. 태그 `v0.7.0-m1b`. 그 계획서의 "범위 밖으로 남긴 것" 절이 M1c 소유로 지정한 3건이 이 계획의 Task 4·5·6 이다.

> **리뷰 반영 필독:** 이 계획은 `/plan-eng-review` 를 거쳤다. Task 1~7 본문을 실행하기 전에
> **[리뷰 반영 — 확정 변경](#리뷰-반영--확정-변경-2026-08-22-plan-eng-review)** 절(R1~R12)을 먼저 읽는다.
> 충돌하면 그 절이 이긴다. 특히 R1·R3·R10 은 각각 Task 1·2·5 를 **초록으로 만들 수 없게 하는** 결함이다.

## Global Constraints

- 외부 npm 의존성 추가 금지. `package.json` 에 `dependencies` 없음 유지.
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green.
- **push 금지.** 커밋·태그는 로컬에만. push 는 사용자 승인 후 별도.
- **파괴적 명령은 백업 없이는 돌지 않는다.** `uninstall-legacy` 는 `--from <backup dir>` 를 필수로 요구하고, 그 백업이 sha256 검증을 통과하며 **이번에 지울 대상을 실제로 담고 있는지**까지 확인한다. 우회는 `--skip-backup-check` 명시뿐이다. (브레인스토밍 확정: "백업 없으면 거부". 프로젝트 스코프에도 동일 적용 — 완화하지 않는다.)
- **기본 스코프는 프로젝트.** 홈 전역은 `--global` 을 명시해야 열린다. D13(프로젝트 스코프가 글로벌로 붕괴)의 재발 방지선은 "기본값이 좁고 넓은 쪽이 명시적"이라는 비대칭 그 자체다.
- `capabilities/**` 아래는 이 계획에서 **한 바이트도 바뀌지 않는다.** M1c 는 설치자·스크립트·테스트·CI 만 건드린다. `npm run build:caps` 를 돌릴 일이 없다.

---

## 실측 기준점

계획을 쓰면서 직접 돌려 확인한 값. 예측이 아니다.

| 항목 | 실측값 | 근거 |
|---|---|---|
| GSD `--scope` 허용값 | **`global` 또는 `project`** — `user` 는 거부 | `gsd-tools capability list --scope user` → `Error: Invalid --scope "user": must be "global" or "project"` |
| `capability` 하위 명령 | `install, update, remove, list, outdated, trust, disable, enable, state, set` | `gsd-tools capability` (인자 없이) |
| `capability remove` 인자 | `<id>` 필수 | `gsd-tools capability remove` → `Error: Missing <id> for: capability remove <id>` |
| M1b 직후 doctor | `READY=true PASS=18 WARN=0 FAIL=0`, capability 4개, 스킬 6개, 마커 6개 | `bin/crew.cjs install`+`doctor` 왕복 |
| L1 현황 | `tests 107 · pass 107 · fail 0` | `npm run test:l1` |
| 머신 레거시 잔여 | 0 — `~/.triple-crown` 없음, `~/.gsd/capabilities` 없음, `~/CLAUDE.md` 마커 0 | 직접 조회 |

**마지막 행이 이 마일스톤의 성격을 정한다.** 이 명령이 오늘 섬길 사용자는 0명이다 (npm 레지스트리 404, 원격 부트스트랩 파손, 설치 시점 프리릴리스 펜스). 따라서 **검증은 전부 픽스처에서 한다** — 이 머신의 홈을 대상으로 `uninstall-legacy` 를 실행하는 단계는 이 계획에 없고, 넣어서도 안 된다.

### 모듈 로드 부작용 — require 하기 전에 반드시 고칠 것

[`scripts/legacy-backup.cjs:57`](../../../scripts/legacy-backup.cjs#L57) 이 **모듈 최상위에서** 전역 예외 핸들러를 등록한다:

```js
process.on('uncaughtException', (e) => fail(`unexpected error: ${(e && e.message) || e}`, 2));
```

`bin/crew.cjs` 가 이 파일을 그대로 require 하면 **설치자 전체의 오류 계약이 납치된다** — `install` 중 어디서 터지든 `Crew installer: <msg>` (exit `err.exitCode||1`) 대신 `legacy-backup: unexpected error: <msg>` (exit 2) 가 나온다. Task 1 Step 3 이 이 등록을 `require.main` 블록 안으로 옮기는 이유이고, Task 1 Step 1 의 적색 테스트가 정확히 이것을 잡는다.

같은 이유로 `const opts = parseArgs(process.argv.slice(2))` ([`:637`](../../../scripts/legacy-backup.cjs#L637)) 도 최상위에 있다 — require 하는 순간 `crew.cjs` 의 argv 를 legacy-backup 의 문법으로 파싱해 `unknown option: --project` 로 죽는다.

---

## File Structure

| 파일 | 상태 | 책임 |
|---|---|---|
| `scripts/legacy-backup.cjs` | 수정 | 레거시 **어휘와 탐지 술어**의 단일 소유자. `require.main` 가드 + `module.exports`. 루트 인자 일반화(홈 고정 해제) |
| `scripts/uninstall-legacy.cjs` | **신규** | 제거 **동작**. `planRemoval` / `checkBackup` / `applyRemoval` 3함수. legacy-backup 에서 술어만 빌려 쓴다 |
| `bin/crew.cjs` | 수정 | `uninstall-legacy` 명령 배선(플래그·동의·출력) + `installCapabilities` 원자성 |
| `scripts/install-claude-ship-guard.cjs` | 수정 | `isGuardHook()` 이 구 훅 파일명도 인식 → 그룹 중복 제거 |
| `e2e/contract/legacy-module.test.cjs` | **신규** | require 부작용 0 · 루트 일반화 |
| `e2e/contract/uninstall-legacy.test.cjs` | **신규** | 설계 §6 L1 표의 `uninstall-legacy` 행 |
| `e2e/contract/capability-atomicity.test.cjs` | **신규** | 실패 주입 시 원장과 소스가 같은 세대인지 |
| `e2e/contract/legacy-transition.test.cjs` | 수정 | 특성 테스트 5건 중 4건을 M1c 동작으로 반전·재타깃 |
| `tests/fake-gsd.cjs` | 수정 | `FAKE_GSD_FAIL_INSTALL` 실패 주입 |
| `tests/run_*.py` 5개 | 수정 | `mkdtemp(prefix="tc-…")` → `crew-…` |
| `.github/workflows/l1.yml` | 수정 | `contract` 잡에 windows-latest matrix |
| `docs/V0.7-IMPLEMENTATION-DESIGN.md` · `docs/RENAME-MAP.md` | 수정 | M1c 범위 확대 기록 |

### 왜 `lib/` 로 올리지 않는가

두 이유다. (1) [`scripts/legacy-backup.cjs:247`](../../../scripts/legacy-backup.cjs#L247) 이 `fs.copyFileSync(__filename, …)` 로 **자기 자신을 백업 디렉터리 안에 복사**한다 — 백업만으로 복구 가능하다는 설계 §2.1 불변식이 그 한 줄에 걸려 있다. 술어를 다른 파일로 빼면 복사된 사본이 혼자서는 아무것도 못 한다. (2) `lib/` 는 M0 이 정한 **capability 번들 복제 대상**(`LIB_MAP` · `LIB-HASH.json` · `build-capabilities.cjs`)의 공간이다. capability 가 쓰지 않는 파일을 거기 두면 `build-capabilities` 의 "표에 없는 사본" 판정과 충돌한다.

### 왜 제거 동작은 별도 파일인가

`bin/crew.cjs` 는 이미 729줄이다. 제거 계획 수립·백업 대조·실제 삭제는 120줄쯤 되고, 그중 **어느 것도 CLI 를 띄우지 않고 단위 테스트할 수 있어야 한다**(`planRemoval` 은 순수 함수에 가깝다). 배선은 crew.cjs, 판단과 동작은 `scripts/uninstall-legacy.cjs`.

---

## Implementation Tasks

- [ ] **T1** `scripts/legacy-backup.cjs` require 가능화 + 루트 일반화 (Task 1)
- [ ] **T2** `planRemoval` · `checkBackup` — 탐지와 게이트만, 쓰기 0 (Task 2)
- [ ] **T3** `applyRemoval` + `crew uninstall-legacy` 배선 + 특성 테스트 재타깃 (Task 3)
- [ ] **T4** 구 ship guard 등록 인식·병합 (Task 4)
- [ ] **T5** capability 업그레이드 원자성 (Task 5)
- [ ] **T6** Windows L1 matrix + `tc-*` 개명 (Task 6)
- [ ] **T7** 완료 판정 · 문서 · 태그 `v0.7.0-m1c` (Task 7)

---

### Task 1: `legacy-backup.cjs` 를 require 가능하게 + 루트 일반화

**Files:**
- Modify: `scripts/legacy-backup.cjs:52-57` (전역 핸들러 이동) · `:17` (상수명) · `:91` (`collectTargets` 시그니처) · `:131` `:169` `:193` (파라미터명) · `:201` (`backup` 루트) · `:523` (`restore --root`) · `:591` (`detect` 루트) · `:623` (`parseArgs`) · `:637-643` (디스패치)
- Create: `e2e/contract/legacy-module.test.cjs`

**Interfaces:**
- Consumes: 없음 (이 태스크가 사슬의 시작).
- Produces:
  ```js
  module.exports = {
    ROUTING_START, ROUTING_END,          // string
    SHIP_GUARD,                          // 'triple-crown-ship-guard.cjs'
    LEGACY_CAPABILITIES,                 // ['triple-gstack','triple-superpowers','triple-crown-guide']
    SKILL_MARKERS,                       // ['.triple-crown-skill','.crew-skill']
    LEGACY_SKILL_MARKERS,                // ['.triple-crown-skill']
    SEMANTIC,                            // Set<'CLAUDE.md'|'.claude/settings.json'>
    collectTargets,                      // (root, undetermined=[], opts={markers}) -> [{rel,kind}]
    findMarkerRange,                     // (lines) -> {start,end}|null
    extractFragment,                     // (root, opts={tolerant}) -> {present,fragment,startLine,endLine,fragmentSha256,readError?}
    hasShipGuardGroup,                   // (group) -> boolean
    extractHookGroup,                    // (root, opts={tolerant}) -> {present,group,sha256,readError?,parseError?}
    legacySignals,                       // (root, targets, frag, hook) -> {owned,count}
    verifyArchive,                       // (from) -> {manifest, problems:[]}
  };
  ```

> **이름 하나만 바뀐다.** 파일 내부의 `const CAPABILITIES`([`:17`](../../../scripts/legacy-backup.cjs#L17))를 `LEGACY_CAPABILITIES` 로 바꾼다. `bin/crew.cjs:13` 에도 같은 이름의 상수가 있어 require 하는 쪽에서 헷갈리고, 무엇보다 **읽는 사람이 둘을 혼동하면 구 id 를 설치 목록에 넣는 사고**가 난다. 파일 안 참조는 `collectTargets` 한 곳뿐이다.

- [ ] **Step 1: 적색 테스트를 먼저 쓴다 — require 부작용과 루트 일반화**

`e2e/contract/legacy-module.test.cjs` 신규:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome } = require('./helpers/fake-home.cjs');

const MODULE = path.join(ROOT, 'scripts', 'legacy-backup.cjs');

// require 는 부작용이 없어야 한다. 이 둘 중 하나라도 남으면 bin/crew.cjs 가 이 파일을
// require 하는 순간 설치자의 오류 계약과 argv 해석이 납치된다.
test('requiring the legacy module installs no global handler and parses no argv', () => {
  const probe = `
    const before = process.listenerCount('uncaughtException');
    process.argv = [process.argv[0], 'probe', '--project', '/tmp/x'];
    const api = require(${JSON.stringify(MODULE)});
    console.log(JSON.stringify({
      handlerDelta: process.listenerCount('uncaughtException') - before,
      exports: Object.keys(api).sort(),
    }));
  `;
  const r = cp.spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, `require threw: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.handlerDelta, 0,
    'legacy-backup.cjs must not register uncaughtException at module load — it would hijack the installer');
  for (const name of ['LEGACY_CAPABILITIES', 'LEGACY_SKILL_MARKERS', 'SKILL_MARKERS', 'SHIP_GUARD',
    'SEMANTIC', 'collectTargets', 'extractFragment', 'extractHookGroup', 'hasShipGuardGroup',
    'findMarkerRange', 'legacySignals', 'verifyArchive']) {
    assert.ok(out.exports.includes(name), `missing export: ${name}`);
  }
});

// CLI 로 직접 실행할 때의 동작은 그대로여야 한다.
test('the CLI still refuses an unknown subcommand with exit 2', () => {
  const r = cp.spawnSync(process.execPath, [MODULE, 'nonsense'], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /usage: legacy-backup\.cjs detect \| backup/);
});

test('detect still runs against a home directory and always exits 0', () => {
  const home = mkFakeHome();
  const r = cp.spawnSync(process.execPath, [MODULE, 'detect'], {
    encoding: 'utf8', timeout: 30000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /legacy targets: [1-9]/);
});

// 루트 일반화: 홈이 아닌 디렉터리도 대상이 된다.
test('backup --root takes a project tree instead of the home directory', () => {
  const proj = mkFakeHome();                 // 같은 레이아웃, 위치만 프로젝트
  const dest = path.join(tempDir('crew-backup-dest-'), 'out');
  const r = cp.spawnSync(process.execPath, [MODULE, 'backup', '--root', proj, '--dest', dest], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  assert.strictEqual(manifest.home, proj, 'the manifest records the root the backup was taken from');
  assert.strictEqual(manifest.scope, 'project');
  assert.ok(manifest.targets.some((t) => t.rel === '.triple-crown'));
});

test('collectTargets can be narrowed to the legacy marker alone', () => {
  const legacy = require(MODULE);
  const root = mkFakeHome();
  const cur = path.join(root, '.claude', 'skills', 'crew-gsd-review');
  fs.mkdirSync(cur, { recursive: true });
  fs.writeFileSync(path.join(cur, '.crew-skill'), 'crew-quality\n');

  const wide = legacy.collectTargets(root).map((t) => t.rel);
  const narrow = legacy.collectTargets(root, [], { markers: legacy.LEGACY_SKILL_MARKERS })
    .map((t) => t.rel);
  assert.ok(wide.includes('.claude/skills/crew-gsd-review'), 'backup captures both markers');
  assert.ok(!narrow.includes('.claude/skills/crew-gsd-review'),
    'removal must never see a current-brand skill');
  assert.ok(narrow.includes('.claude/skills/gsd-triple-crown'));
});
```

- [ ] **Step 2: 돌려서 실패를 확인한다**

Run: `node --test e2e/contract/legacy-module.test.cjs`

기대: `# fail 3` — 첫째(`handlerDelta` 1 + export 부재), 넷째(`unknown option: --root`, exit 2), 다섯째(`legacy.collectTargets` 가 `undefined`). 둘째·셋째는 **이미 초록이어야 한다.** 초록이 아니면 멈춘다 — 아직 아무것도 안 바꿨는데 기존 동작이 깨져 있다는 뜻이다.

- [ ] **Step 3: 전역 핸들러와 argv 파싱을 `require.main` 안으로 옮긴다**

`scripts/legacy-backup.cjs` 의 `:52-57`(주석 + `process.on('uncaughtException', …)` 등록)을 삭제하고, 파일 맨 끝 `:637-643` 을 통째로 교체한다:

```js
// (파일 끝)
module.exports = {
  ROUTING_START, ROUTING_END, SHIP_GUARD,
  LEGACY_CAPABILITIES, SKILL_MARKERS, LEGACY_SKILL_MARKERS, SEMANTIC,
  collectTargets, findMarkerRange, extractFragment,
  hasShipGuardGroup, extractHookGroup, legacySignals, verifyArchive,
};

// CLI 로 직접 실행될 때만 전역 상태를 건드린다. bin/crew.cjs 가 이 파일을 require 하므로
// 최상위에서 uncaughtException 을 잡으면 설치자 전체의 오류 계약(`Crew installer: …`,
// exit err.exitCode||1)이 이 파일의 것(`legacy-backup: …`, exit 2)으로 바뀐다.
// argv 파싱도 마찬가지다 — require 시점에 crew.cjs 의 `--project` 를 보고 죽는다.
if (require.main === module) {
  // 마지막 그물. flushPendingActions()는 fail() 안에서만 도는데, 네이티브 예외
  // (EISDIR/ENOENT/EACCES…)는 fail()을 거치지 않고 프로세스를 끝낸다 — 그러면 exit 1
  // (계약은 2)에 stdout은 비어 있고, 원본을 옮겨둔 ~/.crew-legacy-rollback-XXXXXX
  // 위치가 어디에도 안 나온다. 홈을 이미 교체한 뒤라면 그게 유일한 단서다.
  process.on('uncaughtException', (e) => fail(`unexpected error: ${(e && e.message) || e}`, 2));

  const opts = parseArgs(process.argv.slice(2));
  if (opts.command === 'detect') detect(opts);
  else if (opts.command === 'backup') backup(opts);
  else if (opts.command === 'verify') verify(opts);
  else if (opts.command === 'restore') restore(opts);
  else fail('usage: legacy-backup.cjs detect [--root DIR] | backup [--root DIR] [--dest DIR] | ' +
    'verify --from DIR | restore --from DIR [--root DIR] [--dry-run] [--allow-foreign-home]', 2);
}
```

- [ ] **Step 4: 상수를 정리하고 루트를 일반화한다**

`:17-18` 을 교체하고 상수 하나를 더한다:

```js
const LEGACY_CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];
const SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill'];
// 제거가 보는 마커는 구 것 하나뿐이다. SKILL_MARKERS 를 그대로 쓰면 uninstall-legacy 가
// 현행 crew 스킬까지 지운다 — 백업은 넓게 담고 제거는 좁게 지운다.
const LEGACY_SKILL_MARKERS = ['.triple-crown-skill'];
```

`:91` `collectTargets` — 파라미터명 `home` → `root`, 마커 목록 주입:

```js
function collectTargets(root, undetermined = [], opts = {}) {
  const markers = opts.markers || SKILL_MARKERS;
  const targets = [];
  const dir = (rel) => { if (exists(path.join(root, rel))) targets.push({ rel, kind: 'dir' }); };
  const file = (rel) => { if (exists(path.join(root, rel))) targets.push({ rel, kind: 'file' }); };
  dir('.triple-crown');
  for (const id of LEGACY_CAPABILITIES) dir(`.gsd/capabilities/${id}`);
  file(`.claude/hooks/${SHIP_GUARD}`);
  const skillsRoot = path.join(root, '.claude', 'skills');
  if (exists(skillsRoot)) {
    for (const e of fs.readdirSync(skillsRoot).sort()) {
      const d = path.join(skillsRoot, e);
      // statSync는 심볼릭 링크를 따라간다 — dangling symlink 스킬은 평범한 상태인데
      // 여기서 던지면 "항상 exit 0"인 detect가 raw 스택으로 죽는다.
      let isDir;
      try { isDir = fs.statSync(d).isDirectory(); }
      catch (err) { undetermined.push(`.claude/skills/${e} (${err.code || err.message})`); continue; }
      if (isDir && markers.some((m) => exists(path.join(d, m)))) {
        targets.push({ rel: `.claude/skills/${e}`, kind: 'dir' });
      }
    }
  }
  file('CLAUDE.md');
  file('.claude/settings.json');
  return targets;
}
```

`extractFragment(:131)` · `extractHookGroup(:169)` · `legacySignals(:193)` 는 **파라미터명만** `home` → `root` 로 바꾼다. 본문 로직은 손대지 않는다.

`backup(:201)` 의 첫 세 줄:

```js
function backup(opts) {
  const root = opts.root ? path.resolve(opts.root) : os.homedir();
  const scope = opts.root ? 'project' : 'home';
  const dest = opts.dest || path.join(os.homedir(), '.crew-legacy-backup', localDate());
  // …이하 본문의 home 을 전부 root 로. tar 의 `-C` 인자도 root 다.
```

매니페스트에 한 줄 추가하되 **키 `home` 은 그대로 둔다.** 기존 백업의 `restore` 가 `manifest.home` 을 읽고 `assertRestoreHome(:424)` 이 그 값으로 대상을 판정한다 — 이름을 바꾸면 M-1 이후 만들어진 백업이 전부 복구 불가가 된다:

```js
  const manifest = {
    schema: 1,
    createdAt: new Date().toISOString(),
    home: root,               // 이 백업을 뜬 루트. 키 이름은 하위 호환으로 유지한다
    scope,                    // 'home' | 'project'
    restoreOrder: targets.filter((t) => !SEMANTIC.has(t.rel)).map((t) => t.rel),
    // …나머지 그대로
```

`restore(:523)` 도 `opts.root` 를 받아 `assertRestoreHome` 이 그 값과 대조하게 한다. 인자가 없으면 지금처럼 `os.homedir()`.

`detect(:591)` 은 `detect(opts)` 로 바꾸고 `const home = os.homedir();` 를 `const root = opts.root ? path.resolve(opts.root) : os.homedir();` 로. **출력 첫 줄 `home: ${home}` 은 그대로 둔다** — 문자열을 바꾸기 전에 소비처가 있는지 확인한다:

```bash
grep -rn "home: " --include=*.cjs --include=*.py --include=*.md . | grep -v node_modules | grep -v '\.git/'
```

소비처가 없으면 `root: ${root}` 로 바꾸고, 있으면 그 곳도 같은 커밋에서 고친다.

`parseArgs(:623)` 에 `--root` 추가:

```js
function parseArgs(argv) {
  const out = { command: argv[0], dest: null, from: null, root: null, dryRun: false, allowForeignHome: false };
  const rest = argv.slice(1);
  while (rest.length) {
    const a = rest.shift();
    if (a === '--dest') out.dest = rest.shift() || fail('--dest requires a path', 2);
    else if (a === '--from') out.from = rest.shift() || fail('--from requires a path', 2);
    else if (a === '--root') out.root = rest.shift() || fail('--root requires a path', 2);
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--allow-foreign-home') out.allowForeignHome = true;
    else fail(`unknown option: ${a}`, 2);
  }
  return out;
}
```

- [ ] **Step 5: 녹색 확인**

```bash
node --test e2e/contract/legacy-module.test.cjs 2>&1 | grep -E '^# (pass|fail)'
npm run test:l1 2>&1 | tail -5
```

기대: 신규 파일 `# pass 5 · # fail 0`. 전체 L1 은 **112** (107 + 5).

> `legacy-backup.test.cjs`(842줄)가 깨지면 루트 일반화가 기존 계약을 건드린 것이다. 그 파일은 홈 스코프 백업/복구의 전 경로를 덮는다 — **거기 맞추어 이 태스크를 고친다. 반대로 하지 않는다.**

- [ ] **Step 6: 반증 — 핸들러를 되돌리면 테스트가 죽는가**

```bash
git stash push -- scripts/legacy-backup.cjs
node --test e2e/contract/legacy-module.test.cjs 2>&1 | grep -E '^# (pass|fail)'
git stash pop
```

기대: `# fail 3`. `# fail 0` 이 나오면 테스트가 아무것도 안 보고 있는 것이다.

- [ ] **Step 7: 커밋**

```bash
npm run test:l1 2>&1 | tail -4
git add scripts/legacy-backup.cjs e2e/contract/legacy-module.test.cjs
git commit -m "refactor: make the legacy surface requirable and root-agnostic"
```

---

### Task 2: `planRemoval` · `checkBackup` — 판단만, 쓰기 0

**Files:**
- Create: `scripts/uninstall-legacy.cjs`
- Create: `e2e/contract/uninstall-legacy.test.cjs`

**Interfaces:**
- Consumes: Task 1 의 `module.exports` 전체 (`collectTargets` · `extractFragment` · `extractHookGroup` · `hasShipGuardGroup` · `findMarkerRange` · `verifyArchive` · `LEGACY_CAPABILITIES` · `LEGACY_SKILL_MARKERS` · `SHIP_GUARD`).
- Produces:
  ```js
  module.exports = { planRemoval, checkBackup, REMOVAL_ORDER };   // applyRemoval 은 Task 3

  // planRemoval(root) -> {
  //   root: string,
  //   capabilities: string[],            // 원장에서 지울 구 id (디스크에 있는 것만)
  //   skills: string[],                  // '.claude/skills/<name>' 상대 경로
  //   hookFile: string|null,             // '.claude/hooks/triple-crown-ship-guard.cjs'
  //   settingsGroup: boolean,
  //   routingBlock: {startLine,endLine}|null,
  //   vendorDir: string|null,            // '.triple-crown'
  //   undetermined: string[],
  //   count: number,
  // }
  // checkBackup(plan, from) -> { ok: boolean, problems: string[] }
  ```

- [ ] **Step 1: 실패 테스트를 먼저 쓴다 — 탐지와 게이트**

`e2e/contract/uninstall-legacy.test.cjs` 신규:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome } = require('./helpers/fake-home.cjs');

const UNINSTALL = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
const BACKUP_CLI = path.join(ROOT, 'scripts', 'legacy-backup.cjs');

function mkBackup(root) {
  const dest = path.join(tempDir('crew-backup-'), 'out');
  const r = cp.spawnSync(process.execPath, [BACKUP_CLI, 'backup', '--root', root, '--dest', dest],
    { encoding: 'utf8', timeout: 60000 });
  assert.strictEqual(r.status, 0, `backup failed: ${r.stdout}${r.stderr}`);
  return dest;
}

// mkFakeHome 이 심는 것: capability 3 + 스킬 1 + 훅 파일 1 + settings 훅 그룹 1
// + CLAUDE.md 마커 블록 1 + 벤더 디렉터리 1 = 8.
const PLANTED = 8;

test('planRemoval finds all six kinds of legacy location in a planted fixture', () => {
  const root = mkFakeHome();
  const plan = UNINSTALL.planRemoval(root);
  assert.deepStrictEqual(plan.capabilities,
    ['triple-gstack', 'triple-superpowers', 'triple-crown-guide']);
  assert.deepStrictEqual(plan.skills, ['.claude/skills/gsd-triple-crown']);
  assert.strictEqual(plan.hookFile, '.claude/hooks/triple-crown-ship-guard.cjs');
  assert.strictEqual(plan.settingsGroup, true);
  assert.ok(plan.routingBlock, 'routing marker block must be located');
  assert.strictEqual(plan.vendorDir, '.triple-crown');
  assert.deepStrictEqual(plan.undetermined, []);
  assert.strictEqual(plan.count, PLANTED);
});

test('planRemoval never targets a current crew skill', () => {
  const root = mkFakeHome();
  const cur = path.join(root, '.claude', 'skills', 'crew-gsd-review');
  fs.mkdirSync(cur, { recursive: true });
  fs.writeFileSync(path.join(cur, '.crew-skill'), 'crew-quality\n');
  assert.deepStrictEqual(UNINSTALL.planRemoval(root).skills,
    ['.claude/skills/gsd-triple-crown'],
    'the current-brand marker must not be a removal target');
});

test('planRemoval on a clean tree reports nothing to do', () => {
  assert.strictEqual(UNINSTALL.planRemoval(tempDir('crew-clean-')).count, 0);
});

test('planRemoval reports an unparseable settings.json as undetermined, not absent', () => {
  const root = mkFakeHome();
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json');
  const plan = UNINSTALL.planRemoval(root);
  assert.ok(plan.undetermined.some((u) => u.includes('settings.json')), plan.undetermined.join('\n'));
});

test('checkBackup refuses when the backup came from a different root', () => {
  const root = mkFakeHome();
  const other = mkBackup(mkFakeHome());
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), other);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => /different root/i.test(p)), res.problems.join('\n'));
});

test('checkBackup accepts a backup taken from the same root', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.deepStrictEqual(res.problems, []);
  assert.strictEqual(res.ok, true);
});

test('checkBackup refuses a backup whose archive no longer matches its manifest', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  fs.writeFileSync(path.join(from, 'archive.tar.gz'), 'corrupted');
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.length, 'a corrupted archive must produce problems');
});

test('checkBackup refuses when the plan grew a target the backup never saw', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  // 백업 이후에 새 레거시 스킬이 생겼다 — 지우면 되돌릴 수 없다.
  const late = path.join(root, '.claude', 'skills', 'gsd-triple-gstack-qa-only');
  fs.mkdirSync(late, { recursive: true });
  fs.writeFileSync(path.join(late, '.triple-crown-skill'), '');
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), from);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => p.includes('gsd-triple-gstack-qa-only')), res.problems.join('\n'));
});

test('checkBackup with no --from is a refusal, not a pass', () => {
  const root = mkFakeHome();
  const res = UNINSTALL.checkBackup(UNINSTALL.planRemoval(root), null);
  assert.strictEqual(res.ok, false);
  assert.ok(res.problems.some((p) => p.includes('--from')), res.problems.join('\n'));
});
```

> **`PLANTED = 8` 은 세어서 쓴 값이다.** [`e2e/contract/helpers/fake-home.cjs`](../../../e2e/contract/helpers/fake-home.cjs) 의 `mkFakeHome()` 이 심는 것을 그대로 센 것 — capability 3, 스킬 1(`gsd-triple-crown`), 훅 파일 1, settings 훅 그룹 1, 라우팅 블록 1, 벤더 디렉터리 1. **구현 전에 그 파일을 열어 다시 세고, 픽스처가 바뀌었으면 이 상수를 고친다.** 계획서의 숫자를 검산 없이 옮겨 적어 실행이 막힌 일이 M1b 에 있었다.

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test e2e/contract/uninstall-legacy.test.cjs`

기대: `Cannot find module '…/scripts/uninstall-legacy.cjs'` 로 파일 전체가 죽는다(테스트 0개 실행). 이것이 이 단계의 적색이다.

- [ ] **Step 3: `scripts/uninstall-legacy.cjs` — 판단부 구현**

```js
#!/usr/bin/env node
'use strict';

// 개명 전 Triple Crown 설치본의 제거. 어휘와 탐지 술어는 전부
// scripts/legacy-backup.cjs 가 소유한다 — 여기서는 하나도 다시 쓰지 않는다.
// 그 파일의 주석이 반복해 못박는 규칙("backup 과 restore 는 같은 술어를 써야 한다")에
// 제거를 합류시키는 것이 이 모듈의 전부다.

const fs = require('fs');
const path = require('path');
const legacy = require('./legacy-backup.cjs');

// 복구의 역순. legacy-backup 의 restoreOrder 가 벤더 트리를 먼저 되돌리므로
// 제거는 벤더 트리를 마지막에 지운다 — 중간에 죽어도 소스가 마지막까지 남는다.
const REMOVAL_ORDER = ['capabilities', 'skills', 'hookFile', 'settingsGroup', 'routingBlock', 'vendorDir'];

function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }

function planRemoval(root) {
  const undetermined = [];
  const targets = legacy.collectTargets(root, undetermined, { markers: legacy.LEGACY_SKILL_MARKERS });
  const frag = legacy.extractFragment(root, { tolerant: true });
  const hook = legacy.extractHookGroup(root, { tolerant: true });

  const rels = new Set(targets.map((t) => t.rel));
  const capabilities = legacy.LEGACY_CAPABILITIES.filter((id) => rels.has(`.gsd/capabilities/${id}`));
  const skills = targets.map((t) => t.rel).filter((rel) => rel.startsWith('.claude/skills/'));
  const hookFile = rels.has(`.claude/hooks/${legacy.SHIP_GUARD}`)
    ? `.claude/hooks/${legacy.SHIP_GUARD}` : null;
  const vendorDir = rels.has('.triple-crown') ? '.triple-crown' : null;
  const settingsGroup = !!(hook.present && hook.group);
  const routingBlock = frag.present ? { startLine: frag.startLine, endLine: frag.endLine } : null;

  // 판정 불가는 "없다"가 아니라 "모른다"다. 삼키면 조용한 누락이 된다.
  if (frag.readError) undetermined.push(`CLAUDE.md (${frag.readError})`);
  if (hook.readError) undetermined.push(`.claude/settings.json (${hook.readError})`);
  if (hook.parseError) undetermined.push('.claude/settings.json (not valid JSON)');

  const count = capabilities.length + skills.length +
    (hookFile ? 1 : 0) + (settingsGroup ? 1 : 0) + (routingBlock ? 1 : 0) + (vendorDir ? 1 : 0);

  return { root, capabilities, skills, hookFile, settingsGroup, routingBlock, vendorDir, undetermined, count };
}

// 백업 게이트. "백업이 있다"로는 부족하다 — 그 백업이 (1) 무결하고 (2) 이 루트에서 떴고
// (3) 지금 지우려는 것을 전부 담고 있어야 한다. 셋 중 하나라도 아니면 되돌릴 수 없는
// 삭제가 된다.
function checkBackup(plan, from) {
  if (!from) return { ok: false, problems: ['--from <backup dir> is required'] };
  if (!exists(path.join(from, 'MANIFEST.json'))) {
    return { ok: false, problems: [`not a backup directory (no MANIFEST.json): ${from}`] };
  }

  const problems = [];
  let manifest;
  try {
    const v = legacy.verifyArchive(from);
    manifest = v.manifest;
    for (const p of v.problems) problems.push(p);
  } catch (err) {
    return { ok: false, problems: [`backup is unreadable: ${err.message}`] };
  }

  if (path.resolve(manifest.home) !== path.resolve(plan.root)) {
    problems.push(`backup was taken from a different root: ${manifest.home} (removing from ${plan.root})`);
  }

  const covered = new Set((manifest.targets || []).map((t) => t.rel));
  const wanted = [
    ...plan.capabilities.map((id) => `.gsd/capabilities/${id}`),
    ...plan.skills,
    ...(plan.hookFile ? [plan.hookFile] : []),
    ...(plan.vendorDir ? [plan.vendorDir] : []),
  ];
  for (const rel of wanted) {
    if (!covered.has(rel)) problems.push(`backup does not contain a removal target: ${rel}`);
  }
  if (plan.routingBlock && !(manifest.claudeMd && manifest.claudeMd.present)) {
    problems.push('backup contains no CLAUDE.md fragment but a routing block is about to be removed');
  }
  if (plan.settingsGroup && !(manifest.settings && manifest.settings.hasHookGroup)) {
    problems.push('backup contains no settings.json hook group but one is about to be removed');
  }

  return { ok: problems.length === 0, problems };
}

module.exports = { planRemoval, checkBackup, REMOVAL_ORDER };
```

- [ ] **Step 4: 녹색 확인**

Run: `node --test e2e/contract/uninstall-legacy.test.cjs 2>&1 | grep -E '^# (pass|fail)'`

기대: `# pass 9 · # fail 0`.

> "다른 루트" 테스트가 통과하지 않으면 `verifyArchive` 가 `{manifest, problems}` 를 돌려주지 않고 던지는 경우다. [`:267`](../../../scripts/legacy-backup.cjs#L267) 의 반환 형태를 다시 읽고 **호출부를 맞춘다 — 계약을 바꾸지 않는다.**

- [ ] **Step 5: 커밋**

```bash
npm run test:l1 2>&1 | tail -4
git add scripts/uninstall-legacy.cjs e2e/contract/uninstall-legacy.test.cjs
git commit -m "feat: plan legacy removal and gate it behind a matching backup"
```

---

### Task 3: `applyRemoval` + `crew uninstall-legacy` 배선

**Files:**
- Modify: `scripts/uninstall-legacy.cjs` (`applyRemoval` 추가, exports 갱신)
- Modify: `bin/crew.cjs:91` (`parse`) · `:655` 아래(명령 본체 추가) · `:678` (`help`) · `:707` (`main`)
- Modify: `e2e/contract/uninstall-legacy.test.cjs` (CLI·파괴·보존 단언 추가)
- Modify: `e2e/contract/legacy-transition.test.cjs` (테스트 1·3·5 재타깃)

**Interfaces:**
- Consumes: Task 2 의 `planRemoval` · `checkBackup`.
- Produces: `applyRemoval(plan, { runner, scope, dryRun, run }) -> { actions: string[], failures: string[] }`
  - `runner` 는 `bin/crew.cjs` 의 `resolveGsd(root)` 반환값 또는 `null`
  - `run` 은 `gsdTry` 와 같은 시그니처 `(runner, args, cwd) -> {code, stdout, stderr}`
  - `scope` 는 `'project'` 또는 `'global'` (실측: GSD 는 `user` 를 거부한다)

- [ ] **Step 1: 실패 테스트를 쓴다 — 파괴와 보존**

`e2e/contract/uninstall-legacy.test.cjs` 에 이어 붙인다:

```js
const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const FAKE_GSD = path.join(ROOT, 'tests', 'fake-gsd.cjs');

function runCli(args, env) {
  return cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, CREW_GSD_BIN: FAKE_GSD, ...env },
  });
}

test('--dry-run writes nothing', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const before = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--dry-run', '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')), 'dry-run must not delete the vendor dir');
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), before);
});

test('without --from the command refuses before touching anything', () => {
  const root = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', root, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /--from/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')));
});

test('it removes all six locations and preserves everything else', () => {
  const root = mkFakeHome();
  // 사용자 소유물을 심는다 — 이것들이 살아남아야 한다.
  const unmanaged = path.join(root, '.claude', 'skills', 'unmanaged');
  fs.mkdirSync(unmanaged, { recursive: true });
  fs.writeFileSync(path.join(unmanaged, 'SKILL.md'), '---\nname: unmanaged\n---\n');
  const settingsPath = path.join(root, '.claude', 'settings.json');
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  settings.hooks.PreToolUse.push({
    matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/mine.cjs' }],
  });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);

  // 제거 확인 — 설계 §2.4
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')), 'vendor dir');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'hooks', 'triple-crown-ship-guard.cjs')), 'hook file');
  assert.ok(!fs.existsSync(path.join(root, '.claude', 'skills', 'gsd-triple-crown')), 'legacy skill');
  for (const id of ['triple-gstack', 'triple-superpowers', 'triple-crown-guide']) {
    assert.ok(!fs.existsSync(path.join(root, '.gsd', 'capabilities', id)), `capability ${id}`);
  }
  const claudeMd = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert.ok(!claudeMd.includes('triple-crown:managed-routing'), 'routing markers');

  // 보존 확인 — 이쪽이 더 중요하다
  assert.ok(claudeMd.includes('user line kept'), 'user content outside the markers');
  assert.ok(fs.existsSync(unmanaged), 'unmanaged skill');
  const after = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.strictEqual(after.userSetting, true, 'unrelated settings keys');
  assert.deepStrictEqual(after.hooks.PreToolUse.map((g) => g.hooks[0].command),
    ['node /home/u/mine.cjs'], 'only the ship-guard group is filtered out');
});

test('running it twice is idempotent', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  assert.strictEqual(runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']).status, 0);
  const second = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(second.status, 0, second.stdout + second.stderr);
  assert.match(second.stdout, /nothing to remove/i);
});

test('--global is required to touch the home directory', () => {
  const home = mkFakeHome();
  const proj = tempDir('crew-proj-');
  const r = runCli(['uninstall-legacy', '--project', proj, '--from', mkBackup(home), '--yes'],
    { HOME: home, USERPROFILE: home });
  // 프로젝트는 깨끗하므로 할 일이 없고, 홈은 --global 없이는 대상이 아니다.
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /nothing to remove/i);
  assert.ok(fs.existsSync(path.join(home, '.triple-crown')), 'home must be untouched without --global');
});

test('undetermined targets block the destructive path', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  fs.writeFileSync(path.join(root, '.claude', 'settings.json'), '{ not json');
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /UNDETERMINED/);
  assert.ok(fs.existsSync(path.join(root, '.triple-crown')),
    'nothing may be removed while anything is undetermined');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test e2e/contract/uninstall-legacy.test.cjs 2>&1 | grep -E '^# (pass|fail)'`

기대: `# pass 9 · # fail 6`. Task 2 의 9개는 계속 통과하고 신규 6개가 `unknown command: uninstall-legacy` (exit 2) 로 죽는다.

> `without --from` 테스트도 exit 2 를 기대하므로 **지금은 우연히 통과할 수 있다.** 그래서 그 테스트에 `assert.match(r.stderr, /--from/)` 를 넣었다 — 지금은 `unknown option` 대신 `unknown command` 가 나오므로 실패한다. `# fail 5` 가 나오면 그 단언이 빠진 것이다.

- [ ] **Step 3: `applyRemoval` 구현**

`scripts/uninstall-legacy.cjs` 의 `module.exports` 위에 추가:

```js
// 제거를 실제로 수행한다. 순서는 REMOVAL_ORDER — 복구의 역순이다.
// SEMANTIC 대상(CLAUDE.md · settings.json)은 통째로 지우지 않는다. 마커 쌍 사이,
// 훅 그룹 하나만 걷어낸다 (설계 §2.2 2번·4번, §2.5.1 과 같은 원리 — 위치가 아니라 정체).
function applyRemoval(plan, opts = {}) {
  const actions = [];
  const failures = [];
  const dry = !!opts.dryRun;
  const say = (m) => actions.push((dry ? '[dry-run] ' : '') + m);
  const abs = (rel) => path.join(plan.root, rel);

  // 1. capability 원장. 디스크를 손으로 지우지 않는다 — 원장과 디스크가 어긋나면
  //    다음 설치가 "등록돼 있다는데 파일이 없다"는 상태를 만난다.
  for (const id of plan.capabilities) {
    if (!opts.runner) {
      failures.push(`${id}: GSD CLI unavailable — capability left registered`);
      continue;
    }
    say(`capability remove ${id} (--scope ${opts.scope})`);
    if (dry) continue;
    const r = opts.run(opts.runner, ['capability', 'remove', id, '--scope', opts.scope], plan.root);
    if (r.code !== 0) failures.push(`${id}: ${(r.stderr || r.stdout || '').trim()}`);
  }

  // 2. 스킬 디렉터리
  for (const rel of plan.skills) {
    say(`remove ${rel}`);
    if (!dry) fs.rmSync(abs(rel), { recursive: true, force: true });
  }

  // 3. 훅 파일
  if (plan.hookFile) {
    say(`remove ${plan.hookFile}`);
    if (!dry) fs.rmSync(abs(plan.hookFile), { force: true });
  }

  // 4. settings.json 의 훅 그룹 — 정체로 찾는다. 인덱스를 참조하지 않는다.
  if (plan.settingsGroup) {
    say('remove the ship-guard hook group from .claude/settings.json');
    if (!dry) {
      const p = abs('.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
      const pre = settings.hooks && settings.hooks.PreToolUse;
      if (Array.isArray(pre)) {
        settings.hooks.PreToolUse = pre.filter((g) => !legacy.hasShipGuardGroup(g));
        if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
      }
    }
  }

  // 5. CLAUDE.md 의 마커 블록 — 마커 쌍 사이만. 밖은 사용자 것이다.
  if (plan.routingBlock) {
    say('remove the managed-routing block from CLAUDE.md');
    if (!dry) {
      const p = abs('CLAUDE.md');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      const range = legacy.findMarkerRange(lines);
      if (range) {
        lines.splice(range.start, range.end - range.start + 1);
        const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
        if (text) fs.writeFileSync(p, text + '\n');
        else fs.rmSync(p, { force: true });
      }
    }
  }

  // 6. 벤더 디렉터리 — 마지막. 여기까지 오면 나머지는 이미 사라졌다.
  if (plan.vendorDir) {
    say(`remove ${plan.vendorDir}`);
    if (!dry) fs.rmSync(abs(plan.vendorDir), { recursive: true, force: true });
  }

  return { actions, failures };
}
```

`module.exports` 를 `{ planRemoval, checkBackup, applyRemoval, REMOVAL_ORDER }` 로 바꾼다.

> **`findMarkerRange` 의 반환 형태를 구현 전에 읽는다.** [`:121`](../../../scripts/legacy-backup.cjs#L121) 이 `{start,end}` 를 **0-기반 배열 인덱스**로 주는지 **1-기반 행 번호**로 주는지 확인하고 `splice` 인자를 맞춘다. `extractFragment(:131)` 이 `startLine`/`endLine` 을 어떻게 계산하는지 보면 바로 나온다. **틀리면 사용자 문서가 한 줄 잘려 나가거나 마커 한 줄이 남는다** — 이 명령에서 가장 되돌리기 힘든 종류의 오류이고, "user line kept" 단언만으로는 한 줄 어긋남을 못 잡을 수 있다. 확인한 뒤 위 테스트에 `assert.ok(!claudeMd.includes('routing body line'))` 를 한 줄 더한다.

- [ ] **Step 4: `bin/crew.cjs` 배선 — 플래그**

`parse()` (`:91`) 의 기본값 객체에 3개 추가:

```js
  const out={
    command:'install', project:null, yes:false, bootstrap:true,
    routing:true, shipGuard:true, dryRun:false, strict:false, json:false,
    verbose:false, allowPrerelease:false,
    global:false, from:null, skipBackupCheck:false
  };
```

그리고 `--allow-prerelease` 분기 아래에 3줄:

```js
    else if(a==='--global') out.global=true;
    else if(a==='--from') out.from=rest.shift()||fail('--from requires a path',2);
    else if(a==='--skip-backup-check') out.skipBackupCheck=true;
```

- [ ] **Step 5: `bin/crew.cjs` 배선 — 명령 본체**

`uninstall()` (`:655`) 바로 아래에 추가:

```js
// 개명 전 설치본의 제거. 현행 crew 설치는 건드리지 않는다 — 그건 `crew uninstall` 이다.
// 판단과 파괴는 scripts/uninstall-legacy.cjs 가 하고, 여기서는 스코프 결정 · 백업 게이트 ·
// 동의 · 출력만 한다.
async function uninstallLegacy(root,opts) {
  const {planRemoval,checkBackup,applyRemoval}=
    require(path.join(PACKAGE_ROOT,'scripts','uninstall-legacy.cjs'));

  // 기본은 프로젝트. 홈은 --global 을 명시해야 열린다 (D13 재발 방지선).
  const scopes=[{root,scope:'project',label:`project ${root}`}];
  if(opts.global) scopes.push({root:os.homedir(),scope:'global',label:`home ${os.homedir()}`});

  const plans=scopes.map(s=>({...s,plan:planRemoval(s.root)}));
  const total=plans.reduce((n,p)=>n+p.plan.count,0);
  if(total===0) { log('nothing to remove: no pre-rename installation found.'); return; }

  // 판정 불가가 하나라도 있으면 파괴 경로에 들어가지 않는다. "모른다"를 "없다"로
  // 읽는 순간 조용한 누락이 된다.
  for(const {plan,label} of plans) {
    if(plan.undetermined.length) {
      fail(`UNDETERMINED targets under ${label}:\n`+
        plan.undetermined.map(x=>`  - ${x}`).join('\n')+
        '\nRemoval refuses to run while anything is undetermined. Inspect those paths by hand first.',2);
    }
  }

  if(opts.skipBackupCheck) {
    warn('--skip-backup-check: removing without verifying that a backup covers these targets.');
  } else {
    for(const {plan,label} of plans) {
      if(!plan.count) continue;
      const res=checkBackup(plan,opts.from);
      if(!res.ok) {
        const backupCmd=`node ${path.join(PACKAGE_ROOT,'scripts','legacy-backup.cjs')} backup`+
          (plan.root===os.homedir()?'':` --root ${plan.root}`);
        fail(`backup check failed for ${label}:\n`+
          res.problems.map(x=>`  - ${x}`).join('\n')+
          `\nTake one first:  ${backupCmd}\n`+
          'Then re-run with --from <that directory>. Override with --skip-backup-check at your own risk.',2);
      }
    }
  }

  const actions=plans.filter(p=>p.plan.count)
    .map(({plan,label})=>`${label}: remove ${plan.count} legacy item(s)`);
  if(!(await consent(opts,actions))) fail('Legacy removal cancelled.',3);

  const runner=resolveGsd(root);
  if(!runner) warn('GSD CLI unavailable; capability ledger entries will be reported, not removed.');
  const failures=[];
  for(const {plan,scope} of plans) {
    if(!plan.count) continue;
    const r=applyRemoval(plan,{runner,scope,dryRun:opts.dryRun,run:gsdTry});
    for(const a of r.actions) log(a);
    failures.push(...r.failures);
  }
  if(failures.length) {
    for(const f of failures) warn(f);
    fail(`legacy removal finished with ${failures.length} failure(s); see the warnings above.`,1);
  }
  log(opts.dryRun
    ? 'dry run complete — nothing was written.'
    : 'Legacy Triple Crown installation removed.');
}
```

`main()` (`:707`) 의 `uninstall` 분기 위에 한 줄:

```js
  if(opts.command==='uninstall-legacy') return uninstallLegacy(root,opts);
```

> **`uninstall-legacy` 를 `uninstall` 보다 먼저 판정한다.** 현재 코드는 `opts.command==='uninstall'` 을 정확히 일치로 보므로 순서가 실제로 문제되지는 않지만, 두 명령이 나란히 읽히는 편이 낫다.

- [ ] **Step 6: `help()` 갱신**

`help()` (`:678`) 의 Usage 블록에:

```
  crew uninstall-legacy [--project PATH] [--global] --from <backup dir>
                        [--dry-run] [--skip-backup-check] [--yes]
```

그리고 Install options 아래에 새 절:

```
Legacy removal options:
  --global             Also remove the pre-rename installation from $HOME (default: project only)
  --from PATH          Backup directory that must cover every removal target (required)
  --skip-backup-check  Remove without verifying the backup (dangerous)
```

- [ ] **Step 7: 녹색 확인**

Run: `node --test e2e/contract/uninstall-legacy.test.cjs 2>&1 | grep -E '^# (pass|fail)'`

기대: `# pass 15 · # fail 0`.

- [ ] **Step 8: 특성 테스트 3건을 재타깃한다**

[`e2e/contract/legacy-transition.test.cjs`](../../../e2e/contract/legacy-transition.test.cjs) 는 스스로 "M1c 가 이 단언들을 뒤집는다"고 적어 뒀다. 다섯 중 셋을 지금 고친다 (네 번째는 Task 4).

**테스트 1** (`uninstall removes crew-marked skills and leaves pre-M1a marked ones behind`) 을 통째로 교체한다:

```js
test('uninstall leaves pre-M1a skills alone; uninstall-legacy is what removes them', () => {
  const proj = tempDir('crew-legacy-transition-');
  mkSkill(proj, 'gsd-triple-gstack-code-review', OLD_MARKER);
  mkSkill(proj, 'crew-gsd-review', NEW_MARKER);
  mkSkill(proj, 'unmanaged-skill', '.some-other-marker');

  // 두 명령의 소유 범위는 겹치지 않는다. uninstall 은 현행 브랜드만 본다.
  const r = cp.spawnSync(process.execPath, [CLI, 'uninstall', '--yes', '--project', proj], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, `uninstall failed: ${r.stderr || r.stdout}`);
  assert.deepStrictEqual(fs.readdirSync(path.join(proj, '.claude', 'skills')).sort(),
    ['gsd-triple-gstack-code-review', 'unmanaged-skill']);

  // uninstall-legacy 가 구 마커를 가져간다. 남의 마커는 그대로 둔다.
  const { planRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  assert.deepStrictEqual(planRemoval(proj).skills,
    ['.claude/skills/gsd-triple-gstack-code-review']);
});
```

**테스트 3** (`the ship guard the installer removes is the renamed one only`) — 그대로 두면 M1c 이후에도 **초록인 채 아무것도 안 본다.** 구 파일명이 `bin/crew.cjs` 가 아니라 `scripts/legacy-backup.cjs` 에 살기 때문이다. 의미를 되살린다:

```js
test('the legacy ship guard filename lives in the legacy module, not in the installer', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(src.includes('crew-ship-guard.cjs'), 'renamed ship guard filename not found');
  assert.ok(!src.includes('triple-crown-ship-guard.cjs'),
    'the installer must reach the old name through scripts/legacy-backup.cjs, never by copying the literal');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.strictEqual(legacy.SHIP_GUARD, 'triple-crown-ship-guard.cjs');
});
```

**테스트 5** (`the skill ownership marker is the renamed one only`) — 같은 이유로 재타깃한다:

```js
test('the installer stays single-marker; dual-marker knowledge lives in the legacy module', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const SKILL_MARKER = '([^']*)';/m);
  assert.ok(m, 'SKILL_MARKER declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], NEW_MARKER);
  assert.ok(!src.includes(OLD_MARKER),
    'the old marker literal must not be copied into the installer');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.deepStrictEqual(legacy.LEGACY_SKILL_MARKERS, [OLD_MARKER]);
  assert.ok(legacy.SKILL_MARKERS.includes(NEW_MARKER),
    'backup still captures both markers — removal is what narrows to the old one');
});
```

파일 상단 주석의 표(`설치자 상수 / 구 설치본이 남긴 것 / 결과`)도 **지금 상태를 적도록 고친다** — characterization 테스트의 값은 주석이 사실을 말하는 데 있다.

- [ ] **Step 9: 전체 L1**

Run: `npm run test:l1 2>&1 | tail -5`

기대: **`fail 0`, 총 127** — 107(기준) + 5(Task 1) + 9(Task 2) + 6(Task 3). legacy-transition 의 세 건은 **교체**라 수가 늘지 않는다. 산술이 안 맞으면 **세어 보고 이 줄을 고친다 — 맞추려고 테스트를 지우지 않는다.**

- [ ] **Step 10: 커밋**

```bash
git add scripts/uninstall-legacy.cjs bin/crew.cjs \
        e2e/contract/uninstall-legacy.test.cjs e2e/contract/legacy-transition.test.cjs
git commit -m "feat: add crew uninstall-legacy behind a verified backup gate"
```

---

### Task 4: 구 ship guard 등록을 인식·병합

**Files:**
- Modify: `scripts/install-claude-ship-guard.cjs:15-17` (`isGuardHook`)
- Modify: `e2e/contract/legacy-transition.test.cjs` (네 번째 테스트 반전 + 일관성 테스트 추가)

**Interfaces:**
- Consumes: Task 1 의 `legacy.SHIP_GUARD` (테스트에서만 — 스크립트 자신은 require 하지 않는다).
- Produces: 없음 (동작 수정).

> **오늘의 결함.** [`isGuardHook`](../../../scripts/install-claude-ship-guard.cjs#L15) 는 `'crew-ship-guard.cjs'` 부분 문자열만 찾는다. `'triple-crown-ship-guard.cjs'` 는 `-crown-` 이지 `-crew-` 가 아니라 그 부분 문자열을 **포함하지 않는다.** 그래서 `migrateLegacyRegistrations(:25)` 가 구 등록을 못 알아보고, `sameHookGroup(:18)` 도 정확히 일치하는 그룹만 찾으므로 새 그룹이 따로 붙는다. 결과: `PreToolUse` 그룹 2개 — **Bash 호출마다 옛 가드와 새 가드가 모두 실행된다.**

- [ ] **Step 1: 특성 테스트를 반전한다 (적색)**

`legacy-transition.test.cjs` 의 네 번째 테스트를 통째로 교체한다:

```js
test('a pre-M1a ship guard registration is migrated in place — one hook group, not two', () => {
  // M1a 시점에는 isGuardHook() 이 'crew-ship-guard.cjs' 만 찾아 구 등록을 못 알아봤고,
  // 그래서 새 그룹이 따로 붙어 Bash 호출마다 두 가드가 돌았다. M1c 가 구 파일명을
  // 같은 술어에 합류시켜 in-place 치환으로 되돌린다.
  const proj = tempDir('crew-legacy-transition-');
  const claudeDir = path.join(proj, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const legacyCommand = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/triple-crown-ship-guard.cjs"';
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: {
      PreToolUse: [
        { matcher: 'Bash', hooks: [{ type: 'command', command: legacyCommand }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/unrelated.cjs' }] },
      ],
    },
  }, null, 2));

  const guardScript = path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs');
  const r = cp.spawnSync(process.execPath, [guardScript, proj], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, `guard install failed: ${r.stderr || r.stdout}`);

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  const commands = settings.hooks.PreToolUse.map((g) => g.hooks[0].command);
  assert.strictEqual(commands.filter((c) => c.includes('ship-guard')).length, 1,
    'exactly one ship guard registration must remain');
  assert.ok(commands.some((c) => c.includes('crew-ship-guard.cjs')), 'it must be the renamed one');
  assert.ok(!commands.some((c) => c.includes('triple-crown-ship-guard.cjs')), 'the old command must be gone');
  assert.ok(commands.includes('node /home/u/unrelated.cjs'), "someone else's Bash hook must survive");
});

test('the guard installer and the legacy module agree on the old filename', () => {
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs'), 'utf8');
  const legacy = require(path.join(ROOT, 'scripts', 'legacy-backup.cjs'));
  assert.ok(src.includes(legacy.SHIP_GUARD),
    `install-claude-ship-guard.cjs must recognise ${legacy.SHIP_GUARD}`);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test e2e/contract/legacy-transition.test.cjs 2>&1 | grep -E '^# (pass|fail)'`

기대: `# fail 2` — 반전한 테스트가 `exactly one ship guard registration must remain` 에서 2 를 보고 죽고, 새 일관성 테스트가 문자열 부재로 죽는다.

- [ ] **Step 3: 술어를 넓힌다**

`scripts/install-claude-ship-guard.cjs:15-17` 교체:

```js
// 이 스크립트는 설치자의 하위 프로세스로 독립 실행되므로 legacy-backup.cjs 를 require
// 하지 않는다. 대신 인식 대상 파일명을 여기 한 곳에 모은다. scripts/legacy-backup.cjs 의
// SHIP_GUARD 와 같은 값이며, 두 값이 갈라지면 e2e/contract/legacy-transition.test.cjs 의
// "agree on the old filename" 테스트가 잡는다.
const GUARD_FILENAMES = ['crew-ship-guard.cjs', 'triple-crown-ship-guard.cjs'];
function isGuardHook(h) {
  if (!h || h.type !== 'command') return false;
  const cmd = String(h.command || '');
  return GUARD_FILENAMES.some((name) => cmd.includes(name));
}
```

나머지는 그대로다 — `migrateLegacyRegistrations(:25)` 가 이미 `isGuardHook(h) && h.command !== command` 로 in-place 치환을 하고, `sameHookGroup(:18)` 이 그 뒤 중복 push 를 막는다. **한 함수만 바뀐다.**

- [ ] **Step 4: 녹색 + 회귀 확인**

```bash
node --test e2e/contract/legacy-transition.test.cjs 2>&1 | grep -E '^# (pass|fail)'
npm run test:l1 2>&1 | tail -4
python tests/run_installer_smoke.py; echo "installer smoke exit=$?"
python tests/run_bash_installer_smoke.py; echo "bash installer smoke exit=$?"
```

기대: transition 파일 `# fail 0`, 전체 L1 **128** (127 + 신규 일관성 테스트 1; 반전한 것은 교체라 수가 안 는다), 스모크 둘 다 `exit=0`.

> `removeShipGuard`([`bin/crew.cjs:466`](../../../bin/crew.cjs#L466))는 **일부러 안 고친다.** 그건 `crew uninstall` 의 일부이고 현행 브랜드만 지운다. 구 등록의 제거는 Task 3 의 `applyRemoval` 4번이 `hasShipGuardGroup` 으로 이미 한다 — 두 명령의 소유 범위는 겹치지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add scripts/install-claude-ship-guard.cjs e2e/contract/legacy-transition.test.cjs
git commit -m "fix: recognise the pre-rename ship guard registration so it migrates instead of doubling"
```

---

### Task 5: capability 업그레이드 원자성

**Files:**
- Modify: `tests/fake-gsd.cjs:17` (실패 주입)
- Modify: `bin/crew.cjs:349` (`installCapabilities` 시그니처) · `:348` 위(`rollbackCapabilities` 신규) · `:630-641` (`install` 의 try/catch)
- Create: `e2e/contract/capability-atomicity.test.cjs`

**Interfaces:**
- Consumes: `bin/crew.cjs` 의 `module.exports = { CAPABILITIES }` (M1b 산출물).
- Produces:
  - `installCapabilities(root,runner,opts,touched=[])` — `touched` 에 이번 실행에서 손댄 id 가 순서대로 쌓인다
  - `rollbackCapabilities(root,runner,touched,hadPrevious,opts)` — 던지지 않는다

> **오늘의 결함** (M1b 계획서 "범위 밖" 절): `installCapabilities` 는 id 마다 `remove` → `install` 을 순차로 돈다. 3번째 `install` 에서 죽으면 `tx.restore()`([`:254`](../../../bin/crew.cjs#L254))가 `.crew` **소스만** 되돌린다. 결과는 **원장은 신버전 · 소스는 구버전**인 반쪽 상태이고 사용자가 손으로 치워야 한다. M2 가 `crew-flow` 를 더하면 표면이 5개로 늘어 확률이 커진다.

- [ ] **Step 1: `tests/fake-gsd.cjs` 에 실패 주입**

`:17` 의 install 분기, `const m=JSON.parse(...)` 바로 아래에 3줄:

```js
  // 테스트 전용 실패 주입. 원자성 계약을 검증하려면 "N번째 설치에서 죽는" 상황이
  // 결정적으로 재현돼야 한다.
  if(process.env.FAKE_GSD_FAIL_INSTALL===m.id){
    console.error(`fake-gsd: injected failure installing ${m.id}`); process.exit(1);
  }
```

- [ ] **Step 2: 실패 테스트를 쓴다**

`e2e/contract/capability-atomicity.test.cjs` 신규:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const FAKE_GSD = path.join(ROOT, 'tests', 'fake-gsd.cjs');
const { CAPABILITIES } = require(CLI);

// tests/run_installer_smoke.py 와 같은 픽스처 구성: 임시 HOME 에 최소 gstack 레이아웃을
// 심고 --no-bootstrap 으로 탐지 단계를 통과시킨다.
function mkFixture() {
  const base = tempDir('crew-atomicity-');
  const home = path.join(base, 'home');
  const proj = path.join(base, 'project');
  fs.mkdirSync(proj, { recursive: true });
  const gs = path.join(home, '.claude', 'skills', 'gstack');
  fs.mkdirSync(gs, { recursive: true });
  fs.writeFileSync(path.join(gs, 'setup'), '#!/usr/bin/env bash\nexit 0\n');
  for (const s of ['review', 'qa-only', 'cso', 'canary', 'document-release', 'retro', 'plan-eng-review']) {
    const d = path.join(home, '.claude', 'skills', s);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'SKILL.md'), `---\nname: ${s}\n---\n`);
  }
  const git = (...a) => cp.spawnSync('git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-C', proj, ...a]);
  git('init', '-q');
  git('commit', '-q', '--allow-empty', '-m', 'base');
  return { home, proj };
}

function install(fx, extraEnv) {
  return cp.spawnSync(process.execPath,
    [CLI, 'install', '--project', fx.proj, '--yes', '--no-bootstrap', '--allow-prerelease'],
    {
      encoding: 'utf8', timeout: 180000,
      env: {
        ...process.env, HOME: fx.home, USERPROFILE: fx.home,
        CREW_GSD_BIN: FAKE_GSD, CREW_ALLOW_UNSUPPORTED_NODE: '1', ...extraEnv,
      },
    });
}

function ledger(proj) {
  const p = path.join(proj, '.fake-gsd-capabilities.json');
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

test('a mid-loop failure on a fresh install leaves no capability registered', () => {
  const fx = mkFixture();
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });   // 앞의 둘은 이미 성공한 뒤다
  assert.notStrictEqual(r.status, 0, 'the install must fail');
  assert.deepStrictEqual(ledger(fx.proj).map((x) => x.id), [],
    'a fresh install that failed halfway must leave the ledger empty, not partly populated');
  assert.ok(!fs.existsSync(path.join(fx.proj, '.crew')),
    'the managed source directory must not survive a failed fresh install');
});

test('a failed upgrade rolls the ledger back to the previous generation, not a mix', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0, 'baseline install must succeed');
  const before = ledger(fx.proj).map((x) => `${x.id}:${x.version}`).sort();
  assert.ok(before.length, 'baseline ledger must not be empty');

  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });
  assert.notStrictEqual(r.status, 0, 'the upgrade must fail');

  assert.deepStrictEqual(ledger(fx.proj).map((x) => `${x.id}:${x.version}`).sort(), before,
    'every capability must be back on the generation installed before the failed run');
  assert.ok(fs.existsSync(path.join(fx.proj, '.crew', 'VERSION')),
    'the previous managed source must be restored');
});

test('a failed install tells the user how to get back to a consistent state', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0);
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[1] });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Rolled the capability ledger back|crew install|capability remove/,
    'the failure output must name either the rollback that happened or the repair path');
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test e2e/contract/capability-atomicity.test.cjs 2>&1 | grep -E '^# (pass|fail)'`

기대: `# fail 2` 이상. 첫째는 원장에 성공한 2개가 남아서, 둘째는 원장이 신·구 혼합이라서 죽는다.

- [ ] **Step 4: `touched` 기록**

`installCapabilities` (`:349`) 시그니처와 루프 한 줄:

```js
function installCapabilities(root,runner,opts,touched=[]) {
  let list=[];
  const before=gsdTry(runner,['capability','list','--scope','project'],root);
  if(before.code===0) list=parseCapabilityList(before.stdout);
  for(const id of CAPABILITIES) {
    const old=list.find(x=>x.id===id && x.scope==='project');
    log(old ? `Refreshing ${id}...` : `Installing ${id}...`);
    touched.push(id);                       // 여기서부터 이 id 는 이번 실행의 책임이다
    // …이하 기존 본문 그대로
```

- [ ] **Step 5: `rollbackCapabilities` 추가**

`installCapabilities` 바로 위에:

```js
// 실패한 설치가 남긴 원장을 소스와 같은 세대로 되돌린다.
//
// tx.restore() 는 .crew 소스만 되돌리므로 그것만으로는 "원장은 신버전 · 소스는 구버전"인
// 반쪽 상태가 남는다. 이전 설치본이 있었으면(hadPrevious) 되돌린 소스로 다시 등록하고,
// 없었으면(fresh) 이번에 손댄 것을 전부 지운다.
//
// 이 함수는 던지지 않는다 — 원래 실패를 덮어쓰면 사용자가 진짜 원인을 못 본다.
// 되돌리기에 실패하면 무엇을 손으로 해야 하는지 알린다.
function rollbackCapabilities(root,runner,touched,hadPrevious,opts) {
  if(!touched.length) return;
  if(!runner) {
    warn(`Install failed after touching: ${touched.join(', ')}. GSD CLI is unavailable, so the `+
      'capability ledger could not be rolled back. Re-run `crew install` once GSD is reachable.');
    return;
  }
  const stuck=[];
  for(const id of [...touched].reverse()) {
    const rem=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
    if(rem.code!==0 && opts.verbose) warn(`rollback remove ${id}: ${(rem.stderr||rem.stdout).trim()}`);
    if(!hadPrevious) continue;
    const re=gsdTry(runner,['capability','install',`./.crew/capabilities/${id}`,'--scope','project','--yes'],root);
    if(re.code!==0) stuck.push(id);
  }
  if(stuck.length) {
    warn(`Rollback could not reinstate: ${stuck.join(', ')}. Run \`crew install\` again, or remove `+
      'them with `gsd-tools capability remove <id> --scope project` and reinstall.');
  } else {
    log(hadPrevious
      ? 'Rolled the capability ledger back to the previously installed generation.'
      : 'Removed the partially installed capabilities left by the failed run.');
  }
}
```

- [ ] **Step 6: `install()` 의 try/catch 를 갈아 끼운다**

`:630` 부근의 `const tx=prepareStableSource(root);` 부터 `catch(err){ tx.restore(); throw err; }` 까지:

```js
  const tx=prepareStableSource(root);
  // restore() 가 backup 을 dest 로 rename 하므로 이 값은 반드시 restore 전에 읽어야 한다.
  // 뒤에 읽으면 항상 false 가 되고, 업그레이드 실패가 롤백 대신 "전부 제거"로 끝난다.
  const hadPrevious=exists(tx.backup);
  const touched=[];
  try {
    const rows=installCapabilities(root,gsd,opts,touched);
    const skills=installProjectSkills(root);
    if(opts.routing) installRouting(root);
    if(opts.shipGuard) installShipGuard(root,opts);
    tx.commit();
    // …이하 성공 로그 그대로
  } catch(err) {
    tx.restore();                                    // 소스를 먼저 되돌린다
    rollbackCapabilities(root,gsd,touched,hadPrevious,opts);   // 그다음 원장을 맞춘다
    throw err;
  }
```

- [ ] **Step 7: 녹색 확인**

```bash
node --test e2e/contract/capability-atomicity.test.cjs 2>&1 | grep -E '^# (pass|fail)'
npm run test:l1 2>&1 | tail -4
python tests/run_installer_smoke.py;     echo "installer exit=$?"
python tests/run_installed_lib_smoke.py; echo "installed-lib exit=$?"
```

기대: 신규 `# fail 0`, 전체 L1 **131** (128 + 3), 스모크 둘 다 `exit=0`.

- [ ] **Step 8: 실제 GSD 로 성공 경로가 여전히 도는지 본다**

fake-gsd 는 실패 주입에 충분하지만 성공 경로의 증거가 아니다 (M1b 가 "mock 이 초록이라는 사실은 증거가 아니다"를 실측으로 배웠다):

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
node bin/crew.cjs doctor  --project "$PROJ" | tail -1
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
node bin/crew.cjs doctor  --project "$PROJ" | tail -1
```

기대: 두 줄 모두 `READY=true PASS=18 WARN=0 FAIL=0`. 두 번째 줄이 다르면 재설치 경로가 깨진 것이다.

- [ ] **Step 9: 커밋**

```bash
git add bin/crew.cjs tests/fake-gsd.cjs e2e/contract/capability-atomicity.test.cjs
git commit -m "fix: roll the capability ledger back with the source when an install fails midway"
```

---

### Task 6: Windows L1 잡 + `tc-*` 접두사 개명

**Files:**
- Modify: `tests/run_bash_installer_smoke.py:17` · `tests/run_guide_smoke.py:22` · `tests/run_npx_tarball_smoke.py:17` · `tests/run_installer_smoke.py:16` · `tests/run_local_smoke.py:24`
- Modify: `.github/workflows/l1.yml`

**Interfaces:** 없음 (인프라).

- [ ] **Step 1: `tc-` 접두사를 바꾼다 — 기계적 치환**

M1a 에서 이월된 항목이다. 다섯 곳뿐이다:

```bash
grep -rn 'prefix="tc-' tests/
sed -i 's/prefix="tc-/prefix="crew-/' \
  tests/run_bash_installer_smoke.py tests/run_guide_smoke.py \
  tests/run_npx_tarball_smoke.py tests/run_installer_smoke.py tests/run_local_smoke.py
grep -rn 'prefix="' tests/
```

기대: 다섯 줄 전부 `prefix="crew-…"`. 남은 `tc-` 가 있으면 멈춘다:

```bash
grep -rn "tc-" --include=*.py --include=*.cjs --include=*.yml . | grep -v node_modules | grep -v '\.git/'
```

- [ ] **Step 2: 스모크 6종이 여전히 도는지 확인**

```bash
for t in run_installer_smoke run_installed_lib_smoke run_bash_installer_smoke \
         run_v061_l0 run_local_smoke run_guide_smoke; do
  python tests/$t.py >/dev/null 2>&1; echo "$t exit=$?"
done
```

기대: 여섯 줄 전부 `exit=0`. **파이프 뒤의 `$?` 를 읽지 않는다** — M1b 에서 그것 때문에 한 번 틀렸다. 위 형태는 `>/dev/null` 리다이렉트만 있고 파이프가 없으므로 `$?` 가 python 의 것이다.

- [ ] **Step 3: 커밋 (개명 단독)**

```bash
git add tests/
git commit -m "chore: rename the tc- temp directory prefix to crew-"
```

- [ ] **Step 4: Windows 러너를 추가한다**

`.github/workflows/l1.yml` 의 `contract` 잡만 matrix 로 바꾼다. `smoke` 잡은 건드리지 않는다:

```yaml
jobs:
  contract:
    name: contract (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      # 외부 의존성이 0개라 lockfile 이 없다 — `npm ci` 는 실패한다. 설치 단계 자체가 없다.
      - name: shared lib copies are in sync
        run: node scripts/build-capabilities.cjs --check
      - name: L1 contract
        run: npm run test:l1
```

파이썬 스모크 6종은 `tar`·`bash`·`chmod`·POSIX 경로를 가정한다. Windows 로 넓히면 이 태스크가 M1c 전체보다 커진다 — **범위 밖**이며 아래 절에 소유자를 적는다.

- [ ] **Step 5: 로컬에서 가능한 만큼 Windows 위험을 줄인다**

이 저장소는 WSL 위에 있어 로컬에서 Windows 러너를 재현할 수 없다. 푸시 없이 실행 결과를 볼 방법이 없으므로 **Windows 잡의 첫 결과는 M1c 완료 판정에서 제외한다**(Task 7 Step 3 에 반영). 대신 정적으로 확인한다:

```bash
grep -rn "os.tmpdir()\|'/tmp'\|\"/tmp\"" e2e/contract/*.cjs e2e/contract/helpers/*.cjs
grep -rn "\.split('/')\|join('/')" e2e/contract/*.cjs e2e/contract/helpers/*.cjs
```

- 파일시스템에 닿는 경로는 전부 `path.join` 을 거쳐야 한다.
- **매니페스트 키로 쓰는 상대 경로 문자열**(`'.claude/skills/…'` 등)은 슬래시가 맞다 — 이건 데이터이지 경로 조립이 아니다. `collectTargets` 가 `rel` 을 만들 때와 `applyRemoval` 이 `path.join(plan.root, rel)` 로 되돌릴 때만 변환된다. Windows 에서 `path.join` 은 슬래시를 받아들이므로 동작한다.
- `mkFakeHome()` 를 쓰는 테스트는 `HOME` 과 `USERPROFILE` 을 **둘 다** 설정한다 (Task 1·3 의 테스트 코드가 이미 그렇다). Windows 의 `os.homedir()` 는 `USERPROFILE` 을 본다.

> **예측이며 실측이 아닌 위험 3종** (그래서 완료 판정에서 뺀다):
> - `legacy-backup.cjs` 의 `tar` 호출 — Windows 러너에 GNU tar 는 있으나 경로 구분자·심볼릭 링크 처리가 다르다.
> - `fs.rmSync(recursive)` 가 열린 핸들 때문에 `EBUSY` 를 낼 수 있다. `repo.cjs` 의 `process.on('exit')` 청소는 이미 `try/catch` 로 감싸여 조용히 넘어간다.
> - `node --test "e2e/contract/**/*.test.cjs"` 의 glob 은 Node 가 직접 해석하므로 셸 차이는 없다 — 그러나 따옴표를 벗기는 것은 PowerShell 이다. 실패하면 `npm run test:l1` 의 인용 형태를 본다.

- [ ] **Step 6: 커밋**

```bash
git add .github/workflows/l1.yml
git commit -m "ci: run the L1 contract suite on windows as well as ubuntu"
```

---

### Task 7: M1c 완료 판정 · 문서 · 롤백 태그

**Files:** 검증 전용. 마지막에 `docs/V0.7-IMPLEMENTATION-DESIGN.md` · `docs/RENAME-MAP.md` 갱신과 태그 하나.

**Interfaces:**
- Consumes: Task 1~6 의 커밋.
- Produces: 태그 `v0.7.0-m1c`.

- [ ] **Step 1: 설계 §2.4 의 제거 판정을 픽스처에서 그대로 돌린다**

설계서의 완료 판정은 실제 홈을 대상으로 쓰여 있다. **이 머신에는 레거시가 없고(실측 0), 있어도 지우지 않는다.** 픽스처에서 같은 판정을 돌린다:

```bash
node -e '
const fs=require("fs"),path=require("path"),cp=require("child_process");
const {mkFakeHome}=require("./e2e/contract/helpers/fake-home.cjs");
const root=mkFakeHome();
const dest=path.join(path.dirname(root),"backup-"+process.pid);
const b=cp.spawnSync(process.execPath,["scripts/legacy-backup.cjs","backup","--root",root,"--dest",dest],{encoding:"utf8"});
console.log("backup exit="+b.status);
const r=cp.spawnSync(process.execPath,["bin/crew.cjs","uninstall-legacy","--project",root,"--from",dest,"--yes"],
  {encoding:"utf8",env:{...process.env,CREW_GSD_BIN:path.resolve("tests/fake-gsd.cjs")}});
console.log(r.stdout,r.stderr,"remove exit="+r.status);
const has=(p)=>fs.existsSync(path.join(root,p));
console.log("vendor:",has(".triple-crown"),"hook:",has(".claude/hooks/triple-crown-ship-guard.cjs"));
console.log("skills:",fs.readdirSync(path.join(root,".claude/skills")));
const md=fs.readFileSync(path.join(root,"CLAUDE.md"),"utf8");
console.log("marker:",md.includes("triple-crown:managed-routing"),"user line kept:",md.includes("user line kept"));
'
```

기대: `backup exit=0`, `remove exit=0`, `vendor: false`, `hook: false`, `skills: []`, `marker: false`, `user line kept: true`.

- [ ] **Step 2: 되돌릴 수 있음의 판정 (설계 §2.4 후반)**

제거한 뒤 같은 백업이 여전히 무결하고 복구 리허설이 도는지 본다. 이것이 백업 게이트가 실제로 의미 있었다는 증명이다:

```bash
node -e '
const path=require("path"),cp=require("child_process");
const {mkFakeHome}=require("./e2e/contract/helpers/fake-home.cjs");
const root=mkFakeHome();
const dest=path.join(path.dirname(root),"backup-restore-"+process.pid);
cp.spawnSync(process.execPath,["scripts/legacy-backup.cjs","backup","--root",root,"--dest",dest]);
cp.spawnSync(process.execPath,["bin/crew.cjs","uninstall-legacy","--project",root,"--from",dest,"--yes"],
  {env:{...process.env,CREW_GSD_BIN:path.resolve("tests/fake-gsd.cjs")}});
const v=cp.spawnSync(process.execPath,["scripts/legacy-backup.cjs","verify","--from",dest],{encoding:"utf8"});
console.log("verify exit="+v.status,v.stdout.trim());
const d=cp.spawnSync(process.execPath,["scripts/legacy-backup.cjs","restore","--from",dest,"--root",root,"--dry-run"],{encoding:"utf8"});
console.log("restore --dry-run exit="+d.status);
console.log(d.stdout);
'
```

기대: `verify exit=0` + `verify OK: N entries match archive`, `restore --dry-run exit=0` 이고 복구 대상 목록이 출력된다.

> `Error: unknown option: --root` 가 나오면 Task 1 Step 4 의 `restore` 배선이 빠진 것이다.

- [ ] **Step 3: 전체 회귀 — L1 · 파이썬 스모크 · 패키징 · 빌드**

```bash
npm run test:l1 2>&1 | tail -5
for t in run_installer_smoke run_installed_lib_smoke run_bash_installer_smoke \
         run_v061_l0 run_local_smoke run_guide_smoke; do
  python tests/$t.py >/dev/null 2>&1; echo "$t exit=$?"
done
npm run test:pack 2>&1 | tail -5
node scripts/build-capabilities.cjs --check; echo "build:caps check exit=$?"
```

기대: L1 `fail 0` (총 **131** — 107 + 5 + 9 + 6 + 1 + 3), 스모크 6종 전부 `exit=0`, `test:pack` 통과, `build:caps check exit=0`.

**Windows L1 잡의 첫 실행 결과는 이 판정에 포함하지 않는다** (Task 6 Step 5). 첫 실패는 M1d 가 받는 수정 대상이지 M1c 회귀가 아니다.

> `build:caps --check` 가 0 이 아니면 이 마일스톤이 `capabilities/**` 를 건드린 것이다 — Global Constraints 위반이다. `git diff --stat v0.7.0-m1b HEAD -- capabilities` 로 보고 되돌린다.

- [ ] **Step 4: 실제 GSD 왕복 — M1b 판정이 여전히 유효한지**

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
ls "$PROJ/.claude/skills" | tr '\n' ' '; echo
find "$PROJ/.claude/skills" -name '.crew-skill' | wc -l
ls "$PROJ/.gsd/capabilities" | tr '\n' ' '; echo
node bin/crew.cjs doctor --project "$PROJ" | tail -1
node bin/crew.cjs uninstall --project "$PROJ" --yes >/dev/null
ls "$PROJ/.claude/skills" 2>/dev/null; ls -d "$PROJ/.crew" 2>/dev/null; echo "(위 두 줄은 비어 있어야 한다)"
```

기대: 스킬 6개(`crew-gsd crew-gsd-postship crew-gsd-qa crew-gsd-release crew-gsd-review crew-gsd-sec`) · 마커 6 · capability 4개 · `READY=true PASS=18 WARN=0 FAIL=0` · 제거 후 잔여 없음.

- [ ] **Step 5: 커밋에 계획 밖의 것이 섞이지 않았는지**

```bash
git diff --stat v0.7.0-m1b HEAD -- . ':!docs'
git diff --name-only v0.7.0-m1b HEAD -- capabilities lib guards
```

기대: 첫 명령의 목록이 이 계획의 File Structure 표와 일치. 두 번째는 **빈 출력** — M1c 는 capability·공유 lib·가드를 건드리지 않는다.

- [ ] **Step 6: 설계서와 매핑 문서를 고친다**

`docs/V0.7-IMPLEMENTATION-DESIGN.md`:

- §5 표의 M1c 행 → 범위 `crew uninstall-legacy 명령 + M1a·M1b 이월 부채(구 ship guard 등록 병합 · capability 업그레이드 원자성 · Windows L1 · tc-* 개명)`, 통과 조건 `픽스처에 구 설치를 심고 6곳 제거 + 사용자 작성분 보존 확인, 설치 실패 주입 시 원장·소스 세대 일치`
- §6 L1 표의 `uninstall-legacy` 행 내용 → `구 설치 6곳 제거 · 사용자 작성분 보존 · 백업 미검증 시 거부 · --global 없이 홈 무접촉`
- §9 위험 표에 두 행 추가:
  - `레거시 제거가 사용자 소유 설정을 침범` / `SEMANTIC 대상은 마커 쌍·훅 그룹만 술어로 제거(§2.5.1과 같은 원리), L1 보존 단언 3종`
  - `설치 실패가 원장과 소스를 다른 세대로 남김` / `rollbackCapabilities — tx.restore() 후 touched 재설치, L1 capability-atomicity 3종`
- 개정 이력에 한 줄: `v1.5 (2026-08-22): M1c 범위 확정 — uninstall-legacy 계약(기본 프로젝트 스코프 · 백업 게이트 필수) 기록, M1a·M1b 이월 3건 흡수(§5·§6·§9)`

`docs/RENAME-MAP.md` 하단에 M1c 절을 더한다 — 구 설치를 어떤 명령으로 지우는지, 왜 `crew uninstall` 과 분리돼 있는지, 백업이 왜 필수인지, 그리고 **왜 이 저장소의 개발 머신에서는 한 번도 실행하지 않았는지**(실측 레거시 0).

```bash
git add docs/V0.7-IMPLEMENTATION-DESIGN.md docs/RENAME-MAP.md
git commit -m "docs: record the M1c removal contract and the debts it settles"
npm run test:l1 2>&1 | tail -4
```

> `brand-names.test.cjs` 의 허용목록에 `docs/RENAME-MAP.md` 가 이미 있다. 설계서도 `crew-*` 이름을 쓰므로 같은 이유로 안전하다 — 아니면 허용목록을 확인한다.

- [ ] **Step 7: 태그**

```bash
git tag -a v0.7.0-m1c -m "M1c: crew uninstall-legacy behind a verified backup gate; ship guard migration, atomic capability upgrade, windows L1"
git tag | tail -5
git status --short; echo "(끝 — 비어 있어야 한다)"
```

기대: `v0.6.5` · `v0.7.0-m0` · `v0.7.0-m1a` · `v0.7.0-m1b` · `v0.7.0-m1c`. **push 하지 않는다.**

---

## 범위 밖으로 남긴 것

발견했지만 M1c 에서 하지 않는 것들. 전부 소유자를 적었다.

- **파이썬 스모크 6종의 Windows 잡.** `tar`·`bash`·`chmod`·POSIX 경로를 가정한다. 넓히면 M1c 보다 큰 일이 된다. 소유자: M7 릴리스 전 (또는 별도 승인 게이트).
- **Windows L1 잡의 첫 실행 결과.** 로컬에서 재현 불가라 완료 판정에서 뺐다. 소유자: M1d.
- **`crew doctor` 의 레거시 잔여 검사.** "구 설치가 아직 있다"를 doctor 가 경고하면 좋지만 doctor 신규 검사는 M1d 소관이다(설계 §5.2). 소유자: M1d.
- **`crew-security` 분리.** GSD 1.11.0 단일 항목 capMap. 소유자: 상류 수정 후.
- **config 키 재명명** (`crew.gstack.*` → `crew.review.*` 등). M1b 에서 이월. 소유자: M1d 또는 M7 릴리스 노트.
- **tier 값을 설계 §5.1 에 맞추기.** 소비처 0. 소유자: M1d.
- **`capabilities/crew-guide/checks/workflow-guide.cjs` 의 교차 capability 경로 추측.** 소유자: M1d.
- **`gsd-core` 의 단일 항목 capMap 을 상류에 보고.** 소유자: 사용자.
- **`uninstall-legacy` 의 실사용 검증.** 이 머신에 레거시가 없어 픽스처로만 검증한다. 실제 구 설치본이 남은 머신을 만나면 그때가 첫 실전이다. 소유자: 사용자(그런 머신을 만났을 때).

## 리뷰 반영 — 확정 변경 (2026-08-22 `/plan-eng-review`)

> **실행자 필독.** 아래 12건은 리뷰에서 확정된 변경이다. 위 Task 1~7 본문과 충돌하면
> **이 절이 이긴다.** 각 항목에 소속 태스크를 적었다.

### R1 (Task 1) — `legacy-backup.cjs` 의 `fail()` 을 던지게 바꾼다

`fail()` 은 `process.exit()` 한다([`:46`](../../../scripts/legacy-backup.cjs#L46)). 그래서 Task 2 의
`checkBackup` 이 `verifyArchive` 를 `try/catch` 로 감싸도 아무것도 못 잡는다 — 손상된
`archive.tar.gz` 는 [`extractArchive:262`](../../../scripts/legacy-backup.cjs#L262) 에서
`fail('tar extract failed: …', 2)` 로 **프로세스를 끝낸다.** `node:test` 워커가 통째로 죽어
`# fail 1` 이 아니라 파일 크래시가 난다. 라이브러리 호출에서 도달하는 `process.exit` 는 넷:
`extractArchive:262` · `verifyArchive:268` · `verifyArchive:270` ·
`extractHookGroup:184`(`opts.tolerant` 로 막히지 **않는다**).

`bin/crew.cjs:30` 과 같은 모양으로 통일한다:

```js
function fail(msg, code = 1) {
  const e = new Error(msg);
  e.exitCode = code;
  throw e;
}
```

Task 1 Step 3 의 `require.main` 블록이 CLI 계약을 그대로 재현한다:

```js
if (require.main === module) {
  process.on('uncaughtException', (e) => {
    flushPendingActions();
    cleanup();
    process.stderr.write(`legacy-backup: ${(e && e.message) || e}\n`);
    process.exit((e && e.exitCode) || 2);
  });
  const opts = parseArgs(process.argv.slice(2));
  ...
}
```

> `fail()` 안에서 돌던 `flushPendingActions()`·`cleanup()` 이 핸들러로 옮겨간다.
> **그 두 줄을 빠뜨리면** `restore` 가 홈을 교체한 뒤 죽었을 때 롤백 디렉터리 위치가
> 어디에도 안 나온다 — [`:52`](../../../scripts/legacy-backup.cjs#L52) 주석이 말하는 그 사고다.
> `legacy-backup.test.cjs`(842줄)가 종료 코드와 stdout 을 둘 다 단언하므로 어긋나면 즉시 빨개진다.

**추가 테스트** (`legacy-module.test.cjs`, Task 1 Step 1 에 붙인다):

```js
test('library calls throw instead of exiting the host process', () => {
  const probe = `
    const legacy = require(${JSON.stringify(MODULE)});
    let thrown = null;
    try { legacy.verifyArchive('/definitely/not/a/backup'); }
    catch (e) { thrown = { message: e.message, exitCode: e.exitCode }; }
    console.log(JSON.stringify({ thrown, alive: true }));
  `;
  const r = cp.spawnSync(process.execPath, ['-e', probe], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0,
    'verifyArchive must not end the process — checkBackup depends on catching this');
  const out = JSON.parse(r.stdout);
  assert.ok(out.thrown, 'verifyArchive must throw on a missing MANIFEST.json');
  assert.strictEqual(out.thrown.exitCode, 2, 'the CLI exit code must survive as e.exitCode');
});
```

### R2 (Task 1) — `restore` 의 루트는 `:524` 한 줄이 정한다

`restore()` 안에서 `home` 은 **8곳**에 쓰인다: `:524` 선언 · `:531` `assertRestoreHome` ·
`:540-541` 탈출 검사 · `:571` 표시 · `:576` `applyRestore` · `:578` `restoreClaudeMd` ·
`:579` `restoreSettings`. 계획서 Task 1 Step 4 는 `assertRestoreHome` 하나만 지목했다.
그것만 고치면 **프로젝트 루트로 검증하고 `$HOME` 에 쓴다.** 고칠 곳은 선언 한 줄이다:

```js
function restore(opts) {
  const home = opts.root ? path.resolve(opts.root) : os.homedir();
```

나머지 7곳은 그대로 따라온다. **개별로 고치지 않는다.**

**추가 테스트** (`legacy-module.test.cjs`):

```js
test('restore --root writes into that root and leaves $HOME untouched', () => {
  const proj = mkFakeHome();
  const home = mkFakeHome();                       // 대조군 — 한 바이트도 안 바뀌어야 한다
  const dest = path.join(tempDir('crew-restore-'), 'out');
  assert.strictEqual(cp.spawnSync(process.execPath,
    [MODULE, 'backup', '--root', proj, '--dest', dest], { encoding: 'utf8', timeout: 60000 }).status, 0);

  fs.rmSync(path.join(proj, '.triple-crown'), { recursive: true, force: true });
  const homeBefore = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');

  const r = cp.spawnSync(process.execPath, [MODULE, 'restore', '--from', dest, '--root', proj], {
    encoding: 'utf8', timeout: 60000,
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(fs.existsSync(path.join(proj, '.triple-crown', 'VERSION')), 'restored into --root');
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), homeBefore,
    '$HOME must be untouched when --root points elsewhere');
});
```

### R3 (Task 1·Task 2) — 개명 펜스 허용목록을 파일 만드는 태스크에서 각각 닫는다

[`brand-names.test.cjs:13`](../../../e2e/contract/brand-names.test.cjs#L13) 의 `LEGACY` 정규식이
`triple-crown|triple-gstack|…|Triple\s+Crown` 을 잡고, `ALLOW`(`:18`)에 없는 추적 파일에 그
토큰이 있으면 L1 이 빨개진다. 옆 테스트 `'the allowlist is alive'`(`:84`)는 **허용목록의 모든
항목이 실제로 레거시 이름을 가질 것**을 요구하므로 아직 없는 파일을 미리 넣을 수 없다.

- **Task 1 Step 7 커밋 전**: `ALLOW` 에 `'e2e/contract/legacy-module.test.cjs'` 추가.
  `git add` 에 `e2e/contract/brand-names.test.cjs` 포함.
- **Task 2 Step 5 커밋 전**: `ALLOW` 에 `'e2e/contract/uninstall-legacy.test.cjs'` 추가.
  `git add` 에 `e2e/contract/brand-names.test.cjs` 포함.
- **`scripts/uninstall-legacy.cjs` 는 허용목록에 넣지 않는다.** 대신 헤더 주석에서
  `Triple Crown` 표현을 뺀다(`개명 전 설치본의 제거.`). 그 파일이 레거시 어휘를 하나도 갖지
  않는다는 것이 이 계획의 아키텍처 주장 그 자체다 — 허용목록에 넣으면 그 주장을 스스로 판다.
- `e2e/contract/capability-atomicity.test.cjs` 는 레거시 토큰이 없다. 허용목록 불필요.

### R4 (Task 3) — `findMarkerRange` 의 `-1` 센티넬을 호출부에서 막는다

[`findMarkerRange:121`](../../../scripts/legacy-backup.cjs#L121) 은 `findIndex` 두 번을 그대로
돌려준다 — **`null` 을 반환하는 경로가 없다.** 마커가 없으면 `{start:-1, end:-1}` 이다.
Task 1 Interfaces 의 `findMarkerRange, // (lines) -> {start,end}|null` 에서 `|null` 을 지운다.
`applyRemoval` 의 `if (range)` 는 언제나 참이라 `splice(-1, 1)` 이 **CLAUDE.md 의 마지막 줄을
지운다.**

또한 `extractFragment:145` 의 `startLine`/`endLine` 은 **1-기반**, `findMarkerRange` 는
**0-기반**이다. `applyRemoval` 은 `findMarkerRange` 쪽을 쓴다 — `plan.routingBlock.startLine` 을
`splice` 에 넣지 않는다.

### R5 (Task 3) — 라우팅 블록을 **전부** 지우고 사후 0건을 단언한다

`findMarkerRange` 는 첫 쌍만 본다. 블록이 둘이면 하나만 지우고 "제거 완료"를 출력한다.
R4 와 합쳐 `applyRemoval` 의 5번 단계를 이 형태로 쓴다:

```js
  // 5. CLAUDE.md 의 마커 블록 — 마커 쌍 사이만. 밖은 사용자 것이다.
  //    findMarkerRange 는 첫 쌍만 보고, 없으면 {start:-1,end:-1} 을 준다(null 아님).
  //    두 사실 중 하나라도 놓치면 사용자 문서가 잘리거나 레거시가 남는다.
  if (plan.routingBlock) {
    say('remove every managed-routing block from CLAUDE.md');
    if (!dry) {
      const p = abs('CLAUDE.md');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      let removed = 0;
      for (;;) {
        const { start, end } = legacy.findMarkerRange(lines);
        if (start === -1 || end === -1 || end < start) break;
        lines.splice(start, end - start + 1);
        removed += 1;
      }
      const text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
      if (text) fs.writeFileSync(p, text + '\n');
      else fs.rmSync(p, { force: true });
      // 사후 조건: 이 명령이 "제거 완료"라고 말하면 마커는 0개다.
      if (removed === 0) failures.push('CLAUDE.md: routing block vanished between plan and apply');
      if (fs.existsSync(p) &&
          legacy.findMarkerRange(fs.readFileSync(p, 'utf8').split('\n')).start !== -1) {
        failures.push('CLAUDE.md: a managed-routing marker survived removal');
      }
    }
  }
```

**추가 테스트 2건** (`uninstall-legacy.test.cjs`). `ROUTING_BLOCK` 은
[`helpers/fake-home.cjs`](../../../e2e/contract/helpers/fake-home.cjs) 가 이미 export 한다:

```js
test('two legacy routing blocks are both removed and nothing survives', () => {
  const root = mkFakeHome();
  const p = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8') + '\n' + ROUTING_BLOCK + '\ntail line\n');
  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  const md = fs.readFileSync(p, 'utf8');
  assert.ok(!md.includes('triple-crown:managed-routing'), 'no marker may survive');
  assert.ok(!md.includes('routing body line'), 'the block body must go with the markers');
  assert.ok(md.includes('user line kept') && md.includes('tail line'), 'user content on both sides');
});

test('the marker range guard tolerates a CLAUDE.md that lost its markers mid-flight', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const plan = planRemoval(root);
  assert.ok(plan.routingBlock, 'fixture must start with a routing block');
  // plan 과 apply 사이에 사용자가 손으로 블록을 지웠다.
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), 'only a user line\n');
  const res = applyRemoval(plan, { runner: null, scope: 'project', run: () => ({ code: 0 }) });
  assert.strictEqual(fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8'), 'only a user line\n',
    'splice(-1, 1) must never reach the file');
  assert.ok(res.failures.some((f) => f.includes('vanished')), res.failures.join('\n'));
});
```

### R6 (Task 3) — settings.json 은 **훅 단위**로 걷어내고 빈 그룹만 버린다

계획서의 `pre.filter((g) => !legacy.hasShipGuardGroup(g))` 는 그룹 안에 레거시 훅이 하나라도
있으면 **그룹 전체**를 버린다 — 같은 그룹의 사용자 훅이 함께 사라진다. 4번 단계를 바꾼다:

```js
  // 4. settings.json 의 훅 — 정체로 찾는다. 인덱스를 참조하지 않는다.
  //    그룹째 버리면 같은 그룹을 공유하는 사용자 훅이 함께 사라진다. 훅만 뺀다.
  if (plan.settingsGroup) {
    say('remove the legacy ship-guard hook from .claude/settings.json');
    if (!dry) {
      const p = abs('.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
      const pre = settings.hooks && settings.hooks.PreToolUse;
      if (Array.isArray(pre)) {
        for (const g of pre) {
          if (!g || !Array.isArray(g.hooks)) continue;
          g.hooks = g.hooks.filter(
            (h) => !String((h && h.command) || '').includes(legacy.SHIP_GUARD));
        }
        settings.hooks.PreToolUse = pre.filter((g) => Array.isArray(g && g.hooks) && g.hooks.length);
        if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
      }
    }
  }
```

Task 3 Step 1 의 `it removes all six locations and preserves everything else` 픽스처에
**같은 그룹을 공유하는 사용자 훅**을 심고 보존을 단언한다:

```js
  // 레거시 가드와 사용자 훅이 같은 그룹에 있다 — 사용자 훅은 살아남아야 한다.
  settings.hooks.PreToolUse[0].hooks.push({ type: 'command', command: 'node /home/u/shared.cjs' });
```
```js
  const commands = after.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepStrictEqual(commands.sort(),
    ['node /home/u/mine.cjs', 'node /home/u/shared.cjs'],
    'every non-guard hook survives, including one that shared the guard group');
```

### R7 (Task 3) — `--from` 을 스코프당 하나씩 받는다

`--from` 은 하나인데 `checkBackup` 은 `manifest.home === plan.root` 를 요구한다. 프로젝트와 홈
양쪽에 레거시가 있으면 **둘 중 하나는 반드시 거부된다** — 빠져나갈 길이 `--skip-backup-check`
(게이트를 통째로 끄는 것)뿐이다. 플래그를 하나 더 둔다.

`parse()` 기본값에 `fromGlobal:null` 추가, 분기에 한 줄:

```js
    else if(a==='--from-global') out.fromGlobal=rest.shift()||fail('--from-global requires a path',2);
```

`uninstallLegacy` 의 스코프 구성:

```js
  // 기본은 프로젝트. 홈은 --global 을 명시해야 열린다 (D13 재발 방지선).
  // 두 스코프가 같은 트리를 가리키면(예: --project "$HOME" --global) 한 번만 센다 —
  // 두 번 계획하면 의미 기반 제거가 두 번 돌고 원장 조작이 겹친다.
  const scopes=[{root,scope:'project',label:`project ${root}`,from:opts.from}];
  if(opts.global && path.resolve(os.homedir())!==path.resolve(root)) {
    scopes.push({root:os.homedir(),scope:'global',label:`home ${os.homedir()}`,from:opts.fromGlobal});
  }
```

백업 게이트는 스코프별 `from` 을 쓴다 — `const res=checkBackup(plan,s.from);`.
거부 메시지는 어느 플래그가 비었는지 지목한다(`project` → `--from`, `global` → `--from-global`).

`help()` 의 Legacy removal options 절:

```
  --global             Also remove the pre-rename installation from $HOME (default: project only)
  --from PATH          Backup covering the project-scope removal targets (required)
  --from-global PATH   Backup covering the home-scope removal targets (required with --global)
  --skip-backup-check  Remove without verifying the backups (dangerous)
```

**추가 테스트**:

```js
test('--global with legacy in both scopes takes one backup per scope', () => {
  const home = mkFakeHome();
  const proj = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', proj, '--global', '--yes',
    '--from', mkBackup(proj), '--from-global', mkBackup(home)], { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.ok(!fs.existsSync(path.join(proj, '.triple-crown')), 'project vendor dir');
  assert.ok(!fs.existsSync(path.join(home, '.triple-crown')), 'home vendor dir');
});
```

### R8 (Task 3) — 실패 경로와 탈출구에 테스트를 단다

```js
test('--skip-backup-check removes without a backup and says so', () => {
  const root = mkFakeHome();
  const r = runCli(['uninstall-legacy', '--project', root, '--skip-backup-check', '--yes']);
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stderr, /skip-backup-check/);
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')));
});

test('an unreachable GSD CLI is a reported failure, not a silent skip', () => {
  const root = mkFakeHome();
  const from = mkBackup(root);
  const r = runCli(['uninstall-legacy', '--project', root, '--from', from, '--yes'],
    { CREW_GSD_BIN: path.join(ROOT, 'tests', 'no-such-gsd.cjs') });
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /capability left registered/);
  // 원장은 못 건드렸지만 파일 제거는 끝났다 — 재실행하면 원장만 남는다.
  assert.ok(!fs.existsSync(path.join(root, '.triple-crown')));
});

test('a failing capability remove is surfaced with the id that failed', () => {
  const { planRemoval, applyRemoval } = require(path.join(ROOT, 'scripts', 'uninstall-legacy.cjs'));
  const root = mkFakeHome();
  const res = applyRemoval(planRemoval(root), {
    runner: { display: 'stub', cmd: 'stub', prefix: [] },
    scope: 'project',
    run: (_r, args) => args[2] === 'triple-superpowers'
      ? { code: 1, stdout: '', stderr: 'ledger is locked' }
      : { code: 0, stdout: '', stderr: '' },
  });
  assert.strictEqual(res.failures.length, 1, res.failures.join('\n'));
  assert.match(res.failures[0], /triple-superpowers: ledger is locked/);
});
```

`resolveGsd` 가 존재하지 않는 `CREW_GSD_BIN` 에 대해 `null` 을 주는지 **Task 3 구현 전에
확인한다.** `null` 이 아니라 실행 실패하는 runner 를 주면 두 번째 테스트가 세 번째와 같은
경로를 타므로, 그때는 `runner:null` 을 직접 넣는 단위 테스트로 바꾼다.

### R9 (Task 4) — migrate 뒤 중복 그룹을 접는다

[`:57`](../../../scripts/install-claude-ship-guard.cjs#L57) 의 `migrateLegacyRegistrations` 는 걸리는
훅을 **제자리에서** 갈아 끼우고, 뒤따르는 검사는 **새 그룹을 push 할지만** 정한다. 구 등록과
신 등록이 둘 다 있는 트리 — M1a 이후 설치를 한 번 돌린 트리, 오늘 존재하는 유일한 레거시
상태 — 에서는 이관 뒤 **동일한 그룹이 둘** 남는다. Bash 호출마다 가드가 2회 돈다.

```js
  migrateLegacyRegistrations(pre, command);

  // 이관은 구 등록의 command 를 새 것으로 바꿀 뿐이다. 신 등록이 이미 있었으면 이제
  // 동일한 그룹이 둘이고, 아래 push 검사는 "있으니 넣지 않는다"만 할 뿐 하나를 지우지 않는다.
  const matching = pre.filter(g => sameHookGroup(g, command));
  if (matching.length > 1) {
    settings.hooks.PreToolUse = pre.filter(g => !sameHookGroup(g, command) || g === matching[0]);
  }

  if (!settings.hooks.PreToolUse.some(group => sameHookGroup(group, command))) {
    settings.hooks.PreToolUse.push({ matcher: 'Bash', hooks: [{ type: 'command', command }] });
  }
```

> `pre` 는 `ensureArray` 가 돌려준 **같은 배열 참조**다. 위처럼 `settings.hooks.PreToolUse` 에
> 새 배열을 대입한 뒤에는 `pre` 를 더 쓰지 않는다. 섞어 쓰면 push 가 버려진 배열로 간다.

**추가 테스트** (`legacy-transition.test.cjs`, Task 4 Step 1 의 반전 테스트 옆에):

```js
test('a tree carrying both the legacy and the current registration collapses to one group', () => {
  const proj = tempDir('crew-legacy-transition-');
  const claudeDir = path.join(proj, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const command = 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/crew-ship-guard.cjs"';
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify({
    hooks: { PreToolUse: [
      { matcher: 'Bash', hooks: [{ type: 'command',
        command: 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/triple-crown-ship-guard.cjs"' }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command }] },
      { matcher: 'Bash', hooks: [{ type: 'command', command: 'node /home/u/unrelated.cjs' }] },
    ] },
  }, null, 2));

  const guardScript = path.join(ROOT, 'scripts', 'install-claude-ship-guard.cjs');
  const r = cp.spawnSync(process.execPath, [guardScript, proj], { encoding: 'utf8', timeout: 30000 });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);

  const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf8'));
  const commands = settings.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command));
  assert.strictEqual(commands.filter((c) => c.includes('ship-guard')).length, 1,
    'the guard must fire exactly once per Bash call');
  assert.ok(commands.includes('node /home/u/unrelated.cjs'), 'unrelated hooks survive');
});
```

### R10 (Task 5) — 실패 주입을 **한 번만** 발화시킨다

계획서의 `if(process.env.FAKE_GSD_FAIL_INSTALL===m.id)` 는 env 변수라 **같은 실행 내내 계속
발화한다.** `rollbackCapabilities` 는 `[...touched].reverse()` 로 실패한 id 를 **가장 먼저**
재설치하므로 그 재설치도 죽어 `stuck` 에 들어간다. 원장 결과는 나머지 3개뿐이고,
Task 5 Step 2 의 `deepStrictEqual(after, before)` 는 **통과할 수 없다.**

`tests/fake-gsd.cjs` 의 install 분기, `const m=JSON.parse(...)` 바로 아래:

```js
  // 테스트 전용 실패 주입. 롤백의 재설치까지 죽이면 "이전 세대로 되돌린다"는 계약 자체를
  // 검증할 수 없으므로 **첫 시도에서만** 발화한다. 마커는 원장 옆에 둔다.
  if(process.env.FAKE_GSD_FAIL_INSTALL===m.id){
    const mark=path.join(cwd,'.fake-gsd-failed-once');
    if(!fs.existsSync(mark)){
      fs.writeFileSync(mark,m.id+'\n');
      console.error(`fake-gsd: injected failure installing ${m.id}`); process.exit(1);
    }
  }
```

Task 5 Step 2 의 두 번째 테스트는 baseline 설치 뒤 마커가 없음을 전제한다 — `mkFixture()` 가
매번 새 임시 트리라 자동으로 만족된다. 같은 픽스처에서 실패를 두 번 재현하려면
`fs.rmSync(path.join(fx.proj,'.fake-gsd-failed-once'),{force:true})` 를 사이에 넣는다.

### R11 (Task 5) — 되돌리기 실패는 조용히 넘어가지 않는다

계획서의 `rollbackCapabilities` 는 `remove` 가 비-0 이어도 `opts.verbose` 일 때만 경고하고,
그 뒤 `stuck.length===0` 이면 "되돌렸다"를 출력한다 — **제거가 실패했는데 성공 메시지가 나간다.**

```js
  for(const id of [...touched].reverse()) {
    const rem=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
    // "not installed"는 정상이다(설치 전에 죽은 id). 그 외의 비-0 은 원장이 그대로라는 뜻이다.
    if(rem.code!==0 && !/not installed/i.test(rem.stderr||rem.stdout||'')) {
      stuck.push(`${id} (remove: ${(rem.stderr||rem.stdout||'').trim()})`);
      continue;
    }
    if(!hadPrevious) continue;
    const re=gsdTry(runner,['capability','install',`./.crew/capabilities/${id}`,'--scope','project','--yes'],root);
    if(re.code!==0) stuck.push(`${id} (reinstall: ${(re.stderr||re.stdout||'').trim()})`);
  }
```

**추가 테스트** (`capability-atomicity.test.cjs`) — 복구된 `.crew` 에 그 id 가 없는 경우.
M1a→M1b 가 capability 를 3→4 로 늘렸고 M2 가 4→5 로 늘린다. 그때 정확히 이 경로를 밟는다:

```js
test('rollback reports a capability the previous generation never had', () => {
  const fx = mkFixture();
  assert.strictEqual(install(fx).status, 0);
  // 이전 세대에 없던 capability 를 흉내낸다: 복구될 소스에서 마지막 id 를 지운다.
  fs.rmSync(path.join(fx.proj, '.crew', 'capabilities', CAPABILITIES[3]), { recursive: true, force: true });
  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[2] });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /Rollback could not reinstate/,
    'a capability missing from the restored source must be named, not silently dropped');
});
```

> 이 테스트는 `.crew` 를 손으로 건드린다. `prepareStableSource` 가 `dest` 를 `backup` 으로
> rename 하므로 **다음 install 이 그 훼손된 트리를 backup 으로 삼는다** — 의도한 바다.

### R12 (Task 6) — `.gitignore` 와 Windows 잡

**`tc-` 개명 대상이 하나 빠졌다.** [`.gitignore:37`](../../../.gitignore#L37) 의 `tc-installer-*/` 다.
[`docs/RENAME-MAP.md:138`](../../RENAME-MAP.md#L138) 이 이 항목을 명시적으로 포함시켰는데
Task 6 파일 목록에 없고, 검증 grep 의 `--include=*.py --include=*.cjs --include=*.yml` 는
`.gitignore` 를 보지 않아 **거짓 통과**한다. Step 1 을 이렇게 고친다:

```bash
sed -i 's/prefix="tc-/prefix="crew-/' \
  tests/run_bash_installer_smoke.py tests/run_guide_smoke.py \
  tests/run_npx_tarball_smoke.py tests/run_installer_smoke.py tests/run_local_smoke.py
sed -i 's|^tc-installer-\*/|crew-installer-*/|' .gitignore
# 확장자 필터 없이 추적 파일 전체를 본다 — .gitignore 를 빠뜨린 것이 이 검사의 지난 실패다.
git ls-files -z | xargs -0 grep -n "tc-" -- | grep -v '^docs/'
```

기대: 마지막 명령이 **빈 출력**. `git add tests/ .gitignore`.

**Windows 잡은 `continue-on-error` 로 넣는다.** 첫 결과를 완료 판정에서 빼기로 한 이상,
실패하는 잡이 `main` 을 빨갛게 만드는 것은 앞뒤가 안 맞는다. Step 4 의 YAML 은
**`contract:` 스탠자만** 교체한다 — `jobs:` 부터 붙여넣으면 `smoke` 잡이 사라진다:

```yaml
  contract:
    name: contract (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    # windows 레그는 아직 한 번도 측정되지 않았다(로컬이 WSL 이라 재현 불가).
    # 신호는 보되 main 을 빨갛게 만들지 않는다. M1d 가 초록으로 만들고 이 줄을 뗀다.
    continue-on-error: ${{ matrix.os == 'windows-latest' }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      # 외부 의존성이 0개라 lockfile 이 없다 — `npm ci` 는 실패한다. 설치 단계 자체가 없다.
      - name: shared lib copies are in sync
        run: node scripts/build-capabilities.cjs --check
      - name: L1 contract
        run: npm run test:l1
```

> **범위 밖으로 기록**: `smoke` 잡은 [`tests/run_guide_smoke.py`](../../../tests/run_guide_smoke.py) 를
> 돌리지 않는다(5종 + `test:pack` 뿐). Task 6 Step 1 이 그 파일의 접두사를 바꾸는데 CI 는 그
> 변경을 검증하지 않는다. 기존 공백이고 M1c 에서 고치지 않는다 — 소유자: M1d.

### 테스트 수 재계산

| 태스크 | 계획 | 리뷰 반영 | 누계 |
|---|---:|---:|---:|
| 기준 | — | — | 107 |
| Task 1 | 5 | +2 (R1·R2) = **7** | 114 |
| Task 2 | 9 | +0 = **9** | 123 |
| Task 3 | 6 | +6 (R5×2 · R7 · R8×3) = **12** | 135 |
| Task 4 | 1 | +1 (R9) = **2** | 137 |
| Task 5 | 3 | +1 (R11) = **4** | 141 |

**Task 3 Step 9 · Task 7 Step 3 의 기대값을 `131` 에서 `141` 로 고친다.**
R6 은 기존 보존 테스트에 단언을 더하는 것이라 수가 늘지 않고, Task 4 의 반전은 교체다.
**산술이 안 맞으면 세어 보고 이 표를 고친다 — 맞추려고 테스트를 지우지 않는다.**

### 리뷰에서 확인했지만 M1c 에서 하지 않는 것

- **`checkBackup` 의 내용 일치 검증.** 백업 이후 수정된 대상을 지우면 옛 내용으로 복구된다.
  해시 일치를 요구하면 백업 직후가 아닌 한 게이트가 절대 안 열려 명령이 못 쓰게 된다.
  대신 거부·성공 메시지에 `manifest.createdAt` 을 찍는다. 소유자: M1d 재평가.
- **제거의 트랜잭션화.** `REMOVAL_ORDER`(벤더 트리 마지막)와 백업 안의 `restore.sh` 가
  현재의 답이다. 완전한 롤백은 M1c 보다 크다. 소유자: M1d.
- **`rollbackCapabilities` 의 id 별 사전 스냅샷.** `hadPrevious` 는 `.crew` 존재 비트 하나다.
  이전에 등록돼 있지 않던 id 를 재설치할 수 있다. 소유자: M1d.
- **`total===0` 일 때 `--from` 미검사.** 지울 것이 없으면 게이트도 없다. 의도된 동작이며
  `help()` 에 한 줄 적는다.
- **`detect --root` 출력의 `~/` 접두사.** 프로젝트 루트일 때 거짓말이 된다. 소유자: M1d.

---

## 자기 검토 기록

계획을 쓰면서 실제로 돌려 확인한 것과, 옮겨 적으며 스스로 잡은 것.

- **`legacy-backup.cjs` 를 require 하면 설치자가 망가진다.** [`:57`](../../../scripts/legacy-backup.cjs#L57) 이 모듈 최상위에서 `uncaughtException` 을 잡고 [`:637`](../../../scripts/legacy-backup.cjs#L637) 이 최상위에서 argv 를 파싱한다. "예전에 `crew.cjs` 에 했던 것과 같은 `require.main` 가드"라고만 적고 넘어갔다면 구현자는 `module.exports` 만 붙이고 두 부작용을 그대로 뒀을 것이다 — 그리고 **L1 은 초록이었을 것이다**(설치자가 예외를 던지는 경로를 테스트하지 않으므로). Task 1 Step 1 의 첫 테스트가 이것 하나를 위해 있다.

- **`SKILL_MARKERS` 를 그대로 쓰면 현행 스킬을 지운다.** 그 배열은 `['.triple-crown-skill', '.crew-skill']` 이다 — 백업에는 맞고 제거에는 재앙이다. "술어를 공유한다"가 "인자 없이 그대로 부른다"를 뜻하지 않는다. `LEGACY_SKILL_MARKERS` 를 따로 두고 `collectTargets` 에 주입하는 이유이고, Task 1 Step 1 의 다섯째 테스트가 두 호출의 차이를 직접 본다.

- **`--scope user` 는 존재하지 않는다.** 설계 §2.2 는 "스코프 자동 판별"이라고만 적었고 나는 홈 스코프를 `--scope user` 로 쓰려 했다. 실측: `Error: Invalid --scope "user": must be "global" or "project"`. 값을 계획서에 박기 전에 CLI 에 물었다.

- **`hadPrevious` 를 `tx.restore()` 뒤에 읽으면 항상 false 다.** `restore()` 가 `backup` 을 `dest` 로 rename 하기 때문이다. 처음 쓴 초안이 정확히 그랬고, 그러면 **업그레이드 실패가 롤백 대신 전부 제거로 끝난다** — 고치려던 것보다 나쁜 결과다. Task 5 Step 6 의 주석이 그 이유를 코드 옆에 남긴다.

- **특성 테스트 5건 중 둘은 "반전"이 아니라 "재타깃"이다.** `!src.includes('triple-crown-ship-guard.cjs')` 와 `!src.includes('.triple-crown-skill')` 는 M1c 이후에도 **참인 채로 남는다** — 구 어휘가 `bin/crew.cjs` 가 아니라 `legacy-backup.cjs` 에 살기 때문이다. 그대로 두면 초록인 채 아무것도 안 보는 테스트가 둘 생긴다. 파일이 스스로 "M1c 가 이 단언을 뒤집는다"고 적어 뒀다고 해서 그 말을 그대로 따르면 커버리지가 조용히 빈다. M1b 가 배운 "통과하는 테스트가 가장 위험했다"의 같은 부류다.

- **`without --from` 테스트는 exit 2 만으로는 적색이 안 된다.** 명령 자체가 없는 지금도 `unknown command` 로 exit 2 가 나오기 때문이다. `assert.match(r.stderr, /--from/)` 를 넣어 실제로 게이트가 말하는지 본다 — 종료 코드만 보는 테스트는 두 가지 실패를 구분하지 못한다.

- **`findMarkerRange` 의 인덱스 기준을 확인하지 않고 `splice` 를 썼다.** 0-기반인지 1-기반인지 소스를 열기 전에는 알 수 없고, 틀리면 사용자 문서가 한 줄 잘리거나 마커 한 줄이 남는다. Task 3 Step 3 이 "구현 전에 읽어라"와 함께 추가 단언 한 줄을 지시하는 이유다 — `user line kept` 만으로는 한 줄 어긋남을 못 잡는다.

- **이 명령을 이 머신에 쓰지 않는다.** 실측 레거시 0. 검증은 전부 픽스처다. "홈에서 한 번 돌려 본다" 단계를 넣고 싶은 유혹이 있었지만, 그건 되돌릴 수 없는 실험을 완료 판정에 넣는 것이다.

---

## GSTACK REVIEW REPORT

| Run | Reviewer | Status | Findings |
|---|---|---|---|
| 1 | plan-eng-review (Step 0 scope) | complete | 1 (복잡도 게이트 17파일 — 현행 유지로 확정) |
| 2 | Section 1 Architecture | complete | 3 (R1 `fail()` exit · R7 `--global` 백업 게이트 · R3 개명 펜스) |
| 3 | Section 2 Code quality | complete | 3 (R4 `findMarkerRange` `-1` · R2 `restore --root` · R9 가드 중복) |
| 4 | Section 3 Tests | complete | 1 (커버리지 33/47 → 상위 4종 추가 확정) |
| 5 | Section 4 Performance | complete | 0 (`crew install` 실측 624 ms, L1 3.49s → 약 8~9s) |
| 6 | Outside voice — Codex (`codex-cli 0.149.0`, high) | complete | 4 신규 (R10 실패 주입 · R6 훅 단위 · R5 블록 중복 · R12 `.gitignore`) |

**계획 대비 실측 대조**: `npm run test:l1` = `tests 107 · pass 107 · fail 0` (계획서 기준점 일치).
`crew install` (fake-gsd) = 624 ms. `capabilities/` = 312K. GSD `--scope` = `global|project`.

### 확정된 결정 (계획서 「리뷰 반영 — 확정 변경」 절에 전문)

| # | 결정 | 소속 |
|---|---|---|
| R1 | `legacy-backup.cjs` 의 `fail()` 을 throw 로, CLI 블록이 catch | Task 1 |
| R2 | `restore` 루트는 `:524` 선언 한 줄 + 실제 복구 테스트 | Task 1 |
| R3 | `brand-names.test.cjs` 의 `ALLOW` 를 파일 만드는 태스크에서 각각 갱신 | Task 1·2 |
| R4 | `findMarkerRange` 의 `-1` 을 호출부에서 명시 검사 | Task 3 |
| R5 | 라우팅 블록 전부 제거 + 사후 0건 단언 | Task 3 |
| R6 | settings.json 은 훅 단위 제거, 빈 그룹만 폐기 | Task 3 |
| R7 | `--from` / `--from-global` 스코프별 백업 + 루트 중복 제거 | Task 3 |
| R8 | `--skip-backup-check`·runner-null·remove-비0 경로에 테스트 | Task 3 |
| R9 | migrate 뒤 중복 그룹 접기 + 구·신 동시 등록 픽스처 | Task 4 |
| R10 | `FAKE_GSD_FAIL_INSTALL` 을 첫 시도에서만 발화 | Task 5 |
| R11 | 롤백의 remove 실패를 failures 로 계상 + stuck 테스트 | Task 5 |
| R12 | `.gitignore` 의 `tc-installer-*/` + Windows `continue-on-error` | Task 6 |

**차단 결함 3건** — 반영 전 계획대로 실행하면 초록에 도달할 수 없다:
R1 (Task 2 Step 4 `# pass 9` 불가), R3 (Task 1 Step 5 L1 불가), R10 (Task 5 Step 2 단언 불가).

**테스트 수**: 107 → **141** (Task 1: 7 · Task 2: 9 · Task 3: 12 · Task 4: 2 · Task 5: 4).
계획서 원안의 `131` 은 「리뷰 반영」 절의 재계산표로 대체한다.

**커버리지**: 33/47 (70%) → 반영 후 **42/47 (89%)**. 잔여 5건은 「M1c 에서 하지 않는 것」에 소유자 기록.

**테스트 플랜 산출물**: `~/.gstack/projects/ungkey-triple-crown/dev-main-eng-review-test-plan-20260822-164046.md`

### CROSS-MODEL 흡수

Codex 지적 10건 중 4건을 확정 변경으로 흡수(R5·R6·R10·R12), 4건을 「M1c 에서 하지 않는 것」에
소유자와 함께 기록(`checkBackup` 내용 일치 · 비-트랜잭션 제거 · id 별 스냅샷 · `total===0` 게이트 우회),
1건은 리뷰가 이미 잡은 것과 동일(루트 중복 → R7 에 흡수), 1건은 Windows CI 로 결정 반영(R12).
남은 교차 모델 이견 없음.

**VERDICT: APPROVED WITH CHANGES** — R1~R12 를 반영한 뒤 실행 가능. 반영 없이 착수하면
Task 1·2·5 가 각각 자기 완료 조건에 도달하지 못한다.

NO UNRESOLVED DECISIONS
