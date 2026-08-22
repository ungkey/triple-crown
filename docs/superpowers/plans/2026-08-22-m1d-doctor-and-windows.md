# M1d — doctor 신규 검사 2건 + Windows L1 초록화 + M1 계열 이월 부채 청산 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `crew doctor` 가 설계 §5.2 의 `gsd-shadow` 와 개명 전 설치본의 잔여를 스스로 검출하게 만들고, 한 번도 초록이던 적 없는 Windows L1 레그를 초록으로 만들며, M1a·M1b·M1c 가 M1d 소유로 넘긴 부채 4건을 갚는다. **M2 착수 시점에 M1 계열 이월 부채 0.**

**Architecture:** 세 갈래다. (1) **doctor 는 어휘를 복제하지 않는다** — `bin/crew.cjs:534-590` 의 `add(id,state,detail)` 한 줄로 검사를 늘릴 수 있는 구조를 그대로 쓰되, `gsd-shadow` 는 `expectedSkillDirs()` 에게, `legacy-residue` 는 M1c 가 만든 `scripts/uninstall-legacy.cjs` 의 `planRemoval` 에게 묻는다. 레거시 어휘의 단일 소유자는 여전히 `scripts/legacy-backup.cjs` 하나다. (2) **Windows 는 추측이 아니라 측정으로 고친다** — 첫 실패 지점은 이미 원격 로그에 있고(CRLF 체크아웃), 그 뒤는 잡을 실제로 돌려 하나씩 읽는다. 로컬이 WSL 이라 재현할 수 없다는 사실이 이 순서를 강제한다. (3) **이월 부채는 전부 "추측을 사실로 바꾸는" 형태다** — 경로 추측 → 설치 매니페스트, 존재 비트 추측 → id 별 스냅샷, `~/` 접두사 추측 → 실제 스코프 루트.

**Tech Stack:** Node.js ≥24 (실측 v24.14.0), `node:test` 러너, Node stdlib 만 (외부 npm 의존성 0), 시스템 `git` 2.43.0 · `python3` 3.13.13 · `gh` (계정 `ungkey` 로 인증됨). CI: GitHub Actions `ubuntu-latest` + `windows-latest`. 러너 GSD: `~/.claude/gsd-core/bin/gsd-tools.cjs` **v1.11.0**.

