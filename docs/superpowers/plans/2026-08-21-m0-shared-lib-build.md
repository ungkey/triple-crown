# M0 — 공유 lib 빌드 파이프라인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공유 lib의 단일 소스(`lib/`)를 만들고, capability 사본을 생성·검증하는 빌드 파이프라인(`scripts/build-capabilities.cjs` + `LIB-HASH.json`)을 `npm pack`·설치 프리플라이트·L1 계약 테스트에 물린 뒤, `main`의 `VERSION`을 `0.7.0-dev`로 내려 재구성 기간 내내 배포를 잠근다.

**Architecture:** 설계서 [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) v1.3 §4(M0)의 실행 계획이다. `${GSD_CAP_DIR}`은 capability 자기 디렉터리만 가리키므로 M1b가 capability를 9개로 쪼개면 게이트가 남의 lib을 참조할 수 없다. 상위 문서 §5.2 3안 중 **A(패키징 시 복제)** 를 구현한다 — 런타임 결합 0, 소스 중복 0. 사본이 canonical과 다를 때 "canonical을 정상 수정했다"와 "사본을 손으로 고쳤다"는 2-way 비교로 갈라낼 수 없으므로, 직전 생성 해시를 제3의 기준점으로 쓰는 3-way 판정을 쓴다. **개명도 capability 분해도 하지 않는다** — 그것은 M1a/M1b다.

**Tech Stack:** Node.js ≥24 (실측 v24.14.0), `node:test` 러너, Node stdlib만 (외부 npm 의존성 0), 시스템 `npm`·`git`·`python3`.

