# M1a — 기계적 개명(crew 선두) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 저장소 전체의 브랜드 식별자를 `triple-crown`/`triple-gstack`/`triple-superpowers`/`TRIPLE_*` 에서 `crew` 계열로 1:1 치환하고, 설치자의 `SKILL_PREFIX` 를 빈 문자열로 만들어 스킬명을 151자에서 79자로 줄인 뒤, 되돌아오지 못하도록 L1 계약 테스트 두 벌로 못 박는다. **capability 분해도 신규 기능도 하지 않는다.**

**Architecture:** 설계서 [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §5(M1 분할)의 M1a다. 상위 문서 §4.3 매핑표를 그대로 적용하되, 분해를 전제한 `triple-gstack` → `crew-quality`/`crew-security`/`crew-ship` 3분할은 **적용하지 않는다** — M1a 시점의 capability 는 3개 그대로이고 `triple-gstack` 은 `crew-quality` 로 1:1 개명된다. 치환은 눈으로 하지 않는다: 우선순위가 있는 규칙표를 가진 일회용 스크립트가 추적 파일 전체를 훑고, 동결 목록과 보호 토큰만 비켜간다. 개명이 끝난 뒤에는 스크립트가 아니라 **테스트**가 계약을 지킨다.

**Tech Stack:** Node.js ≥24 (실측 v24.14.0), `node:test` 러너, Node stdlib만 (외부 npm 의존성 0), 시스템 `npm` 11.11.0 · `git` 2.43.0 · `python3` 3.13.13.

**Spec:** [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §3(저장소 구조) · §5~5.1(M1 분할·개명 대상) · §6 L1 · §8(커밋·태그) / [`docs/RESTRUCTURE-PLAN.md`](../../RESTRUCTURE-PLAN.md) §4(네이밍 재설계) · §4.1(GSD 접두사 실측) · §4.3(이름 매핑표)

## Global Constraints

- 외부 npm 의존성 추가 금지. `package.json` 에 `dependencies` 없음 유지.
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green.
- **push 금지.** 커밋·태그는 로컬에만. push 는 사용자 승인 후 별도 (Task 4·5가 그 게이트다).
- **기능 변화 0.** M1a 는 순수 리팩터링이다. 동작이 바뀌는 수정은 발견해도 하지 않고 "범위 밖" 절에 소유자와 함께 기록한다. 설계 §7.5: "이름 변경은 순수 리팩터링으로 격리해야 회귀 원인을 특정할 수 있다."
- **분해 금지.** capability 는 3개 그대로다. `crew-core`/`crew-flow`/`crew-security`/`crew-ship`/`crew-demo`/`crew-concept` 는 M1b 이후다.
- **아티팩트 이름은 바꾸지 않는다** (설계 §3.1). `GSTACK-CODE-REVIEW.json` · `GSTACK-QA.json` · `GSTACK-PLAN-REVIEW.json` · `MUTATION.json` · `EVIDENCE.json` 은 브랜드와 무관하게 유지한다. 진행 중인 phase 의 증거가 무효화되기 때문이다. 개명 규칙표에 `GSTACK-` 을 넣지 않는 것이 이 제약의 구현이다.
- **`gstack` 은 남의 이름이다.** `~/.gstack`, `~/.claude/skills/gstack/`, `/plan-eng-review`, `/review`, `/cso` 는 외부 도구(garrytan/gstack)를 가리킨다. `triple-gstack` 이라는 **우리** capability id 만 바뀌고 `gstack` 단독 토큰은 건드리지 않는다.
- **머신·폴더 종속 금지.** 저장소 경로는 `git rev-parse --show-toplevel` 또는 `path.resolve(__dirname,'..')` 로 얻는다. 파괴적 실험은 `git archive` 로 뜬 임시 트리에서만 한다.
- **VERSION 은 `0.7.0-dev` 그대로다.** M1a 는 릴리스가 아니다. `prepublishOnly` 의 프리릴리스 펜스(M0 산출물)가 계속 배포를 막는다.

## 선행 조건 (착수 전 확인)

M1a 는 M0 산출물 위에 쌓인다. 아래가 전부 참이 아니면 **착수하지 않는다.**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git rev-parse -q --verify refs/tags/v0.7.0-m0 >/dev/null && echo "OK v0.7.0-m0 태그" || echo "BLOCK: M0 미완료"
[ -f scripts/build-capabilities.cjs ] && echo "OK build-capabilities.cjs" || echo "BLOCK: M0 Task 3 미완료"
[ -d lib ] && ls lib && echo "OK canonical lib/" || echo "BLOCK: M0 Task 2 미완료"
node scripts/build-capabilities.cjs --check
node --test 'e2e/contract/**/*.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
git status --short; echo "(작업 트리 끝 — 비어 있어야 한다)"
cat VERSION
```

기대: `v0.7.0-m0` 태그 존재, `lib/` 에 `evidence-store.cjs`·`repo-state-lib.cjs`·`resolve-phase-dir.cjs` 3개, `build-capabilities: in sync`, **L1 81/81 pass**, `git status --short` 빈 출력, `VERSION` = `0.7.0-dev`.

작업 트리가 더러우면 착수하지 않는다. Task 1 의 개명 스크립트는 추적 파일 전체를 제자리에서 고치므로, 미커밋 변경이 섞이면 `git diff` 로 개명분과 구분할 수 없다.

## 실측 기준점 (2026-08-21 확인)

전부 이 계획을 쓰는 동안 `git archive HEAD` 로 뜬 임시 트리에서 실제로 돌려 확인했다. 추정이 아니다.

| 항목 | 실측값 |
|---|---|
| 추적 파일 | 118개 |
| 개명 대상 내용 변경 | 75개 파일 |
| 동결(내용 무변경) | 21개 파일 |
| 경로 개명 | 33개 |
| diffstat | 84 files changed, 699 insertions(+), 702 deletions(−) |
| L1 기준선 | 81건 (M0 종료 시점) |
| 개명 직후 L1 (테스트 무수정) | **81/81 pass** |
| 파이썬 스모크 7종 | 전부 PASS (`run_installer_smoke`·`run_installed_lib_smoke`·`run_v061_l0`·`run_local_smoke`·`run_guide_smoke`·`validate_prototype`·`run_bash_installer_smoke`) |
| `npm pack` + `run_npx_tarball_smoke` | PASS (`crew-harness-0.7.0-dev.tgz`, total files 47) |
| `node e2e/run-live.cjs --mock` | `PASS Crew v0.6 install/render/staging/guard contract` |
| 실제 설치 후 `doctor` | `READY=true PASS=17 WARN=0 FAIL=0` |
| 설치된 스킬 디렉터리 | `crew-gsd` `crew-gsd-postship` `crew-gsd-qa` `crew-gsd-release` `crew-gsd-review` `crew-gsd-sec` |
| 스킬명 총 길이 | 151자 → **79자** (8·15·11·12·17·16) — 상위 문서 §4.3 수치와 일치 |
| 개명 후 잔존 구 이름 | 동결 목록 + `ungkey/triple-crown` **뿐** (그 외 0건) |
| 원격 부트스트랩 | **깨져 있다.** `npm pack github:ungkey/triple-crown#v0.6.5` → `The git reference could not be found … pathspec 'v0.6.5'` |
| npm 레지스트리 | `triple-crown-workflow-installer` · `crew-harness` **둘 다 404** — 이름 이전 비용 0 |
| 이 머신의 레거시 | `legacy-backup.cjs detect` → `legacy targets: 0`, `~/.triple-crown` 없음, `~/.claude/skills` 에 crew/triple 스킬 0개, `gsd-tools` 미설치 |

### 실측으로 뒤집힌 것 넷

1. **`SKILL.md` frontmatter `name` 은 stem 이 아니라 접두사가 붙은 이름이다.** 초안은 "디렉터리명 == frontmatter name"(상위 문서 §4 제약 2)을 그대로 믿고 `name: triple-crown` 을 고치는 앵커를 넣었다가 `guide SKILL.md name anchor not found` 로 죽었다. 실제 값은 `name: gsd-triple-crown` 이다 — 즉 frontmatter 는 **설치된** 디렉터리명(`${SKILL_PREFIX}${stem}`)과 일치하고 소스 stem 과는 다르다. 규칙 `gsd-triple-crown → crew-gsd` 가 이미 처리하므로 별도 앵커가 필요 없다. `SKILL_PREFIX` 를 빈 문자열로 만드는 순간 stem 과 frontmatter 가 처음으로 일치하게 되며, Task 2 가 그 일치를 계약으로 고정한다.
2. **`triple-crown → crew` 는 놀랄 만큼 깨끗한 치환이다.** `triple-crown-guide → crew-guide`, `.triple-crown/ → .crew/`, `.triple-crown-skill → .crew-skill`, `triple-crown:managed-routing → crew:managed-routing`, `triple-crown-ship-guard.cjs → crew-ship-guard.cjs`, `bin/triple-crown.cjs → bin/crew.cjs`, CLI `triple-crown → crew` 가 전부 규칙 하나로 옳게 떨어진다. **예외는 셋뿐**이다 — npm 패키지명(`crew-harness`), 스킬 stem 여섯 개, GitHub 경로(보호).
3. **가이드 capability 의 스킬 stem 만 규칙표로 처리할 수 없다.** stem 이 단독 `triple-crown` 이라 일반 규칙이 `crew` 로 만들어 버리는데 목표는 `crew-gsd` 다. 실측에서 이 함정이 실제로 터진 곳은 `tests/validate_prototype.py:65` 의 `guide["skills"] != ["triple-crown"]` 였고 (`AssertionError: crew-guide must expose one unified situational skill`), 매니페스트 쪽은 여러 줄 JSON 이라 정규식 앵커가 따로 필요했다. 두 형태를 서로 다른 장치로 잡는다.
4. **줄바꿈으로 끊긴 브랜드 프로즈가 리터럴 규칙을 빠져나간다.** `docs/SECURITY-CONTRACT.md:40` 이 `Triple` / `Crown` 으로 줄이 갈려 있어 리터럴 치환이 통과했다. 리터럴 규칙 뒤에 `/Triple\s+Crown/g` 정규식 한 줄을 덧대야 0건이 된다.

### 이 개명이 건드리지 않는 것

| 남는 것 | 이유 |
|---|---|
| `scripts/legacy-backup.cjs`, `e2e/contract/legacy-backup.test.cjs`, `e2e/contract/helpers/fake-home.cjs` | 레거시 탐지·백업·복구는 **개명 전 설치본**을 가리켜야 동작한다. 여기서 이름을 바꾸면 M-1 산출물이 아무것도 못 찾는다. 참고로 M-1 은 이미 `SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill']` 로 양쪽을 본다 |
| `docs/RESTRUCTURE-PLAN.md`, `docs/V0.7-IMPLEMENTATION-DESIGN.md`, `docs/superpowers/plans/**` | 매핑 자체를 기록하는 설계·계획 문서다. 구 이름이 사료다 |
| `docs/V0.2~V0.6*.md`, `tests/*.md` | 이력 문서(설계 노트·핫픽스·테스트 리포트). 지난 릴리스가 무엇이었는지를 바꾸면 추적성이 사라진다 |
| `ungkey/triple-crown` | GitHub 저장소 개명은 사용자 소유의 외부 작업이고, `install.sh` 는 아직 **구 이름 아래의** 마지막 안정 태그를 부트스트랩한다. Task 4(승인 게이트) |
| `GSTACK-*.json`, `gstack` 단독 토큰, `.gsd/`, `gsd-tools` | 설계 §3.1 · 외부 도구 |

## File Structure

```
crew/                                    (개명 후. 저장소 디렉터리명 자체는 안 바꾼다 — Task 4)
  bin/crew.cjs                    <-개명  구 bin/triple-crown.cjs · SKILL_PREFIX 만 의미 변경
  guards/crew-ship-guard.cjs      <-개명  구 guards/triple-crown-ship-guard.cjs
  lib/                                   무변경 (M0 산출물)
  capabilities/
    crew-quality/                 <-개명  구 triple-gstack. M1b 분해의 출발점
      skills/crew-gsd-review/     <-개명  구 triple-gstack-code-review
      skills/crew-gsd-qa/         <-개명  구 triple-gstack-qa-only
      skills/crew-gsd-sec/        <-개명  구 triple-gstack-cso
      skills/crew-gsd-postship/   <-개명  구 triple-gstack-post-ship
      skills/crew-gsd-release/    <-개명  구 triple-gstack-release-observe
    crew-discipline/              <-개명  구 triple-superpowers
    crew-guide/                   <-개명  구 triple-crown-guide
      skills/crew-gsd/            <-개명  구 skills/triple-crown  (규칙표 예외)
  e2e/contract/
    brand-names.test.cjs          ★신규★ 구 브랜드 회귀 펜스 (4건)
    skill-contract.test.cjs       ★신규★ stem 규약·접두사·frontmatter 일치 (5건)
  docs/RENAME-MAP.md              ★신규★ 매핑표 + 동결 목록 + M1c 입력 사양
  scripts/                               무변경. 개명 스크립트는 **커밋하지 않는다** (아래)
```

**개명 스크립트를 저장소에 넣지 않는 이유.** `package.json` 의 `files` 가 `scripts` 를 통째로 포함하므로 `scripts/rename-to-crew.cjs` 를 커밋하면 트리 전체를 제자리에서 재작성하는 도구가 **사용자 tarball 에 실려 나간다**. 일회용이므로 `mktemp` 경로에 쓰고 저장소 루트를 cwd 로 실행한다. 소스는 이 계획서 Task 1 Step 3 에 전문이 있고, 규칙표는 `docs/RENAME-MAP.md` 로 저장소에 남는다.

---

### Task 1: 회귀 펜스 + 매핑 문서 + 기계적 개명

개명은 반쪽으로 커밋될 수 없다 — 경로가 바뀌는 순간 그 경로를 참조하는 모든 파일이 함께 바뀌어야 하므로 **한 커밋**이다. 대신 펜스 테스트를 먼저 써서 빨간불을 확인하고, 개명이 그 불을 끄게 한다.

**Files:**
- Create: `e2e/contract/brand-names.test.cjs`
- Create: `docs/RENAME-MAP.md`
- Modify: 추적 파일 75개 (내용) + 33개 (경로) — 스크립트가 처리
- Modify: `bin/triple-crown.cjs:21` → `bin/crew.cjs` 의 `SKILL_PREFIX`
- Modify: `capabilities/triple-crown-guide/capability.json` 의 `skills` 배열

**Interfaces:**
- Consumes: M0 의 `scripts/build-capabilities.cjs`(사본 재생성), `e2e/contract/helpers/repo.cjs` 의 `ROOT`.
- Produces: `docs/RENAME-MAP.md` — Task 2 의 테스트 주석과 M1c `uninstall-legacy` 의 제거 대상 목록이 이 표를 참조한다. `brand-names.test.cjs` 의 `ALLOW`/`REPO_PATH_FILES` 상수 — 이후 모든 태스크가 이 목록을 유지 보수한다.

- [ ] **Step 1: 회귀 펜스 테스트를 먼저 쓴다**

`e2e/contract/brand-names.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT } = require('./helpers/repo.cjs');

// M1a 개명이 되돌아오지 못하게 막는 펜스. 문자열 하나가 새로 들어오는 것은
// 리뷰에서 눈으로 못 잡는다 — 표면 전체를 정적으로 훑는다.

const LEGACY = /triple-crown|triple_crown|triple-gstack|triple-superpowers|TRIPLE_|Triple\s+Crown|TC_GSTACK|TC_GUIDE/;

// 구 이름이 **남아 있어야 하는** 파일. 두 부류뿐이다.
//   (1) 레거시 탐지/복구: 개명 전 설치본을 가리켜야 동작한다.
//   (2) 설계/계획/이력 문서: 매핑 자체를 기록하므로 구 이름이 사료다.
const ALLOW = [
  'scripts/legacy-backup.cjs',
  'e2e/contract/legacy-backup.test.cjs',
  'e2e/contract/helpers/fake-home.cjs',
  'e2e/contract/brand-names.test.cjs',
  'docs/RENAME-MAP.md',
  'docs/RESTRUCTURE-PLAN.md',
  'docs/V0.7-IMPLEMENTATION-DESIGN.md',
];
const ALLOW_PREFIX = ['docs/superpowers/'];
const ALLOW_RE = [/^docs\/V0\.[0-6][^/]*\.md$/, /^tests\/[^/]*\.md$/];

// 부트스트랩이 가리키는 GitHub 경로. 저장소 개명은 외부 작업이라 M1a 범위 밖이고,
// install.sh 는 아직 구 이름 아래의 마지막 안정 태그를 받는다. **이 토큰만** 예외다.
const REPO_PATH = 'ungkey/triple-crown';
const REPO_PATH_FILES = new Set([
  'install.sh', 'install.ps1', 'package.json',
  'README.md', 'docs/INSTALLER.md',
  'e2e/contract/brand-names.test.cjs',
]);

function tracked() {
  return cp.execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean);
}
function allowed(rel) {
  return ALLOW.includes(rel)
    || ALLOW_PREFIX.some((p) => rel.startsWith(p))
    || ALLOW_RE.some((re) => re.test(rel));
}

test('no tracked file outside the allowlist still carries a pre-M1a brand token', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (allowed(rel)) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { continue; }
    if (buf.includes(0)) continue;
    buf.toString('utf8').split('\n').forEach((line, i) => {
      const stripped = line.split(REPO_PATH).join('');
      if (LEGACY.test(stripped)) bad.push(`${rel}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepStrictEqual(bad, [], 'pre-M1a brand tokens leaked back in');
});