**Spec:** [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §5(M1 분할 — M1d 행) · §5.2(doctor 신규 검사) · §6 L1(`shadow-skill` 행) · §8(커밋·태그) · §9(위험) / [`docs/RESTRUCTURE-PLAN.md`](../../RESTRUCTURE-PLAN.md) §7.5 및 capability 표(`:415`·`:429`·`:436`·`:451` — tier 값)

**선행 계획:** [`2026-08-22-m1c-uninstall-legacy.md`](2026-08-22-m1c-uninstall-legacy.md) — 완료. 태그 `v0.7.0-m1c`. 그 계획서의 "범위 밖으로 남긴 것" 과 [`docs/RENAME-MAP.md`](../../RENAME-MAP.md) 의 "M1d 로 이월된 것" 절이 이 계획의 Task 3·5·6·7·8·9 다.

---

## Global Constraints

- 외부 npm 의존성 추가 금지. `package.json` 에 `dependencies` 없음 유지.
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`).
- 태그는 `v0.7.0-m1d` 하나. **롤백 지점이지 릴리스가 아니다**(설계 §8).
- `VERSION` 과 `package.json.version` 은 `0.7.0-dev` 그대로. 내리지 않는다(설계 §4.5 계층 2).
- 이 마일스톤은 `capabilities/**` 를 **건드린다**(Task 8·9). 매 커밋 뒤 `node scripts/build-capabilities.cjs --check` 가 `in sync` 여야 한다.
- `capabilities/*/checks/lib/**` 사본은 **직접 편집 금지**. canonical 은 `lib/` 이고 동기화는 `npm run build:caps` 가 한다.
- **원격 푸시 범위**: 이 마일스톤은 Windows 러너 측정이 필수이므로 작업 브랜치를 `origin` 에 푸시한다. **태그는 푸시하지 않는다** — 원격 태그는 `v0.6.4`·`v0.6.5` 둘뿐인 상태를 유지한다(실측).
- 실 `$HOME` 에 대한 파괴적 명령 금지. 모든 검증은 `e2e/contract/helpers/` 픽스처 안에서 돈다.

---

## 실측 기준점

착수 전 직접 확인한 값. 계획의 모든 판단이 이 표를 근거로 한다.

| 항목 | 실측값 |
|---|---|
| HEAD | `425e639 Merge branch 'm1c-uninstall-legacy'`, 워킹트리 clean |
| 로컬 태그 | `v0.6.4` `v0.6.5` `v0.7.0-m0` `v0.7.0-m1a` `v0.7.0-m1b` `v0.7.0-m1c` |
| 원격 refs | `refs/heads/main` = `425e639` (HEAD 와 동일), 태그는 `v0.6.4`·`v0.6.5` **뿐** |
| L1 | `tests 168 / pass 168 / fail 0` (4.1s) |
| 파이썬 스모크 6종 | 전부 `exit=0` |
| `build-capabilities.cjs --check` | `in sync` |
| 실 GSD 왕복 | 스킬 6개 · `.crew-skill` 마커 6 · capability 4개 · `READY=true PASS=18 WARN=0 FAIL=0` · uninstall 후 잔여 없음 |
| 설계 §2.4 제거 판정(픽스처) | `backup exit=0` · `remove exit=0` · `vendor:false` · `hook:false` · `skills:[]` · `marker:false` · `user line kept:true` |
| 설계 §2.4 복구 판정 | `verify exit=0 / verify OK: 15 entries match archive` · `restore --dry-run exit=0` |
| M1c 범위 | `git diff --name-only v0.7.0-m1b HEAD -- capabilities lib guards` **빈 출력** |
| **Windows 잡 (run 32570050318, job 97024137255)** | **실패.** 첫 스텝 `shared lib copies are in sync` 에서 죽는다: `build-capabilities: shared lib copies are out of sync` / `- crew-quality: …/LIB-HASH.json is stale` / `- crew-ship: …/LIB-HASH.json is stale`. `L1 contract` 스텝은 **한 번도 실행된 적이 없다** |
| `.gitattributes` | **없음**. 추적 파일 중 CRLF 를 담은 파일 **0개** |
| tier 현재값 | `crew-discipline`·`crew-quality`·`crew-ship` = `full`, `crew-guide` = `standard` |
| tier 설계값 | `crew-quality`·`crew-ship`·`crew-discipline` = `standard`, `crew-guide` = `core` (RESTRUCTURE-PLAN.md:415·429·436·451) |
| GSD 의 tier 취급 | **자유 문자열.** `gsd-core/src/capability-state.cts:206` 이 `typeof capObj['tier']==='string' ? … : 'unknown'` 으로 읽어 `capability list` 에 싣기만 한다. enum 검증도, requires 와의 결합도 없음 |
| doctor PASS 수를 단언하는 테스트 | **없음.** `e2e/doctor.cjs` 는 설치자 doctor 와 별개 도구다(`tests/run_v061_l0.py` 가 그쪽을 본다) |
| `~/` 출력 문자열을 소비하는 테스트 | **없음.** `legacy-backup.test.cjs:91` 이 소비하는 것은 `home: ` 라벨 하나뿐 |
| `findGstackChecks` 후보 | `workflow-guide.cjs:137-139` — 프로젝트 스테이징 · 소스 형제 · **`os.homedir()`** 세 개 |
| `rollbackCapabilities` 의 이전 세대 판정 | `hadPrevious` = `exists(tx.backup)` 비트 하나(`bin/crew.cjs:676`) |
| `workflow-guide.cjs` 진입 | `module.exports` 없음. 최상위에서 `main()` 호출 → **현재는 require 불가** |

### CRLF 가 왜 첫 스텝을 죽이는가

`build-capabilities.cjs` 는 `sha256(fs.readFileSync(src))` 로 canonical(`lib/*.cjs`)과 사본(`capabilities/<id>/checks/lib/*.cjs`)을 **바이트로** 비교한다(`:96`·`:144`·`:152`). Windows 러너의 `actions/checkout` 은 `core.autocrlf` 기본값 아래에서 텍스트 파일을 CRLF 로 펴 놓는다. 두 파일 다 CRLF 가 되지만 `LIB-HASH.json` 에 **기록된** 해시는 LF 기준이므로 `:182` 의 기록 최신성 검사가 `stale` 로 떨어진다. 파일 내용은 멀쩡하고 체크아웃만 다른, 순수한 도구 문제다.

---

## File Structure

| 파일 | 역할 | 상태 |
|---|---|---|
| `.gitattributes` | 모든 텍스트 파일을 체크아웃에서도 LF 로 고정. Windows 레그의 첫 실패 제거 | **신규** (Task 1) |
| `e2e/contract/line-endings.test.cjs` | 추적 파일의 `eol` 속성과 실제 바이트를 둘 다 본다 | **신규** (Task 1) |
| `e2e/contract/helpers/platform.cjs` | `WIN` · POSIX 권한 스킵 사유 · symlink 생성 가능 여부 실측 | **신규** (Task 2) |
| `e2e/contract/legacy-backup.test.cjs` | POSIX 권한 의존 테스트에 플랫폼 술어 적용 + Task 6 의 신규 단언 | 수정 (Task 2·6) |
| `e2e/contract/uninstall-legacy.test.cjs` | 동상 + symlink 테스트 + Task 6 의 신선도 단언 | 수정 (Task 2·6) |
| `.github/workflows/l1.yml` | `continue-on-error` 제거 — Windows 를 신호가 아니라 게이트로 | 수정 (Task 3) |
| `bin/crew.cjs` | doctor `gsd-shadow`·`legacy-residue` 추가, 백업 신선도 경고, `rollbackCapabilities` id 별 스냅샷 | 수정 (Task 4·5·6·7) |
| `e2e/contract/shadow-skill.test.cjs` | 설계 §6 L1 표의 `shadow-skill` 행 — 아직 없던 계약 | **신규** (Task 4) |
| `e2e/contract/doctor-legacy-residue.test.cjs` | doctor 가 개명 전 잔여를 WARN 으로 보고 | **신규** (Task 5) |
| `scripts/legacy-backup.cjs` | `detect` 출력의 경로 접두사를 실제 스코프로 | 수정 (Task 6) |
| `scripts/uninstall-legacy.cjs` | `staleTargets()` — 백업보다 새 대상 식별 | 수정 (Task 6) |
| `e2e/contract/capability-atomicity.test.cjs` | id 별 이전 세대 복원 계약 추가 | 수정 (Task 7) |
| `capabilities/crew-guide/checks/workflow-guide.cjs` | 교차 capability 경로 해석을 매니페스트 기반으로, 홈 후보 제거, require 가능하게 | 수정 (Task 8) |
| `e2e/contract/guide-check-resolution.test.cjs` | 해석기 계약 — 매니페스트에 없으면 null, 홈은 절대 안 본다 | **신규** (Task 8) |
| `capabilities/{crew-discipline,crew-quality,crew-ship,crew-guide}/capability.json` | `tier` 를 설계표에 맞춤 | 수정 (Task 9) |
| `e2e/contract/capability-split.test.cjs` | tier 펜스 추가 | 수정 (Task 9) |
| `docs/V0.7-IMPLEMENTATION-DESIGN.md` · `docs/RENAME-MAP.md` | M1d 결과 기록 | 수정 (Task 10) |

### 왜 doctor 검사를 `bin/crew.cjs` 안에 두는가

`crew doctor` 는 **설치자의** 진단이다. 검사 목록을 다른 파일로 빼면 `add()` 가 만드는 단일 리포트 구조(`{schema,version,projectRoot,checks,summary,ready}`)가 두 군데로 갈라지고, `--json` 소비자가 보는 표면이 파일 경계에 따라 달라진다. 반면 **판정에 쓰는 지식**은 전부 남에게 묻는다 — 스킬 이름은 `expectedSkillDirs()`, 레거시 어휘는 `planRemoval`. 이 계획은 그 경계를 바꾸지 않는다.

---

## Implementation Tasks

### Task 1: `.gitattributes` — Windows 체크아웃을 LF 로 고정

**Files:**
- Create: `.gitattributes`
- Test: `e2e/contract/line-endings.test.cjs`

**Interfaces:**
- Consumes: 없음.
- Produces: Windows 레그의 첫 스텝(`build-capabilities.cjs --check`)이 통과하는 상태. Task 3 이 그 뒤를 측정한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`e2e/contract/line-endings.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT } = require('./helpers/repo.cjs');

// 추적 파일 목록. brand-names.test.cjs 가 쓰는 것과 같은 수법 — 확장자 필터 없이
// git 이 아는 전부를 본다.
function trackedFiles() {
  return cp.execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean);
}

// CRLF 체크아웃은 build-capabilities.cjs 의 sha256 비교를 바이트 단위로 어긋나게 한다
// (실측: windows-latest 잡 97024137255 의 첫 스텝이 LIB-HASH stale 로 죽었다).
// 그 실패는 Windows 에서만 보이므로, 여기서는 "그렇게 되지 않도록 하는 설정"을 본다.
test('every tracked file is checked out with LF on every platform', () => {
  const files = trackedFiles();
  assert.ok(files.length > 50, `git ls-files returned too few paths (${files.length})`);

  const r = cp.spawnSync('git', ['check-attr', '--stdin', '-z', 'eol'], {
    cwd: ROOT, input: files.join('\0'), encoding: 'utf8',
  });
  assert.strictEqual(r.status, 0, `git check-attr failed:\n${r.stderr}`);

  // -z 출력은 <path>NUL<attr>NUL<value>NUL 삼중항의 연속이다.
  const parts = r.stdout.split('\0');
  const bad = [];
  for (let i = 0; i + 2 < parts.length; i += 3) {
    if (parts[i + 2] !== 'lf') bad.push(`${parts[i]} -> eol=${parts[i + 2]}`);
  }
  assert.deepStrictEqual(bad, [],
    'these tracked paths would be checked out with platform-native line endings:\n' + bad.join('\n'));
});

test('no tracked file carries CRLF in the repository itself', () => {
  const bad = [];
  for (const f of trackedFiles()) {
    const buf = fs.readFileSync(path.join(ROOT, f));
    if (buf.includes(Buffer.from('\r\n'))) bad.push(f);
  }
  assert.deepStrictEqual(bad, [], 'CRLF in tracked files:\n' + bad.join('\n'));
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/line-endings.test.cjs
```

기대: 첫 테스트가 `eol=unspecified` 목록과 함께 FAIL. 둘째 테스트는 PASS(실측: 현재 CRLF 파일 0).

- [ ] **Step 3: `.gitattributes` 를 만든다**

```gitattributes
# 체크아웃 줄바꿈을 플랫폼과 무관하게 LF 로 고정한다.
#
# 이유: scripts/build-capabilities.cjs 는 canonical `lib/*.cjs` 와 capability 사본을
# sha256 **바이트**로 대조하고, 그 값을 LIB-HASH.json 에 기록한다. Windows 러너의
# checkout 이 텍스트를 CRLF 로 펴면 기록된 해시와 영영 어긋나 `--check` 가 stale 로
# 죽는다 — 파일 내용은 멀쩡한데 도구가 거짓 경보를 낸다(실측: run 32570050318).
* text=auto eol=lf

# 아카이브·이미지는 절대 변환하지 않는다.
*.tgz binary
*.gz binary
*.png binary
*.jpg binary
*.ico binary
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test e2e/contract/line-endings.test.cjs
npm run test:l1 2>&1 | tail -4
node scripts/build-capabilities.cjs --check
git status --short
```

기대: `pass 2 / fail 0`, L1 전체 `fail 0`, `in sync`, **`git status` 는 비어 있다**(추적 파일에 CRLF 가 없으므로 정규화가 아무 파일도 바꾸지 않는다). 여기서 파일이 수정된 것으로 뜨면 `git add --renormalize .` 결과를 같은 커밋에 담고 그 사실을 커밋 메시지에 적는다.

- [ ] **Step 5: 커밋**

```bash
git add .gitattributes e2e/contract/line-endings.test.cjs
git commit -m "fix: pin checkout line endings to LF so the shared-lib hash check survives windows"
```

---

### Task 2: 플랫폼 술어 — POSIX 권한에 기대는 테스트를 정직하게

**Files:**
- Create: `e2e/contract/helpers/platform.cjs`
- Modify: `e2e/contract/legacy-backup.test.cjs`, `e2e/contract/uninstall-legacy.test.cjs`
- Test: 위 두 파일이 자기 자신의 테스트다.

**Interfaces:**
- Consumes: 없음.
- Produces: `{ WIN, NO_POSIX_PERMS, symlinkSupported(dir) }`. Task 3 이 측정 후 추가 스킵이 필요할 때 같은 모듈에 붙인다.

**왜 지금 하는가.** Windows 에서 `fs.chmodSync(dir, 0o555)` 는 삭제를 막지 못한다 — POSIX 권한 비트가 없다. 그 위에 세워진 "EACCES 를 실패로 보고한다" 류 테스트는 Windows 에서 **거짓 실패**한다(권한 거부가 일어나지 않으니 삭제가 성공하고, 단언은 실패를 기대한다). 이건 측정 전에 확정적으로 아는 사실이므로 Task 3 의 측정 잡음을 미리 줄인다. 기존 코드에 이미 같은 모양의 술어가 둘 있다 — `IS_ROOT`/`ROOT_SKIP`(root 에서 chmod 555 가 무효) 과 `legacy-backup.test.cjs:860` 의 `win32` 스킵. 새 개념이 아니라 흩어진 술어를 한곳에 모으는 일이다.

- [ ] **Step 1: 헬퍼를 만든다**

`e2e/contract/helpers/platform.cjs`:

```js
'use strict';

const fs = require('fs');
const path = require('path');

const WIN = process.platform === 'win32';

// POSIX 권한 비트가 없는 플랫폼에서는 chmod 로 거부를 만들 수 없다. 그 위에 세운
// "쓰기 실패를 어떻게 보고하는가" 류 테스트는 재현 자체가 불가능하다 — 통과시키는 게
// 아니라 재현 불가임을 이름으로 남긴다.
const NO_POSIX_PERMS = WIN
  ? 'chmod does not deny access on Windows — this test needs POSIX permission bits'
  : null;

// Windows 의 심볼릭 링크 생성은 권한(개발자 모드 또는 관리자)을 요구한다. 러너마다
// 다르므로 선언하지 않고 **실제로 만들어 보고** 판정한다.
function symlinkSupported(dir) {
  const target = path.join(dir, '.symlink-probe-target');
  const link = path.join(dir, '.symlink-probe-link');
  try {
    fs.writeFileSync(target, 'probe\n');
    fs.symlinkSync(target, link);
    return true;
  } catch {
    return false;
  } finally {
    try { fs.rmSync(link, { force: true }); } catch { /* 최선 노력 */ }
    try { fs.rmSync(target, { force: true }); } catch { /* 최선 노력 */ }
  }
}

module.exports = { WIN, NO_POSIX_PERMS, symlinkSupported };
```

- [ ] **Step 2: 권한 의존 테스트에 술어를 적용한다**

`legacy-backup.test.cjs` 의 `IS_ROOT` 스킵이 붙은 세 곳(`:196`·`:314`·`:787`)과 `:341` 계열, `uninstall-legacy.test.cjs:624` 계열을 같은 모양으로 확장한다. 파일 상단 import 에 추가:

```js
const { NO_POSIX_PERMS, symlinkSupported } = require('./helpers/platform.cjs');
```

각 테스트 본문 첫 줄:

```js
  if (IS_ROOT) { t.skip(ROOT_SKIP); return; }
  if (NO_POSIX_PERMS) { t.skip(NO_POSIX_PERMS); return; }
```

symlink 를 만드는 테스트(`legacy-backup.test.cjs:712`·`:812`·`:819`, `uninstall-legacy.test.cjs:319`)는 **만들어 보고** 판정한다:

```js
  const home = mkFakeHome();
  if (!symlinkSupported(home)) { t.skip('creating symlinks requires elevated rights on this platform'); return; }