**Spec:** [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §3(저장소 구조) · §4.2~4.5(M0) · §6 L1 · §8(커밋·태그) · §9(위험)

## Global Constraints

- 외부 npm 의존성 추가 금지. 빌드·테스트는 stdlib + 시스템 `npm`/`git`만 쓴다 (`package.json`에 `dependencies` 없음 유지).
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green.
- **push 금지.** 커밋·태그는 로컬에만. push는 사용자 승인 후 별도. (`.github/workflows/`를 추가해도 push 전까지는 아무것도 실행되지 않는다 — 그 사실을 Task 6에 명시한다.)
- **M0은 개명 단계가 아니다.** 코드 식별자·스킬명·디렉터리명·환경변수는 전부 `triple-crown`/`triple-gstack`/`TRIPLE_CROWN_*` 유지. 신규로 만드는 이름(`lib/`, `build-capabilities.cjs`, `LIB-HASH.json`)만 브랜드 중립이다.
- **머신·폴더 종속 금지.** 저장소 경로는 `path.resolve(__dirname, '..')` 또는 `git rev-parse --show-toplevel`로 얻는다. 하드코딩된 절대 경로를 새로 만들지 않는다. 트리를 더럽히는 테스트는 반드시 임시 복사본에서 돈다.
- 파일 800줄 이하. `scripts/build-capabilities.cjs` 목표 ~200줄 (2-패스 분리 + 출처/prune 가드 포함).
- **canonical `lib/`은 배포하지 않는다.** `package.json`의 `files`에 `lib`을 추가하지 않는다. 배포본에는 사본만 들어가고, 설치 시점 검사는 **사본 대 `LIB-HASH.json`** 으로만 성립해야 한다 (Task 5의 근거).

## 선행 조건 (착수 전 확인)

M0은 M-1 산출물 위에 쌓인다. 아래가 전부 참이 아니면 **착수하지 않는다.**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git rev-parse -q --verify refs/tags/v0.6.5 >/dev/null && echo "OK v0.6.5 태그 존재" || echo "BLOCK: M-1 미완료"
[ -f scripts/legacy-backup.cjs ] && echo "OK legacy-backup.cjs" || echo "BLOCK: M-1 Task 3~6 미완료"
ls e2e/contract/*.test.cjs
node --test 'e2e/contract/**/*.test.cjs' && echo "OK L1 green"
grep -n 'REF=' install.sh
node scripts/legacy-backup.cjs detect
```

기대: `v0.6.5` 태그가 있고, `e2e/contract/`에 `prerelease-fence` · `home-root-refusal` · `legacy-backup` · `install-entrypoints` 네 파일이 있고, L1이 green이고, `install.sh`의 기본 ref가 `v0.6.5`다.

레거시 정리(설계 §2.0.1 — "M0 착수 전에 수동 수행")는 **`detect`가 `legacy targets: 0`이면 수행할 대상이 없어 통과**다. 0이 아니면 M-1 Task 9 런북을 먼저 끝낸다.

## File Structure

```
lib/                              신규 — canonical 공유 lib 단일 소스 (배포 안 함)
  repo-state-lib.cjs                이동(무변경) — capabilities/triple-gstack/checks/ 에서
  evidence-store.cjs                이동(무변경) — 동상
  resolve-phase-dir.cjs             이동(무변경) — 동상
scripts/build-capabilities.cjs    신규 — 3-way 판정 복제기 + --check (~150줄)
capabilities/triple-gstack/checks/
  lib/repo-state-lib.cjs            신규(커밋되는 생성물) — lib/ 의 사본
  lib/evidence-store.cjs            신규(커밋되는 생성물)
  lib/resolve-phase-dir.cjs         신규(커밋되는 생성물)
  lib/LIB-HASH.json                 신규(커밋되는 생성물) — 직전 생성 해시 기록
  *.cjs                             수정 — require 경로 12파일 14곳
capabilities/triple-gstack/skills/
  triple-gstack-code-review/SKILL.md  수정 — checks/ → checks/lib/ 2곳
  triple-gstack-qa-only/SKILL.md      수정 — 동상 1곳
bin/triple-crown.cjs              수정 — crypto require, 사본 무결성 검사, 프리플라이트 호출 위치
package.json                      수정 — version, scripts(build:caps/prepack/test/test:pack)
VERSION                           수정 — 0.6.5 → 0.7.0-dev
capabilities/*/capability.json     수정 — version 3곳 → 0.7.0-dev
tests/run_installer_smoke.py       수정 — --allow-prerelease 2곳
tests/run_npx_tarball_smoke.py     수정 — --allow-prerelease 1곳
tests/run_bash_installer_smoke.py  수정 — --allow-prerelease 1곳
e2e/contract/
  helpers/repo.cjs                신규 — 저장소 임시 복사 + 트리 순회
  version-consistency.test.cjs    신규 — Task 1
  lib-layout.test.cjs             신규 — Task 2
  lib-hash.test.cjs               신규 — Task 3
  pack-contract.test.cjs          신규 — Task 4
  bundled-lib-integrity.test.cjs  신규 — Task 5
  install-entrypoints.test.cjs    수정 — Task 1 (tgz·TRIPLE_CROWN_REF 기준값 2곳)
  prerelease-fence.test.cjs       수정 — Task 3 (copyPackage → helpers/repo.cjs)
.github/workflows/l1.yml          신규 — Task 6
```

## 실측 기준점 (2026-08-21 확인)

이 절의 값은 전부 이 저장소에서 직접 확인했다. **관측 시점의 사실이지 계약이 아니다** — 실행 시 어긋나면 계획이 아니라 실측을 따른다.

- `git rev-parse --show-toplevel` → 저장소 루트. HEAD `6889181 docs: add the M0 shared-lib build plan, reconciled against the shipped M-1` (**2026-08-21 재실측**)
- **M-1은 출하 완료다.** `VERSION`=`0.6.5`, 태그 `v0.6.4`·`v0.6.5` 존재, `install.sh:34`이 `REF="${TRIPLE_CROWN_REF:-v0.6.5}"`, `scripts/legacy-backup.cjs` 존재, `e2e/contract/`에 `home-root-refusal`·`install-entrypoints`·`legacy-backup`·`prerelease-fence` 4파일 + `helpers/fake-home.cjs`, **L1 42건 green**. `.github/` 없음
- 공유 lib 현 위치·줄수: `capabilities/triple-gstack/checks/repo-state-lib.cjs` 194줄 · `evidence-store.cjs` 260줄 · `resolve-phase-dir.cjs` 90줄 (설계 §3 표기와 일치)
- 세 파일 모두 `__dirname` 미사용 — 경로 가정이 없으므로 이동해도 동작이 변하지 않는다. `process.cwd()` 기반(`repo-state-lib.cjs:38,48` · `resolve-phase-dir.cjs:65`)이라 호출자 cwd만 영향
- `require('./repo-state-lib.cjs')` 등 **바깥 참조 14곳 / 12파일**: `review-session.cjs:9,14` · `canary-session.cjs:9` · `security-risk.cjs:4` · `release-ledger.cjs:7` · `uat-bridge.cjs:6` · `qa-session.cjs:6` · `security-ready.cjs:3` · `security-session.cjs:4` · `verify-ready.cjs:6,10` · `docs-release-session.cjs:9` · `qa-ready.cjs:4` · `ship-guard-control.cjs:6`
- **lib 내부 참조 2곳** (`evidence-store.cjs:10` · `resolve-phase-dir.cjs:6` → `./repo-state-lib.cjs`)은 셋이 함께 이동하므로 **바뀌지 않는다**
- SKILL.md 호출 3곳: `triple-gstack-code-review/SKILL.md:56` (`checks/resolve-phase-dir.cjs`) · `:168` (`checks/evidence-store.cjs`) · `triple-gstack-qa-only/SKILL.md:39` (`checks/resolve-phase-dir.cjs`)
- `triple-crown-guide`의 유일한 check(`workflow-guide.cjs`)는 세 lib을 쓰지 않는다. `triple-superpowers`에는 `checks/`가 없다 → **M0 시점 lib 소비자는 `triple-gstack` 하나뿐**
- 게이트 `command`는 `${GSD_CAP_DIR}/checks/<script>.cjs` 형태 5개(`capability.json:272,285,298,311,324`). **어느 게이트도 lib을 직접 실행하지 않는다** — 설계 §4.3 표의 "게이트 command가 `checks/lib/`을 참조" 행은 실측상 *게이트 스크립트의 `require`* 와 *SKILL.md의 직접 호출* 두 경로로 나타난다
- `bin/triple-crown.cjs:264 validateBundledManifests()`가 `cap.version !== VERSION`을 강제한다 → **`VERSION`을 올리면 capability.json 3개도 같이 올려야 한다**
- `bin/triple-crown.cjs:532`가 `if(opts.dryRun) { log('DRY RUN'); ...; return; }` — **프리플라이트(`:568`)보다 앞이라 `--dry-run`은 매니페스트 검사를 타지 않는다**
- `install()`의 실제 배치: `:515` 함수 시작 · `:516` 프로젝트 존재 검사 · `:517~519` 프리릴리스 펜스 · `:520~522` `$HOME` 펜스 · `:523` `const actions=[`. **`:522`는 `$HOME` 펜스의 닫는 `}`이지 dry-run 반환이 아니다** — Task 5의 삽입 지점(`:522` 직후)과 dry-run 반환(`:532`)을 혼동하지 않는다
- `bin/triple-crown.cjs`는 `crypto`를 require하지 않는다 (`fs`·`path`·`os`·`child_process`·`readline`만). 자체 `sha256` 헬퍼도 없다
- 설치를 호출하는 테스트 6곳: `tests/run_installer_smoke.py:46,79` · `tests/run_npx_tarball_smoke.py:43` · `tests/run_bash_installer_smoke.py:31`(`install.sh` 경유) · `e2e/contract/home-root-refusal.test.cjs:20,26`(**L1**). `install.sh`는 `"$@"`로, `install.ps1`은 `@RemainingArgs`로 전달하므로 플래그가 그대로 넘어간다
- `tests/run_installer_smoke.py:48`은 `expected_version=(ROOT/"VERSION").read_text().strip()` — M-1 Task 7이 `"0.6.4"` 하드코딩을 **이미 제거했다.** M0에서 손댈 것 없음
- `tests/validate_prototype.py`·`run_local_smoke.py`는 세 lib 파일 경로를 열거하지 않는다 → 이동해도 영향 없음
- `npm pack --dry-run` 현재 산출 파일 44개. `package.json` `files`에 `capabilities` 포함 → `checks/lib/`는 자동으로 실린다
- **`npm pack --dry-run`은 `prepack`을 실제로 실행한다** (probe 실측: 마커 파일 생성 확인). `--json` 출력은 원소 1개 배열이고 `[0].files`는 `{path,size,mode}` 배열이다
- `.gitignore`에 `lib/`·`.github/`를 막는 규칙 없음. `*.tgz`는 무시됨
- `tests/fake-gsd.cjs:36`이 `fs.cpSync(src,dst,{recursive:true})`로 capability를 통째 복사 → `checks/lib/`가 `.gsd/capabilities/<id>/`까지 따라간다

---

### Task 1: 프리릴리스 전환 — `VERSION` 0.7.0-dev + 버전 일치 계약

재구성 기간 내내 `main` 산출물이 **어느 진입점으로 들어오든** 설치되지 않게 만든다 (설계 §4.5 계층 2). 이 태스크는 M0의 **첫 커밋**이어야 한다 — 이후 태스크가 트리를 흔드는 동안 배포 잠금이 이미 걸려 있어야 하기 때문이다.

**Files:**
- Modify: `VERSION` · `package.json` (`version`)
- Modify: `capabilities/triple-superpowers/capability.json` · `capabilities/triple-gstack/capability.json` · `capabilities/triple-crown-guide/capability.json` (각 `version` 필드)
- Modify: `tests/run_installer_smoke.py:46,79` · `tests/run_npx_tarball_smoke.py:43` · `tests/run_bash_installer_smoke.py:31`
- Modify: `e2e/contract/home-root-refusal.test.cjs:20,26` (설치기를 부르는 **L1** 테스트도 같은 펜스에 걸린다)
- Modify: `e2e/contract/install-entrypoints.test.cjs:57,78` (`VERSION`을 기준으로 삼는 테스트 **2개** — tgz 파일명, `TRIPLE_CROWN_REF=` 리터럴)
- Test: `e2e/contract/version-consistency.test.cjs` (신규)

**Interfaces:**
- Consumes: M-1 Task 1의 `--allow-prerelease` 플래그와 `install()` 상단 프리릴리스 거부. M-1 Task 8의 `install.sh` 기본 ref 상수 `v0.6.5`.
- Produces: `VERSION` == `package.json.version` == 모든 `capabilities/*/capability.json`의 `version` == `0.7.0-dev`. 이후 모든 태스크는 설치를 부를 때 `--allow-prerelease`를 붙인다.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/version-consistency.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function version() {
  return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
}

test('VERSION, package.json and every capability manifest agree', () => {
  const v = version();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, v, 'package.json version must equal VERSION');

  // bin/triple-crown.cjs validateBundledManifests() 가 설치 시점에 같은 등식을 강제한다
  // (cap.version !== VERSION 이면 프리플라이트 실패). 여기서 먼저 깨뜨려 두면 설치를
  // 돌리지 않고도 커밋 전에 잡힌다.
  const ids = fs.readdirSync(path.join(ROOT, 'capabilities'));
  assert.ok(ids.length > 0, 'no capabilities found');
  for (const id of ids) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'capabilities', id, 'capability.json'), 'utf8'));
    assert.strictEqual(m.version, v, `${id}: manifest version must equal VERSION`);
  }
});
```

> **§4.5 계층 1(부트스트랩 자기일관성)은 여기서 다시 검사하지 않는다.** M-1이 출하한
> `install-entrypoints.test.cjs:30`의 `release tree: default ref equals the tag this tree
> ships as`가 이미 같은 불변식을 — 그것도 `install.sh`와 `install.ps1` 양쪽으로 —
> 강제한다. 두 파일에 같은 단언을 두면 한쪽만 고쳐 놓고 green을 보게 된다.
> 이 파일의 책임은 **`VERSION` == `package.json` == 모든 `capability.json`** 하나다.

- [ ] **Step 2: 테스트가 현재 트리에서 도는지 확인**

Run: `node --test e2e/contract/version-consistency.test.cjs`
Expected: PASS 1건. 이 테스트는 회귀 방지선이지 RED 유도가 아니다 — RED는 다음 단계에서 `VERSION`만 올려 인위적으로 만든다.

- [ ] **Step 3: `VERSION`만 올려 RED 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
echo "0.7.0-dev" > VERSION
node --test e2e/contract/version-consistency.test.cjs
```

Expected: FAIL — `package.json version must equal VERSION` (`0.6.5` != `0.7.0-dev`). 테스트가 실제로 불일치를 잡는다는 증명이다.

- [ ] **Step 4: 나머지 버전 4곳 정렬**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node -e '
const fs = require("fs");
const v = fs.readFileSync("VERSION", "utf8").trim();
const bump = (p) => {
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  j.version = v;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(`${p} -> ${v}`);
};
bump("package.json");
for (const id of fs.readdirSync("capabilities")) bump(`capabilities/${id}/capability.json`);
'
git diff --stat
node --test e2e/contract/version-consistency.test.cjs
```

Expected: PASS 1건. `git diff --stat`이 파일당 `1 +, 1 -` 수준이어야 한다 — 그보다 크면 재직렬화가 포맷을 바꾼 것이므로 되돌리고 손으로 고친다.

- [ ] **Step 5: 프리릴리스 거부에 걸리는 호출 6곳에 `--allow-prerelease` 추가**

`install()`의 프리릴리스 펜스는 **함수 최상단**이라 `$HOME` 펜스보다 먼저 터진다. 즉 `VERSION`을 올리는 순간 설치기를 무플래그로 부르는 테스트는 전부 "프리릴리스라서 거부됨"으로 바뀐다. 파이썬 스모크 4곳뿐 아니라 **L1의 `home-root-refusal.test.cjs`도 여기 걸린다** — 실측:

```
AssertionError: The input did not match the regular expression /\$HOME/. Input:
'Triple Crown installer: Triple Crown v0.7.0-dev is a prerelease build from a development branch. …'
```

`prerelease-fence.test.cjs:43`의 `repo tree install behavior matches its own VERSION prerelease state`는 **손대지 않는다** — M-1이 미리 `VERSION`으로 기대를 뒤집게 써 뒀다.

`tests/run_installer_smoke.py:46` — 리스트 끝에 플래그를 더한다:

```python
        p=run(["node",str(CLI),"install","--project",str(project),"--yes","--no-bootstrap","--allow-prerelease"],ROOT,env)
```

`tests/run_installer_smoke.py:79` — 재설치 멱등성 검사도 같은 형태:

```python
        run(["node",str(CLI),"install","--project",str(project),"--yes","--no-bootstrap","--allow-prerelease"],ROOT,env)
```

`tests/run_npx_tarball_smoke.py:43` 부근 — argv 리스트에서 `"triple-crown","install",` 다음 줄에 같은 들여쓰기로 추가:

```python
            "triple-crown","install",
            "--allow-prerelease",
```

`tests/run_bash_installer_smoke.py:31` — `install.sh`는 `"$@"`로 전부 전달한다:

```python
        p=run(["bash",str(ROOT/"install.sh"),"--yes","--no-bootstrap","--no-ship-guard","--allow-prerelease","--project",str(project)],project,env)
```

`e2e/contract/home-root-refusal.test.cjs` — 두 호출 모두 플래그를 넣는다. 첫 호출은 플래그를 넣어야 비로소 **`$HOME` 펜스**가 터져 원래 검사하려던 exit 4 + `$HOME` 메시지가 나온다:

```js
  // VERSION 이 프리릴리스인 동안에는 최상단 펜스가 먼저 터져 $HOME 펜스에 닿지 못한다.
  // 이 테스트의 대상은 $HOME 거부이므로 프리릴리스 펜스는 명시적으로 연다.
  const refused = run(['install', '--yes', '--dry-run', '--allow-prerelease', '--project', fakeHome]);
```

```js
  const ok = run(['install', '--yes', '--dry-run', '--allow-prerelease', '--project', proj]);
```

각 파일의 해당 함수 위에 이유를 남긴다 (4곳 동일 문구):

```python
# main 은 v0.7 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
# 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
```

- [ ] **Step 6: 문서 기준값을 `VERSION`에서 고정 ref로 옮기기 (테스트 2개)**

M-1 Task 8이 만든 테스트 중 **두 개**가 문서 리터럴을 `VERSION`과 비교한다:

| 위치 | 테스트 | 무엇을 스캔하나 |
|---|---|---|
| `:57` | `every documented tarball example names the version this tree ships as` | `triple-crown-workflow-installer-<ver>.tgz` |
| `:78` | `every documented TRIPLE_CROWN_REF= literal pins the version this tree ships as` | `TRIPLE_CROWN_REF=v<ver>` |

`VERSION`이 `0.7.0-dev`가 되는 순간 **둘 다** "문서가 설치 불가능한 프리릴리스를 안내하라"는 요구로 뒤집힌다. 하나만 고치면 Step 7의 `npm run test:l1`이 나머지 하나에서 죽는다. 둘의 기준값을 "사용자가 실제로 설치해야 하는 릴리스" = `install.sh`의 고정 ref로 함께 옮긴다.

`:24`의 `default bootstrap ref is not a branch name`과 `:37`의 `every documented github install example pins the bootstrap tag`는 이미 `shDefaultRef()`를 쓰므로 손대지 않는다. `:30`의 `release tree: default ref equals the tag this tree ships as`도 그대로 둔다 — 프리릴리스에서 조기 반환하고, 릴리스 커밋에서 `ref == VERSION`을 강제해 이 Step이 벌린 둘 사이의 간극을 다시 닫는 게 바로 그 테스트다.

먼저 `ps1DefaultRef()` 정의 바로 아래(`:22` 다음)에 헬퍼를 추가한다:

```js
// 문서가 안내해야 하는 것은 이 트리의 VERSION 이 아니라 부트스트랩이 고정한 릴리스다.
// 재구성 중 main 의 VERSION 은 0.7.0-dev 이고 그 tarball 은 설치가 거부된다(§4.5 계층 2).
// 최종 릴리스 커밋에서는 둘이 같아지므로 — 'release tree' 테스트가 그걸 강제한다 —
// 이 식은 그때도 옳다. 따라서 릴리스 시점에 되돌릴 코드가 없다.
function releaseVersion() {
  return shDefaultRef().replace(/^v/, '');
}
```

그다음 두 테스트의 첫 줄을 각각 교체한다.

Before (`:58`, `:79` — 두 곳 모두 같은 줄):

```js
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
```

After (두 곳 모두):

```js
  const version = releaseVersion();
```

두 테스트의 실패 메시지 `(VERSION=${version})`도 `(release=v${version})`으로 바꾼다 — 실패했을 때 "VERSION과 안 맞는다"가 아니라 "릴리스 ref와 안 맞는다"가 실제 원인이다.

> **그 줄에 전역 `sed`를 쓰면 안 된다.** 똑같은 줄이 `:31`의 `release tree: default ref
> equals the tag this tree ships as`에도 있어서 전역 치환은 **3건**을 잡는다. 그 테스트까지
> 바뀌면 단언이 `shDefaultRef() === 'v' + shDefaultRef().replace(/^v/,'')` 라는 항등식이 되어
> **§4.5 계층 1 검사가 조용히 무력화된다.** 실측으로 확인한 값이다 (`grep -c` = 3).

앵커를 다음 줄까지 넓혀 두 곳만 잡는다:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node -e '
const fs = require("fs");
const F = "e2e/contract/install-entrypoints.test.cjs";
let s = fs.readFileSync(F, "utf8");
const one = (o, x, l) => { const c = s.split(o).length - 1; if (c !== 1) throw new Error(l + ": " + c); s = s.split(o).join(x); };

one("  return m[1];\n}\n\ntest(\x27default bootstrap ref is not a branch name\x27",
    "  return m[1];\n}\n\nfunction releaseVersion() {\n  return shDefaultRef().replace(/^v/, \x27\x27);\n}\n\ntest(\x27default bootstrap ref is not a branch name\x27",
    "helper");

const pair = "  const version = fs.readFileSync(path.join(ROOT, \x27VERSION\x27), \x27utf8\x27).trim();\n  const scanned = [\x27README.md\x27, \x27docs/INSTALLER.md\x27, \x27docs/WORKFLOW-GUIDE.md\x27,";
let c = s.split(pair).length - 1; if (c !== 2) throw new Error("pair: " + c);
s = s.split(pair).join("  const version = releaseVersion();\n  const scanned = [\x27README.md\x27, \x27docs/INSTALLER.md\x27, \x27docs/WORKFLOW-GUIDE.md\x27,");

const msg = "(VERSION=${version})";
c = s.split(msg).length - 1; if (c !== 2) throw new Error("msg: " + c);
s = s.split(msg).join("(release=v${version})");

fs.writeFileSync(F, s);
console.log("helper 1 · 기준값 2 · 메시지 2 치환");
'
```

검증 — `:31` 테스트가 **원형 그대로**여야 한다:

```bash
sed -n '/release tree: default ref/,+2p' e2e/contract/install-entrypoints.test.cjs
```

Expected: `const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();` 줄이 살아 있다. 사라졌으면 되돌린다.

- [ ] **Step 7: 전체 회귀 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm run test:l1
python tests/run_installer_smoke.py
python tests/run_bash_installer_smoke.py
python tests/run_v061_l0.py
python tests/run_local_smoke.py
npm pack && python tests/run_npx_tarball_smoke.py && rm -f triple-crown-workflow-installer-*.tgz
node bin/triple-crown.cjs install --yes --dry-run --project "$(mktemp -d)"
```

Expected: L1 전부 PASS · 파이썬 스모크 전부 `PASS …` · 마지막 명령은 **non-zero + stderr에 `prerelease`** (계층 2가 실제로 잠갔다는 증명).

- [ ] **Step 8: 커밋**

```bash
git add VERSION package.json capabilities/triple-superpowers/capability.json \
        capabilities/triple-gstack/capability.json capabilities/triple-crown-guide/capability.json \
        tests/run_installer_smoke.py tests/run_npx_tarball_smoke.py tests/run_bash_installer_smoke.py \
        e2e/contract/install-entrypoints.test.cjs e2e/contract/version-consistency.test.cjs
git commit -m "chore: enter v0.7 prerelease (0.7.0-dev) and lock main against distribution"
```

---

### Task 2: canonical `lib/` 승격 + 참조 경로 전환

**Files:**
- Create: `lib/repo-state-lib.cjs` · `lib/evidence-store.cjs` · `lib/resolve-phase-dir.cjs` (`git mv`, 내용 무변경)
- Create: `capabilities/triple-gstack/checks/lib/repo-state-lib.cjs` · `evidence-store.cjs` · `resolve-phase-dir.cjs` (사본, 커밋 대상)
- Modify: `capabilities/triple-gstack/checks/` 12파일 14곳의 `require`
- Modify: `capabilities/triple-gstack/skills/triple-gstack-code-review/SKILL.md:56,168` · `triple-gstack-qa-only/SKILL.md:39`
- Create: `e2e/contract/helpers/repo.cjs`
- Test: `e2e/contract/lib-layout.test.cjs`

**Interfaces:**
- Consumes: Task 1의 프리릴리스 상태 (스모크 호출에 `--allow-prerelease`가 이미 들어가 있다).
- Produces: canonical 경로 `lib/<f>.cjs` · 사본 경로 `capabilities/<id>/checks/lib/<f>.cjs`. `helpers/repo.cjs`가 `{ ROOT, copyRepo(prefix), walkFiles(dir, exts) }`를 내보낸다 — Task 3·4·5가 그대로 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/helpers/repo.cjs`:

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// helpers/ 는 e2e/contract/ 아래이므로 저장소 루트는 세 단계 위다.
const ROOT = path.join(__dirname, '..', '..', '..');

// 저장소를 통째로 임시 디렉터리에 복사한다. drift·hand-edit 시나리오는 트리를
// 더럽히므로 원본에서 재현할 수 없다. .git 과 node_modules 는 제외 — 복사 비용의
// 대부분이 거기고, 어느 테스트도 이력이나 의존성을 보지 않는다.
function copyRepo(prefix = 'crew-repo-') {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules');
    },
  });
  return dest;
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

module.exports = { ROOT, copyRepo, walkFiles };
```

`e2e/contract/lib-layout.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT, walkFiles } = require('./helpers/repo.cjs');

const SHARED = ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs'];

test('the shared libs live in lib/ and nowhere else as an original', () => {
  for (const f of SHARED) {
    assert.ok(fs.existsSync(path.join(ROOT, 'lib', f)), `lib/${f} must be the canonical copy`);
    // 이동 전 위치에 남아 있으면 두 원본이 공존한다 — 정확히 이 상태가 §4 가 없애려는 것이다.
    assert.ok(!fs.existsSync(path.join(ROOT, 'capabilities', 'triple-gstack', 'checks', f)),
      `capabilities/triple-gstack/checks/${f} must have moved into lib/`);
  }
});

test('every bundled copy is byte-identical to its canonical lib', () => {
  const dir = path.join(ROOT, 'capabilities', 'triple-gstack', 'checks', 'lib');
  for (const f of SHARED) {
    assert.deepStrictEqual(
      fs.readFileSync(path.join(dir, f)),
      fs.readFileSync(path.join(ROOT, 'lib', f)),
      `checks/lib/${f} drifted from lib/${f}`);
  }
});

test('every relative require inside capabilities/ resolves to a file that exists', () => {
  // require 경로를 손으로 12파일에서 고치는 작업이라 한 곳만 놓쳐도 런타임에만 터진다.
  // 정적으로 전수 확인한다.
  const bad = [];
  for (const f of walkFiles(path.join(ROOT, 'capabilities'), ['.cjs'])) {
    const dir = path.dirname(f);
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      if (!fs.existsSync(path.resolve(dir, m[1]))) {
        bad.push(`${path.relative(ROOT, f)}: require('${m[1]}')`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'unresolvable relative requires');
});

test('every checks/ path a SKILL.md invokes exists in that capability', () => {
  // SKILL.md 는 실행되는 문서다. 여기 적힌 경로가 틀리면 스킬이 런타임에 죽는데
  // 어떤 단위 테스트도 마크다운을 실행하지 않는다.
  const bad = [];
  for (const f of walkFiles(path.join(ROOT, 'capabilities'), ['SKILL.md'])) {
    // capabilities/<id>/skills/<stem>/SKILL.md → capability 루트는 세 단계 위
    const capDir = path.join(path.dirname(f), '..', '..');
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/(checks\/[A-Za-z0-9._/-]+\.cjs)/g)) {
      if (!fs.existsSync(path.join(capDir, m[1]))) {
        bad.push(`${path.relative(ROOT, f)}: ${m[1]}`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'SKILL.md points at missing check scripts');
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test e2e/contract/lib-layout.test.cjs`
Expected: FAIL 2건 — `lib/repo-state-lib.cjs must be the canonical copy`, 그리고 `checks/lib/repo-state-lib.cjs` 읽기 ENOENT. 나머지 2건(require 해결·SKILL.md 경로)은 이동 전이라 PASS다.

- [ ] **Step 3: 이동 + 사본 생성**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
mkdir -p lib capabilities/triple-gstack/checks/lib
for f in repo-state-lib.cjs evidence-store.cjs resolve-phase-dir.cjs; do
  git mv "capabilities/triple-gstack/checks/$f" "lib/$f"
  cp "lib/$f" "capabilities/triple-gstack/checks/lib/$f"
done
ls -1 lib capabilities/triple-gstack/checks/lib
git status --short
```

Expected: 양쪽에 세 파일. `git status --short`가 `R` 3건 + 신규 디렉터리 1건.

> 사본은 **커밋되는 생성물**이다. `npm pack`이 `capabilities/`만 싣기 때문에 사본이 커밋되어 있지 않으면 배포본에 lib이 없다. 사본을 `.gitignore`에 넣지 않는다.

- [ ] **Step 4: 바깥 참조 14곳 전환**

`checks/` 바로 아래 스크립트만 고친다 — `checks/lib/` 안의 두 참조는 형제끼리라 그대로 둔다.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT/capabilities/triple-gstack/checks"
for f in *.cjs; do
  sed -i -E "s#require\((['\"])\./(repo-state-lib|evidence-store|resolve-phase-dir)\.cjs\1\)#require(\1./lib/\2.cjs\1)#g" "$f"
done
cd "$REPO_ROOT"
# grep -c 는 매치된 **줄** 수라 한 줄에 두 참조가 있으면 과소 계수한다. occurrence 를 센다.
grep -o "require(.\./lib/" capabilities/triple-gstack/checks/*.cjs | wc -l | sed 's/^/바깥 참조 전환: /'
grep -rn "require(.\./\(repo-state-lib\|evidence-store\|resolve-phase-dir\)" capabilities/triple-gstack/checks/*.cjs || echo "OK 잔여 없음"
grep -n "require('\./" capabilities/triple-gstack/checks/lib/*.cjs
```

Expected: `바깥 참조 전환: 14` · `OK 잔여 없음` · 마지막은 `evidence-store.cjs:10`·`resolve-phase-dir.cjs:6`이 `./repo-state-lib.cjs` **그대로** (형제 참조라 바뀌면 안 된다).

- [ ] **Step 5: SKILL.md 3곳 전환**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
sed -i -E 's#(checks)/(resolve-phase-dir|evidence-store)\.cjs#\1/lib/\2.cjs#g' \
  capabilities/triple-gstack/skills/triple-gstack-code-review/SKILL.md \
  capabilities/triple-gstack/skills/triple-gstack-qa-only/SKILL.md
grep -rn "checks/lib/" capabilities/triple-gstack/skills/*/SKILL.md
```

Expected: 3줄 — `triple-gstack-code-review/SKILL.md:56` (`checks/lib/resolve-phase-dir.cjs`), `:168` (`checks/lib/evidence-store.cjs`), `triple-gstack-qa-only/SKILL.md:39` (`checks/lib/resolve-phase-dir.cjs`).

- [ ] **Step 6: 테스트가 통과하는지 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node --test e2e/contract/lib-layout.test.cjs
node capabilities/triple-gstack/checks/lib/resolve-phase-dir.cjs 2>&1 | head -3
node capabilities/triple-gstack/checks/verify-ready.cjs 2>&1 | head -3
```

Expected: L1 4건 PASS. 두 `node` 호출은 **`Cannot find module`이 나오지 않아야** 한다 — 인자 부족으로 인한 usage/오류 메시지는 정상이다.

- [ ] **Step 7: 전체 회귀 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm run test:l1
python tests/run_installer_smoke.py
python tests/run_local_smoke.py
python tests/run_v061_l0.py
python tests/validate_prototype.py
node e2e/run-live.cjs --mock 2>&1 | tail -3
```

Expected: 전부 PASS. `run_local_smoke.py`가 `checks/ship-guard-control.cjs`를 직접 실행하므로 이 스모크가 **새 require 경로의 실행 검증**이다.

- [ ] **Step 8: 커밋**

```bash
git add lib capabilities/triple-gstack/checks capabilities/triple-gstack/skills \
        e2e/contract/helpers/repo.cjs e2e/contract/lib-layout.test.cjs
git commit -m "refactor: promote shared libs to lib/ and vendor a per-capability copy"
```

---

### Task 3: `scripts/build-capabilities.cjs` — 3-way 판정 복제기

**Files:**
- Create: `scripts/build-capabilities.cjs`
- Create: `capabilities/triple-gstack/checks/lib/LIB-HASH.json` (도구가 생성, 커밋 대상)
- Modify: `package.json` (`scripts["build:caps"]`)
- Modify: `e2e/contract/prerelease-fence.test.cjs` (M-1의 로컬 `copyPackage()` → `helpers/repo.cjs`)
- Test: `e2e/contract/lib-hash.test.cjs`

**Interfaces:**
- Consumes: Task 2의 `lib/` · `checks/lib/` 배치, `helpers/repo.cjs`의 `copyRepo`·`walkFiles`.
- Produces: `npm run build:caps` = `node scripts/build-capabilities.cjs`. `node scripts/build-capabilities.cjs --check`는 **아무것도 쓰지 않고** 동기화 여부만 판정해 exit 0/1 (테스트가 이 무쓰기 계약을 단언한다 — `l1.yml`의 첫 스텝이라 트리를 더럽히면 뒤따르는 L1 결과가 오염된다). `--prune`은 표에 없는 사본 삭제를 **명시적으로** 허용한다 — 없으면 거부다. 모듈로 require하면 `{ LIB_MAP, planCapability, applyCapability }`를 준다. `LIB-HASH.json` 스키마: `{ "schema": 1, "generatedFrom": "lib/", "files": { "<name>.cjs": "<sha256hex>" } }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/lib-hash.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
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
    fs.readFileSync(copyOf(repo, 'triple-gstack', 'repo-state-lib.cjs')),
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
  fs.appendFileSync(copyOf(repo, 'triple-gstack', 'repo-state-lib.cjs'), '\n// sneaky\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0, 'a hand-edited copy must never be silently overwritten');
  assert.match(r.stderr, /hand-edited/);
  assert.match(r.stderr, /git restore capabilities\/triple-gstack\/checks\/lib\/repo-state-lib\.cjs/);
});

test('a missing record over untouched copies is regenerated (bootstrap)', () => {
  // 사본이 전부 canonical 과 같으면 기록은 유도 가능하다. 여기서 거부하면 Task 2 가
  // 심어 놓은 사본 위에서 도는 최초 빌드가 영영 불가능해진다.
  const repo = copyRepo('crew-bootstrap-');
  const rec = path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib', 'LIB-HASH.json');
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
  const dir = path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib');
  fs.rmSync(path.join(dir, 'LIB-HASH.json'));
  fs.appendFileSync(path.join(dir, 'evidence-store.cjs'), '\n// sneaky\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /provenance unknown/);
  assert.match(r.stderr, /evidence-store\.cjs/);
});

test('an unmapped file with no record is refused rather than deleted', () => {
  const repo = copyRepo('crew-unmapped-');
  const dir = path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib');
  fs.rmSync(path.join(dir, 'LIB-HASH.json'));
  fs.writeFileSync(path.join(dir, 'stowaway.cjs'), 'module.exports = {};\n');
  const r = build(repo);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /stowaway\.cjs/);
});

test('a missing copy is rebuilt', () => {
  const repo = copyRepo('crew-missing-');
  fs.rmSync(copyOf(repo, 'triple-gstack', 'resolve-phase-dir.cjs'));
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
  const dir = path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib');
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
  const dir = path.join(repo, 'capabilities', 'triple-gstack', 'checks', 'lib');
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
  const victim = copyOf(repo, 'triple-gstack', 'evidence-store.cjs');
  const before = fs.readFileSync(victim);
  fs.appendFileSync(copyOf(repo, 'triple-gstack', 'repo-state-lib.cjs'), '\n// hand edit\n');

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
  fs.rmSync(path.join(repo, 'capabilities', 'triple-gstack'), { recursive: true });
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
    "'triple-gstack': ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs']",
    "'triple-gstack': ['resolve-phase-dir.cjs', 'evidence-store.cjs', 'repo-state-lib.cjs']");
  assert.notStrictEqual(reversed, src, 'the LIB_MAP literal must be substitutable');
  fs.writeFileSync(tool, reversed);
  const r = build(repo, ['--check']);
  assert.strictEqual(r.status, 0, `key order must not affect the record comparison:\n${r.stderr}`);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test e2e/contract/lib-hash.test.cjs`
Expected: FAIL — `Cannot find module '../../scripts/build-capabilities.cjs'`.

- [ ] **Step 3: 빌드 도구 구현**

`scripts/build-capabilities.cjs`:

```js
#!/usr/bin/env node
'use strict';

// 공유 lib 단일 소스 파이프라인 (설계서 §4.2).
//
// canonical 은 lib/ 하나뿐이다. capability 는 런타임에 남의 디렉터리를 참조할 수
// 없으므로(${GSD_CAP_DIR} 는 자기 자신만 가리킨다) 패키징 시점에 사본을 심는다.
// 사본이 canonical 과 다를 때 "canonical 을 정상 수정했다"와 "사본을 손으로 고쳤다"는
// 둘 다 같은 모양이라 2-way 비교로는 갈라낼 수 없다. 직전 생성 해시(LIB-HASH.json)를
// 제3의 기준점으로 써서 셋을 비교한다:
//
//   copy == new                   최신 — 아무것도 안 한다
//   copy == prev  (그리고 != new) canonical 정상 수정 — 덮어쓰고 new 기록
//   copy != prev  && copy != new  사본 수동 편집 — 거부
//   사본 없음                      복사 + 기록
//   기록 없고 사본 == canonical     최초 도입(부트스트랩) — 기록만 새로 쓴다
//   기록 없고 사본 != canonical     출처 증명 불가 — 거부
//   표에 없는 사본                  거부. 삭제는 --prune 을 명시했을 때만
//
// **쓰기는 전수 판정이 끝난 뒤에만 한다(2-패스).** 한 파일이 정상 수정이고 다른 파일이
// 손편집이면 1-패스 구조는 앞 파일을 이미 덮어쓴 뒤 뒤 파일에서 멈춘다 — 사용자는
// "빌드 실패"를 보지만 트리는 반쯤 바뀐 상태고, 손편집을 거부해 증거를 지키겠다는
// 목적이 반쪽만 성립한다. planCapability() 는 파일시스템을 읽기만 하고,
// applyCapability() 는 **모든** capability 의 에러가 0 일 때만 불린다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(REPO_ROOT, 'lib');
const HASH_FILE = 'LIB-HASH.json';

// 어느 capability 가 어느 공유 lib 을 쓰는가.
//
// 이 표를 처음 건드리는 것은 M1b 가 아니라 **M1a** 다 — 설계 §5 표대로 M1a 가
// triple-gstack 을 crew-quality 로 1:1 개명한다. 그 기계적 치환은 이 키,
// capabilities/<id>/checks/lib/ 경로, 그리고 lib-hash.test.cjs 의 git restore 정규식을
// **한 커밋에서 같이** 옮겨야 한다. M1b 는 그 뒤에 crew-quality 를 9개로 쪼개며 표를
// 늘린다. 표에서 빠진 참조는 e2e/contract/lib-hash.test.cjs 의 LIB_MAP 완전성
// 테스트가 잡는다.
const LIB_MAP = {
  'triple-gstack': ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs'],
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}
// 키 순서에 의존하지 않는 비교. LIB_MAP 순서가 바뀌었다고 "낡았다"가 되면 안 된다.
function sameRecord(a, b) {
  if (!a || !b || a.schema !== b.schema || a.generatedFrom !== b.generatedFrom) return false;
  const ka = Object.keys(a.files || {}).sort();
  const kb = Object.keys(b.files || {}).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a.files[k] === b.files[k]);
}
// 사본 디렉터리에서 기록 파일 자신을 뺀 전부. **확장자로 거르지 않는다** —
// `.cjs` 만 세면 checks/lib/helper.js 같은 밀항자가 빌드 · --check · 설치
// 프리플라이트 세 검사를 전부 통과하고 tarball 에 실린다(package.json files 가
// capabilities 를 싣는다). CommonJS 는 .js 도 require 로 해석하므로 한 줄이면 실행된다.
function presentFiles(destDir) {
  return fs.existsSync(destDir)
    ? fs.readdirSync(destDir).filter((f) => f !== HASH_FILE).sort()
    : [];
}
// 기대 기록은 **사본**을 다시 읽어 만든다. 기록의 의미를 "도구가 마지막에 심어 놓은
// 사본의 해시"로 못 박아야 다음 회차의 copy == prev 판정이 성립한다. canonical 해시로
// 채우면 기록과 사본의 대응이 끊겨 2회 연속 수정에서 빌드가 영구히 막힌다.
function recordFromCopies(destDir, files) {
  const next = { schema: 1, generatedFrom: 'lib/', files: {} };
  for (const f of files) {
    const p = path.join(destDir, f);
    if (!fs.existsSync(p)) return null;
    next.files[f] = sha256(fs.readFileSync(p));
  }
  return next;
}

// 1-패스. 파일시스템은 읽기만 한다. { errors, ops } 를 돌려준다.
function planCapability(id, files, opts = {}) {
  const errors = [];
  const ops = [];                       // { kind:'copy'|'remove', src?, dst }
  const capDir = path.join(REPO_ROOT, 'capabilities', id);
  if (!fs.existsSync(capDir)) return { id, errors: [`${id}: capability directory missing`], ops };

  const destDir = path.join(capDir, 'checks', 'lib');
  const hashPath = path.join(destDir, HASH_FILE);
  const record = readJson(hashPath);
  const present = presentFiles(destDir);

  // 기록이 없을 때. 매핑된 사본이 전부 canonical 과 바이트 동일하면 잃을 내용이 없으므로
  // 기록만 새로 쓴다 — Task 2 가 사본을 심고 이 도구가 처음 도는 부트스트랩이 정확히 이
  // 상태다. 여기서 무조건 거부하면 최초 빌드가 영영 불가능하다. 하나라도 canonical 과
  // 다르거나 표에 없는 파일이 끼어 있으면 그 출처를 증명할 수 없으니 덮어쓰지 않고 멈춘다.
  if (present.length && !record) {
    const unprovable = present.filter((f) => {
      if (!files.includes(f)) return true;
      const src = path.join(LIB_DIR, f);
      if (!fs.existsSync(src)) return true;
      return sha256(fs.readFileSync(path.join(destDir, f))) !== sha256(fs.readFileSync(src));
    });
    if (unprovable.length) {
      return {
        id,
        errors: [`${id}: ${rel(destDir)}/ has copies but no ${HASH_FILE} — provenance unknown ` +
                 `for ${unprovable.join(', ')}; restore the record, or delete those copies and rebuild`],
        ops,
      };
    }
  }

  for (const f of files) {
    const src = path.join(LIB_DIR, f);
    if (!fs.existsSync(src)) { errors.push(`${id}: canonical lib/${f} is missing`); continue; }
    const newHash = sha256(fs.readFileSync(src));
    const dst = path.join(destDir, f);
    const prev = record && record.files ? record.files[f] : undefined;

    if (!fs.existsSync(dst)) {
      if (opts.check) { errors.push(`${id}: ${rel(dst)} is missing — run \`npm run build:caps\``); continue; }
      ops.push({ kind: 'copy', src, dst });
    } else {
      const copyHash = sha256(fs.readFileSync(dst));
      if (copyHash === newHash) {
        // 최신.
      } else if (prev !== undefined && copyHash === prev) {
        if (opts.check) { errors.push(`${id}: lib/${f} changed since the last build — run \`npm run build:caps\``); continue; }
        ops.push({ kind: 'copy', src, dst });
      } else {
        errors.push(
          `${id}: ${rel(dst)} was hand-edited\n` +
          `      copy=${copyHash.slice(0, 12)} canonical=${newHash.slice(0, 12)} ` +
          `last-generated=${prev === undefined ? '<unrecorded>' : prev.slice(0, 12)}\n` +
          `      공유 lib 의 원본은 lib/${f} 하나다. 사본을 되돌린 뒤 다시 빌드한다:\n` +
          `        git restore ${rel(dst)} && npm run build:caps`);
      }
    }
  }

  // 표에 없는 사본. **기본은 거부다.** 바로 위에서 손편집 사본은 덮어쓰기를 거부하면서
  // 여기서 언매핑 사본을 조용히 지우면, 같은 부류(사람이 넣은 파일)에 정반대 처우가 된다.
  // 삭제는 의도를 명시한 --prune 에서만 일어난다 — M1b 가 lib 배분을 바꿀 때 쓴다.
  for (const f of present) {
    if (files.includes(f)) continue;
    const stale = path.join(destDir, f);
    if (opts.prune && !opts.check) { ops.push({ kind: 'remove', dst: stale }); continue; }
    errors.push(`${id}: ${rel(stale)} is not mapped in LIB_MAP['${id}'] — ` +
                `delete it yourself, or run \`npm run build:caps -- --prune\` to let the tool remove it`);
  }

  // --check 는 기록의 최신성까지 본다. 사본이 이미 최신인 상태에서만 여기에 닿으므로
  // 기대 기록은 지금 사본에서 그대로 유도된다. 쓰지 않는다.
  if (opts.check && !errors.length) {
    const next = recordFromCopies(destDir, files);
    if (next && !sameRecord(record, next)) {
      errors.push(`${id}: ${rel(hashPath)} is stale — run \`npm run build:caps\``);
    }
  }

  return { id, errors, ops, destDir, hashPath, files };
}

// 2-패스. **모든** capability 의 판정이 에러 0 일 때만 불린다.
function applyCapability(plan) {
  const actions = [];
  for (const op of plan.ops) {
    if (op.kind === 'copy') {
      fs.mkdirSync(path.dirname(op.dst), { recursive: true });
      const created = !fs.existsSync(op.dst);
      fs.copyFileSync(op.src, op.dst);
      actions.push(`${created ? 'created' : 'updated'} ${rel(op.dst)}`);
    } else {
      fs.rmSync(op.dst);
      actions.push(`removed ${rel(op.dst)}`);
    }
  }
  const next = recordFromCopies(plan.destDir, plan.files);
  if (next && !sameRecord(readJson(plan.hashPath), next)) {
    writeJson(plan.hashPath, next);
    actions.push(`recorded ${rel(plan.hashPath)}`);
  }
  return actions;
}

// 사람이 읽는 출력은 전부 stderr 로 간다. 이 도구는 prepack 으로도 도는데, 그때
// stdout 은 `npm pack --json` 의 것이다 — 한 줄이라도 섞으면 JSON 파싱이 깨진다.
// (실측: stdout 에 쓰면 pack 계약 테스트가 `Unexpected token 'b', "build-capa"...` 로 죽는다.)
function main(argv) {
  const opts = { check: argv.includes('--check'), prune: argv.includes('--prune') };
  const plans = [];
  const errors = [];
  for (const [id, files] of Object.entries(LIB_MAP)) {
    const plan = planCapability(id, files, opts);
    plans.push(plan);
    errors.push(...plan.errors);
  }
  const actions = [];
  if (!errors.length && !opts.check) {
    for (const plan of plans) if (plan.destDir) actions.push(...applyCapability(plan));
  }
  for (const a of actions) process.stderr.write(`build-capabilities: ${a}\n`);
  if (errors.length) {
    process.stderr.write(`build-capabilities: ${opts.check ? 'shared lib copies are out of sync' : 'build failed'}\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
  process.stderr.write(`build-capabilities: ${opts.check ? 'in sync' : 'ok'}\n`);
}

module.exports = { LIB_MAP, planCapability, applyCapability };
if (require.main === module) main(process.argv.slice(2));
```

- [ ] **Step 4: `build:caps` 연결 + 최초 기록 생성**

`package.json`의 `scripts`에 한 줄 추가 (기존 `pack:check` 위):

```json
    "build:caps": "node scripts/build-capabilities.cjs",
```

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm run build:caps
cat capabilities/triple-gstack/checks/lib/LIB-HASH.json
node scripts/build-capabilities.cjs --check
```

Expected: 첫 실행이 `recorded capabilities/triple-gstack/checks/lib/LIB-HASH.json` + `ok`. `LIB-HASH.json`에 세 파일의 sha256. `--check`는 `in sync` + exit 0.

> **표에 없는 사본은 기본 거부다.** M1b가 lib 배분을 바꿔 사본을 실제로 지워야 할 때만
> `npm run build:caps -- --prune`을 쓴다. 손편집 사본은 덮어쓰기를 거부하면서 언매핑
> 사본은 조용히 지우면 같은 부류(사람이 넣은 파일)에 정반대 처우가 되므로, 삭제는
> 의도를 명시한 경로에서만 일어난다.

- [ ] **Step 5: `prerelease-fence.test.cjs`의 중복 복사 헬퍼 제거**

M-1 Task 1이 그 파일 안에 로컬 `copyPackage()`를 두었다. 같은 일을 하는 코드가 둘이면 제외 규칙이 갈라진다. `helpers/repo.cjs`로 통일한다.

- 파일 상단의 `const ROOT = path.join(__dirname, '..', '..');`와 `function copyPackage() { … }` 블록을 삭제한다.
- 대신 다음 한 줄을 넣는다:

```js
const { ROOT, copyRepo } = require('./helpers/repo.cjs');
```

- 본문의 `copyPackage()` 호출을 `copyRepo('crew-prerelease-')`로 바꾼다.
- 삭제 후 쓰이지 않게 되는 `os` require가 있으면 함께 지운다.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
grep -n "copyPackage\|copyRepo\|helpers/repo" e2e/contract/prerelease-fence.test.cjs
node --test e2e/contract/prerelease-fence.test.cjs
```

Expected: `copyPackage` 잔여 0건, 테스트 PASS.

- [ ] **Step 6: 테스트가 통과하는지 확인**

Run: `node --test e2e/contract/lib-hash.test.cjs`
Expected: PASS **16건**.

- [ ] **Step 7: 전체 회귀 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm run test:l1
python tests/run_installer_smoke.py && python tests/run_local_smoke.py
git status --short
```

Expected: L1 전부 PASS. `git status --short`에 `capabilities/triple-gstack/checks/lib/LIB-HASH.json`이 신규로 뜬다 — 파괴적 실험은 임시 복사본에서만 했으므로 원본에는 그 외 변경이 없어야 한다.

- [ ] **Step 8: 설계서 §4.2 판정표를 구현과 맞춘다**

구현이 설계서를 두 곳에서 넘어섰다. 안 고치면 M1b 실행자가 §4.2를 상위 규칙으로 읽고 부트스트랩 예외를 "버그"로 오인해 되돌린다 — 그럼 또 최초 빌드가 막힌다. 계획서 자기 검토에만 적어 두는 것으로는 부족하다(1500줄짜리 문서 맨 끝 불릿 하나다).

`docs/V0.7-IMPLEMENTATION-DESIGN.md` §4.2의 판정 블록 마지막 줄을 세 줄로 늘린다.

Before:

```
LIB-HASH 없는데 사본 존재       → 출처 증명 불가. non-zero exit
```

After:

```
LIB-HASH 없고 사본 == canonical → 최초 도입(부트스트랩). 기록만 새로 쓴다
LIB-HASH 없고 사본 != canonical → 출처 증명 불가. non-zero exit
표에 없는 사본                  → non-zero exit. 삭제는 --prune 명시 시에만
```

그 아래 한 줄 덧붙인다:

```
부트스트랩 행이 필요한 이유: M0 Task 2 가 사본을 심고 Task 3 이 첫 빌드를 도는 순간이
정확히 "사본은 있는데 기록은 없는" 상태다. 무조건 거부하면 최초 빌드가 영영 불가능하다.
```

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
sed -n '/^LIB-HASH 없/,+2p' docs/V0.7-IMPLEMENTATION-DESIGN.md
grep -c 'prune' docs/V0.7-IMPLEMENTATION-DESIGN.md
```

Expected: 세 줄이 보이고 `prune`이 1건 이상.

- [ ] **Step 9: 커밋**

```bash
git add scripts/build-capabilities.cjs package.json \
        capabilities/triple-gstack/checks/lib/LIB-HASH.json \
        e2e/contract/lib-hash.test.cjs e2e/contract/prerelease-fence.test.cjs \
        docs/V0.7-IMPLEMENTATION-DESIGN.md
git commit -m "feat: add build-capabilities with 3-way shared lib drift detection"
```

> 설계 갱신을 구현과 **같은 커밋**에 둔다. 나중에 "왜 문서와 코드가 다르지"를 추적할 필요가 없어진다.

---

### Task 4: `prepack` 연결 + 패키징 계약

canonical을 정상 수정한 사람이 `npm pack`에서 막히면 파이프라인이 실패한 것이다 (설계 §4.4 3행). `prepack`이 사본을 먼저 갱신하게 만들고, 배포본에 사본과 기록이 실제로 실리는지(6행) 고정한다.

**Files:**
- Modify: `package.json` (`scripts["prepack"]`)
- Test: `e2e/contract/pack-contract.test.cjs`

**Interfaces:**
- Consumes: Task 3의 `scripts/build-capabilities.cjs`, `helpers/repo.cjs`.
- Produces: `npm pack`·`npm publish`가 항상 최신 사본을 싣는다. 배포본 경로 계약: `capabilities/<id>/checks/lib/<f>.cjs` + `capabilities/<id>/checks/lib/LIB-HASH.json`, **`lib/` 미포함**.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/pack-contract.test.cjs`:

```js
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
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test e2e/contract/pack-contract.test.cjs`
Expected: 첫 테스트 FAIL — `prepack did not refresh the copies` (아직 `prepack`이 없어 사본이 낡은 채 남는다). 두 번째는 PASS.

- [ ] **Step 3: `prepack` 연결**

`package.json`의 `scripts`에 추가:

```json
    "prepack": "node scripts/build-capabilities.cjs",
```

> `prepack`은 `npm pack`·`npm publish`·git 의존성 설치 시 실행된다. 외부 의존성·네트워크를 쓰지 않고 동기화 상태면 아무것도 쓰지 않으므로, `npx github:ungkey/triple-crown` 경로에서도 안전하게 no-op이다.

같은 `scripts`에 **배포 청결 게이트**도 넣는다:

```json
    "prepublishOnly": "node scripts/build-capabilities.cjs --check && node -e \"const s=require('child_process').execSync('git status --porcelain',{encoding:'utf8'});if(s.trim())throw new Error('refusing to publish from a dirty tree:\\n'+s)\"",
```

> **`prepublishOnly`는 `prepack`보다 먼저 돈다** (npm publish 생명주기: `prepublishOnly` → `prepack` → `prepare` → `publish`). 순서가 핵심이다 — `prepack`이 사본을 조용히 갱신해 버리기 **전에** "커밋된 트리가 이미 동기화 상태였는가"를 묻는 것이 이 게이트의 요점이다. 안 걸면 리뷰도 커밋도 안 된 생성물이 tarball에 실릴 수 있다. `npm pack`에는 걸리지 않으므로 개발 중 pack 은 여전히 자유롭다.

- [ ] **Step 4: 테스트가 통과하는지 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node --test e2e/contract/pack-contract.test.cjs
npm pack --dry-run 2>&1 | grep 'npm notice' | grep -c 'checks/lib'
```

Expected: PASS **3건**. `grep -c`가 **4** (사본 3 + `LIB-HASH.json`).

> `npm notice` 필터를 거치는 이유: `prepack` 출력도 `2>&1` 로 합쳐지는데 그 줄에도
> `checks/lib` 가 들어간다. 실측상 사본이 낡은 상태에서 세면 4가 아니라 6이 나온다.

- [ ] **Step 5: 커밋**

```bash
git add package.json e2e/contract/pack-contract.test.cjs
git commit -m "feat: run build-capabilities on prepack and pin the packaged lib layout"
```

---

### Task 5: 설치 시점 사본 무결성 검사

배포본에는 canonical이 없다. 설치자가 자기 안의 사본을 신뢰할 근거는 **함께 실린 `LIB-HASH.json`** 뿐이다. 프리플라이트에 대조를 추가하고, `--dry-run`이 이 검사를 타도록 호출 위치를 앞으로 옮긴다.

**Files:**
- Modify: `bin/triple-crown.cjs` — `crypto` require (`:4~8` 블록), `validateBundledManifests()` (`:264`), `install()` 안의 호출 위치 (`:568` → `:522` 직후 = `const actions=[` 바로 앞)
- Test: `e2e/contract/bundled-lib-integrity.test.cjs`

**Interfaces:**
- Consumes: Task 3이 만든 `LIB-HASH.json` 스키마, Task 2의 `checks/lib/` 배치, M-1 Task 1의 `--allow-prerelease`.
- Produces: `validateBundledManifests()`가 매니페스트 오류와 사본 오류를 **한 errors 배열**로 모아 보고한다. `triple-crown install --dry-run`이 패키지 결함을 대상 환경(GSD·gstack·Node 24) 없이도 드러낸다. `doctor`의 `bundle-runtime-compat` 행이 자동으로 같은 검사를 포함한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/bundled-lib-integrity.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const { copyRepo } = require('./helpers/repo.cjs');

function install(pkg, extra = []) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  return cp.spawnSync(process.execPath, [
    path.join(pkg, 'bin', 'triple-crown.cjs'), 'install',
    '--yes', '--dry-run', '--project', project, '--allow-prerelease', ...extra,
  ], { encoding: 'utf8' });
}
const libDir = (pkg) => path.join(pkg, 'capabilities', 'triple-gstack', 'checks', 'lib');

test('a clean package passes preflight on --dry-run', () => {
  // 이 단언이 없으면 아래 세 테스트는 "설치가 원래 안 되는 것"으로도 통과한다.
  const r = install(copyRepo('crew-clean-'));
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /DRY RUN/);
});

test('a tampered lib copy is refused at preflight', () => {
  const pkg = copyRepo('crew-tampered-');
  fs.appendFileSync(path.join(libDir(pkg), 'repo-state-lib.cjs'), '\n// tampered\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0, 'a modified bundled lib must not install');
  assert.match(r.stderr, /sha256 mismatch/);
});

test('an unrecorded file in checks/lib is refused', () => {
  // 기록에 없는 파일은 설치자가 출처를 말할 수 없다. 사본 옆에 조용히 얹히는
  // 추가 모듈이 가장 위험한 형태다 — require 한 줄이면 실행된다.
  const pkg = copyRepo('crew-extra-');
  fs.writeFileSync(path.join(libDir(pkg), 'extra.cjs'), 'module.exports = {};\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /not recorded/);
});

test('a missing recorded file is refused', () => {
  const pkg = copyRepo('crew-gone-');
  fs.rmSync(path.join(libDir(pkg), 'evidence-store.cjs'));
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /recorded but missing/);
});

test('an empty LIB-HASH record is refused rather than passing vacuously', () => {
  // 기록이 비고 사본도 없으면 "기록된 것 검사"와 "기록에 없는 것 검사" 두 루프가 모두
  // 공회전한다 — 사본을 전부 지운 패키지가 통과하고, 게이트가 사용자 세션에서 죽는다.
  const pkg = copyRepo('crew-emptyrec-');
  const dir = libDir(pkg);
  for (const f of fs.readdirSync(dir)) if (f !== 'LIB-HASH.json') fs.rmSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'LIB-HASH.json'),
    JSON.stringify({ schema: 1, generatedFrom: 'lib/', files: {} }, null, 2) + '\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0, 'an empty record must not verify');
  assert.match(r.stderr, /records no files/);
});

test('a malformed record — bad schema, path key, or hash — is refused', () => {
  const H = 'a'.repeat(64);
  const cases = [
    [{ schema: 2, generatedFrom: 'lib/', files: { 'repo-state-lib.cjs': H } }, /schema-1/],
    [{ schema: 1, generatedFrom: 'lib/', files: { '../../bin/triple-crown.cjs': H } }, /not a plain file name/],
    [{ schema: 1, generatedFrom: 'lib/', files: { 'repo-state-lib.cjs': 'nothex' } }, /malformed sha256/],
  ];
  for (const [record, re] of cases) {
    const pkg = copyRepo('crew-badrec-');
    fs.writeFileSync(path.join(libDir(pkg), 'LIB-HASH.json'), JSON.stringify(record, null, 2) + '\n');
    const r = install(pkg);
    assert.notStrictEqual(r.status, 0, `must refuse: ${JSON.stringify(record)}`);
    assert.match(r.stderr, re);
  }
});

test('a checks/lib without a readable LIB-HASH.json is refused', () => {
  const pkg = copyRepo('crew-norec-');
  fs.writeFileSync(path.join(libDir(pkg), 'LIB-HASH.json'), 'not json\n');
  const r = install(pkg);
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /without a readable schema-1/);
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인**

Run: `node --test e2e/contract/bundled-lib-integrity.test.cjs`
Expected: 1번 PASS, 나머지 6건 FAIL — 변조·추가·삭제·빈 기록·깨진 기록이 전부 `DRY RUN`으로 통과한다. 현재 프리플라이트가 `--dry-run` 반환 뒤에 있어 아예 돌지 않는다는 증명이다.

- [ ] **Step 3: `crypto` require 추가**

`bin/triple-crown.cjs` 상단 require 블록(`:4~8`)의 `readline` 다음 줄에 추가:

```js
const crypto = require('crypto');
```

- [ ] **Step 4: 사본 대조를 `validateBundledManifests()`에 합치기**

`validateBundledManifests()`의 `for(const id of CAPABILITIES) { … }` 루프가 끝난 직후, `if(errors.length)` 앞에 아래 블록을 넣는다:

```js
  // 배포본에는 canonical lib/ 이 없다(package.json files 참조). 사본을 신뢰할 근거는
  // 함께 실린 LIB-HASH.json 하나뿐이므로 그 기록과만 대조한다.
  //
  // 이 대조가 실제로 주는 성질은 두 가지다: (1) 사고성 drift 검출, (2) 사본만 고치고
  // 기록은 안 고친 한쪽 편집 검출. 기록도 같은 tarball 안에 있으므로 **둘 다 고친 경우는
  // 잡지 못한다** — canonical 을 같이 싣는 경우와 동일한 한계다. lib/ 을 안 싣는 이유는
  // 변조 저항이 아니라 단일 소스 규율이다.
  //
  // 검사 대상은 CAPABILITIES 가 아니라 capabilities/ 디렉터리 그 자체다. 설치 목록과
  // 검사 목록이 갈라지면 M1b 가 capability 를 늘릴 때 한쪽에만 넣어 그 사본이 검사 없이
  // 배포되는 사일런트 구멍이 생긴다. "배포본에 실제로 있는 것"을 검사 대상의 정의로 삼는다.
  const HEX64=/^[0-9a-f]{64}$/;
  const capsRoot=path.join(PACKAGE_ROOT,'capabilities');
  for(const id of (exists(capsRoot)?fs.readdirSync(capsRoot):[])) {
    const dir=path.join(capsRoot,id,'checks','lib');
    if(!exists(dir)) continue;                    // 이 capability 는 공유 lib 을 쓰지 않는다
    const record=readJson(path.join(dir,'LIB-HASH.json'));
    if(!record || record.schema!==1 || record.generatedFrom!=='lib/'
       || !record.files || typeof record.files!=='object' || Array.isArray(record.files)) {
      errors.push(`${id}: checks/lib exists without a readable schema-1 LIB-HASH.json`);
      continue;
    }
    const recorded=Object.keys(record.files);
    // 빈 기록은 정의상 모순이다. checks/lib/ 이 있다는 것 자체가 "이 capability 는 공유
    // lib 을 쓴다"는 선언인데, 기록이 비면 아래 두 루프가 모두 공회전해 **사본을 전부
    // 지운 패키지가 그대로 통과한다.** 그러면 게이트가 사용자 세션 한가운데서
    // Cannot find module 로 죽는다 — 설치 시점에 잡을 수 있었던 것을 가장 나쁜 순간으로 미룬다.
    if(!recorded.length) {
      errors.push(`${id}: LIB-HASH.json records no files — a checks/lib with nothing recorded cannot be verified`);
      continue;
    }
    for(const f of recorded) {
      // 기록 파일은 신뢰 경계다. 키를 그대로 join 하면 '../../bin/x.cjs' 같은 값이 패키지
      // 밖을 가리킬 수 있다. 단순 파일명만 허용한다.
      if(!f || f!==path.basename(f) || f==='.' || f==='..') {
        errors.push(`${id}: LIB-HASH.json key ${JSON.stringify(f)} is not a plain file name`);
        continue;
      }
      if(!HEX64.test(String(record.files[f]))) {
        errors.push(`${id}: checks/lib/${f} has a malformed sha256 in LIB-HASH.json`);
        continue;
      }
      const p=path.join(dir,f);
      if(!exists(p)) { errors.push(`${id}: checks/lib/${f} is recorded but missing`); continue; }
      const got=crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      if(got!==record.files[f]) errors.push(`${id}: checks/lib/${f} sha256 mismatch (tampered or stale build)`);
    }
    // 확장자로 거르지 않는다 — .js/.mjs/.json 밀항자도 require 로 실행된다.
    // 기록 파일 자신만 예외다.
    for(const f of fs.readdirSync(dir)) {
      if(f!=='LIB-HASH.json' && !recorded.includes(f)) {
        errors.push(`${id}: checks/lib/${f} is not recorded in LIB-HASH.json`);
      }
    }
  }
```

- [ ] **Step 5: 프리플라이트를 `--dry-run` 앞으로 옮기기**

`install()` 안에서 `validateBundledManifests(); log('Capability manifest preflight: PASS');` 두 줄을 **삭제**하고(현 `:568` 부근, `superpowersBefore` 블록 다음), 함수 최상단의 **거부 펜스 3개 뒤 · `const actions=[` 앞**에 넣는다.

**삽입 위치가 M-1 이후 바뀌었다.** M-1 Task 1이 `install()` 최상단에 exit 4 펜스 두 개(프리릴리스 빌드 거부, `$HOME` 루트 거부)를 넣었다. 프리플라이트를 그보다 **앞**에 두면 안 된다 — 두 펜스는 "이 설치를 애초에 하면 안 된다"는 판정이고, 패키지 무결성보다 먼저 나와야 사용자가 보는 첫 오류가 정확해진다. 아래 Before 블록을 통째로 대조해서 넣는다.

Before (`install()` 시작부, `:515~523`):

```js
async function install(root,opts) {
  if(!exists(root) || !fs.statSync(root).isDirectory()) fail(`Project directory does not exist: ${root}`);
  if(VERSION.includes('-') && !opts.allowPrerelease) {
    fail(`Triple Crown v${VERSION} is a prerelease build from a development branch. Install a tagged release instead, or pass --allow-prerelease to proceed anyway.`,4);
  }
  if(sameRealPath(root, os.homedir())) {
    fail(`Refusing to install with the home directory as project root ($HOME = ${os.homedir()}). A $HOME-rooted install collapses project scope into global scope. Run from inside a project, or pass --project <project path>.`,4);
  }
  const actions=[
```

After:

```js
async function install(root,opts) {
  if(!exists(root) || !fs.statSync(root).isDirectory()) fail(`Project directory does not exist: ${root}`);
  if(VERSION.includes('-') && !opts.allowPrerelease) {
    fail(`Triple Crown v${VERSION} is a prerelease build from a development branch. Install a tagged release instead, or pass --allow-prerelease to proceed anyway.`,4);
  }
  if(sameRealPath(root, os.homedir())) {
    fail(`Refusing to install with the home directory as project root ($HOME = ${os.homedir()}). A $HOME-rooted install collapses project scope into global scope. Run from inside a project, or pass --project <project path>.`,4);
  }
  // 패키지 자체의 결함이므로 대상 환경(GSD·gstack·Node 24)과 무관하다. dry-run 반환보다
  // 뒤에 두면 --dry-run 이 변조된 패키지를 통과시킨다 — 검사는 쓰기 전에, 그리고
  // 동의를 구하기 전에 끝나야 한다. 위 두 펜스보다는 뒤다: "설치하면 안 되는 빌드/경로"가
  // "패키지가 변조됐다"보다 먼저 나와야 첫 오류가 실제 원인을 가리킨다.
  validateBundledManifests();
  log('Capability manifest preflight: PASS');
  const actions=[
```

검증: `grep -n 'validateBundledManifests' bin/triple-crown.cjs`가 **정의 1 + `doctor` 1 + `install` 1 = 3행**이어야 하고, `install` 쪽 행 번호가 `opts.dryRun` 조기 반환(`:532` 부근)보다 **작아야** 한다.

- [ ] **Step 6: 테스트가 통과하는지 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node --test e2e/contract/bundled-lib-integrity.test.cjs
npm run test:l1
```

Expected: **7건** PASS, L1 전부 PASS.

- [ ] **Step 7: 전체 회귀 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
python tests/run_installer_smoke.py
python tests/run_bash_installer_smoke.py
python tests/run_v061_l0.py
python tests/run_local_smoke.py
npm pack && python tests/run_npx_tarball_smoke.py && rm -f triple-crown-workflow-installer-*.tgz
node e2e/doctor.cjs 2>&1 | tail -8 || true
```

Expected: 파이썬 스모크 전부 PASS. `doctor.cjs`의 `bundle-runtime-compat` 행이 `PASS` (사본 검사가 합쳐졌으므로 실패하면 여기서도 드러난다).

- [ ] **Step 8: 설치된 트리에서 소비자가 실제로 도는지 확인 (신규 스모크)**

M0의 핵심 주장은 "사본을 capability 안에 심어 두면 **설치 후에도** `require`가 해석된다"다. 그런데 여기까지의 테스트 중 그걸 실행으로 증명하는 것이 없다 — `pack-contract`는 파일 목록만 읽고, `bundled-lib-integrity`는 `--dry-run`이라 아무것도 쓰지 않으며, `run_npx_tarball_smoke.py`는 설치만 하고 공유 lib 소비자를 한 번도 실행하지 않는다. 상대경로나 패키징 레이아웃이 한 칸 어긋나도 신규 L1이 전부 초록이 된다.

L1이 아니라 파이썬 스모크에 둔다 — 실제 설치를 하므로 "수 초 · 비용 0" 기준을 벗어난다.

`tests/run_installed_lib_smoke.py` (신규):

```python
#!/usr/bin/env python3
"""설치된 트리에서 공유 lib 소비자가 실제로 로드되는지 확인한다.

L1 lib-layout 은 저장소 트리에서 require 경로를 **정적으로** 검사한다. 배포·설치 경로에서
사본이 따라가는지, 그 위치에서 형제 참조까지 해석되는지는 실행해 봐야만 알 수 있다.
"""
import os, subprocess, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CLI = ROOT / "bin" / "triple-crown.cjs"

with tempfile.TemporaryDirectory() as td:
    home = Path(td) / "home"; project = Path(td) / "proj"
    home.mkdir(); project.mkdir()
    # main 은 재구성 기간 내내 프리릴리스 VERSION 을 달고 있다(설계 §4.5 계층 2).
    # 이 스모크는 "배포 가능한가"가 아니라 "설치 동작이 온전한가"를 보므로 펜스를 명시적으로 연다.
    env = dict(os.environ, HOME=str(home), TRIPLE_CROWN_ALLOW_UNSUPPORTED_NODE="1")
    p = subprocess.run(
        ["node", str(CLI), "install", "--project", str(project),
         "--yes", "--no-bootstrap", "--no-ship-guard", "--allow-prerelease"],
        cwd=str(ROOT), env=env, capture_output=True, text=True)
    assert p.returncode == 0, p.stderr

    hits = sorted(Path(td).rglob("checks/lib/repo-state-lib.cjs"))
    assert hits, "no installed copy of checks/lib/repo-state-lib.cjs found under the install roots"
    for lib in hits:
        # evidence-store 는 형제 ./repo-state-lib.cjs 를 require 한다 — 둘 다 로드해야
        # "사본 디렉터리 안에서 형제 참조가 해석된다"가 증명된다.
        r = subprocess.run(
            ["node", "-e",
             "require(process.argv[1]);require(process.argv[2]);console.log('ok')",
             str(lib), str(lib.parent / "evidence-store.cjs")],
            capture_output=True, text=True)
        assert r.returncode == 0 and "ok" in r.stdout, f"{lib}: {r.stderr}"

print("PASS installed-shared-lib-require")
```

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
python tests/run_installed_lib_smoke.py
```

Expected: `PASS installed-shared-lib-require`.

> **단언이 실제로 무는지 먼저 본다.** 임시 복사본에서 `capabilities/triple-gstack/checks/lib/`를 지우고 한 번 돌려 `no installed copy … found`로 죽는 것을 확인한 뒤 원본에서 GREEN을 본다. 안 그러면 "설치가 원래 사본을 안 만든다"와 "만든다"가 구분되지 않는다.

- [ ] **Step 9: 커밋**

```bash
git add bin/triple-crown.cjs e2e/contract/bundled-lib-integrity.test.cjs \
        tests/run_installed_lib_smoke.py
git commit -m "feat: verify bundled shared lib copies against LIB-HASH at preflight"
```

---

### Task 6: CI + `npm test` 통합

M-1 자기 검토가 남긴 두 구멍을 닫는다 — **CI가 없어 L1 green이 수작업 규율**이고, **`npm test`가 L1도 npx tarball 스모크도 부르지 않는다**.

> **Windows 잡은 넣지 않는다.** 초안은 `continue-on-error`로 "보이게는 하되 막지는 않는다"였다. 영구적으로 실패해도 되는 잡은 커버리지가 아니라 상시 빨간불이고, 상시 빨간불이 하나 있는 CI는 사람이 전체를 대충 보게 만든다 — L1 게이트 자체의 신호 가치를 깎는다. 대신 **Windows L1 커버리지 0**을 아래 "범위 밖으로 남긴 것"에 명시 항목으로 남긴다. M1a가 경로 가정(구분자·임시 HOME·심볼릭 링크)을 정리할 때 blocking 잡으로 넣는다.

**Files:**
- Create: `.github/workflows/l1.yml`
- Modify: `package.json` (`scripts.test`, `scripts["test:pack"]`)

**Interfaces:**
- Consumes: Task 3의 `build:caps`, Task 4의 `prepack`, M-1의 `test:l1`.
- Produces: `npm test` = L1 + 파이썬 스모크 2종. `npm run test:pack` = `npm pack` 후 npx tarball 스모크.

- [ ] **Step 1: `npm test` 확장**

`package.json`의 `scripts`를 아래 형태로 만든다 (`build:caps`·`prepack`은 Task 3·4에서 이미 들어갔다):

```json
  "scripts": {
    "build:caps": "node scripts/build-capabilities.cjs",
    "prepack": "node scripts/build-capabilities.cjs",
    "prepublishOnly": "node scripts/build-capabilities.cjs --check && node -e \"const s=require('child_process').execSync('git status --porcelain',{encoding:'utf8'});if(s.trim())throw new Error('refusing to publish from a dirty tree:\\n'+s)\"",
    "test:l1": "node -e \"const n=require('fs').readdirSync('e2e/contract',{recursive:true}).filter(f=>String(f).endsWith('.test.cjs')).length;if(!n)throw new Error('L1 gate found no *.test.cjs under e2e/contract - refusing to report a vacuous pass')\" && node --test \"e2e/contract/**/*.test.cjs\"",
    "test": "npm run test:l1 && python tests/run_installer_smoke.py && python tests/run_installed_lib_smoke.py && python tests/run_v061_l0.py",
    "test:pack": "npm pack && python tests/run_npx_tarball_smoke.py",
    "pack:check": "npm pack --dry-run"
  }