test('no tracked path still carries a pre-M1a brand token', () => {
  const bad = tracked().filter((rel) => LEGACY.test(rel));
  assert.deepStrictEqual(bad, [], 'pre-M1a brand tokens in file paths');
});

test('the allowlist is alive — every entry exists and still holds a legacy name', () => {
  // 허용 목록이 조용히 죽는 것이 이 펜스의 가장 흔한 실패 방식이다. 파일이 지워지거나
  // 개명되면 목록은 그대로 통과하고, 그 뒤에 들어오는 진짜 회귀를 못 잡게 된다.
  const dead = [];
  for (const rel of ALLOW) {
    if (rel === 'e2e/contract/brand-names.test.cjs') continue; // 자기 자신
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) { dead.push(`${rel}: missing`); continue; }
    if (!LEGACY.test(fs.readFileSync(abs, 'utf8'))) dead.push(`${rel}: no legacy name left — drop it from ALLOW`);
  }
  assert.deepStrictEqual(dead, [], 'stale allowlist entries');
});

test('the old GitHub path appears only where the bootstrap actually needs it', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (REPO_PATH_FILES.has(rel) || allowed(rel)) continue;
    let buf;
    try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { continue; }
    if (buf.includes(0)) continue;
    if (buf.toString('utf8').includes(REPO_PATH)) bad.push(rel);
  }
  assert.deepStrictEqual(bad, [], `${REPO_PATH} outside the bootstrap surface`);
});
```

> 세 번째 테스트가 왜 있는가. 허용 목록형 펜스의 표준 실패 방식은 "목록에 적힌 파일이 사라졌는데 목록은 그대로"다. 그 상태에서 펜스는 계속 초록불이지만 실제로는 아무것도 지키지 않는다. `docs/RENAME-MAP.md` 가 지워지거나 `legacy-backup.cjs` 가 개명되면 이 테스트가 먼저 죽는다.

- [ ] **Step 2: 빨간불 확인**

```bash
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
```

기대: `pass 1` · `fail 3` — 내용(75파일)·경로(33개)·허용목록(`docs/RENAME-MAP.md: missing`, Step 6에서 만든다). 네 번째(GitHub 경로)는 이 시점에 **통과한다**: 개명 전에도 `ungkey/triple-crown` 은 `REPO_PATH_FILES` 안에만 있기 때문이다.

`fail 0` 이면 펜스가 아무것도 안 보고 있다는 뜻이므로 멈추고 원인을 찾는다.

> 실측 보조 확인: `docs/RENAME-MAP.md` 를 미리 만들어 둔 상태로 돌리면 `pass 2 · fail 2` 다. 허용목록 테스트가 그 파일 하나에 정확히 반응한다는 뜻이다.

- [ ] **Step 3: 개명 스크립트를 임시 경로에 쓴다**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RENAME_DIR="$(mktemp -d)"
echo "$RENAME_DIR"
```