```

`(t)` 인자를 받지 않던 테스트는 시그니처를 `(t) => {` 로 바꾼다.

- [ ] **Step 3: 리눅스에서 아무것도 스킵되지 않음을 확인한다**

```bash
npm run test:l1 2>&1 | tail -6
```

기대: `pass` 수가 Task 1 직후와 **같고** `skipped 0`. 리눅스에서 스킵이 하나라도 늘면 술어를 잘못 붙인 것이다 — `NO_POSIX_PERMS` 는 리눅스에서 `null` 이다.

- [ ] **Step 4: 커밋**

```bash
git add e2e/contract/helpers/platform.cjs e2e/contract/legacy-backup.test.cjs e2e/contract/uninstall-legacy.test.cjs
git commit -m "test: name the platform assumptions behind the permission and symlink fixtures"
```

---

### Task 3: Windows 잡을 측정하고 초록으로 만든다

**Files:**
- Modify: `.github/workflows/l1.yml` (마지막에), 측정 결과에 따라 `e2e/contract/**`

**Interfaces:**
- Consumes: Task 1·2 의 커밋.
- Produces: `contract (windows-latest)` 잡이 `continue-on-error` 없이 통과하는 상태.

**이 태스크는 측정이 선행이다.** 로컬은 WSL 이라 Windows 를 재현할 수 없다(설계 §5 · `l1.yml` 주석). 따라서 "무엇이 깨지는지"를 먼저 원격에서 읽고, 아래 결정표대로 고친다.

- [ ] **Step 1: 작업 브랜치를 푸시하고 잡을 돌린다**

```bash
git push origin HEAD:refs/heads/m1d-windows
gh workflow run L1 --ref m1d-windows
sleep 20
gh run list --branch m1d-windows --limit 1
```

`workflow_dispatch` 는 `l1.yml` 에 이미 있다. **`main` 에는 푸시하지 않는다** — 측정이 끝날 때까지 작업 브랜치에서만 돈다.

- [ ] **Step 2: 실패를 읽는다**

```bash
RUN=$(gh run list --branch m1d-windows --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN"
JOB=$(gh run view "$RUN" --json jobs --jq '.jobs[] | select(.name | contains("windows")) | .databaseId')
gh run view --job "$JOB" --log-failed | head -80
```

- [ ] **Step 3: 결정표대로 고친다**

읽은 실패를 아래 분류에 넣는다. 표 밖의 실패가 나오면 **그것도 M1d 에서 고치고**, 이 표에 한 행을 추가한 뒤 계획서를 커밋한다(Task 10 Step 5 가 그 사실을 판정한다).

| 증상 | 원인 | 조치 |
|---|---|---|
| `LIB-HASH.json is stale` 가 **여전히** | `.gitattributes` 가 적용되지 않은 캐시된 체크아웃 | 잡을 재실행. 그래도 남으면 `actions/checkout` 앞에 `git config --global core.autocrlf false` 스텝 추가 |
| 경로 단언이 `\` 때문에 실패 | 테스트가 `/` 로 조립한 상대 경로를 비교 | 비교 양쪽을 `path.join`/`path.normalize` 로 통일. **제품 코드의 `rel` 표기는 바꾸지 않는다** — 매니페스트에 이미 기록된 형식이다 |
| `spawnSync('tar')` 실패 | `tar.exe` 부재 또는 gzip 미지원 | `legacy-backup.cjs` 는 그대로 두고, 테스트에서 `tar` 가용성을 `platform.cjs` 로 실측해 스킵. `tar` 자체 대체는 M1d 범위 밖 |
| `bash restore.sh` 실패 | Git Bash 부재 또는 스크립트 줄바꿈 | `legacy-backup.test.cjs:860` 의 기존 win32 스킵이 이미 덮는다. 다른 곳에서 나오면 같은 술어를 붙인다 |
| EACCES 를 기대한 테스트가 성공으로 끝남 | POSIX 권한 비트 부재 | Task 2 의 `NO_POSIX_PERMS` 를 그 테스트에도 붙인다(누락분) |
| `EPERM: symlink` | 권한 없는 symlink 생성 | Task 2 의 `symlinkSupported()` 를 그 테스트에도 붙인다 |
| `sh -lc command -v` 로 도구 탐지 실패 | `commandPath()` 의 posix 분기 | 이미 `bin/crew.cjs:65` 에 `win32 → where` 분기가 있고 `:69` 가 `/\r?\n/` 로 자른다. 실제 원인을 로그로 확정한 뒤에만 손댄다 |
| 타임아웃 | Windows 러너의 프로세스 생성 비용 | 해당 테스트의 `timeout` 을 올린다. 러너 전체 시간은 `gh run view` 로 기록 |

각 수정마다 브랜치에 커밋하고 Step 1 의 `gh workflow run` 을 다시 돌린다. **한 번에 한 부류씩** 고친다 — 여러 개를 묶으면 어느 수정이 무엇을 고쳤는지 알 수 없다.

- [ ] **Step 4: 초록을 확인하고 게이트로 승격한다**

`contract (windows-latest)` 가 통과하면 `.github/workflows/l1.yml` 에서 `continue-on-error:` 줄과 그 위의 주석 2줄을 삭제한다:

```yaml
  contract:
    name: contract (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
```

- [ ] **Step 5: 게이트 상태에서 다시 측정한다**

```bash
git add .github/workflows/l1.yml
git commit -m "ci: make the windows contract leg a gate now that it passes"
git push origin HEAD:refs/heads/m1d-windows
gh workflow run L1 --ref m1d-windows
```

기대: `gh run view "$RUN"` 의 세 잡이 전부 `✓`. `continue-on-error` 가 없는 상태에서의 초록이어야 한다 — 이전 단계의 초록은 "실패해도 초록"과 구분되지 않는다.

- [ ] **Step 6: 스킵된 것을 기록한다**

```bash
gh run view --job "$JOB" --log | grep -Ei "skip|# SKIP" | head -20
```

Windows 에서 스킵된 테스트 이름과 사유를 Task 10 Step 7 의 문서 갱신에 넣는다. **조용한 스킵은 초록의 의미를 갉아먹는다** — 무엇이 Windows 에서 검증되지 **않는지**가 기록돼야 한다.

---

### Task 4: doctor `gsd-shadow` 검사 (설계 §5.2)

**Files:**
- Modify: `bin/crew.cjs` (`doctor()` — `skills-no-global-shadow` 바로 뒤)
- Test: `e2e/contract/shadow-skill.test.cjs` (신규)

**Interfaces:**
- Consumes: 기존 `expectedSkillDirs()` (`bin/crew.cjs:455`), `SKILL_PREFIX`(빈 문자열).
- Produces: doctor 리포트의 `checks[]` 에 `id:'gsd-shadow'` 행. 상태는 `PASS` 또는 `WARN`(FAIL 아님 — 섀도는 설치자가 만든 것이 아니고, READY 를 막을 근거가 없다).

**근거.** 설계 §1.5: GSD 는 capability 스킬을 표면화할 때 런타임 접두사를 stem 앞에 무조건 붙이고(`install-profiles.cts:818`), prune 은 접두사가 다른 디렉터리를 건드리지 않는다(`surface.cts:511-513`). 지금은 D9 때문에 `crew-*` 스킬이 그 경로를 타지 않지만, 상류가 D9 를 고치는 순간 같은 스킬이 `gsd-<stem>` 이라는 **다른 이름으로 한 벌 더** 깔린다. 두 벌은 서로를 지우지 않고 공존하며, 어느 쪽을 Claude Code 가 쓰는지는 발견 순서에 달린다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`e2e/contract/shadow-skill.test.cjs`:

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

// doctor 는 FAIL 이 하나라도 있으면 exit 1 이지만 --json 은 언제나 stdout 으로 나온다.
// 이 테스트가 보는 것은 gsd-shadow 행 하나이므로 종료 코드는 판정에 쓰지 않는다.
function doctor(project, home) {
  const r = cp.spawnSync(process.execPath, [CLI, 'doctor', '--project', project, '--json'], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, HOME: home, USERPROFILE: home, CREW_GSD_BIN: FAKE_GSD },
  });
  try { return JSON.parse(r.stdout); }
  catch { throw new Error(`doctor --json produced no JSON:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`); }
}

const row = (d, id) => d.checks.find((c) => c.id === id);

function mkPair() {
  const base = tempDir('crew-shadow-');
  const home = path.join(base, 'home');
  const proj = path.join(base, 'project');
  fs.mkdirSync(path.join(home, '.claude', 'skills'), { recursive: true });
  fs.mkdirSync(proj, { recursive: true });
  return { home, proj };
}

// 설치되는 스킬 이름은 skill-contract.test.cjs 가 이미 못박는다. 여기서는 그중 하나만
// 대표로 쓴다 — GSD 접두사가 붙은 이름은 `gsd-` + 그 stem 이다(설계 §1.5).
const SAMPLE = 'crew-gsd';

test('doctor reports no gsd-prefixed shadow on a clean project', () => {
  const { home, proj } = mkPair();
  const c = row(doctor(proj, home), 'gsd-shadow');
  assert.ok(c, 'doctor must always emit a gsd-shadow row');
  assert.strictEqual(c.state, 'PASS', c.detail);
});

test('doctor warns when a gsd-prefixed duplicate exists in the project', () => {
  const { home, proj } = mkPair();
  const dir = path.join(proj, '.claude', 'skills', `gsd-${SAMPLE}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: gsd-${SAMPLE}\n---\n`);

  const c = row(doctor(proj, home), 'gsd-shadow');
  assert.strictEqual(c.state, 'WARN', c.detail);
  assert.match(c.detail, new RegExp(`gsd-${SAMPLE}`),
    'the warning must name the shadowing directory so the user can remove it');
});

test('doctor warns when a gsd-prefixed duplicate exists in the home skills dir', () => {
  const { home, proj } = mkPair();
  const dir = path.join(home, '.claude', 'skills', `gsd-${SAMPLE}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: gsd-${SAMPLE}\n---\n`);

  const c = row(doctor(proj, home), 'gsd-shadow');
  assert.strictEqual(c.state, 'WARN', c.detail);
  assert.match(c.detail, /\.claude[\\/]skills/, 'the warning must name the root it was found in');
});

// 이미 있는 검사와 헷갈리지 않게: skills-no-global-shadow 는 **같은 이름**의 홈 사본을,
// gsd-shadow 는 **gsd- 접두사가 붙은 다른 이름**을 본다. 둘은 서로를 대신하지 못한다.
test('gsd-shadow and skills-no-global-shadow are independent checks', () => {
  const { home, proj } = mkPair();
  const dir = path.join(home, '.claude', 'skills', `gsd-${SAMPLE}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: x\n---\n');

  const d = doctor(proj, home);
  assert.strictEqual(row(d, 'gsd-shadow').state, 'WARN');
  assert.strictEqual(row(d, 'skills-no-global-shadow').state, 'PASS',
    'a gsd-prefixed directory is not a same-name global copy');
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/shadow-skill.test.cjs
```

기대: 4개 전부 FAIL — `doctor must always emit a gsd-shadow row` (아직 없는 검사다).

- [ ] **Step 3: 검사를 넣는다**

`bin/crew.cjs` 의 `skills-no-global-shadow` `add(...)` 호출 **바로 뒤**에:

```js
  // GSD 는 capability 스킬을 표면화할 때 런타임 접두사(`gsd-`)를 stem 앞에 무조건 붙이고
  // (install-profiles.cts:818), prune 은 접두사가 다른 디렉터리를 건드리지 않는다
  // (surface.cts:511-513). 상류가 D9 를 고치는 순간 같은 스킬이 `gsd-<stem>` 이라는 다른
  // 이름으로 한 벌 더 깔리고, 두 벌은 서로를 지우지 않은 채 공존한다 — 어느 쪽이 이기는지는
  // Claude Code 의 발견 순서에 달린다(설계 §1.5·§5.2). 설치자는 그 사본을 만들지도 지우지도
  // 않으므로 FAIL 이 아니라 WARN 이다.
  const shadowRoots=[...new Set([skillsRoot,path.join(os.homedir(),'.claude','skills')]
    .map(p=>path.resolve(p)))];
  const gsdShadow=[];
  for(const base of shadowRoots) {
    for(const n of expectedSkills) {
      const dir=path.join(base,`gsd-${n}`);
      if(exists(path.join(dir,'SKILL.md'))) gsdShadow.push(dir);
    }
  }
  add('gsd-shadow',
    gsdShadow.length?'WARN':'PASS',
    gsdShadow.length
      ? `gsd-prefixed duplicates of managed skills: ${gsdShadow.join(', ')} — remove them; Crew skills are surfaced by this installer, not by GSD`
      : 'no gsd-prefixed duplicates of managed skills');
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test e2e/contract/shadow-skill.test.cjs
npm run test:l1 2>&1 | tail -4
```

기대: 새 파일 `pass 4 / fail 0`, L1 전체 `fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add bin/crew.cjs e2e/contract/shadow-skill.test.cjs
git commit -m "feat: have doctor report gsd-prefixed shadows of the managed skills"
```

---

### Task 5: doctor `legacy-residue` 검사

**Files:**
- Modify: `bin/crew.cjs` (`doctor()` — Task 4 의 행 뒤)
- Test: `e2e/contract/doctor-legacy-residue.test.cjs` (신규)

**Interfaces:**
- Consumes: `scripts/uninstall-legacy.cjs` 의 `planRemoval(root)` → `{root,capabilities,skills,hookFile,settingsGroup,routingBlock,vendorDir,undetermined,count}`.
- Produces: doctor 리포트의 `checks[]` 에 `id:'legacy-residue'` 행. `PASS` 또는 `WARN`.

**근거.** M1c 계획의 "범위 밖으로 남긴 것" 이 이 검사를 M1d 소유로 지정했다: "구 설치가 아직 있다"를 doctor 가 경고하면 좋지만 doctor 신규 검사는 M1d 소관이다(설계 §5.2). `planRemoval` 은 **읽기 전용**이고 이미 M1c 에서 계약으로 고정돼 있으므로, 여기서 레거시 어휘를 한 글자도 새로 쓰지 않는다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`e2e/contract/doctor-legacy-residue.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');
const { mkFakeHome } = require('./helpers/fake-home.cjs');

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const FAKE_GSD = path.join(ROOT, 'tests', 'fake-gsd.cjs');

function doctor(project, home) {
  const r = cp.spawnSync(process.execPath, [CLI, 'doctor', '--project', project, '--json'], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, HOME: home, USERPROFILE: home, CREW_GSD_BIN: FAKE_GSD },
  });
  try { return JSON.parse(r.stdout); }
  catch { throw new Error(`doctor --json produced no JSON:\nstdout:\n${r.stdout}\nstderr:\n${r.stderr}`); }
}
const row = (d, id) => d.checks.find((c) => c.id === id);

test('doctor reports no legacy residue when neither scope has a pre-rename install', () => {
  const base = tempDir('crew-residue-');
  const home = path.join(base, 'home');
  const proj = path.join(base, 'project');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(proj, { recursive: true });

  const c = row(doctor(proj, home), 'legacy-residue');
  assert.ok(c, 'doctor must always emit a legacy-residue row');
  assert.strictEqual(c.state, 'PASS', c.detail);
});

test('doctor warns and names the command when the project still holds a pre-rename install', () => {
  const proj = mkFakeHome();                    // 픽스처는 개명 전 설치본 전체를 심는다
  const home = tempDir('crew-residue-home-');
  const c = row(doctor(proj, home), 'legacy-residue');
  assert.strictEqual(c.state, 'WARN', c.detail);
  assert.match(c.detail, /uninstall-legacy/,
    'the warning must name the command that removes it');
});

test('doctor warns about a pre-rename install found in the home scope', () => {
  const home = mkFakeHome();
  const proj = tempDir('crew-residue-proj-');
  const c = row(doctor(proj, home), 'legacy-residue');
  assert.strictEqual(c.state, 'WARN', c.detail);
  assert.match(c.detail, /--global/,
    'home-scope residue needs --global, and the warning must say so');
});

test('doctor never counts the same tree twice when the project root is the home dir', () => {
  const home = mkFakeHome();
  const c = row(doctor(home, home), 'legacy-residue');
  assert.strictEqual(c.state, 'WARN', c.detail);
  // 같은 트리를 두 스코프로 세면 같은 루트가 detail 에 두 번 나온다.
  const hits = c.detail.split(home).length - 1;
  assert.strictEqual(hits, 1, `the same root must appear once, not ${hits} times: ${c.detail}`);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/doctor-legacy-residue.test.cjs
```

기대: 4개 전부 FAIL — `doctor must always emit a legacy-residue row`.

- [ ] **Step 3: 검사를 넣는다**

`bin/crew.cjs` 의 Task 4 행 바로 뒤에:

```js
  // 개명 전 설치본이 남아 있는지. 판정은 M1c 의 계획기에게 맡긴다 — 레거시 어휘(구
  // capability id · 구 스킬 마커 · 구 훅 파일명 · 구 라우팅 마커)의 단일 소유자는
  // scripts/legacy-backup.cjs 이고 planRemoval 은 그 술어만 쓴다. 여기서 다시 쓰면 두 벌이
  // 갈라지고 doctor 만 조용히 뒤처진다. planRemoval 은 읽기 전용이다.
  try {
    const {planRemoval}=require(path.join(PACKAGE_ROOT,'scripts','uninstall-legacy.cjs'));
    const seen=new Set();
    const found=[], unknown=[];
    for(const scopeRoot of [root,os.homedir()]) {
      let key; try{key=fs.realpathSync(scopeRoot);}catch{key=path.resolve(scopeRoot);}
      if(seen.has(key)) continue;              // --project "$HOME" 이나 symlink 로 도달한 같은 트리
      seen.add(key);
      const plan=planRemoval(scopeRoot);
      const scope=key===path.resolve(os.homedir())?'--global':'project';
      if(plan.count) found.push(`${scopeRoot} (${plan.count} item(s), scope ${scope})`);
      if(plan.undetermined.length) unknown.push(`${scopeRoot}: ${plan.undetermined.join('; ')}`);
    }
    add('legacy-residue',
      (found.length||unknown.length)?'WARN':'PASS',
      found.length||unknown.length
        ? [
            found.length?`pre-rename installation still present — ${found.join('; ')}`:'',
            unknown.length?`undetermined: ${unknown.join('; ')}`:'',
            'back it up and remove it: `crew uninstall-legacy` (add --global for the home scope)',
          ].filter(Boolean).join(' | ')
        : 'no pre-rename installation found in the project or home scope');
  } catch(err) {
    // 모른다는 사실을 PASS 로 보고하지 않는다 — 그게 이 검사가 막아야 하는 공백이다.
    add('legacy-residue','WARN',`could not inspect for a pre-rename installation: ${err.message}`);
  }
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test e2e/contract/doctor-legacy-residue.test.cjs
npm run test:l1 2>&1 | tail -4
```

기대: `pass 4 / fail 0`, L1 전체 `fail 0`.

- [ ] **Step 5: 커밋**

```bash
git add bin/crew.cjs e2e/contract/doctor-legacy-residue.test.cjs
git commit -m "feat: have doctor warn when a pre-rename installation is still present"
```

---

### Task 6: `detect` 출력의 경로 정직화 + 백업 신선도 경고

**Files:**
- Modify: `scripts/legacy-backup.cjs` (`detect()` 의 출력부), `scripts/uninstall-legacy.cjs` (`staleTargets` 추가·export), `bin/crew.cjs` (`uninstallLegacy` 의 게이트 통과 뒤)
- Test: `e2e/contract/legacy-backup.test.cjs`, `e2e/contract/uninstall-legacy.test.cjs`

**Interfaces:**
- Consumes: `planRemoval` 의 반환 구조, `checkBackup` 이 돌려주는 `createdAt`.
- Produces: `staleTargets(plan, createdAt) → string[]` (`scripts/uninstall-legacy.cjs` export).

**근거.** RENAME-MAP 의 "M1d 로 이월된 것" 두 항목이다. (1) `detect --root <project>` 가 `~/` 접두사를 찍으면 출력이 거짓말이 된다 — 사용자는 홈을 열어 보고 "없는데?" 로 끝난다. (2) 백업 이후 대상이 바뀌면 복구는 옛 내용을 돌려준다. 해시 일치를 **요구**하면 백업 직후가 아닌 한 게이트가 영영 안 열려 명령이 못 쓰게 되므로, 막지 않고 **이름을 대서 경고**한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`e2e/contract/legacy-backup.test.cjs` 끝에:

```js
test('detect --root prints the scope it actually inspected, not a ~/ guess', () => {
  const proj = mkFakeHome();                     // 홈이 아니라 프로젝트로 쓴다
  const otherHome = tempDir('crew-detect-home-');
  const r = runBackupTool(['detect', '--root', proj], { HOME: otherHome });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes(proj), `detect must name the inspected root:\n${r.stdout}`);
  assert.ok(!/(^|\s)~\//m.test(r.stdout),
    `a project-scoped detect must not print ~/ paths — they point at a directory it never read:\n${r.stdout}`);
});

test('detect without --root keeps the ~/ shorthand for the home scope', () => {
  const home = mkFakeHome();
  const r = runBackupTool(['detect'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /~\/\.triple-crown/,
    'the home scope keeps its familiar shorthand');
});
```

`e2e/contract/uninstall-legacy.test.cjs` 끝에:

```js
test('removal warns when a target changed after the backup was taken', () => {
  const home = mkFakeHome();
  const from = mkBackup(home);
  // 백업 이후 대상을 바꾼다. 복구는 이 변경분을 돌려주지 못한다.
  const vendor = path.join(home, '.triple-crown', 'VERSION');
  fs.writeFileSync(vendor, '0.6.3-edited\n');
  const later = (Date.now() + 5000) / 1000;
  fs.utimesSync(vendor, later, later);

  const r = runCrew(['uninstall-legacy', '--project', home, '--from', from, '--yes'],
    { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /changed after/,
    'the user must be told which targets the backup can no longer reproduce');
  assert.match(r.stderr, /\.triple-crown/, 'the warning must name the target');
});

test('a stale target is a warning, not a refusal', () => {
  const home = mkFakeHome();
  const from = mkBackup(home);
  const vendor = path.join(home, '.triple-crown', 'VERSION');
  fs.writeFileSync(vendor, '0.6.3-edited\n');
  const later = (Date.now() + 5000) / 1000;
  fs.utimesSync(vendor, later, later);

  const r = runCrew(['uninstall-legacy', '--project', home, '--from', from, '--yes'],
    { HOME: home, USERPROFILE: home });
  assert.strictEqual(r.status, 0, 'requiring byte-identity would make the command unusable');
  assert.ok(!fs.existsSync(path.join(home, '.triple-crown')), 'removal still happened');
});
```

> `mkBackup` 과 `runCrew` 는 `uninstall-legacy.test.cjs` 상단에 이미 있는 헬퍼다. 이름이 다르면 그 파일의 기존 테스트가 쓰는 형태를 그대로 재사용한다.

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/legacy-backup.test.cjs e2e/contract/uninstall-legacy.test.cjs 2>&1 | tail -12
```

기대: `detect --root …` 는 `~/` 를 여전히 찍어 FAIL, 신선도 경고 2건은 `changed after` 부재로 FAIL.

- [ ] **Step 3: `detect` 의 접두사를 스코프에 맞춘다**

`scripts/legacy-backup.cjs` 의 `detect()` 안, `log(\`home: ${root}\`)` 다음에:

```js
  // 접두사는 실제로 들여다본 스코프를 말해야 한다. `--root` 로 프로젝트를 볼 때 `~/` 를
  // 찍으면 출력이 거짓말이 된다 — 사용자는 홈을 열어 보고 "없는데?" 로 끝난다. 홈
  // 스코프에서는 익숙한 축약을 유지한다. 어떤 테스트도 이 문자열을 소비하지 않는다는 것을
  // 실측으로 확인했다 — 소비되는 것은 `home: ` 라벨 하나뿐이다.
  const atRoot = (rel) => (path.resolve(root) === path.resolve(os.homedir())
    ? `~/${rel}` : path.join(root, rel));
```

이어지는 출력 두 곳을 바꾼다:

```js
  for (const t of owned) log(`  owned  ${t.kind === 'dir' ? 'dir ' : 'file'} ${atRoot(t.rel)}`);
  for (const u of undetermined) log(`  UNDETERMINED  ${atRoot(u)}`);
```

`CLAUDE.md` · `settings.json` 줄은 이미 상대 표기이므로 그대로 둔다.

- [ ] **Step 4: `staleTargets` 를 만든다**

`scripts/uninstall-legacy.cjs` 에 추가하고 export 에 넣는다:

```js
// 백업 이후 대상이 바뀌었으면 복구는 옛 내용을 돌려준다. 그렇다고 해시 일치를 **요구**하면
// 백업 직후가 아닌 한 게이트가 영영 안 열려 명령 자체가 못 쓰게 된다(RENAME-MAP 의 M1d
// 이월 항목이 이 절충을 그대로 지정한다). 막지 않고, 어느 대상이 백업보다 새것인지 이름을
// 대서 경고한다. 판정은 mtime 하나 — 내용 비교는 아카이브를 풀어야 하고, 그건 제거 직전
// 경로에서 지불할 비용이 아니다.
function staleTargets(plan, createdAt) {
  if (!createdAt) return [];
  const t = Date.parse(createdAt);
  if (!Number.isFinite(t)) return [];
  const rels = [
    ...plan.capabilities.map((id) => `.gsd/capabilities/${id}`),
    ...plan.skills,
    ...(plan.hookFile ? [plan.hookFile] : []),
    ...(plan.vendorDir ? [plan.vendorDir] : []),
    ...(plan.routingBlock ? ['CLAUDE.md'] : []),
    ...(plan.settingsGroup ? ['.claude/settings.json'] : []),
  ];
  const stale = [];
  for (const rel of rels) {
    // 디렉터리는 자기 mtime 만 본다. 하위까지 훑으면 제거 직전에 트리 전체를 걷게 된다.
    try { if (fs.statSync(path.join(plan.root, rel)).mtimeMs > t) stale.push(rel); }
    catch { /* 사라진 대상은 planRemoval 이 애초에 세지 않았다 */ }
  }
  return stale;
}
```

```js
module.exports = { planRemoval, checkBackup, applyRemoval, staleTargets, REMOVAL_ORDER };
```

- [ ] **Step 5: 경고를 배선한다**

`bin/crew.cjs` 의 `uninstallLegacy` — require 목록에 `staleTargets` 를 더하고, 백업 게이트가 통과한 직후(`fail(...)` 블록 다음)에:

```js
      const stale=staleTargets(plan,res.createdAt);
      if(stale.length) {
        warn(`backup for ${label} was taken ${res.createdAt}, but these targets changed after that: `+
          `${stale.join(', ')} — restoring will bring back the older content.`);
      }