```

> **`test:l1` 값은 출하본에서 한 글자도 바꾸지 않는다.** M-1이 앞에 붙인 `node -e …`는
> `e2e/contract`에 `*.test.cjs`가 하나도 없을 때 `node --test`가 **0건 실행으로 exit 0**
> 하는 것을 막는 vacuous-pass 가드다. Task 2가 파일을 대량으로 옮기는 마일스톤에서 그
> 가드가 없으면 "glob이 아무것도 못 찾았다"와 "전부 통과했다"가 구분되지 않는다.
> 이 Step은 `test`·`test:pack`만 추가한다.

> `test:pack`을 `test`에 넣지 않는 이유: `npm pack`이 저장소 루트에 `.tgz`를 남긴다(`.gitignore` 대상이지만 작업 트리는 더러워진다). CI에서 별도 스텝으로 돌린다.

- [ ] **Step 2: 확장한 `npm test`가 도는지 확인**

Run: `npm test`
Expected: L1 전부 PASS → `PASS installer-install-idempotent-status-uninstall` → `run_v061_l0.py`의 PASS 줄.

- [ ] **Step 3: 워크플로 작성**

`.github/workflows/l1.yml`:

```yaml
name: L1

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

jobs:
  contract:
    name: contract (ubuntu)
    runs-on: ubuntu-latest
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

  smoke:
    name: python smoke (ubuntu)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: python tests/run_installer_smoke.py
      - run: python tests/run_installed_lib_smoke.py
      - run: python tests/run_bash_installer_smoke.py
      - run: python tests/run_v061_l0.py
      - run: python tests/run_local_smoke.py
      - name: npx tarball smoke
        run: npm run test:pack