`"$RENAME_DIR/rename-to-crew.cjs"`:

```js
'use strict';
// 호출자: node "$RENAME_DIR/rename-to-crew.cjs". 임포터 없음. M1a 일회용.
// 실행 위치의 git 트리를 제자리에서 고친다 — 저장소 루트를 cwd 로 두고 돌린다.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

// 동결 목록. 내용을 절대 바꾸지 않는다.
//   (1) 레거시 탐지/복구는 **개명 전 설치본**을 가리켜야 한다.
//   (2) 설계/계획/이력 문서는 매핑 자체를 기록하므로 구 이름이 남아야 한다.
const FROZEN = [
  /^scripts\/legacy-backup\.cjs$/,
  /^e2e\/contract\/legacy-backup\.test\.cjs$/,
  /^e2e\/contract\/helpers\/fake-home\.cjs$/,
  /^docs\/RESTRUCTURE-PLAN\.md$/,
  /^docs\/V0\.7-IMPLEMENTATION-DESIGN\.md$/,
  /^docs\/superpowers\//,
  /^docs\/V0\.[0-6].*\.md$/,
  /^tests\/.*\.md$/,
];

// 보호 토큰. 개명 대상이지만 이 단계에서는 바꾸지 않는다.
// GitHub 저장소 개명은 외부/사용자 소유 작업이고, install.sh 는 아직 구 이름의
// v0.6.5 태그를 부트스트랩한다.
const PROTECTED = ['ungkey/triple-crown'];

// 치환 규칙. 순서가 곧 우선순위다. 긴 것 먼저.
const RULES = [
  ['triple-crown-workflow-installer', 'crew-harness'],
  ['gsd-triple-gstack-code-review', 'crew-gsd-review'],
  ['gsd-triple-gstack-qa-only', 'crew-gsd-qa'],
  ['gsd-triple-gstack-cso', 'crew-gsd-sec'],
  ['gsd-triple-gstack-post-ship', 'crew-gsd-postship'],
  ['gsd-triple-gstack-release-observe', 'crew-gsd-release'],
  ['gsd-triple-crown', 'crew-gsd'],
  // 설치된 스킬 디렉터리를 가리키는 glob (`.gitignore`, 문서 2곳). 위의 개별 규칙
  // 여섯 개가 지나간 **뒤** 남는 것만 잡아야 하므로 순서가 중요하다.
  ['gsd-triple-', 'crew-'],
  ['triple-gstack-code-review', 'crew-gsd-review'],
  ['triple-gstack-qa-only', 'crew-gsd-qa'],
  ['triple-gstack-cso', 'crew-gsd-sec'],
  ['triple-gstack-post-ship', 'crew-gsd-postship'],
  ['triple-gstack-release-observe', 'crew-gsd-release'],
  ['triple-gstack', 'crew-quality'],
  ['triple-superpowers', 'crew-discipline'],
  ['triple-crown-guide', 'crew-guide'],
  // 가이드 capability 의 스킬 stem 은 단독 `triple-crown` 이라 일반 규칙이 `crew` 로
  // 만들어 버린다. 한 줄짜리 리스트 리터럴은 여기서 잡는다 (실측: tests/validate_prototype.py:65).
  ['["triple-crown"]', '["crew-gsd"]'],
  ['TRIPLE_CROWN_', 'CREW_'],
  ['TRIPLE_', 'CREW_'],
  ['TC_GSTACK_CAP', 'CREW_CAP'],
  ['TC_GUIDE_CAP', 'CREW_CAP'],
  ['triple_crown.', 'crew.'],
  ['triple-crown', 'crew'],
  ['tripleCrownVersion', 'crewVersion'],
  ['Triple Crown', 'Crew'],
];

const STEM_FROM = 'capabilities/triple-crown-guide/skills/triple-crown';
const STEM_TO = 'capabilities/triple-crown-guide/skills/crew-gsd';

function tracked() {
  return cp.execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean);
}
function frozen(rel) { return FROZEN.some((re) => re.test(rel)); }

function rewrite(text) {
  let out = text;
  const masks = [];
  PROTECTED.forEach((tok, i) => {
    const mark = `PROTECTED${i}`;
    if (out.includes(tok)) { masks.push([mark, tok]); out = out.split(tok).join(mark); }
  });
  for (const [from, to] of RULES) out = out.split(from).join(to);
  // 리터럴 규칙이 끝난 뒤 남는 것: 마크다운에서 줄바꿈으로 끊긴 브랜드 프로즈.
  // 실측 잔존 2곳 (docs/SECURITY-CONTRACT.md:40, tests/V0.6.3-...:129).
  out = out.replace(/Triple\s+Crown/g, 'Crew');
  for (const [mark, tok] of masks) out = out.split(mark).join(tok);
  return out;
}

// 1단계: 예외 stem 을 먼저 옮긴다.
if (fs.existsSync(path.join(ROOT, STEM_FROM))) {
  cp.execSync(`git mv ${JSON.stringify(STEM_FROM)} ${JSON.stringify(STEM_TO)}`, { cwd: ROOT });
}
// 매니페스트의 stem 리터럴은 여러 줄 JSON 이라 규칙표로 못 잡는다. 앵커로 못 박는다.
// SKILL.md frontmatter 는 손대지 않는다 — 실측상 `name: gsd-triple-crown` 이라
// 규칙 `gsd-triple-crown -> crew-gsd` 가 이미 처리한다.
{
  const man = path.join(ROOT, 'capabilities/triple-crown-guide/capability.json');
  const b = fs.readFileSync(man, 'utf8');
  const a = b.replace(/"skills":\s*\[\s*"triple-crown"\s*\]/, '"skills": ["crew-gsd"]');
  if (a === b && !b.includes('"crew-gsd"')) throw new Error('guide manifest skills anchor not found');
  fs.writeFileSync(man, a);
}

// 설치자 접두사. 문자열 치환으로는 안 되는 유일한 의미 변경이다.
// stem 자체가 `crew-gsd-*` 가 되므로 GSD 런타임 접두사를 빈 문자열로 만든다.
{
  const bin = path.join(ROOT, 'bin/triple-crown.cjs');
  const b = fs.readFileSync(bin, 'utf8');
  const a = b.replace("const SKILL_PREFIX = 'gsd-';", "const SKILL_PREFIX = '';");
  if (a === b) throw new Error('SKILL_PREFIX anchor not found');
  fs.writeFileSync(bin, a);
}

// 2단계: 내용 치환.
let changed = 0;
let skipped = 0;
for (const rel of tracked()) {
  if (frozen(rel)) { skipped++; continue; }
  const abs = path.join(ROOT, rel);
  let buf;
  try { buf = fs.readFileSync(abs); } catch { continue; }
  if (buf.includes(0)) continue;
  const src = buf.toString('utf8');
  const out = rewrite(src);
  if (out !== src) { changed++; fs.writeFileSync(abs, out); }
}

// 3단계: 경로 개명. 깊은 경로부터 옮겨야 부모 이동이 자식 경로를 무효화하지 않는다.
const moves = [];
for (const rel of tracked()) {
  const next = rewrite(rel);
  if (next !== rel) moves.push([rel, next]);
}
moves.sort((a, b) => b[0].split('/').length - a[0].split('/').length);
for (const [from, to] of moves) {
  fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
  cp.execSync(`git mv ${JSON.stringify(from)} ${JSON.stringify(to)}`, { cwd: ROOT });
}
// git mv 는 비게 된 부모 디렉터리를 지우지 않는다.
cp.execSync('find capabilities -type d -empty -delete', { cwd: ROOT });

console.error(`content: ${changed} changed, ${skipped} frozen; paths: ${moves.length} moved`);
```