```

- [ ] **Step 6: 통과를 확인한다**

```bash
node --test e2e/contract/legacy-backup.test.cjs e2e/contract/uninstall-legacy.test.cjs 2>&1 | tail -6
npm run test:l1 2>&1 | tail -4
```

기대: 두 파일 `fail 0`, L1 전체 `fail 0`.

- [ ] **Step 7: 커밋**

```bash
git add scripts/legacy-backup.cjs scripts/uninstall-legacy.cjs bin/crew.cjs \
        e2e/contract/legacy-backup.test.cjs e2e/contract/uninstall-legacy.test.cjs
git commit -m "fix: name the scope detect inspected, and warn when a backup predates its targets"
```

---

### Task 7: `rollbackCapabilities` — 이전 세대를 id 별로 안다

**Files:**
- Modify: `bin/crew.cjs` (`rollbackCapabilities` · `install`)
- Test: `e2e/contract/capability-atomicity.test.cjs`

**Interfaces:**
- Consumes: `parseCapabilityList`, `gsdTry` (기존).
- Produces: `capabilityIdsInstalled(root,runner) → Set<string>|null` (null = 알 수 없음). `rollbackCapabilities(root,runner,touched,{previous,hadPrevious},opts)`.

**근거.** RENAME-MAP: "`hadPrevious` 는 `.crew` 존재 비트 하나뿐이라, 이전에 등록되지 않았던 id 를 재설치할 수 있다." 업그레이드 실패 후 롤백이 **이전에 없던** capability 를 등록해 놓으면, 원장은 실패 이전 상태가 아니라 제3의 상태가 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`e2e/contract/capability-atomicity.test.cjs` 끝에:

```js
test('a failed upgrade reinstates only the ids that were registered before it', () => {
  const fx = mkFixture();
  const first = install(fx);
  assert.strictEqual(first.status, 0, `${first.stdout}\n${first.stderr}`);
  assert.deepStrictEqual(ledger(fx.proj).map((x) => x.id).sort(), [...CAPABILITIES].sort());

  // 이전 세대에서 한 개가 빠져 있던 상태를 만든다: 원장과 스테이징 양쪽에서 지운다.
  const dropped = CAPABILITIES[1];
  const p = path.join(fx.proj, '.fake-gsd-capabilities.json');
  fs.writeFileSync(p, JSON.stringify(ledger(fx.proj).filter((x) => x.id !== dropped), null, 2) + '\n');
  fs.rmSync(path.join(fx.proj, '.gsd', 'capabilities', dropped), { recursive: true, force: true });

  const r = install(fx, { FAKE_GSD_FAIL_INSTALL: CAPABILITIES[3] });
  assert.notStrictEqual(r.status, 0, 'the second install must fail');

  const after = ledger(fx.proj).map((x) => x.id).sort();
  assert.deepStrictEqual(after, CAPABILITIES.filter((id) => id !== dropped).sort(),
    'rollback must reinstate exactly the previous generation — not an id that was absent from it');
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/capability-atomicity.test.cjs 2>&1 | tail -12
```

기대: FAIL — `after` 에 `dropped` 가 다시 들어와 있다(`hadPrevious` 가 true 라 전부 재설치했다).

- [ ] **Step 3: id 별 스냅샷을 뜬다**

`bin/crew.cjs` 의 `capabilityList` 근처에:

```js
// 설치 **전** 원장에 무엇이 있었는지. null 은 "빈 집합"이 아니라 "모름"이다 — GSD 를
// 못 부르거나 list 가 실패한 경우다. 모름을 없음으로 읽으면 롤백이 있던 등록을 지운 채
// 끝난다.
function capabilityIdsInstalled(root,runner) {
  if(!runner) return null;
  const r=gsdTry(runner,['capability','list','--scope','project'],root);
  if(r.code!==0) return null;
  return new Set(parseCapabilityList(r.stdout).filter(x=>x.scope==='project').map(x=>x.id));
}
```

`rollbackCapabilities` 의 시그니처와 판정을 바꾼다:

```js
function rollbackCapabilities(root,runner,touched,prev,opts) {
  if(!touched.length) return;
  const {previous=null,hadPrevious=false}=prev||{};
  // …(runner 부재 경고는 그대로)…
  for(const id of [...touched].reverse()) {
    const rem=gsdTry(runner,['capability','remove',id,'--scope','project'],root);
    if(rem.code!==0 && !/not installed/i.test(rem.stderr||rem.stdout||'')) {
      stuck.push(`${id} (remove: ${(rem.stderr||rem.stdout||'').trim()})`);
      continue;
    }
    // 이전 세대에 이 id 가 있었을 때만 되돌린다. previous 가 null 이면 세대를 알 수 없으므로
    // `.crew` 백업 존재 비트로 물러선다 — 그것이 M1c 까지의 동작이고, 모름을 없음으로 읽는
    // 것보다는 낫다.
    const had = previous ? previous.has(id) : hadPrevious;
    if(!had) continue;
    const re=gsdTry(runner,['capability','install',`./.crew/capabilities/${id}`,'--scope','project','--yes'],root);
    if(re.code!==0) stuck.push(`${id} (reinstall: ${(re.stderr||re.stdout||'').trim()})`);
  }
```

마지막 보고 문구도 세대 기준으로 바꾼다:

```js
  } else {
    const restored=touched.filter(id=>previous?previous.has(id):hadPrevious);
    log(restored.length
      ? `Rolled the capability ledger back to the previous generation (${restored.join(', ')}).`
      : 'Removed the partially installed capabilities left by the failed run.');
  }
```

`install()` 에서 스냅샷을 뜨고 넘긴다 — **`prepareStableSource` 보다 먼저**, 즉 이번 실행이 원장을 손대기 전에:

```js
  const previous=capabilityIdsInstalled(root,gsd);
  const tx=prepareStableSource(root);
  const hadPrevious=exists(tx.backup);
  // …
    rollbackCapabilities(root,gsd,touched,{previous,hadPrevious},opts);
```

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test e2e/contract/capability-atomicity.test.cjs 2>&1 | tail -6
npm run test:l1 2>&1 | tail -4
```

기대: 새 테스트 포함 `fail 0`. 기존 4건(신선 설치 실패 · 업그레이드 실패 · 원장/소스 세대 일치 · GSD 부재)도 그대로 통과해야 한다 — 그 넷이 `previous=null` 경로와 정상 경로를 함께 덮는다.

- [ ] **Step 5: 커밋**

```bash
git add bin/crew.cjs e2e/contract/capability-atomicity.test.cjs
git commit -m "fix: roll the ledger back to the exact previous generation, id by id"
```

---

### Task 8: 교차 capability 경로를 추측하지 않는다

**Files:**
- Modify: `capabilities/crew-guide/checks/workflow-guide.cjs`
- Test: `e2e/contract/guide-check-resolution.test.cjs` (신규)

**Interfaces:**
- Consumes: `.crew/INSTALL-MANIFEST.json` 의 `capabilities: string[]` (`bin/crew.cjs:250` 이 매 설치마다 쓴다).
- Produces: `module.exports = { resolveCheck }` — `resolveCheck(root, file) → absolutePath|null` (파일이 든 `checks` 디렉터리).

**근거.** M1c 의 "범위 밖으로 남긴 것" 이 이 항목을 M1d 소유로 지정했다. 현재 `findGstackChecks(root)`(`:137-139`)는 세 곳을 순서대로 시도하는데 **세 번째가 `os.homedir()`** 다. 프로젝트에 `crew-quality` 가 안 깔려 있으면 이 프로젝트의 게이트 판정이 **다른 프로젝트의 설치본**을 실행한다. 같은 파일의 `doctorSnapshot`(`:683-690`)은 이미 옳은 출처를 쓴다 — "기대 capability 목록은 설치자가 남긴 매니페스트에서 온다". 한 파일 안에서 두 함수가 서로 다른 출처를 쓰고 있는 상태다.

- [ ] **Step 1: 모듈을 require 가능하게 만든다**

`workflow-guide.cjs` 맨 끝의

```js
try { main(); }
catch (err) {
  console.error(`crew-guide: ${err.message}`);
  process.exit(2);
}
```

를 다음으로 바꾼다:

```js
// CLI 로 직접 실행될 때만 돈다. L1 이 해석기를 단위로 검증하려면 require 가 가능해야 하고,
// require 시점에 main() 이 돌면 인자 없는 실행으로 죽는다. scripts/legacy-backup.cjs 가
// M1c 에서 쓴 것과 같은 수법이다.
module.exports = { resolveCheck };

if (require.main === module) {
  try { main(); }
  catch (err) {
    console.error(`crew-guide: ${err.message}`);
    process.exit(2);
  }
}
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`e2e/contract/guide-check-resolution.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

const GUIDE = path.join(ROOT, 'capabilities', 'crew-guide', 'checks', 'workflow-guide.cjs');
const { resolveCheck } = require(GUIDE);

function mkProject(caps, staged) {
  const root = tempDir('crew-guide-res-');
  fs.mkdirSync(path.join(root, '.crew'), { recursive: true });
  fs.writeFileSync(path.join(root, '.crew', 'INSTALL-MANIFEST.json'),
    JSON.stringify({ schema: 1, capabilities: caps }, null, 2) + '\n');
  for (const [id, file] of staged) {
    const dir = path.join(root, '.gsd', 'capabilities', id, 'checks');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, file), '#!/usr/bin/env node\nprocess.exit(0);\n');
  }
  return root;
}