```

- [ ] **Step 4: 워크플로가 문법적으로 유효한지 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
python -c "
import pathlib
p = pathlib.Path('.github/workflows/l1.yml')
text = p.read_text()
try:
    import yaml
    d = yaml.safe_load(text)
    assert set(d['jobs']) == {'contract','smoke'}, d['jobs']
    print('OK yaml parsed, jobs:', sorted(d['jobs']))
except ImportError:
    assert 'jobs:' in text and 'contract:' in text and 'smoke:' in text
    print('OK structural check (PyYAML absent)')
"
node scripts/build-capabilities.cjs --check
npm run test:l1
```

Expected: `OK …` 한 줄, `in sync`, L1 전부 PASS.

> **이 파일은 push 전까지 아무것도 실행하지 않는다.** Global Constraints의 push 금지가 유효하므로 M0에서는 로컬 커밋까지만이다. 첫 실행은 사용자가 push를 승인한 뒤다.

- [ ] **Step 5: 커밋**

```bash
git add .github/workflows/l1.yml package.json
git commit -m "ci: add L1 + smoke workflow and wire npm test to the contract suite"
```

---

### Task 7: M0 완료 판정 + 롤백 태그

설계 §4.4의 완료 판정 6행을 **한 번에, 손으로** 재현해 통과를 확인하고 롤백 지점을 남긴다. 앞의 태스크들이 각 행을 자동 테스트로 고정했으므로 여기서는 그 테스트들이 실제로 그 시나리오를 돌고 있는지를 사람이 확인한다.