> **앵커 두 개가 던지는 이유.** `SKILL_PREFIX` 와 가이드 매니페스트는 규칙표로 잡히지 않는 유이한 지점이다. 조용히 건너뛰면 개명은 "성공"하고 설치만 깨진다 — `gsd-crew-gsd-review` 라는 디렉터리에 `name: crew-gsd-review` 프론트매터가 들어가 Claude Code 가 스킬을 인식하지 못한다. 던지기가 `writeFileSync` 보다 앞이므로 앵커가 어긋나면 아무것도 바뀌지 않는다.

- [ ] **Step 4: 개명 실행**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
node "$RENAME_DIR/rename-to-crew.cjs"
```

기대: `content: 75 changed, 21 frozen; paths: 33 moved`

숫자가 다르면 멈춘다. 되돌리기는 `git checkout -- . && git clean -fd` 한 줄이다 (작업 트리가 착수 전에 깨끗했으므로 안전하다).

- [ ] **Step 5: 공유 lib 사본 재생성**

```bash
node scripts/build-capabilities.cjs --check   # 실패해야 정상
node scripts/build-capabilities.cjs
node scripts/build-capabilities.cjs --check   # 통과해야 정상
```

기대: 첫 줄이 `capabilities/crew-quality/checks/lib/LIB-HASH.json is stale — run npm run build:caps` → 재생성 → `build-capabilities: in sync`.

> 개명이 canonical `lib/*.cjs` 와 사본을 **같은 규칙으로 동시에** 고쳤으므로 사본은 여전히 canonical 과 바이트 동일하다. 낡은 것은 기록(`LIB-HASH.json`)뿐이다. M0 Task 3 의 출처 가드가 "사본이 전부 canonical 과 동일하면 기록만 새로 쓴다"로 좁혀져 있어 이 상태가 정확히 통과 경로다 — 그 완화가 없었다면 여기서 `provenance unknown` 으로 막혔다.

- [ ] **Step 6: 매핑 문서 작성**

`docs/RENAME-MAP.md`:

````markdown
# 이름 매핑 (M1a)

`v0.7.0-m1a` 에서 브랜드 식별자를 `crew` 계열로 1:1 개명했다. 구 이름은 이 문서와
아래 동결 목록에만 남는다. `e2e/contract/brand-names.test.cjs` 가 그 외 어디에도
구 이름이 없음을 매 커밋 검사한다.

## 매핑표

| 구분 | 구 이름 | 신 이름 |
|---|---|---|
| npm 패키지 | `triple-crown-workflow-installer` | `crew-harness` |
| CLI | `triple-crown` | `crew` |
| 설치자 | `bin/triple-crown.cjs` | `bin/crew.cjs` |
| 가드 훅 | `guards/triple-crown-ship-guard.cjs` | `guards/crew-ship-guard.cjs` |
| capability | `triple-gstack` | `crew-quality` |
| capability | `triple-superpowers` | `crew-discipline` |
| capability | `triple-crown-guide` | `crew-guide` |
| 스킬 (16자) | `gsd-triple-crown` | `crew-gsd` (8자) |
| 스킬 (29자) | `gsd-triple-gstack-code-review` | `crew-gsd-review` (15자) |
| 스킬 (25자) | `gsd-triple-gstack-qa-only` | `crew-gsd-qa` (11자) |
| 스킬 (21자) | `gsd-triple-gstack-cso` | `crew-gsd-sec` (12자) |
| 스킬 (27자) | `gsd-triple-gstack-post-ship` | `crew-gsd-postship` (17자) |
| 스킬 (33자) | `gsd-triple-gstack-release-observe` | `crew-gsd-release` (16자) |
| 벤더 디렉터리 | `.triple-crown/` | `.crew/` |
| 소유권 마커 | `.triple-crown-skill` | `.crew-skill` |
| 인가 디렉터리 | `.planning/.triple-crown/` | `.planning/.crew/` |
| CLAUDE.md 마커 | `triple-crown:managed-routing` | `crew:managed-routing` |
| config 루트 | `triple_crown.*` | `crew.*` |
| 환경변수 | `TRIPLE_CROWN_*` / `TRIPLE_*` | `CREW_*` |
| SKILL.md 지역 변수 | `TC_GSTACK_CAP` / `TC_GUIDE_CAP` | `CREW_CAP` |
| 프로즈 | `Triple Crown` | `Crew` |

스킬명 총 길이 **151자 -> 79자**.

설치자의 `SKILL_PREFIX` 가 `'gsd-'` 에서 `''` 로 바뀌었다. 이제 소스 stem 과 설치된
디렉터리명과 `SKILL.md` frontmatter `name` 셋이 같은 문자열이다.

## 바꾸지 않은 것

- **아티팩트 이름** — `GSTACK-CODE-REVIEW.json`, `GSTACK-QA.json`, `GSTACK-PLAN-REVIEW.json`,
  `GSTACK-SECURITY.json`, `GSTACK-CANARY.json`, `GSTACK-RETRO.json`, `GSTACK-DOCUMENT-RELEASE.json`,
  `GSTACK-QA-UAT-BRIDGE.json`, `MUTATION.json`, `EVIDENCE.json`. 이름을 바꾸면 진행 중인
  phase 의 증거가 통째로 무효화된다 (설계 §3.1).
- **`gstack` 단독 토큰** — 외부 도구(garrytan/gstack)를 가리킨다. `~/.gstack`,
  `~/.claude/skills/gstack/`, `/plan-eng-review`, `/review`. config 키의 중간 마디
  `crew.gstack.*` 도 이 도구와의 다리를 뜻하므로 유지한다.
- **GSD 표면** — `.gsd/`, `gsd-tools`, `gsd-` capability id 예약 접두사.
- **GitHub 경로** — `ungkey/triple-crown`. 저장소 개명은 별도 승인 작업이다.

## 동결: 구 이름이 남아 있어야 하는 곳

| 파일 | 이유 |
|---|---|
| `scripts/legacy-backup.cjs` | 개명 **전** 설치본을 탐지·백업·복구한다. 이름을 바꾸면 아무것도 못 찾는다 |
| `e2e/contract/legacy-backup.test.cjs` | 위의 계약 테스트 |
| `e2e/contract/helpers/fake-home.cjs` | 레거시 설치본을 심는 픽스처 |
| `docs/RESTRUCTURE-PLAN.md` · `docs/V0.7-IMPLEMENTATION-DESIGN.md` | 매핑 자체를 정의하는 설계 문서 |
| `docs/superpowers/plans/**` | 실행 계획 이력 |
| `docs/V0.2~V0.6*.md` · `tests/*.md` | 지난 릴리스의 설계 노트·핫픽스·테스트 리포트 |

## M1c `crew uninstall-legacy` 가 제거할 대상

개명 전 설치본이 머신에 남긴 것. 위 동결 파일의 상수와 같은 값이어야 한다.

```
1. gsd-tools capability remove triple-gstack / triple-superpowers / triple-crown-guide
2. ~/CLAUDE.md 의 triple-crown:managed-routing 마커 블록
3. ~/.claude/hooks/triple-crown-ship-guard.cjs
4. ~/.claude/settings.json 의 PreToolUse(Bash) 훅 등록 항목
5. ~/.triple-crown/ 벤더 디렉터리
6. ~/.claude/skills/ 의 .triple-crown-skill 마커 디렉터리
```

기존 설치가 GSD config 에 `triple_crown.*` 값을 갖고 있으면 M1a 이후 그 값은 읽히지
않고 `crew.*` 기본값이 적용된다. `uninstall-legacy` 는 이 사실을 사용자에게 고지한다.
````

- [ ] **Step 7: 펜스가 초록불이 되는지 확인**

```bash
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E '^(.|.) (tests|pass|fail)'
```

기대: `pass 4` · `fail 0`.

> **실측 경고.** 이 계획을 검증하는 동안 펜스가 잡은 첫 위반은 개명 누락이 아니라 **새로 쓴 테스트 주석에 적어 넣은 구 이름**이었다 (`skill-contract.test.cjs:42` 의 33자 스킬명 인용). 신규 파일에 설명 목적으로라도 구 이름을 적으면 펜스가 문다 — 길이만 쓰고 이름은 `docs/RENAME-MAP.md` 로 넘긴다.

- [ ] **Step 8: 전체 L1 + 스모크**

```bash
npm run test:l1 2>&1 | grep -E '^. (tests|pass|fail)'
for t in run_installer_smoke run_installed_lib_smoke run_v061_l0 run_local_smoke \
         run_guide_smoke validate_prototype run_bash_installer_smoke; do
  printf '%-28s ' "$t"; python "tests/$t.py" >/dev/null 2>&1 && echo PASS || echo FAIL
done
```

기대: **L1 85/85 pass** (기준선 81 + 펜스 4). 파이썬 7종 전부 PASS.

> `validate_prototype` 이 `crew-guide must expose one unified situational skill` 로 죽으면 규칙표의 `["triple-crown"] -> ["crew-gsd"]` 항목이 빠진 것이다 — 실측에서 실제로 났던 실패다.

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "refactor: rename the brand surface to crew and drop the gsd- skill prefix"
git status --short; echo "(끝 — 비어 있어야 한다)"
git diff --stat HEAD~1 | tail -1
```

기대: `git status --short` 빈 출력. diffstat 은 신규 2파일(`brand-names.test.cjs`, `RENAME-MAP.md`)을 더해 실측 `84 files changed` 보다 커진다.

> `git add -A` 를 쓴다. 개명은 파일 목록을 통째로 바꾸므로 M0 Task 1 Step 8 처럼 경로를 열거하는 방식은 여기서 오히려 위험하다 — 하나만 빠져도 트리가 반쪽으로 커밋되고, 그 사실은 신선한 체크아웃에서만 드러난다. 대신 커밋 **직후** `git status --short` 로 남은 것이 없음을 확인한다.

---

### Task 2: 스킬 표면 계약

D1(스킬 이름 최대 33자)은 이 재구성 전체의 출발점이었다. 길이·접두사·frontmatter 일치를 사람이 지키는 규칙에서 테스트가 지키는 계약으로 바꾼다.

**Files:**
- Create: `e2e/contract/skill-contract.test.cjs`

**Interfaces:**
- Consumes: Task 1 의 개명 결과 · `docs/RENAME-MAP.md` (주석 참조) · `e2e/contract/helpers/repo.cjs` 의 `ROOT`.
- Produces: 없음. 이후 M1b 가 capability 를 9개로 쪼갤 때 이 계약이 새 stem 들을 자동으로 검사한다.

- [ ] **Step 1: 테스트 작성**

`e2e/contract/skill-contract.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./helpers/repo.cjs');

// D1(스킬명 최대 33자)이 이 개명의 출발점이었다. 길이와 접두사는 사람이 지키는 규칙이
// 아니라 계약이어야 한다. 여기에 프론트매터 일치와 접두사 0 까지 함께 못 박는다.

// installed-surface-resolver.cts:168 SAFE_STEM.
const SAFE_STEM = /^[a-z0-9][a-z0-9-]*$/;
const MAX_STEM = 18;

function capabilityIds() {
  return fs.readdirSync(path.join(ROOT, 'capabilities'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
function stemsOnDisk(id) {
  const dir = path.join(ROOT, 'capabilities', id, 'skills');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort();
}
function frontmatterName(id, stem) {
  const src = fs.readFileSync(path.join(ROOT, 'capabilities', id, 'skills', stem, 'SKILL.md'), 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, `${id}/${stem}: SKILL.md has no frontmatter block`);
  const n = m[1].match(/^name:[ \t]*(\S+)[ \t]*$/m);
  assert.ok(n, `${id}/${stem}: SKILL.md frontmatter has no name`);
  return n[1];
}

test('every capability id is crew-prefixed and stem-safe', () => {
  const bad = capabilityIds().filter((id) => !id.startsWith('crew-') || !SAFE_STEM.test(id));
  assert.deepStrictEqual(bad, [], 'capability ids off contract');
});

test('every skill stem is crew-prefixed, stem-safe and at most 18 characters', () => {
  // 18자는 확정된 상한이 아니라 D1 이 되돌아오지 못하게 하는 천장이다. 현재 최장은
  // crew-gsd-postship(17자)이고, 개명 전 최장은 33자였다 (구 이름은 docs/RENAME-MAP.md).
  const bad = [];
  for (const id of capabilityIds()) {
    for (const stem of stemsOnDisk(id)) {
      if (!stem.startsWith('crew-')) bad.push(`${id}/${stem}: not crew-prefixed`);
      else if (!SAFE_STEM.test(stem)) bad.push(`${id}/${stem}: fails SAFE_STEM`);
      else if (stem.length > MAX_STEM) bad.push(`${id}/${stem}: ${stem.length} > ${MAX_STEM}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'skill stems off contract');
});

test('the installer surfaces skills verbatim — SKILL_PREFIX is empty', () => {
  // 접두사가 되살아나면 설치된 디렉터리는 다시 `gsd-crew-...` 가 되고, 그때
  // Claude Code 는 프론트매터 name 과 어긋난 디렉터리를 인식하지 못한다.
  const src = fs.readFileSync(path.join(ROOT, 'bin', 'crew.cjs'), 'utf8');
  const m = src.match(/^const SKILL_PREFIX = '([^']*)';$/m);
  assert.ok(m, 'SKILL_PREFIX declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], '', 'SKILL_PREFIX must stay empty now that stems are self-describing');
});

test('each SKILL.md frontmatter name equals its directory stem', () => {
  // SKILL_PREFIX 가 빈 문자열이므로 설치된 디렉터리명 == stem 이다. 프론트매터 name 이
  // 어긋나면 Claude Code 가 스킬을 못 읽는다 (상위 문서 §4 제약 2).
  const bad = [];
  for (const id of capabilityIds()) {
    for (const stem of stemsOnDisk(id)) {
      const name = frontmatterName(id, stem);
      if (name !== stem) bad.push(`${id}/${stem}: frontmatter name=${name}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'frontmatter names diverged from stems');
});

test('every capability manifest lists exactly the stems present on disk', () => {
  const bad = [];
  for (const id of capabilityIds()) {
    const declared = [...(JSON.parse(
      fs.readFileSync(path.join(ROOT, 'capabilities', id, 'capability.json'), 'utf8')).skills || [])].sort();
    const actual = stemsOnDisk(id);
    if (JSON.stringify(declared) !== JSON.stringify(actual)) {
      bad.push(`${id}: declared=${JSON.stringify(declared)} disk=${JSON.stringify(actual)}`);
    }
  }
  assert.deepStrictEqual(bad, [], 'manifest skills lists diverged from disk');
});
```

- [ ] **Step 2: 통과 확인**

```bash
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
```

기대: `pass 5` · `fail 0`.

- [ ] **Step 3: 반증 — 계약이 실제로 무는지 확인한다**

Task 1 이후에 쓰는 테스트라 "빨간불을 본 적이 없다". 세 가지를 일부러 깨뜨려 본다. **파괴는 사본에서만 한다.**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
WORK="$(mktemp -d)"; git archive HEAD | tar -x -C "$WORK"; cd "$WORK"
git init -q . && git add -A && git -c user.email=t@t -c user.name=t commit -qm base

echo "=== 반증 1: SKILL_PREFIX 되살리기 ==="
node -e "const f='bin/crew.cjs',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(\"const SKILL_PREFIX = '';\",\"const SKILL_PREFIX = 'gsd-';\"))"
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E 'SKILL_PREFIX must|^. (pass|fail)'
git checkout -- bin/crew.cjs

echo "=== 반증 2: stem 을 19자로 ==="
git mv capabilities/crew-quality/skills/crew-gsd-postship capabilities/crew-quality/skills/crew-gsd-postshipxx
node -e "const f='capabilities/crew-quality/capability.json',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('crew-gsd-postship\"','crew-gsd-postshipxx\"'))"
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E '19 > 18|^. (pass|fail)'
git checkout -- . && git clean -fdq

echo "=== 반증 3: 브랜드 문자열 되돌리기 (Task 1 펜스) ==="
printf '\n// triple-crown regression probe\n' >> e2e/doctor.cjs
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E 'doctor.cjs:|^. (pass|fail)'
cd "$REPO_ROOT"
```

기대: 반증 1 `fail 1` (`SKILL_PREFIX must stay empty…`) · 반증 2 `fail 1` (`… 19 > 18`) · 반증 3 `fail 1` 이며 실패 목록에 `e2e/doctor.cjs:<줄번호>` 가 찍힌다. **실측으로 반증 1·3 을 확인했다.**

- [ ] **Step 4: 커밋**

```bash
npm run test:l1 2>&1 | grep -E '^. (tests|pass|fail)'
git add e2e/contract/skill-contract.test.cjs
git commit -m "test: pin the skill surface contract — crew prefix, 18-char ceiling, empty SKILL_PREFIX"
git status --short; echo "(끝)"
```

기대: **L1 90/90 pass** (81 + 4 + 5). 작업 트리 빈 출력.

---

### Task 3: M1a 완료 판정 + 롤백 태그

설계 §5 의 M1a 통과 조건("기존 e2e 전부 통과. 기능 변화 0")을 손으로 재현하고 롤백 지점을 남긴다.

**Files:**
- 없음 (검증 + 태그)

**Interfaces:**
- Consumes: Task 1~2 전부.
- Produces: 로컬 태그 `v0.7.0-m1a` — M1b 가 회귀했을 때 되돌아올 지점이며 **릴리스가 아니다** (설계 §8).

- [ ] **Step 1: 전체 그린 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
npm test
npm run test:pack && rm -f crew-harness-*.tgz
python tests/run_bash_installer_smoke.py
python tests/run_local_smoke.py
python tests/run_guide_smoke.py
python tests/validate_prototype.py
node e2e/run-live.cjs --mock 2>&1 | tail -2
git status --short; echo "(끝)"
```

기대: 전부 PASS. `run-live` 는 `PASS Crew v0.6 install/render/staging/guard contract`. `git status --short` **빈 출력**.

- [ ] **Step 2: 실제 설치 왕복**

개명의 진짜 판정은 "설치된 스킬 디렉터리가 새 이름인가"다. 계약 테스트는 소스만 본다.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
PROJ="$(mktemp -d)"
cd "$REPO_ROOT"
node bin/crew.cjs install --yes --allow-prerelease --project "$PROJ"
ls "$PROJ/.claude/skills"
ls "$PROJ/.crew"
find "$PROJ/.claude/skills" -maxdepth 2 -name '.crew-skill' | wc -l
node bin/crew.cjs doctor --project "$PROJ" | tail -3
node bin/crew.cjs uninstall --yes --project "$PROJ"
ls -A "$PROJ/.claude/skills" 2>/dev/null; echo "(제거 후 스킬 목록 끝)"
```

기대:
- 스킬 6개 — `crew-gsd` `crew-gsd-postship` `crew-gsd-qa` `crew-gsd-release` `crew-gsd-review` `crew-gsd-sec`
- 벤더 디렉터리 `.crew` 안에 `VERSION`·`INSTALL-MANIFEST.json`·`capabilities`·`docs` 등
- `.crew-skill` 마커 **6개**
- `READY=true PASS=17 WARN=0 FAIL=0`
- 제거 후 스킬 목록 빈 출력

> `--allow-prerelease` 가 필요한 이유: `VERSION` 이 `0.7.0-dev` 라 M-1 의 설치 시점 프리릴리스 펜스(설계 §4.5 계층 2)가 먼저 막는다. M1a 는 그 펜스를 건드리지 않는다.

- [ ] **Step 3: 기능 변화 0 확인**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
# 개명 커밋의 순변화량. 치환은 길이만 바꾸므로 삽입과 삭제가 거의 같아야 한다.
git show --stat "$(git log --format=%H --grep='rename the brand surface' -1)" | tail -1
# 개명 스크립트가 만들지 않은 변경이 섞였는지 본다: 규칙표에 없는 토큰이 등장했는가.
git diff v0.7.0-m0 --unified=0 -- . ':!docs/RENAME-MAP.md' ':!e2e/contract/brand-names.test.cjs' \
  ':!e2e/contract/skill-contract.test.cjs' ':!capabilities/crew-quality/checks/lib/LIB-HASH.json' \
  | grep '^[+-]' | grep -v '^[+-][+-]' \
  | grep -vi 'crew\|triple\|gsd-\|SKILL_PREFIX' | head -20
echo "(규칙표 밖 변경 끝 — 비어 있어야 한다)"
```

기대: 마지막 목록이 **빈 출력**. 한 줄이라도 나오면 개명이 아닌 변경이 섞인 것이므로 그 줄을 되돌리고 별도 커밋으로 분리한다.

- [ ] **Step 4: 롤백 태그**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git tag -a v0.7.0-m1a -m "M1a: mechanical rename to crew; capabilities still 3, no decomposition"
git tag -l 'v0.7*'
git log --oneline -4
```

기대: `v0.7.0-m0` 과 `v0.7.0-m1a` 가 목록에 있고 후자가 HEAD 에 붙어 있다.

> **push 하지 않는다.** 이 태그는 M1b 회귀 시 되돌아올 지점이며 릴리스가 아니다 (설계 §8).

---

### Task 4 (승인 게이트): 원격 배포 표면

**이 태스크는 사용자 승인 없이 실행하지 않는다.** push 와 GitHub 저장소 개명은 되돌리기 어렵고 저장소 밖에 영향을 준다.

**Files:**
- Modify (승인 시): `install.sh` · `install.ps1` · `README.md` · `docs/INSTALLER.md` · `package.json` 의 `ungkey/triple-crown`
- Modify (승인 시): `e2e/contract/brand-names.test.cjs` 의 `REPO_PATH` / `REPO_PATH_FILES`

**Interfaces:**
- Consumes: Task 3 의 `v0.7.0-m1a` 태그.
- Produces: 없음. 미실행이 기본값이다.

- [ ] **Step 1: 현 상태를 사용자에게 보고한다**

```bash
git ls-remote --tags origin
git ls-remote --heads origin
git tag -l
cd /tmp && npm pack "github:ungkey/triple-crown#v0.6.5" --dry-run 2>&1 | tail -3
```

**실측(2026-08-21):** 원격에는 `v0.6.4` 태그와 `main` 브랜치만 있다. `v0.6.5` 와 `v0.7.0-m0` 는 **로컬 전용**이다. 그런데 `install.sh` 의 기본 ref 는 `v0.6.5` 이므로 원격 부트스트랩은 지금 이렇게 죽는다:

```
npm error The git reference could not be found
npm error command git --no-replace-objects checkout v0.6.5
npm error error: pathspec 'v0.6.5' did not match any file(s) known to git
```

**이것은 M1a 가 만든 결함이 아니라 이미 존재하던 결함이다.** M-1 이 `install.sh` 의 기본 ref 를 `v0.6.5` 로 올렸지만 태그가 push 되지 않았다. `install-entrypoints.test.cjs` 는 ref 가 **브랜치가 아님**과 문서와의 **일관성**만 보고, 그 ref 가 원격에 실재하는지는 보지 않는다 — 로컬 파일만 읽는 계약 테스트로는 원리상 잡을 수 없다.

- [ ] **Step 2: 두 결정을 받는다**

| 결정 | 선택지 | 권장 |
|---|---|---|
| A. `v0.6.5` 태그 push | (1) 지금 push 해 부트스트랩을 살린다 (2) M7 릴리스까지 깨진 채 둔다 | **(1)** — 한 줄이고 되돌릴 수 있으며(`git push --delete origin v0.6.5`), 그때까지 신규 사용자가 설치할 방법이 없다 |
| B. GitHub 저장소 개명 `ungkey/triple-crown` -> `ungkey/crew` | (1) M7 릴리스와 함께 (2) 지금 | **(1)** — 아래 근거 |

**B 를 미루는 근거.** `install.sh` 의 기본 ref 는 `v0.6.5`, 즉 **개명 전** 태그다. 지금 저장소를 개명하면 부트스트랩이 GitHub 의 리다이렉트에 의존하게 되는데, 그 의존을 새로 만들 이유가 지금은 없다 — `main` 은 `0.7.0-dev` 로 잠겨 있어 아무도 최신 코드를 설치하지 않는다. 개명의 자연스러운 시점은 `install.sh` 의 ref 가 처음으로 **개명 후** 태그를 가리키는 순간, 즉 M7 릴리스 커밋이다. 그때 `ungkey/crew` 전환·태그 push·`VERSION` 승격이 한 커밋에서 일관되게 일어난다.

- [ ] **Step 3 (A 승인 시): 태그 push**

```bash
git push origin v0.6.5
git ls-remote --tags origin | grep v0.6.5
cd /tmp && npm pack "github:ungkey/triple-crown#v0.6.5" --dry-run 2>&1 | tail -2
```

기대: 태그가 원격에 보이고 `npm pack --dry-run` 이 tarball 이름을 출력하며 exit 0.

> `v0.7.0-m0` · `v0.7.0-m1a` 는 push 하지 않는다. 롤백 지점이지 릴리스가 아니다.

- [ ] **Step 4 (B 승인 시에만): 저장소 경로 전환**

승인된 경우에만 수행한다. GitHub 웹에서 저장소를 개명한 뒤:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
git remote set-url origin https://github.com/ungkey/crew.git
grep -rl 'ungkey/triple-crown' install.sh install.ps1 README.md docs/INSTALLER.md package.json \
  | xargs sed -i 's#ungkey/triple-crown#ungkey/crew#g'
```

그리고 `e2e/contract/brand-names.test.cjs` 에서 보호 장치를 **제거**한다: `REPO_PATH` 상수와 그것을 쓰는 네 번째 테스트, `REPO_PATH_FILES`, 첫 번째 테스트의 `stripped` 마스킹까지. 그러면 첫 번째 테스트가 저장소 경로까지 자동으로 지킨다.

```bash
npm run test:l1 2>&1 | grep -E '^. (tests|pass|fail)'
git add -A && git commit -m "chore: point the bootstrap surface at the renamed repository"
```

기대: L1 **89/89** (`brand-names` 가 4건에서 3건으로 준다).

---

### Task 5 (승인 게이트): Windows L1 잡

M0 자기 검토가 "Windows L1 커버리지 0 · 소유자 M1a" 로 이월한 항목이다. **이 태스크는 push 없이는 검증할 수 없다** — GitHub Actions 는 push 전에는 아무것도 실행하지 않는다.

**Files:**
- Modify: `.github/workflows/l1.yml`
- Modify: `e2e/contract/legacy-backup.test.cjs` (플랫폼 skip 7건)

**Interfaces:**
- Consumes: Task 3 의 그린 상태.
- Produces: 없음.

- [ ] **Step 1: 범위를 사용자에게 보고하고 승인을 받는다**

**실측:** L1 의 `test()` 블록은 81개(M1a 후 90개)이고, 그중 POSIX 전용 호출(`chmodSync`·`symlinkSync`·8진수 모드)을 쓰는 것은 **7개, 전부 `legacy-backup.test.cjs` 안**이다. 나머지 파일은 0개다.

| 사실 | 값 |
|---|---|
| Windows 에서 조건부 skip 이 필요한 테스트 | 7건 |
| 그 7건이 있는 파일 | `e2e/contract/legacy-backup.test.cjs` 하나 |
| 로컬 검증 가능 여부 | **불가**. 이 머신은 WSL2 Linux 다 |
| 첫 실행이 초록일 확률 | 낮다. 경로 구분자·임시 HOME·`npm pack` 동작이 미검증이다 |

**보고할 판단.** M0 자기 검토는 Windows 잡을 M1a 에 배정하면서 근거를 "M1a 가 경로 가정을 정리할 때"라고 적었다. 그런데 실측상 **M1a 는 경로 로직을 한 줄도 건드리지 않았다** — 순수 문자열 치환이라 테스트 무수정으로 81/81 이 통과했다. 그 전제가 성립하지 않으므로, Windows 커버리지를 M1a 에 밀어 넣으면 "이름 변경은 순수 리팩터링으로 격리한다"(설계 §7.5)는 원칙을 깨고 서로 다른 두 종류의 위험을 한 마일스톤에 섞게 된다.

**권장: M1b 로 이월.** M1b 는 capability 를 9개로 쪼개면서 실제로 경로를 다루므로 Windows 가정이 그때 자연스럽게 문제가 된다. 사용자가 지금 하기를 원하면 Step 2~3 으로 간다.

- [ ] **Step 2 (승인 시): 플랫폼 skip 을 넣는다**

`e2e/contract/legacy-backup.test.cjs` 의 7건에 이미 있는 `ROOT_SKIP` 관용구와 같은 형태로 조건을 단다. 이 파일은 `docs/RENAME-MAP.md` 의 동결 목록에 있지만, **동결은 브랜드 문자열에 대한 것이고 플랫폼 skip 은 무관하다.**

```js
// 파일 상단, 기존 ROOT_SKIP 옆에.
const POSIX_ONLY = process.platform === 'win32';
const WIN_SKIP = 'POSIX file modes and symlinks — Windows has no equivalent semantics';
```

해당 7건의 `test('…', () => {` 를 `test('…', { skip: POSIX_ONLY && WIN_SKIP }, () => {` 로 바꾼다. 대상은 `chmodSync`·`symlinkSync`·8진수 모드를 쓰는 블록이며, 다음으로 전수 확인한다:

```bash
node -e "
const fs=require('fs');
const s=fs.readFileSync('e2e/contract/legacy-backup.test.cjs','utf8');
s.split(/\ntest\(/).slice(1).forEach((b,i)=>{
  if(/chmodSync|symlinkSync|0o[0-7]{3}/.test(b))
    console.log(i, b.slice(0, b.indexOf('\n')).slice(0,80), /skip:/.test(b.slice(0,200))?'[skip 있음]':'[skip 없음]');
});"
```

기대: 7행 전부 `[skip 있음]`.

- [ ] **Step 3 (승인 시): 워크플로 잡 추가**

`.github/workflows/l1.yml` 의 `jobs:` 아래에 추가한다:

```yaml
  contract-windows:
    name: contract (windows)
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
      - name: shared lib copies are in sync
        run: node scripts/build-capabilities.cjs --check
      - name: L1 contract
        run: npm run test:l1
```

`continue-on-error` 를 **넣지 않는다.** 상시 빨간불 하나가 CI 전체의 신호 가치를 깎는다 (M0 리뷰 D15 에서 확정된 판단).

- [ ] **Step 4 (승인 시): push 하고 초록이 될 때까지 고친다**

```bash
git checkout -b ci/windows-l1
git add .github/workflows/l1.yml e2e/contract/legacy-backup.test.cjs
git commit -m "ci: add a blocking Windows L1 job and skip the POSIX-only backup tests there"
git push -u origin ci/windows-l1
```

`main` 에 직접 커밋하지 않는다 — 첫 실행이 빨간불일 가능성이 높고, `main` 이 빨간 상태로 남으면 M1b 착수 판정이 불가능해진다. 브랜치에서 초록을 본 뒤에 합친다.

---

## 자기 검토 기록

계획을 다 쓴 뒤 설계서·상위 문서·실측과 다시 대조하며 고친 것들. 실행자가 같은 함정을 다시 밟지 않도록 남긴다.

- **`SKILL.md` frontmatter 가정이 틀렸다.** 상위 문서 §4 제약 2 는 "스킬 디렉터리명 == SKILL.md `name`" 이라고 못 박지만, 소스 트리에서는 성립하지 않는다 — 디렉터리는 `triple-crown` 인데 `name` 은 `gsd-triple-crown` 이다. 제약이 말하는 "디렉터리"는 **설치된** `~/.claude/skills/<prefix><stem>/` 이다. 초안이 이 둘을 혼동해 `name: triple-crown` 앵커를 넣었고 실행에서 `guide SKILL.md name anchor not found` 로 죽었다. 앵커를 지우고, 대신 `SKILL_PREFIX` 가 빈 문자열이 된 **뒤에** 셋이 처음으로 일치한다는 사실을 Task 2 의 계약으로 고정했다.
- **`git mv` 를 얕은 경로부터 하면 자식 경로가 무효화된다.** `capabilities/triple-gstack` 을 먼저 옮기면 그 아래 `skills/triple-gstack-cso` 의 원본 경로가 사라진다. 깊이 내림차순 정렬 한 줄이 이걸 막는다. 그리고 `git mv` 는 비게 된 부모를 지우지 않으므로 `find capabilities -type d -empty -delete` 가 뒤따라야 빈 껍데기가 남지 않는다.
- **보호 토큰 마스킹이 필요했다.** `ungkey/triple-crown` 은 `triple-crown -> crew` 규칙에 그대로 걸린다. 규칙 순서로는 못 막는다 — 부분 문자열이기 때문이다. 치환 전 마스킹, 치환 후 복원이 유일한 방법이다.
- **동결 목록을 좁게 잡았다가 두 번 넓혔다.** 처음엔 `tests/*TEST-REPORT.md` 만 동결했는데 `tests/V0.6.3-RUNTIMECOMPAT-HOTFIX-REPORT.md` 가 그 패턴에 안 걸려 개명됐다. `tests/*.md` 전체로 넓혔다. 마찬가지로 `docs/V0.[0-6]*.md` 로 지난 릴리스 노트 전부를 묶었다. **이력 문서를 개명하면 "v0.6.3 이 무엇이었는가"라는 기록 자체가 바뀐다.**
- **`.gitignore` 에 구 패턴을 되살리는 안을 검토했다가 버렸다.** `.triple-crown/` 등을 남겨 두면 개명 전 설치 잔재가 이 저장소에 있을 때 무시된다 — 그런데 실측상 그런 디렉터리는 없고 `git status --short` 는 빈 출력이다. 존재할 수 없는 산출물을 위해 브랜드 펜스에 구멍(`.gitignore` 를 ALLOW 에 추가)을 뚫는 것은 손해다. 구 설치 잔재의 정리는 M1c `uninstall-legacy` 의 일이다.
- **펜스에 "허용 목록이 살아 있는가" 테스트를 더했다.** 허용 목록형 검사의 표준 실패 방식은 목록에 적힌 파일이 사라지거나 개명되는 것이다. 그 상태에서 검사는 계속 초록이지만 아무것도 안 지킨다. 세 번째 테스트가 각 항목이 **실재하고 여전히 구 이름을 담고 있는지**를 본다.
- **펜스가 처음 잡은 것은 개명 누락이 아니라 내가 쓴 주석이었다.** `skill-contract.test.cjs` 에 개명 전 33자 스킬명을 예시로 적었다가 `brand-names` 가 물었다. 이런 종류의 재유입이 정확히 이 펜스의 존재 이유이므로 예외를 만들지 않고 주석에서 이름을 빼 `docs/RENAME-MAP.md` 로 넘겼다.
- **`config` 네임스페이스는 루트만 바꾼다.** `triple_crown.gstack.qa_enabled` -> `crew.gstack.qa_enabled` 다. 중간 마디 `gstack` 은 외부 도구와의 다리를 뜻하므로 남는다. 상위 문서 §4.3 도 "config 루트"만 매핑한다. 다만 **기존 설치의 사용자 설정값은 고아가 된다** — GSD config 에 `triple_crown.*` 를 손으로 바꿔 둔 사용자가 있으면 그 값은 M1a 이후 읽히지 않고 기본값이 적용된다. 이 머신은 `gsd-tools` 미설치 · `legacy targets: 0` 이라 영향 0 이지만, M1c `uninstall-legacy` 가 안내 문구에서 이 사실을 알려야 한다. **소유자: M1c.**
- **개명 스크립트를 커밋하지 않기로 했다.** `package.json:files` 가 `scripts` 를 통째로 싣는다. 트리 전체를 제자리에서 재작성하는 도구가 사용자 tarball 에 들어가는 것은 그 자체로 위험이다. 계획서에 전문을 두고 규칙표는 `docs/RENAME-MAP.md` 로 남기면 추적성은 유지된다.
- **`git add -A` 를 쓴다.** M0 Task 1 은 경로를 열거했고 실제로 한 파일을 빠뜨려 적대적 리뷰에서 잡혔다. 개명은 파일 목록 자체가 바뀌므로 열거는 더 위험하다. 대신 커밋 직후 `git status --short` 가 비어 있음을 확인하는 단계를 넣었다.
- **Windows 잡의 M1a 배정 근거가 실측에서 무너졌다.** M0 자기 검토는 "M1a 가 경로 가정(구분자·임시 HOME·심볼릭 링크)을 정리할 때 함께 넣는다"고 썼는데, M1a 는 경로 로직을 한 줄도 안 건드린다 — 순수 치환이라 테스트 무수정으로 81/81 이다. 전제가 성립하지 않으므로 Task 5 를 승인 게이트로 두고 **M1b 이월을 권장**한다. 커버리지 0 이라는 사실은 이 절과 아래 범위 밖 항목에 남겨 사라지지 않게 했다.
- **원격 부트스트랩이 이미 깨져 있다는 것은 M1a 의 부수 발견이다.** `install.sh` 기본 ref `v0.6.5` 가 원격에 없다(`pathspec 'v0.6.5' did not match`). `install-entrypoints.test.cjs` 는 로컬 파일만 읽으므로 원리상 못 잡는다. M1a 가 만든 결함이 아니고 M1a 가 악화시키지도 않지만, 저장소 개명(Task 4 B)을 지금 하면 이 결함 위에 리다이렉트 의존을 얹게 되므로 두 결정을 한 태스크에 묶었다.
- **검증 방법.** `git archive HEAD` 로 임시 트리를 여섯 번 뜨고 계획서의 스크립트·테스트를 그대로 배치해 실행했다. 마지막 한 번은 이 문서의 코드 블록을 **정규식으로 다시 뽑아 그대로** 돌린 것이다 — 계획서에 적힌 것과 검증한 것이 같은 물건임을 보장한다.

  결과: 개명 전 펜스 `pass 1 · fail 3` (Step 2 기대치와 일치), 개명 `content: 75 changed, 21 frozen; paths: 33 moved`, 잔존 구 이름 **0건**(동결·보호 제외), **L1 81/81 -> 90/90**, 파이썬 스모크 7종 PASS, `npm pack` + npx tarball 스모크 PASS, `run-live --mock` PASS, 실제 설치 `READY=true PASS=17 WARN=0 FAIL=0`, 스킬 6개가 `crew-gsd*` 이름으로 설치. 반증 2건(`SKILL_PREFIX` 되살리기, 구 이름 한 줄 심기)이 각각 정확히 1건씩 실패시키는 것도 확인했다.

  **검증한 것과 계획서 사이의 유일한 차이**는 개명 스크립트의 `--check` 드라이런 플래그다. 검증본에는 있었고 계획서에서는 뺐다 — 스크립트가 `git mv` 를 실제로 돌기 전까지는 이동 목록이 확정되지 않아 드라이런이 부분적인 답만 주는데, 부분적인 답은 없느니만 못하다. 대신 실행 후 `content/paths` 숫자 대조(Step 4)와 `git checkout -- . && git clean -fd` 한 줄 되돌리기가 같은 안전망을 제공한다. `--check` 를 뺀 형태로 다시 돌려 동일 결과를 확인했다.

## 범위 밖으로 남긴 것

- **Windows L1 커버리지 0.** Task 5 가 승인 게이트로 남기며 **M1b 이월 권장.** 소유자: M1b (또는 사용자 승인 시 M1a).
- **`scripts/configure-distribution.cjs` 의 `--repo` 분기는 사문이다.** `REPLACE_WITH_OWNER/triple-crown-workflow` 라는 플레이스홀더를 `README.md`/`docs/INSTALLER.md` 에서 찾는데, 실측상 그 문자열은 저장소 어디에도 없다(자기 자신 제외). 즉 `--repo` 는 `package.json` 만 고치고 문서는 못 고친다. **M1a 는 기능 변화 0 이므로 고치지 않는다.** 소유자: M7 (배포 설정을 실제로 쓰는 시점).
- **`crew.gstack.*` 라는 어색한 중간 마디.** 루트만 개명한 결과다. capability 가 쪼개지는 M1b 에서 네임스페이스를 다시 나눌지 판단한다. 소유자: M1b.
- **기존 설치의 `triple_crown.*` config 값 고아화.** 이 머신은 영향 0. 안내는 `uninstall-legacy` 가 한다. 소유자: M1c.
- **`gsd-shadow` doctor 검사.** 설계 §5.2 가 M1d 에 배치했다. `crew-` 접두사 덕분에 GSD 의 prune 대상에서 빠지는 것은 M1a 시점에 이미 성립한다(상위 문서 §4.1). 소유자: M1d.
- **`fixtures/tiny/` 와 L2 하네스.** M0 가 M1b 로 이월했다. M1a 도 L1 만 돈다 (설계 §6). 소유자: M1b.
- **저장소 디렉터리명 `triple-crown/` 자체.** 로컬 체크아웃 경로이며 어떤 코드도 참조하지 않는다(모든 경로가 `git rev-parse --show-toplevel` 또는 `__dirname` 기준). GitHub 저장소 개명(Task 4 B)과 함께 사용자가 원하면 바꾼다.