test('resolveCheck finds a staged check through the install manifest', () => {
  const root = mkProject(['crew-quality', 'crew-ship'], [['crew-quality', 'qa-ready.cjs']]);
  assert.strictEqual(resolveCheck(root, 'qa-ready.cjs'),
    path.join(root, '.gsd', 'capabilities', 'crew-quality', 'checks'));
});

test('resolveCheck does not care which capability owns the file', () => {
  // crew-security 가 분리되면 같은 파일이 다른 capability 로 옮겨간다. 해석기는 매니페스트가
  // 나열한 capability 중 그 파일을 실제로 가진 쪽을 고르지, 이름을 하드코딩하지 않는다.
  const root = mkProject(['crew-quality', 'crew-security'], [['crew-security', 'security-ready.cjs']]);
  assert.strictEqual(resolveCheck(root, 'security-ready.cjs'),
    path.join(root, '.gsd', 'capabilities', 'crew-security', 'checks'));
});

test('resolveCheck returns null instead of reaching into the home directory', () => {
  const root = mkProject(['crew-quality'], []);          // 매니페스트는 있고 스테이징은 없다
  const home = tempDir('crew-guide-home-');
  const stray = path.join(home, '.gsd', 'capabilities', 'crew-quality', 'checks');
  fs.mkdirSync(stray, { recursive: true });
  fs.writeFileSync(path.join(stray, 'qa-ready.cjs'), 'process.exit(0);\n');

  const prevHome = process.env.HOME, prevUp = process.env.USERPROFILE;
  process.env.HOME = home; process.env.USERPROFILE = home;
  try {
    assert.strictEqual(resolveCheck(root, 'qa-ready.cjs'), null,
      "another project's install must never satisfy this project's gate");
  } finally {
    process.env.HOME = prevHome; process.env.USERPROFILE = prevUp;
  }
});