**Files:**
- 없음 (검증 + 태그)

**Interfaces:**
- Consumes: Task 1~6 전부.
- Produces: 로컬 태그 `v0.7.0-m0` — §8에 따라 **롤백 지점이며 릴리스가 아니다.**

- [ ] **Step 1: §4.4 완료 판정 매트릭스 재현**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
WORK="$(mktemp -d)"
git archive HEAD | tar -x -C "$WORK"
cd "$WORK"

echo "=== 1행: canonical 수정 → 빌드 없이 판정 → 거부여야 ==="
printf '\n// row1\n' >> lib/repo-state-lib.cjs
node scripts/build-capabilities.cjs --check && echo "FAIL(기대: 거부)" || echo "OK 거부됨"

echo "=== 2행: 빌드 후 판정 → 통과여야 ==="
node scripts/build-capabilities.cjs >/dev/null
node scripts/build-capabilities.cjs --check >/dev/null && echo "OK 통과" || echo "FAIL"

echo "=== 3행: canonical 수정 → npm pack --dry-run → 성공이어야 ==="
printf '\n// row3\n' >> lib/evidence-store.cjs
npm pack --dry-run >/dev/null 2>&1 && echo "OK pack 성공" || echo "FAIL(prepack 이 막았다)"

echo "=== 4행: canonical 2회 연속 수정 → 매번 빌드 성공 ==="
for n in 1 2; do
  printf '\n// row4-%s\n' "$n" >> lib/resolve-phase-dir.cjs
  node scripts/build-capabilities.cjs >/dev/null && echo "OK pass $n" || echo "FAIL pass $n"