test('resolveCheck returns null when there is no install manifest at all', () => {
  const root = tempDir('crew-guide-bare-');
  assert.strictEqual(resolveCheck(root, 'qa-ready.cjs'), null);
});
```

- [ ] **Step 3: 실패를 확인한다**

```bash
node --test e2e/contract/guide-check-resolution.test.cjs
```

기대: `resolveCheck is not a function` 로 전부 FAIL (Step 1 만 했다면 export 대상이 아직 없다).

- [ ] **Step 4: 해석기를 만든다**

`workflow-guide.cjs` 의 `findGstackChecks` 를 대체한다:

```js
// 교차 capability 경로를 추측하지 않는다. 무엇이 이 프로젝트에 깔려 있어야 하는지는
// 설치자가 남긴 매니페스트가 안다 — doctorSnapshot 이 이미 같은 출처를 쓴다(:683). 홈
// 후보는 **뺀다**: 프로젝트에 capability 가 없을 때 다른 프로젝트의 설치본을 이 프로젝트의
// 게이트 판정에 끌어오는 경로였다. 못 찾으면 null 이고, 호출부는 probe unavailable 로
// 정직하게 보고한다.
function resolveCheck(root, file) {
  const manifest = readJson(path.join(root, '.crew', 'INSTALL-MANIFEST.json'));
  const ids = manifest && Array.isArray(manifest.capabilities)
    ? manifest.capabilities.filter((c) => typeof c === 'string' && c) : [];
  for (const id of ids) {
    const dir = path.join(root, '.gsd', 'capabilities', id, 'checks');
    if (exists(path.join(dir, file))) return dir;
  }
  // 이 저장소의 소스 트리에서 직접 돌 때만 형제 capability 를 본다. doctorSnapshot 의
  // sourceFallback 과 같은 예외이고 같은 조건이다 — 이 파일이 root 아래에 있을 때만.
  const capsRoot = path.resolve(__dirname, '..', '..');
  if (capsRoot.startsWith(path.resolve(root))) {
    let sibs = [];
    try { sibs = fs.readdirSync(capsRoot); } catch { sibs = []; }
    for (const sib of sibs) {
      const dir = path.join(capsRoot, sib, 'checks');
      if (exists(path.join(dir, file))) return dir;
    }
  }
  return null;
}

// null 디렉터리를 path.join 에 넘기면 던진다. probe() 는 null 을 이미 안전하게 다룬다.
function pathIn(dir, file) { return dir ? path.join(dir, file) : null; }
```

호출부를 파일 단위 해석으로 바꾼다:

```js
  // :232 자리 — 프로브 비활성화 스위치는 해석기 앞단에서 유지한다.
  const checkDir = (file) => (process.env.CREW_GUIDE_DISABLE_PROBES === '1' ? null : resolveCheck(root, file));