done

echo "=== 5행: 사본 직접 수정 → 빌드 거부 + 복구 명령 ==="
printf '\n// row5\n' >> capabilities/triple-gstack/checks/lib/repo-state-lib.cjs
node scripts/build-capabilities.cjs 2>&1 | grep -q 'git restore' && echo "OK 거부 + 복구 명령" || echo "FAIL"

echo "=== 6행: pack 산출물에 checks/lib 포함 ==="
cd "$REPO_ROOT"
npm pack --dry-run 2>&1 | grep 'npm notice' | grep -c 'checks/lib'
```

Expected: 1행 `OK 거부됨` · 2행 `OK 통과` · 3행 `OK pack 성공` · 4행 `OK pass 1`/`OK pass 2` · 5행 `OK 거부 + 복구 명령` · 6행 **4**.

> 파괴적 실험은 `git archive`로 뜬 임시 트리에서만 한다. `$REPO_ROOT`에는 마지막 `npm pack --dry-run` 한 번만 도는데, 동기화 상태라 `prepack`이 no-op이다.

- [ ] **Step 2: 전체 그린 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm test
npm run test:pack && rm -f triple-crown-workflow-installer-*.tgz
python tests/run_bash_installer_smoke.py
python tests/run_local_smoke.py
python tests/validate_prototype.py
node e2e/run-live.cjs --mock 2>&1 | tail -2
git status --short
```

Expected: 전부 PASS. `git status --short` **빈 출력** — 작업 트리에 커밋되지 않은 변경이 없어야 태그가 의미를 갖는다.

- [ ] **Step 3: 롤백 태그**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git tag -a v0.7.0-m0 -m "M0: shared lib build pipeline; main locked at 0.7.0-dev"
git tag -l 'v0.7*'
git log --oneline -7
```

Expected: `v0.7.0-m0`이 목록에 있고 HEAD에 붙어 있다.

> **push하지 않는다.** 이 태그는 M1a가 회귀했을 때 되돌아올 지점이며 릴리스가 아니다 (설계 §8).

---

## 자기 검토 기록

계획을 다 쓴 뒤 설계서와 실측을 다시 대조하며 고친 것들. 실행자가 같은 함정을 다시 밟지 않도록 남긴다.

- **`VERSION`만 올리면 설치가 통째로 깨진다.** `bin/triple-crown.cjs:264`가 `cap.version !== VERSION`을 강제하므로 `capabilities/*/capability.json` 3곳이 같이 올라가야 한다. Task 1 Step 4가 이 넷을 한 명령으로 처리하고, `version-consistency` 테스트가 앞으로도 갈라지지 못하게 막는다.
- **프리릴리스 펜스가 기존 테스트 6곳을 죽인다.** `run_installer_smoke.py:46,79` · `run_npx_tarball_smoke.py:43` · `run_bash_installer_smoke.py:31` · `e2e/contract/home-root-refusal.test.cjs:20,26`. 설계서 §4.5는 "설치가 거부된다"만 말하고 자기 테스트가 그 거부에 걸린다는 사실은 다루지 않는다. 초안은 파이썬 4곳만 셌는데 실측에서 L1 1파일 2호출이 더 나왔다. Task 1 Step 5가 전부 `--allow-prerelease`를 붙인다.
- **M-1의 문서 버전 테스트가 M0에서 자동으로 깨진다 — 하나가 아니라 둘.** M-1 Task 8이 문서 리터럴을 `VERSION`과 비교하는 테스트를 만들었는데, `VERSION`이 `0.7.0-dev`가 되는 순간 "문서가 설치 불가능한 프리릴리스를 안내하라"는 요구가 된다. 출하본에는 그런 테스트가 **tgz 파일명(`:57`)과 `TRIPLE_CROWN_REF=` 리터럴(`:78`) 두 개** 있다 — 후자는 계획 단계에 없던 것이라 초안이 놓쳤다. 둘 다 기준을 `install.sh`의 고정 ref로 옮겼다 (Task 1 Step 6). 릴리스 커밋에서 `ref == VERSION`이 되므로 그때 되돌릴 코드가 없다 — 나중에 삭제해야 하는 테스트는 지뢰다.
- **`--dry-run`이 프리플라이트를 타지 않는다.** `bin/triple-crown.cjs:532`의 조기 반환이 `:568`의 `validateBundledManifests()`보다 앞이다. 이걸 모르고 계약 테스트를 `--dry-run`으로 짜면 변조된 패키지가 전부 통과한다. Task 5 Step 5가 호출을 함수 최상단으로 옮긴다 — 패키지 결함은 대상 환경과 무관하고, 동의를 구하기 전에 끝나야 한다.
- **설계 §4.3의 "게이트 command가 `checks/lib/`을 참조" 행은 실측과 어긋난다.** 게이트 5개는 전부 `checks/<script>.cjs`를 부르고 lib은 그 스크립트가 `require`한다. 실제 변경 지점은 *`require` 14곳*과 *SKILL.md 직접 호출 3곳*이다. `lib-layout` 테스트가 두 경로를 모두 정적으로 전수 검사한다.
- **lib 내부 참조 2곳은 건드리면 안 된다.** `evidence-store.cjs:10`·`resolve-phase-dir.cjs:6`의 `./repo-state-lib.cjs`는 셋이 함께 이동하므로 형제 참조 그대로다. Task 2 Step 4의 `sed`는 `checks/*.cjs`만 훑고, 같은 Step이 내부 참조가 안 바뀌었음을 명시적으로 확인한다.
- **`prev`를 안 쓰면 canonical 2회 수정에서 빌드가 영구히 막힌다.** 설계 §4.2가 이미 지적한 지점이지만, 구현에서 `next.files`를 canonical 해시로 채우면 같은 함정이 되살아난다 — 기록의 의미가 "canonical의 해시"가 되어 사본과의 대응이 끊긴다. 그래서 기록은 **사본을 다시 읽어** 채운다.
- **키 순서에 기댄 기록 비교는 거짓 stale을 만든다.** `LIB_MAP` 배열 순서가 바뀌면 `JSON.stringify` 비교가 어긋난다. `sameRecord()`가 정렬된 키로 비교한다.
- **CI를 넣어도 push 전까지는 안 돈다.** Task 6 Step 4에 명시했다. Windows 잡은 **넣지 않는다** — 초안의 `continue-on-error`는 커버리지가 아니라 상시 빨간불이고, 상시 빨간불 하나가 CI 전체의 신호 가치를 깎는다. 커버리지 0이라는 사실은 아래 범위 밖 항목으로 명시해 사라지지 않게 한다. (리뷰 D15에서 뒤집힌 판단이다.)
- **`npm ci`를 쓰지 않는다.** 외부 의존성이 0개라 lockfile이 없고 `npm ci`는 즉시 실패한다. 워크플로에 설치 단계 자체를 두지 않았다.
- **`npm pack --dry-run`이 `prepack`을 실행한다는 것은 추측이 아니라 실측이다.** probe로 마커 파일 생성을 확인했고 `--json` 출력 형태(`[0].files[].path`)도 같이 확인했다. 이게 거짓이면 Task 4의 §4.4 3행 테스트가 무의미해진다.
- **pack 계약 테스트만 느리다.** 저장소 복사 2회 + `npm pack` 2회라 L1의 "수 초" 기준에서 벗어난다. 별도 파일(`pack-contract.test.cjs`)로 떼어 두어 필요하면 빼기 쉽게 했다. 지금은 뺄 이유가 없어 빼지 않는다.
- **실행 검증이 잡은 결함 1 — 최초 빌드가 불가능했다.** 초안의 출처 가드는 "사본이 있는데 기록이 없으면 무조건 거부"였다. 그런데 Task 2가 `cp`로 사본을 심고 Task 3이 처음 `build:caps`를 도는 순간이 정확히 그 상태다 — `build failed … provenance unknown`으로 부트스트랩이 영영 막힌다. 사본이 전부 canonical과 바이트 동일하면 잃을 내용이 없으므로 기록만 새로 쓰도록 좁혔고, 다르거나 표에 없는 파일이 끼면 그대로 거부한다. 계약이 갈라졌으므로 테스트도 3건으로 쪼갰다.
- **실행 검증이 잡은 결함 2 — `node --test <디렉터리>`가 Node 24에서 동작하지 않는다.** M-1 Task 1이 `test:l1`을 `node --test e2e/contract/`로 정의했는데, 실측(v24.14.0)에서 그 경로를 테스트 *파일*로 취급해 `Cannot find module '…/e2e/contract'`로 죽는다. Node 22부터 러너가 glob 기반으로 바뀐 결과다. **M-1 계획서의 해당 정의도 함께 고쳤다** — 안 고치면 M-1 Task 1의 첫 `npm run test:l1`부터 죽는다. 올바른 형태는 따옴표로 감싼 `node --test 'e2e/contract/**/*.test.cjs'` (셸이 아니라 Node가 전개하므로 Windows에서도 같다).
- **실행 검증이 잡은 결함 3 — `prepack` 출력이 `npm pack --json`을 오염시킨다.** 빌드 도구가 stdout에 한 줄이라도 쓰면 pack 계약 테스트가 `Unexpected token 'b', "build-capa"...`로 죽는다. 도구 출력을 전부 stderr로 옮겼다. 같은 이유로 셸에서 세는 `grep -c 'checks/lib'`도 `npm notice` 필터를 거친다 — 안 거치면 사본이 낡았을 때 4 대신 6이 나온다.
- **검증 방법.** `git archive HEAD`로 임시 트리를 뜨고 Task 2의 `sed`·`mv`를 그대로 돌린 뒤, 계획서의 코드 블록 6개를 추출해 배치하고 실행했다. 결과: **신규 L1 17/17 PASS**(lib-hash 9 · lib-layout 4 · pack-contract 2 · version-consistency 2). 그 뒤 중복이던 `version-consistency` 두 번째 테스트를 뺐으므로 **계획서 최종형은 신규 16건**이다 — 뺀 것은 `install-entrypoints.test.cjs:30`과 같은 단언이라 커버리지 손실은 없다, Task 5 무결성 4/4 PASS(M-1의 `--allow-prerelease`가 없는 트리라 그 플래그만 뺀 형태로), 파이썬 스모크 `run_installer_smoke`·`run_local_smoke`·`run_v061_l0`·`validate_prototype` 전부 PASS, §4.4 완료 판정 6행 전부 기대대로. `바깥 참조 전환: 14` · 형제 참조 2곳 불변 · SKILL.md 3곳 전환도 실측으로 확인했다.
- **범위 밖으로 남긴 것 — `fixtures/tiny/` 와 L2 하네스.** 설계 §7.1은 `tiny`를 "M0~M6 전 구간에서 사용"이라 쓰지만 §6은 "M0·M1a는 설치 가능 산출물의 동작 변화가 없어 L1만 돌린다"고 못 박는다. §4.4 완료 판정에도 픽스처는 없다. 소비자 없는 픽스처를 미리 만들면 M1b가 실제로 태울 때 다시 고치게 된다 → **M1b에서 하네스와 함께 만든다.**
- **범위 밖으로 남긴 것 — Windows L1 커버리지 0.** CI에 Windows 잡을 두지 않는다. 실제 통과는 M1a(기계적 개명)에서 경로 가정(구분자·임시 HOME·심볼릭 링크)을 정리할 때 blocking 잡으로 함께 넣는다. **소유자: M1a.**
- **범위 밖으로 남긴 것 — 설치된 런타임의 사본 무결성.** 지금 프리플라이트는 `PACKAGE_ROOT`(설치 **전** 패키지)만 본다. 설치가 `.gsd/capabilities/<id>/`로 복사한 뒤의 사본이 나중에 손상되는 경우는 아무도 안 본다. 설계 §5.2가 doctor 신규 검사를 **M1d**에 배치해 두었으므로 거기서 `doctor`가 설치된 트리를 같은 `LIB-HASH.json`으로 재검증하게 한다. **소유자: M1d.** (Codex 지적 N4, 리뷰 D14에서 이월 결정.)
- **M-1 출하본이 계획서를 앞질러 간 5곳을 되맞췄다.** M-1이 실제로 낸 물건은 계획보다 넓었고(L1 16 → 38건), 초안은 계획서 기준으로 쓰여 있었다. 실측으로 대조해 고친 것:
  1. **`test:l1`의 vacuous-pass 가드.** 출하본은 `node --test` 앞에 `e2e/contract`의 `*.test.cjs` 개수를 세어 0이면 던지는 `node -e`를 붙여 뒀다. Task 6 Step 1의 `scripts` 블록이 그걸 단순형으로 덮어써 회귀시킬 뻔했다 — 파일을 대량 이동하는 마일스톤에서 "glob이 아무것도 못 찾음"과 "전부 통과"를 구분해 주는 유일한 장치다. 값을 출하본 그대로 박았다.
  2. **`VERSION` 기준 문서 테스트가 2개.** 위 항목.
  3. **`version-consistency`의 §4.5 계층 1 테스트가 중복.** 출하본 `install-entrypoints.test.cjs:30`이 같은 불변식을 `install.sh`·`install.ps1` 양쪽으로 이미 검사한다. 같은 단언이 두 파일에 있으면 한쪽만 고치고 green을 본다 → 신규 파일에서 뺐다. 이 파일 책임은 `VERSION`==`package.json`==`capability.json` 하나다.
  4. **프리릴리스 펜스에 걸리는 곳이 파이썬 4곳만이 아니다.** `home-root-refusal.test.cjs`의 두 호출도 무플래그라, `VERSION`을 올리면 최상단 펜스가 먼저 터져 `$HOME` 펜스에 닿지 못한다 — L1이 `did not match /\$HOME/`로 죽는다. Task 1 Step 5에 2곳을 더했다(총 6곳). 반대로 `prerelease-fence.test.cjs:43`은 M-1이 이미 `VERSION` 기준으로 기대를 뒤집게 써 둬서 손대지 않는다.
  5. **Task 5의 프리플라이트 삽입 위치.** M-1이 `install()` 최상단에 exit 4 펜스 2개(프리릴리스 빌드, `$HOME` 루트)를 넣어서 "프로젝트 존재 검사 바로 뒤"라는 초안 지시가 그 사이를 갈랐다. 펜스 **뒤** · `const actions=[` **앞**으로 바꿨고, Before 블록을 출하본 전문으로 교체해 대조 가능하게 했다.