```

```js
  // :253-255 자리
  const verifyProbe = probe(pathIn(checkDir('verify-ready.cjs'), 'verify-ready.cjs'), d);
  const qaProbe = probe(pathIn(checkDir('qa-ready.cjs'), 'qa-ready.cjs'), d);
  const secProbe = probe(pathIn(checkDir('security-ready.cjs'), 'security-ready.cjs'), d);
```

`planReviewState(phaseDir, planFiles, checks)` 는 `checks` 디렉터리 대신 `checkDir` 함수를 받게 바꾸고(`:170`·`:182`), 호출부(`:258`)도 함께 고친다:

```js
  const pr = probe(pathIn(checkDir('plan-review-current.cjs'), 'plan-review-current.cjs'), phaseDir);
```

`determineNext` 의 안내 문구(`:455`)도 해석 결과에서 만든다 — `ctx` 에 `checkDir` 를 실어 보낸다(`:407` 의 컨텍스트 리터럴에 `checkDir` 추가):

```js
      after:[
        `node ${markPlanReviewedPath(ctx)} "${ctx.phase.dir}" --status pass`,
        '/gsd-progress --next'
      ]
```

```js
// 안내 문구의 경로도 해석기에서 나온다. 못 찾으면 설치 후의 표준 위치를 안내한다 —
// 명령을 통째로 감추면 사용자가 다음에 무엇을 할지 알 수 없다.
function markPlanReviewedPath(ctx) {
  const dir = ctx.checkDir && ctx.checkDir('mark-plan-reviewed.cjs');
  return dir
    ? path.relative(ctx.root, path.join(dir, 'mark-plan-reviewed.cjs'))
    : path.join('.gsd', 'capabilities', 'crew-quality', 'checks', 'mark-plan-reviewed.cjs');
}
```

- [ ] **Step 5: 통과를 확인한다**

```bash
node --test e2e/contract/guide-check-resolution.test.cjs
npm run test:l1 2>&1 | tail -4
node scripts/build-capabilities.cjs --check
python tests/run_guide_smoke.py; echo "guide smoke exit=$?"
```

기대: 새 파일 `pass 4 / fail 0`, L1 `fail 0`, `in sync`, guide 스모크 `exit=0`.

- [ ] **Step 6: 실 GSD 왕복으로 확인한다**

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
node bin/crew.cjs status --project "$PROJ" 2>&1 | tail -5
node bin/crew.cjs doctor --project "$PROJ" | tail -1
```

기대: `status` 가 오류 없이 나오고 `READY=true`. 해석기가 스테이징 경로를 실제로 찾는다는 뜻이다.

- [ ] **Step 7: 커밋**

```bash
git add capabilities/crew-guide/checks/workflow-guide.cjs e2e/contract/guide-check-resolution.test.cjs
git commit -m "fix: resolve cross-capability checks from the install manifest, never from the home dir"
```

---

### Task 9: capability `tier` 를 설계표에 맞추고 펜스로 고정

**Files:**
- Modify: `capabilities/{crew-discipline,crew-quality,crew-ship,crew-guide}/capability.json`
- Modify: `e2e/contract/capability-split.test.cjs`

**Interfaces:**
- Consumes: 없음.
- Produces: L1 펜스 `capability tiers match the restructure plan`.

**근거와 안전성.** M1b 가 "tier 값을 설계에 맞추기. 소비처 0" 을 M1d 로 이월했다. 실측으로 확인한 소비처는 하나다 — `gsd-core/src/capability-state.cts:206` 이 `tier` 를 **자유 문자열**로 읽어 `capability list` 행에 싣는다. enum 검증도, `requires` 와의 결합도, 설치 거부 경로도 없다. 따라서 이 변경은 표시값 정렬이고, 위험은 "아무도 안 보는 값이 나중에 다시 어긋난다" 하나뿐이다. 그래서 펜스를 같이 넣는다.

- [ ] **Step 1: 실패하는 펜스를 쓴다**

`e2e/contract/capability-split.test.cjs` 끝에:

```js
// tier 는 GSD 1.11.0 에서 자유 문자열이다(capability-state.cts:206 — 검증 없이 capability
// list 에 실린다). 검증이 없다는 것은 어긋나도 아무도 알려주지 않는다는 뜻이므로 설계표를
// 여기서 못박는다. 출처: docs/RESTRUCTURE-PLAN.md:415·429·436·451.
test('capability tiers match the restructure plan', () => {
  const EXPECTED = {
    'crew-discipline': 'standard',
    'crew-quality': 'standard',
    'crew-ship': 'standard',
    'crew-guide': 'core',
  };
  const actual = {};
  for (const id of Object.keys(EXPECTED)) actual[id] = manifest(id).tier;
  assert.deepStrictEqual(actual, EXPECTED);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
node --test e2e/contract/capability-split.test.cjs 2>&1 | tail -12
```

기대: FAIL — `full`/`standard` 가 나온다.

- [ ] **Step 3: 매니페스트를 고친다**

```bash
node -e '
const fs=require("fs");
const want={"crew-discipline":"standard","crew-quality":"standard","crew-ship":"standard","crew-guide":"core"};
for(const [id,tier] of Object.entries(want)){
  const p=`capabilities/${id}/capability.json`;
  const s=fs.readFileSync(p,"utf8");
  const out=s.replace(/("tier":\s*)"[^"]*"/, `$1"${tier}"`);
  if(out===s) throw new Error(`no tier field replaced in ${p}`);
  fs.writeFileSync(p,out);
}
'
git diff --stat capabilities
```

기대: 4개 파일, 각 1줄씩. JSON 키 순서와 들여쓰기는 그대로다.

- [ ] **Step 4: 통과를 확인한다**

```bash
node --test e2e/contract/capability-split.test.cjs 2>&1 | tail -4
npm run test:l1 2>&1 | tail -4
node scripts/build-capabilities.cjs --check
```

기대: 전부 `fail 0` · `in sync`. 골든(`e2e/contract/golden/capability-surface.json`)은 tier 를 담지 않으므로(실측) 재생성이 필요 없다.

- [ ] **Step 5: 실 GSD 가 새 값을 그대로 싣는지 확인한다**

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
node bin/crew.cjs doctor --project "$PROJ" | tail -1
```

기대: `READY=true` 이고 capability 4개가 `active`. 설치가 거부되지 않는 것이 "tier 검증 없음" 실측의 확인이다.

- [ ] **Step 6: 커밋**

```bash
git add capabilities e2e/contract/capability-split.test.cjs
git commit -m "chore: align capability tiers with the restructure plan and fence them"
```

---

### Task 10: M1d 완료 판정 · 문서 · 롤백 태그

**Files:** 검증 전용. 마지막에 `docs/V0.7-IMPLEMENTATION-DESIGN.md` · `docs/RENAME-MAP.md` 갱신과 태그 하나.

**Interfaces:**
- Consumes: Task 1~9 의 커밋.
- Produces: 태그 `v0.7.0-m1d`.

- [ ] **Step 1: 설계 §5.2 의 두 검사를 재현으로 판정한다**

설계 §5 의 M1d 통과 조건은 "각 조건 재현 시 검출" 이다. 픽스처에서 두 조건을 실제로 만들고 검출을 본다:

```bash
node -e '
const fs=require("fs"),path=require("path"),cp=require("child_process");
const {mkFakeHome}=require("./e2e/contract/helpers/fake-home.cjs");
const {tempDir}=require("./e2e/contract/helpers/repo.cjs");
const FAKE=path.resolve("tests/fake-gsd.cjs");
const doc=(proj,home)=>JSON.parse(cp.spawnSync(process.execPath,
  ["bin/crew.cjs","doctor","--project",proj,"--json"],
  {encoding:"utf8",env:{...process.env,HOME:home,USERPROFILE:home,CREW_GSD_BIN:FAKE}}).stdout);
const row=(d,id)=>d.checks.find(c=>c.id===id);

const h1=tempDir("m1d-home-"), p1=tempDir("m1d-proj-");
fs.mkdirSync(path.join(p1,".claude/skills/gsd-crew-gsd"),{recursive:true});
fs.writeFileSync(path.join(p1,".claude/skills/gsd-crew-gsd/SKILL.md"),"---\nname: x\n---\n");
console.log("gsd-shadow:",JSON.stringify(row(doc(p1,h1),"gsd-shadow")));

const h2=tempDir("m1d-home2-"), p2=mkFakeHome();
console.log("legacy-residue:",JSON.stringify(row(doc(p2,h2),"legacy-residue")));

const h3=tempDir("m1d-home3-"), p3=tempDir("m1d-proj3-");
const d3=doc(p3,h3);
console.log("clean:",row(d3,"gsd-shadow").state,row(d3,"legacy-residue").state);
'
```

기대: 첫 둘은 `"state":"WARN"` 이고 detail 이 각각 섀도 디렉터리와 `uninstall-legacy` 를 이름으로 댄다. 대조군은 `PASS PASS`.

- [ ] **Step 2: `home-root-refusal` 회귀 (설계 §5.2 마지막 문단)**

M1d 는 이 거부를 새로 만들지 않는다 — M-1 산출물이 여전히 동작하는지만 본다:

```bash
node --test e2e/contract/home-root-refusal.test.cjs
```

기대: `pass 1 / fail 0`.

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

기대: L1 `fail 0`. 이 계획이 더하는 테스트는 **20개** — Task 1 의 2, Task 4 의 4, Task 5 의 4, Task 6 의 4, Task 7 의 1, Task 8 의 4, Task 9 의 1 — 이므로 총계는 M1c 기준선 168 에서 **188** 이 된다. 수가 다르면 **어느 테스트가 빠졌는지 확인한다** — 수가 아니라 목록이 판정 기준이다. 스모크 6종 전부 `exit=0`, `test:pack` 통과, `build:caps check exit=0`.

- [ ] **Step 4: 실 GSD 왕복 — doctor 가 2행 늘었는지**

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease >/dev/null
node bin/crew.cjs doctor --project "$PROJ" | tail -3
node bin/crew.cjs uninstall --project "$PROJ" --yes >/dev/null
```