- **테스트 누적:** Task 1 → +1, Task 2 → +4, Task 3 → +16, Task 4 → +3, Task 5 → +7. 기준선은 **42건**이다 — `aa9aad5`(detect exit-0 · verbatim symlink 수정)가 4건을 더한 뒤의 값이고, 계획 초안이 쓴 38은 그 커밋 이전 값이다. 따라서 **L1 +31건 = 73건**. 여기에 설치 후 소비자 실행 스모크 **1건**이 파이썬 쪽에 추가된다 (실제 설치를 하므로 L1이 아니다).

---

## GSTACK REVIEW REPORT

`/plan-eng-review` · 2026-08-21 · branch `main` · commit `6889181` · 대상 `docs/superpowers/plans/2026-08-21-m0-shared-lib-build.md`

| Runs | Status | Findings |
|---|---|---|
| Step 0 범위 도전 (복잡도 게이트 발동, 파일 20+) | 통과 — D2에서 "그대로 진행" 확정 | 0 (파일 수의 12/20은 sed 한 줄, 신규 판단 코드는 `build-capabilities.cjs` 하나) |
| Section 1 아키텍처 | issues_found | 3 — A1 밀항자 필터 `.cjs` 전용 · A2 설계서 §4.2 이탈 미반영 · A3 `CAPABILITIES`/`LIB_MAP` 이중 목록 |
| Section 2 코드 품질 | issues_found | 5 — B1 `:522`/`:557` 자기모순 · B2 기준선 38→42 · B3 실측 기준점이 M-1 이전 트리 · B4 `grep -c`가 줄 수 · B5 변조 방어 주장 과장 |
| Section 3 테스트 | issues_found | 3 — C1 언매핑 삭제 분기 미실행·조용함 · C2 게이트 차단 단언 부재 2건 · C3 에러 경로 4건 미검증 (신규 분기 커버리지 73%) |
| Section 4 성능 | clean | 0 — `copyRepo` 13ms 실측(저장소 1.1MB/106파일), L1 14회 ≈ 200ms |
| Outside voice (Codex, `model_reasoning_effort=high`) | issues_found | 10 — 합의 3 (B5·A1·C1) / 신규 6 (N1~N6) / 전략 1 (조기 기계화) |

**실측으로 검증한 것** — 판정을 근거 없이 올리지 않았다:

| 주장 | 결과 |
|---|---|
| `prepack` 실패가 `npm pack`을 막는가 | **막는다.** exit 1, `--json`은 배열 대신 `{"error":…}` |
| `install()` 줄 배치 | `:515` 시작 · `:523` `const actions=[` · `:532` dry-run 반환 · `:568` 프리플라이트 |
| 바깥 참조 14곳 | require occurrence 16 − 형제 2 = **14**. 확장자 생략형 0건 |
| `lib-layout` 테스트 3·4가 현 트리에서 통과하는가 | 미해결 relative require **0**, SKILL.md 누락 경로 **0** |
| `readJson`/`exists`/`PACKAGE_ROOT`/`CAPABILITIES` 존재 | 전부 존재. `fail()`은 throw이지 exit이 아니라 `doctor`의 `try/catch`가 흡수 |
| M1a가 `LIB_MAP` 키를 먼저 깨는가 | **깬다.** 설계 §5 표 — M1a가 `triple-gstack` → `crew-quality` |
| L1 현재 건수 | **42** (`aa9aad5` 이후) |
| 저장소 심볼릭 링크 | 0건 — `copyRepo`의 `verbatimSymlinks` 미지정은 현재 무해 |

**반영 결과** — 결정 11건 전부 이 문서에 적용:

| # | 결정 | 반영 위치 |
|---|---|---|
| A1 | 밀항자 필터를 확장자 부정목록 → 기록 허용목록으로 반전 | `presentFiles()` · 프리플라이트 마지막 루프 · 테스트 `non-.cjs stowaway` |
| A2 | 설계서 §4.2 판정표 갱신 | Task 3 Step 8 (신규) |
| A3 | 프리플라이트 검사 대상을 `readdirSync('capabilities')`로 | Task 5 Step 4 |
| B1~B4 | 낡은 실측치 4곳 갱신 | 실측 기준점 · 자기 검토 · Task 2 Step 4 |
| B5 | 변조 방어 주장 삭제, 단일 소스 규율로 정정 | `pack-contract` 주석 · 프리플라이트 주석 |
| C1 | 언매핑 사본 기본 거부 + `--prune` 분리 | `planCapability()` · 테스트 2건 |
| C2 | `prepack` 차단 · `--check` 무쓰기 단언 | `pack-contract` +1 · `lib-hash` +1 |
| C3 | 에러 경로 4건 테스트 | `lib-hash` +3 · `bundled-lib-integrity` +1 |
| N1 | 기록 자체 검증 (스키마·비어있지 않음·키 경로·해시 hex) | Task 5 Step 4 · 테스트 3건 |
| N2 | 판정/쓰기 2-패스 분리 | `planCapability()`/`applyCapability()` · 혼합 drift 테스트 |
| N3 | `LIB_MAP` 주석을 M1a 기준으로 | `LIB_MAP` 주석 |
| N5 | 설치 후 소비자 실행 스모크 | Task 5 Step 8 (신규 `tests/run_installed_lib_smoke.py`) |
| N6 | 배포 청결 게이트 `prepublishOnly` | Task 4 Step 3 · Task 6 Step 1 |
| N4 | 설치된 런타임 무결성 → **M1d 이월** | 범위 밖 항목 (소유자 M1d) |
| T2 | Windows CI 잡 제거 | Task 6 · 범위 밖 항목 (소유자 M1a) |

**테스트 누적 변화:** L1 신규 **+20 → +31** (Task 3 9→16, Task 4 2→3, Task 5 4→7). 기준선 42 위에 **73건**. 파이썬 스모크 +1.

**CODEX 흡수:** 합의 3건은 이미 리뷰가 독립 도달한 항목(교차 확인). 신규 6건 중 5건 채택, 1건(N4) 명시 이월. 전략 지적(조기 기계화)은 설계 §4.1의 시퀀싱 결정 및 D2 사용자 확정과 충돌하므로 **재논의하지 않는다** — Codex는 M1a~M1d 로드맵을 보지 못했다.

**CROSS-MODEL TENSION:** T2(Windows CI)만 발생. 계획서는 "조용히 빼면 안 고쳐진다", Codex는 "영구 allowed-to-fail은 빨간 잡음". D15에서 잡 제거 + 명시 TODO로 양쪽 우려를 동시에 해소. 나머지는 긴장 없음.

**남은 저심각도 (이 계획 범위 밖, M-1 출하본 소관):** `v0.6.5` 태그가 릴리스 커밋 `a3e2063`이 아니라 `45cfae9`에 있다 · `docs/INSTALL.md` 제목 버전을 아무 테스트도 보지 않는다.

**VERDICT: APPROVED WITH CHANGES APPLIED** — 11건 전부 사용자 승인 후 이 문서에 반영 완료. 착수 전 남은 것은 계획서 커밋뿐이다. push 금지 제약 유효.

NO UNRESOLVED DECISIONS