기대: `READY=true PASS=20 WARN=0 FAIL=0` — M1c 기준선 18 에 `gsd-shadow` · `legacy-residue` 두 행이 더해진 값이다. WARN 이 0 이 아니면 이 머신에 실제로 섀도나 레거시가 있다는 뜻이므로, **doctor 를 고치지 말고 그 사실을 확인한다**(실측 기준: 이 머신의 레거시 대상 0).

- [ ] **Step 5: 커밋에 계획 밖의 것이 섞이지 않았는지**

```bash
git diff --stat v0.7.0-m1c HEAD -- . ':!docs'
git diff --name-only v0.7.0-m1c HEAD -- lib guards
```

기대: 첫 명령의 목록이 이 계획의 File Structure 표와 일치. 두 번째는 **빈 출력** — M1d 는 공유 lib 와 가드를 건드리지 않는다. `capabilities/` 는 Task 8·9 로 **의도적으로** 바뀌므로 첫 목록에 나오는 것이 정상이다.

- [ ] **Step 6: 원격 CI 가 세 잡 모두 초록인지**

```bash
git push origin HEAD:refs/heads/m1d-windows
gh workflow run L1 --ref m1d-windows
sleep 60
RUN=$(gh run list --branch m1d-windows --limit 1 --json databaseId --jq '.[0].databaseId')
gh run view "$RUN"
```

기대: `contract (ubuntu-latest)` · `contract (windows-latest)` · `python smoke (ubuntu)` 전부 `✓`. `continue-on-error` 가 이미 제거된 상태여야 한다(Task 3 Step 4).

- [ ] **Step 7: 설계서와 매핑 문서를 고친다**

`docs/V0.7-IMPLEMENTATION-DESIGN.md`:

- §5 표의 M1d 행 → 범위 `doctor 검사 2건(gsd-shadow · legacy-residue) + Windows L1 게이트화 + M1 계열 이월(교차 capability 경로 · 롤백 세대 · detect 스코프 표기 · tier 정렬)`, 통과 조건 `각 조건 재현 시 검출, windows-latest 레그가 continue-on-error 없이 통과`
- §5.2 표에 `legacy-residue` 행 추가 — 내용 `planRemoval 로 프로젝트·홈 두 스코프를 읽어 개명 전 설치본 잔여를 WARN. undetermined 를 PASS 로 읽지 않는다`, 근거 `M1c 이월`
- §6 L1 표에 세 행 추가: `shadow-skill`(gsd-`<stem>` 섀도 검출 — 기존 행의 실제 구현), `legacy-residue`(doctor 판정), `line-endings`(체크아웃 줄바꿈 고정 — Windows 레그의 전제)
- §9 위험 표에 세 행 추가:
  - `Windows 체크아웃이 공유 lib 해시 검사를 깨뜨림` / `.gitattributes 로 eol=lf 고정 + L1 line-endings 2종`
  - `게이트 판정이 다른 프로젝트의 설치본을 실행` / `resolveCheck 가 설치 매니페스트만 본다(홈 후보 제거), L1 guide-check-resolution 4종`
  - `롤백이 이전 세대에 없던 capability 를 등록` / `capabilityIdsInstalled 로 id 별 스냅샷, L1 capability-atomicity 5종`
- 개정 이력에 한 줄: `v1.6 (2026-08-22): M1d 범위 확정 — doctor 검사 2건, Windows L1 게이트화, M1 계열 이월 4건 청산(§5·§5.2·§6·§9)`

`docs/RENAME-MAP.md` 의 "M1d 로 이월된 것" 절을 **결과로 갱신한다** — 네 항목 각각에 무엇을 했는지(또는 왜 여전히 안 하는지)를 적고, Task 3 Step 6 에서 수집한 **Windows 스킵 목록**을 함께 남긴다. 조용한 스킵은 초록의 의미를 갉아먹는다.

```bash
git add docs/V0.7-IMPLEMENTATION-DESIGN.md docs/RENAME-MAP.md
git commit -m "docs: record the M1d doctor checks, the windows gate, and the debts it settles"
npm run test:l1 2>&1 | tail -4
```

> `brand-names.test.cjs` 의 허용목록에 두 문서가 이미 있다(M1c 에서 확인). 새 문서를 만들지 않는 한 추가 작업은 없다.

- [ ] **Step 8: 태그**

```bash
git tag -a v0.7.0-m1d -m "M1d: doctor gsd-shadow + legacy-residue; windows L1 as a gate; manifest-based check resolution, per-id rollback, tier alignment"
git tag | tail -5
git status --short; echo "(끝 — 비어 있어야 한다)"
```

기대: `v0.7.0-m0` · `v0.7.0-m1a` · `v0.7.0-m1b` · `v0.7.0-m1c` · `v0.7.0-m1d`. **태그는 push 하지 않는다.**

- [ ] **Step 9: `main` 을 전진시키고 작업 브랜치를 정리한다**

```bash
git log --oneline -1                      # HEAD 가 M1d 마지막 커밋인지
git push origin HEAD:main
gh run list --branch main --limit 1
git push origin --delete m1d-windows
```

기대: `main` 의 L1 실행이 세 잡 전부 초록. 이때의 초록이 M1d 의 최종 판정이다.

---

## 범위 밖으로 남긴 것

발견했지만 M1d 에서 하지 않는 것들. 전부 소유자를 적었다.

- **파이썬 스모크 6종의 Windows 잡.** `tar`·`bash`·`chmod`·POSIX 경로를 가정한다. L1 을 초록으로 만드는 것과 스모크를 이식하는 것은 크기가 다르다. 소유자: M7 릴리스 전.
- **`legacy-backup.cjs` 의 `tar` 의존 제거.** Windows 에서 `tar.exe` 가 없거나 다르게 동작하면 Task 3 은 테스트를 스킵하지 **도구를 바꾸지** 않는다. Node 로 tar/gzip 을 직접 쓰는 것은 별도 마일스톤 크기다. 소유자: M7 또는 별도 승인.
- **config 키 재명명** (`crew.gstack.*` → `crew.review.*` 등). 설계 §5.1 개명표가 요구하는 것은 **루트**(`triple_crown.*` → `crew.*`)뿐이고 그건 M1a 에서 끝났다. 하위 네임스페이스를 지금 바꾸면 이미 프로젝트에 쓰인 키의 마이그레이션 코드가 필요하고 소비처가 게이트 스크립트 전부다. 소유자: **M7 릴리스 노트와 함께**(마이그레이션 경로를 같이 낼 때).
- **`checkBackup` 의 내용(해시) 일치 검증.** Task 6 은 mtime 기반 **경고**까지만 한다. 바이트 일치를 요구하면 백업 직후가 아닌 한 게이트가 열리지 않아 명령이 못 쓰게 된다. 소유자: 없음(하지 않기로 확정 — RENAME-MAP 에 근거를 남긴다).
- **제거의 트랜잭션화.** 현재 답은 `REMOVAL_ORDER` 와 백업 안의 `restore.sh` 다. 완전한 롤백은 M1d 보다 크다. 소유자: M7 릴리스 전.
- **`crew-security` 분리.** GSD 1.11.0 단일 항목 capMap. 소유자: 상류 수정 후.
- **`gsd-core` 의 단일 항목 capMap 을 상류에 보고.** 소유자: 사용자.
- **`uninstall-legacy` 의 실사용 검증.** 이 머신에 레거시가 없다(실측 0). 소유자: 사용자(실제 구 설치본이 남은 머신을 만났을 때).
- **`gsd-shadow` 의 자동 정리.** doctor 는 경고만 한다. 남의 설치자가 만든 디렉터리를 우리가 지우는 것은 소유권 위반이다. 소유자: 없음(의도된 설계).

---

## 자기 검토 기록

**스펙 커버리지.** 설계 §5 M1d 행("doctor 검사 2건") → Task 4·5. §5.2 `gsd-shadow` → Task 4. §5.2 마지막 문단(`home-root-refusal` 회귀 확인) → Task 10 Step 2. §6 L1 표의 `shadow-skill` 행 → Task 4 의 신규 파일. §8(커밋·태그) → Global Constraints + Task 10 Step 8. M1c 이월 5건 → Task 3(Windows 첫 실행 결과) · Task 5(doctor 레거시 잔여) · Task 8(교차 capability 경로) · Task 9(tier) · 범위 밖(config 키). RENAME-MAP 이월 4건 → Task 6(detect `~/`, 백업 신선도) · Task 7(rollback id 별) · 범위 밖(내용 일치, 트랜잭션화).

**플레이스홀더 스캔.** Task 3 만 "측정 후 결정" 을 담는다. 그것을 TODO 로 두지 않기 위해 결정표(증상 → 원인 → 조치)와, 표 밖의 실패가 나왔을 때의 절차(고치고 표에 행 추가, Task 10 Step 5 가 판정)를 명시했다. 나머지 태스크는 전부 실제 코드 블록을 담는다.

**타입 일관성.** `planRemoval` 의 반환 필드명(`capabilities`/`skills`/`hookFile`/`settingsGroup`/`routingBlock`/`vendorDir`/`undetermined`/`count`)은 Task 5·6 에서 같은 이름으로 쓴다. `checkBackup` 의 `createdAt` 은 Task 6 의 `staleTargets(plan, createdAt)` 인자와 일치한다. `rollbackCapabilities` 의 네 번째 인자는 Task 7 에서 `{previous, hadPrevious}` 객체로 **한 번에** 바뀌며 호출부도 같은 커밋에서 고친다. `resolveCheck(root, file)` 는 Task 8 의 export 이름과 테스트의 require 이름이 같고, `checkDir`/`pathIn`/`markPlanReviewedPath` 는 전부 같은 태스크 안에서 정의·소비된다.

**남은 불확실성 하나.** Task 3 의 Windows 잔여 실패 목록은 지금 알 수 없다 — 첫 스텝이 죽어 `L1 contract` 스텝이 한 번도 실행되지 않았기 때문이다(실측). 이 계획은 그 불확실성을 태스크 하나에 가두고, 나머지 9개 태스크는 그 결과와 무관하게 진행 가능하도록 순서를 잡았다. Task 1 만 Task 3 의 선행이다.
