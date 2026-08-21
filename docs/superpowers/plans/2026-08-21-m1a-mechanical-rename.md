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
- **내부 동작 변경 0.** M1a 는 순수 리팩터링이다. 동작이 바뀌는 수정은 발견해도 하지 않고 "범위 밖" 절에 소유자와 함께 기록한다. 설계 §7.5: "이름 변경은 순수 리팩터링으로 격리해야 회귀 원인을 특정할 수 있다."
- **공개 진입점은 바뀐다.** CLI 이름 · 환경변수(`TRIPLE_*` → `CREW_*`) · config 루트(`triple_crown.*` → `crew.*`) · capability id · 소유권 마커 · 라우팅 마커가 전부 바뀐다. **이것은 breaking rename 이며 M7 릴리스 노트에 그렇게 표시된다.** 위 제약과 혼동하지 말 것 — "동작을 고치지 마라"는 실행자 규칙이지 "외부에서 볼 때 동일하다"는 주장이 아니다. 기존 설치의 설정값은 고아가 된다(범위 밖, 소유자 M1c).
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

전부 `git archive` 로 뜬 임시 트리에서 실제로 돌려 확인했다. 추정이 아니다. 아래 표는
**엔지니어링 리뷰(2026-08-21) 이후 재측정한 값**이다 — 리뷰가 `e2e/compatibility-baseline.json`
을 동결 목록에 넣었고(`74/23`), 그 사이 이 계획서 자신이 저장소에 커밋되어 추적 파일이
119개가 됐다. 초판의 `75 changed, 21 frozen`(118 파일 기준)은 더 이상 맞지 않는다.

| 항목 | 실측값 |
|---|---|
| 기준 커밋 | `c42d2b0` (M0 + 이 계획서) |
| 추적 파일 | 119개 |
| 개명 대상 내용 변경 | **74개** 파일 |
| 동결(내용 무변경) | **23개** 파일 |
| 경로 개명 | 33개 |
| L1 기준선 | 81건 (M0 종료 시점) |
| 개명 직후 L1 (테스트 무수정) | **81/81 pass** |
| 신규 계약 3벌 추가 후 L1 | **95/95 pass** (81 + 브랜드 5 + 스킬 5 + 이행 4) |
| 파이썬 스모크 7종 | 전부 PASS (`run_installer_smoke`·`run_installed_lib_smoke`·`run_v061_l0`·`run_local_smoke`·`run_guide_smoke`·`validate_prototype`·`run_bash_installer_smoke`) |
| `npm pack` + `run_npx_tarball_smoke` | PASS (`crew-harness-0.7.0-dev.tgz`, total files 47) |
| `node e2e/run-live.cjs --mock` | `PASS Crew v0.6 install/render/staging/guard contract` |
| 실제 설치 후 `doctor` | `READY=true PASS=17 WARN=0 FAIL=0` |
| 설치된 스킬 디렉터리 | `crew-gsd` `crew-gsd-postship` `crew-gsd-qa` `crew-gsd-release` `crew-gsd-review` `crew-gsd-sec` |
| 스킬명 총 길이 | 151자 → **79자** (8·15·11·12·17·16) — 상위 문서 §4.3 수치와 일치 |
| 개명 후 잔존 구 이름 | 동결 목록 + `ungkey/triple-crown` **뿐** (`LEGACY` 정규식이 아는 토큰 기준. `tc-*` 는 그 정규식에 없고 의도적으로 남는다 — 아래 표) |
| 반증 (계약이 실제로 무는가) | 6종 전부 정확히 `fail 1`. `SKILL_PREFIX` 되살리기 · stem 19자 · frontmatter 어긋남 · 스킬 추가 · 저장소 경로 1회 추가 · 마커 이중화 |
| `T3` 재현-비교 | `archive(v0.7.0-m0)+스크립트` vs `archive(개명 커밋)` diff **빈 출력** (의도한 신규 파일 제외 시) |
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
| `scripts/legacy-backup.cjs`, `e2e/contract/legacy-backup.test.cjs`, `e2e/contract/helpers/fake-home.cjs` | 레거시 탐지·백업·복구는 **개명 전 설치본**을 가리켜야 동작한다. 여기서 이름을 바꾸면 M-1 산출물이 아무것도 못 찾는다. 참고로 M-1 은 이미 `SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill']` 로 양쪽을 본다. `legacy-backup.test.cjs` 는 기능 테스트 **34건**(backup·detect·verify·restore·rollback·`$HOME` 탈출 거부)이라 이 동결이 지키는 것은 주석이 아니라 그 계약이다 |
| `e2e/compatibility-baseline.json` | **v0.6.3 표면의 스냅샷**이다. `tests/validate_prototype.py:82` 가 존재 여부만 확인하고 **파싱하는 코드가 하나도 없다**(`git grep compatibility-baseline -- '*.cjs' '*.js'` → 빈 출력). 개명하면 `"crewVersion": "0.6.3"` 처럼 존재한 적 없는 조합이 남는다 — `docs/V0.[0-6]*.md` 를 동결하는 것과 같은 이유다 |
| `tc-*` 임시 디렉터리 접두사 | `.gitignore:37` 과 파이썬 스모크 5곳의 `mkdtemp(prefix="tc-...")`. `tc` 는 구 브랜드 약자지만 **사용자 표면이 아니고** 시스템 임시 경로에만 나타난다. `LEGACY` 정규식에 넣지 않는다 — 개명하면 펜스가 지킬 표면만 는다. 전면 개명은 M1b 후보 |
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
    brand-names.test.cjs          ★신규★ 구 브랜드 회귀 펜스 (5건)
    skill-contract.test.cjs       ★신규★ stem 규약·접두사·frontmatter 일치 (5건)
    legacy-transition.test.cjs    ★신규★ 개명 전 설치본이 어떻게 남는지 기록 (4건)
    helpers/fake-home.cjs                무변경(동결). legacy-transition 이 마커 상수를 참조
    compatibility-baseline.json          동결 — v0.6.3 스냅샷
  tests/run_installer_smoke.py    <-수정  설치 스킬 집합 검사를 부분집합에서 **완전 일치**로
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
//   (2) 설계/계획/이력 기록: 매핑이나 지난 릴리스의 표면을 기록하므로 구 이름이 사료다.
const ALLOW = [
  'scripts/legacy-backup.cjs',
  'e2e/contract/legacy-backup.test.cjs',
  'e2e/contract/helpers/fake-home.cjs',
  'e2e/compatibility-baseline.json',
  'e2e/contract/brand-names.test.cjs',
  'docs/RENAME-MAP.md',
  'docs/RESTRUCTURE-PLAN.md',
  'docs/V0.7-IMPLEMENTATION-DESIGN.md',
];
const ALLOW_PREFIX = ['docs/superpowers/'];
// 이 두 정규식은 개명 스크립트의 FROZEN 항목과 **글자 그대로 같아야 한다**.
const ALLOW_RE = [/^docs\/V0\.[0-6][^/]*\.md$/, /^tests\/[^/]*\.md$/];

// 부트스트랩이 가리키는 GitHub 경로. 저장소 개명은 외부 작업이라 M1a 범위 밖이고,
// install.sh 는 아직 구 이름 아래의 마지막 안정 태그를 받는다. **이 토큰만** 예외다.
const REPO_PATH = 'ungkey/triple-crown';
// 파일별 정확한 등장 횟수. 마스킹이 줄 단위 통짜 제거라 이 토큰에 이어 붙는 것
// (`ungkey/triple-crown-guide` 같은)은 LEGACY 검사를 빠져나간다. 횟수를 못 박으면
// 새로 끼어드는 모든 등장이 잡힌다. Task 4 B(저장소 개명) 승인 시 이 표와 아래
// 두 테스트가 통째로 사라진다.
const REPO_PATH_COUNTS = {
  'install.sh': 3,
  'install.ps1': 1,
  'package.json': 1,
  'README.md': 11,
  'docs/INSTALLER.md': 6,
};

function tracked() {
  return cp.execSync('git ls-files -z', { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8').split('\0').filter(Boolean);
}
function allowed(rel) {
  return ALLOW.includes(rel)
    || ALLOW_PREFIX.some((p) => rel.startsWith(p))
    || ALLOW_RE.some((re) => re.test(rel));
}
function textOf(rel) {
  let buf;
  try { buf = fs.readFileSync(path.join(ROOT, rel)); } catch { return null; }
  if (buf.includes(0)) return null;
  return buf.toString('utf8');
}

test('no tracked file outside the allowlist still carries a pre-M1a brand token', () => {
  const bad = [];
  for (const rel of tracked()) {
    if (allowed(rel)) continue;
    const src = textOf(rel);
    if (src === null) continue;
    src.split('\n').forEach((line, i) => {
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
    if (Object.hasOwn(REPO_PATH_COUNTS, rel) || allowed(rel)) continue;
    const src = textOf(rel);
    if (src === null) continue;
    if (src.includes(REPO_PATH)) bad.push(rel);
  }
  assert.deepStrictEqual(bad, [], `${REPO_PATH} outside the bootstrap surface`);
});

test('the old GitHub path appears exactly as many times as the bootstrap needs', () => {
  const drift = [];
  for (const [rel, want] of Object.entries(REPO_PATH_COUNTS)) {
    const src = textOf(rel);
    if (src === null) { drift.push(`${rel}: unreadable`); continue; }
    const got = src.split(REPO_PATH).length - 1;
    if (got !== want) drift.push(`${rel}: ${got} occurrences, expected ${want}`);
  }
  assert.deepStrictEqual(drift, [], 'bootstrap repo-path occurrences drifted');
});
```

> **세 번째 테스트가 왜 있는가.** 허용 목록형 펜스의 표준 실패 방식은 "목록에 적힌 파일이 사라졌는데 목록은 그대로"다. 그 상태에서 펜스는 계속 초록불이지만 실제로는 아무것도 지키지 않는다. `docs/RENAME-MAP.md` 가 지워지거나 `legacy-backup.cjs` 가 개명되면 이 테스트가 먼저 죽는다.
>
> **다섯 번째 테스트가 왜 있는가.** 첫 번째 테스트는 줄에서 `ungkey/triple-crown` 을 **통짜로 지운 뒤** 검사한다. 그래서 그 토큰에 이어 붙는 것 — `ungkey/triple-crown-guide` 같은 — 은 `-guide` 만 남아 `LEGACY` 를 빠져나간다. 네 번째 테스트도 "부트스트랩 파일 밖에 있는가"만 보므로 그 다섯 파일 **안에서는** 횟수도 위치도 제한이 없다. 다섯 번째가 파일별 등장 횟수를 실측값으로 못 박아 그 틈을 닫는다. 반증으로 확인했다: `README.md` 에 한 번 더 심으면 `README.md: 12 occurrences, expected 11` 로 죽는다.

- [ ] **Step 2: 빨간불 확인**

```bash
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
```

기대: 5건 중 **`pass 2` · `fail 3`** — 내용(74파일)·경로(33개)·허용목록(`docs/RENAME-MAP.md: missing`, Step 6에서 만든다). 네 번째(GitHub 경로 격리)와 다섯 번째(등장 횟수)는 이 시점에 **통과한다**: `ungkey/triple-crown` 은 보호 토큰이라 개명이 건드리지 않으므로 위치도 횟수도 개명 전후가 같다.

`fail 0` 이면 펜스가 아무것도 안 보고 있다는 뜻이므로 멈추고 원인을 찾는다.

> 실측: `c42d2b0` 트리에서 `pass 2 · fail 3` 을 확인했다. `docs/RENAME-MAP.md` 를 미리 만들어 두면 `pass 3 · fail 2` 가 되어야 한다 — 허용목록 테스트가 그 파일 하나에 정확히 반응한다는 뜻이다.

- [ ] **Step 3: 개명 스크립트를 임시 경로에 쓴다**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RENAME_DIR="$(mktemp -d)"
echo "$RENAME_DIR"
```

스크립트를 읽기 전에 두 그림을 본다. **이 계획에서 틀릴 수 있는 것은 순서뿐이고, 실측에서 두 번 물렸다.**

한 문자열이 규칙표를 통과하는 경로:

```
  원본 텍스트
      |
      v
  [1] 보호 토큰 마스킹        ungkey/triple-crown  ->  PROTECTED0
      |                       규칙 순서로는 못 막는다. 부분 문자열이라
      |                       'triple-crown -> crew' 가 어디서든 문다.
      v
  [2] 규칙표 순차 치환        긴 것 먼저. 이 순서가 결과를 바꾼다:
      |                         gsd-triple-gstack-cso -> crew-gsd-sec   (개별)
      |                         gsd-triple-           -> crew-          (glob, 나중)
      |                       뒤집으면 crew-gstack-cso 가 나온다.
      v
  [3] 정규식 마무리           /Triple\s+Crown/g -> Crew
      |                       마크다운에서 줄바꿈으로 갈린 프로즈는
      |                       리터럴 'Triple Crown' 에 안 걸린다.
      v
  [4] 마스킹 복원             PROTECTED0  ->  ungkey/triple-crown
      |
      v
  결과 텍스트
```

스크립트 실행 순서 여섯 단계:

```
  [1] 예외 stem 이동   capabilities/triple-crown-guide/skills/triple-crown
      git mv             -> .../skills/crew-gsd
                         stem 이 단독 'triple-crown' 이라 규칙표는 'crew' 로
                         만든다. 목표는 crew-gsd 이므로 먼저 손으로 옮긴다.
       |
  [2] 매니페스트 앵커  capability.json 의 "skills": ["triple-crown"]
      throw-on-miss      -> ["crew-gsd"].  여러 줄 JSON 이라 정규식이 필요.
       |
  [3] 접두사 앵커      bin/triple-crown.cjs 의 SKILL_PREFIX 'gsd-' -> ''
      throw-on-miss      문자열 치환으로 안 되는 유일한 의미 변경.
       |                 [2][3] 은 writeFileSync 전에 던진다 — 앵커가
       |                 어긋나면 트리는 손도 안 댄 상태로 남는다.
  [4] 내용 치환        추적 파일 전체. FROZEN 은 건너뛴다.     -> 74 changed
       |
  [5] 경로 개명        rewrite(경로) 가 다른 것만. 깊이 내림차순. -> 33 moved
       |               git ls-files 는 파일만 주므로 실제로는 파일 단위
       |               이동이고 정렬은 방어적 no-op 이다 (자기 검토 참조).
  [6] 빈 부모 정리     find capabilities -type d -empty -delete
                       git mv 는 비게 된 디렉터리를 안 지운다.
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
// 아래 두 정규식은 brand-names.test.cjs 의 ALLOW_RE 와 **글자 그대로 같아야 한다**.
const FROZEN = [
  /^scripts\/legacy-backup\.cjs$/,
  /^e2e\/contract\/legacy-backup\.test\.cjs$/,
  /^e2e\/contract\/helpers\/fake-home\.cjs$/,
  /^e2e\/compatibility-baseline\.json$/,
  /^docs\/RESTRUCTURE-PLAN\.md$/,
  /^docs\/V0\.7-IMPLEMENTATION-DESIGN\.md$/,
  /^docs\/superpowers\//,
  /^docs\/V0\.[0-6][^/]*\.md$/,
  /^tests\/[^/]*\.md$/,
];

const PROTECTED = ['ungkey/triple-crown'];

const RULES = [
  ['triple-crown-workflow-installer', 'crew-harness'],
  ['gsd-triple-gstack-code-review', 'crew-gsd-review'],
  ['gsd-triple-gstack-qa-only', 'crew-gsd-qa'],
  ['gsd-triple-gstack-cso', 'crew-gsd-sec'],
  ['gsd-triple-gstack-post-ship', 'crew-gsd-postship'],
  ['gsd-triple-gstack-release-observe', 'crew-gsd-release'],
  ['gsd-triple-crown', 'crew-gsd'],
  ['gsd-triple-', 'crew-'],
  ['triple-gstack-code-review', 'crew-gsd-review'],
  ['triple-gstack-qa-only', 'crew-gsd-qa'],
  ['triple-gstack-cso', 'crew-gsd-sec'],
  ['triple-gstack-post-ship', 'crew-gsd-postship'],
  ['triple-gstack-release-observe', 'crew-gsd-release'],
  ['triple-gstack', 'crew-quality'],
  ['triple-superpowers', 'crew-discipline'],
  ['triple-crown-guide', 'crew-guide'],
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
  out = out.replace(/Triple\s+Crown/g, 'Crew');
  for (const [mark, tok] of masks) out = out.split(mark).join(tok);
  return out;
}

if (fs.existsSync(path.join(ROOT, STEM_FROM))) {
  cp.execSync(`git mv ${JSON.stringify(STEM_FROM)} ${JSON.stringify(STEM_TO)}`, { cwd: ROOT });
}
{
  const man = path.join(ROOT, 'capabilities/triple-crown-guide/capability.json');
  const b = fs.readFileSync(man, 'utf8');
  const a = b.replace(/"skills":\s*\[\s*"triple-crown"\s*\]/, '"skills": ["crew-gsd"]');
  if (a === b && !b.includes('"crew-gsd"')) throw new Error('guide manifest skills anchor not found');
  fs.writeFileSync(man, a);
}
{
  const bin = path.join(ROOT, 'bin/triple-crown.cjs');
  const b = fs.readFileSync(bin, 'utf8');
  const a = b.replace("const SKILL_PREFIX = 'gsd-';", "const SKILL_PREFIX = '';");
  if (a === b) throw new Error('SKILL_PREFIX anchor not found');
  fs.writeFileSync(bin, a);
}

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

기대: **`content: 74 changed, 23 frozen; paths: 33 moved`** (기준 커밋 `c42d2b0`, 추적 파일 119개).

숫자가 다르면 멈춘다. **다만 멈추기 전에 `docs/superpowers/` 파일 수부터 본다** — 그 디렉터리는 통째로 동결이므로 계획서를 하나 더 커밋할 때마다 `frozen` 이 1 늘고 합계가 움직인다. 초판이 `75 changed, 21 frozen`(118 파일)이었던 것도 그 사이 이 계획서 자신이 커밋됐기 때문이다. 진짜 이상 신호는 `paths` 가 33 이 아니거나 `changed + frozen` 이 추적 파일 수를 넘는 경우다.

되돌리기:

```bash
git checkout -- . && git clean -fd \
  -e e2e/contract/brand-names.test.cjs \
  -e docs/RENAME-MAP.md
```

**`-e` 를 빼면 안 된다.** `git clean -fd` 는 정의상 미추적 파일을 지우는데, Step 1 에서 만든 펜스 테스트는 이 시점에 아직 커밋 전이라 미추적이다. 그대로 돌리면 개명을 되돌리면서 **방금 쓴 펜스까지 잃고** Step 1 부터 다시 써야 한다. "작업 트리가 착수 전에 깨끗했다"는 전제는 착수 **전** 상태를 말하는 것이고 Step 1 이 이미 그 전제를 깼다.

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

**이 표의 왼쪽 열은 전부 공개 진입점이다.** 내부 동작은 그대로지만 CLI 이름·환경변수·
config 루트·capability id·마커가 바뀌므로 이것은 breaking rename 이며, M7 릴리스
노트에 그렇게 표시된다.

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
- **`tc-*` 임시 디렉터리 접두사** — `tests/run_installer_smoke.py` 등 파이썬 스모크
  다섯 곳의 `mkdtemp(prefix="tc-...")` 와 `.gitignore` 의 `tc-installer-*/`. `tc` 는
  구 브랜드의 약자지만 **사용자 표면이 아니고** 시스템 임시 경로에만 나타난다.
  개명하면 펜스가 지켜야 할 표면만 늘어나므로 의도적으로 남긴다. 따라서
  `brand-names.test.cjs` 의 `LEGACY` 정규식에 `tc-` 는 **없다** — "잔존 구 이름 0건"은
  그 정규식이 아는 토큰에 한해서 참이다. 전면 개명은 M1b 후보.

## 동결: 구 이름이 남아 있어야 하는 곳

| 파일 | 이유 |
|---|---|
| `scripts/legacy-backup.cjs` | 개명 **전** 설치본을 탐지·백업·복구한다. 이름을 바꾸면 아무것도 못 찾는다 |
| `e2e/contract/legacy-backup.test.cjs` | 위의 계약 테스트 34건 |
| `e2e/contract/helpers/fake-home.cjs` | 레거시 설치본을 심는 픽스처 |
| `e2e/contract/legacy-transition.test.cjs` | 개명 후 구 설치본이 어떻게 남는지 기록하는 characterization 테스트 |
| `e2e/compatibility-baseline.json` | **v0.6.3 표면의 스냅샷**이다. 파싱하는 코드가 없고(`tests/validate_prototype.py` 가 존재 여부만 확인) `"tripleCrownVersion": "0.6.3"` 을 담는다. 개명하면 그 이름이 존재하지 않던 버전의 기록이 바뀐다 |
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

**M1a~M1c 사이의 증상.** 개명 전 설치본이 남은 머신에서 새 버전을 설치하면 위 여섯
가지가 그대로 남고 새 표면이 그 옆에 추가된다 — 스킬이 구·신 각 6개씩 **12개 동시
노출**된다. `bin/crew.cjs` 의 `CAPABILITIES` 에 구 id 가 없어 `capability remove` 가
구 원장을 건드리지 않고, `SKILL_MARKER` 가 `.crew-skill` 이라 uninstall 스캔이 구
마커 디렉터리를 건너뛰기 때문이다. `e2e/contract/legacy-transition.test.cjs` 가 이
상태를 명시적으로 단언하며, **M1c 는 그 단언을 뒤집는 것으로 완료를 증명한다.**

현재 노출은 0 이다: `legacy-backup.cjs detect` -> `legacy targets: 0`, npm 레지스트리
404, 원격 부트스트랩 파손, 설치 시점 프리릴리스 펜스.

기존 설치가 GSD config 에 `triple_crown.*` 값을 갖고 있으면 M1a 이후 그 값은 읽히지
않고 `crew.*` 기본값이 적용된다. `uninstall-legacy` 는 이 사실을 사용자에게 고지한다.
````

- [ ] **Step 7: 펜스가 초록불이 되는지 확인**

```bash
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E '^(.|.) (tests|pass|fail)'
```

기대: `pass 5` · `fail 0`.

> **실측 경고.** 이 계획을 검증하는 동안 펜스가 잡은 첫 위반은 개명 누락이 아니라 **새로 쓴 테스트 주석에 적어 넣은 구 이름**이었다 (`skill-contract.test.cjs:42` 의 33자 스킬명 인용). 신규 파일에 설명 목적으로라도 구 이름을 적으면 펜스가 문다 — 길이만 쓰고 이름은 `docs/RENAME-MAP.md` 로 넘긴다.

- [ ] **Step 8: 전체 L1 + 스모크**

```bash
npm run test:l1 2>&1 | grep -E '^. (tests|pass|fail)'
for t in run_installer_smoke run_installed_lib_smoke run_v061_l0 run_local_smoke \
         run_guide_smoke validate_prototype run_bash_installer_smoke; do
  printf '%-28s ' "$t"; python "tests/$t.py" >/dev/null 2>&1 && echo PASS || echo FAIL
done
```

기대: **L1 86/86 pass** (기준선 81 + 펜스 5). 파이썬 7종 전부 PASS.

> `validate_prototype` 이 `crew-guide must expose one unified situational skill` 로 죽으면 규칙표의 `["triple-crown"] -> ["crew-gsd"]` 항목이 빠진 것이다 — 실측에서 실제로 났던 실패다.

- [ ] **Step 9: 커밋**

```bash
# 스테이징 **전에** 무엇이 딸려 들어가는지 본다.
git status --porcelain | grep '^??'; echo "(미추적 파일 끝)"
```

기대: 정확히 두 줄 — `?? docs/RENAME-MAP.md` 와 `?? e2e/contract/brand-names.test.cjs`. 그 외에 무엇이 있으면 Step 5·8 이 저장소 안에 산출물을 떨군 것이므로 지우고 다시 본다.

```bash
git add -A
git commit -m "refactor: rename the brand surface to crew and drop the gsd- skill prefix"
git status --short; echo "(끝 — 비어 있어야 한다)"
git diff --stat HEAD~1 | tail -1
```

기대: `git status --short` 빈 출력.

> `git add -A` 를 쓴다. 개명은 파일 목록을 통째로 바꾸므로 M0 Task 1 Step 8 처럼 경로를 열거하는 방식은 여기서 오히려 위험하다 — 하나만 빠져도 트리가 반쪽으로 커밋되고, 그 사실은 신선한 체크아웃에서만 드러난다.
>
> **다만 검사는 스테이징 뒤가 아니라 앞에서 한다.** 커밋 직후의 `git status --short` 는 무엇이 삼켜졌든 정의상 빈 출력이라 아무것도 알려주지 않는다. 직전 Step 8 이 L1 과 파이썬 스모크 7종을 돌리므로 그 사이에 저장소로 떨어진 것이 있으면 조용히 커밋된다. 그러면 Task 3 Step 3 의 재현-비교 증명이 곧바로 깨진다 — 두 검사가 서로를 받친다.

---

### Task 2: 스킬 표면 계약 + 레거시 이행 기록

D1(스킬 이름 최대 33자)은 이 재구성 전체의 출발점이었다. 길이·접두사·frontmatter 일치를 사람이 지키는 규칙에서 테스트가 지키는 계약으로 바꾼다.

여기에 **개명이 실제로 위험한 지점** 하나를 함께 못 박는다. M1a 의 진짜 위험은 새 설치가 아니라 **개명 전 설치본이 남은 머신의 상태 전이**다 — 설치자가 아는 이름 목록이 통째로 바뀌므로 구 capability 원장·구 마커 스킬·구 훅·구 벤더 트리가 전부 고아가 된다. 제거는 M1c 의 일이지만(동작 변경 = M1a 제약 위반), **그 상태를 실행 가능한 문장으로 고정하는 것**은 지금 할 수 있고 M1c 는 그 문장을 뒤집는 것으로 완료를 증명하게 된다.

**Files:**
- Create: `e2e/contract/skill-contract.test.cjs`
- Create: `e2e/contract/legacy-transition.test.cjs`
- Modify: `e2e/contract/brand-names.test.cjs` 의 `ALLOW` (신규 테스트가 구 이름을 담는다)
- Modify: `tests/run_installer_smoke.py` 의 설치 스킬 집합 검사

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

- [ ] **Step 3: 레거시 이행 테스트를 쓴다**

`e2e/contract/legacy-transition.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { ROOT, tempDir } = require('./helpers/repo.cjs');

// 개명 전 설치본이 남은 머신에서 무슨 일이 일어나는가.
//
// 이 파일은 **characterization 테스트**다 — 고쳐야 할 동작이 아니라 지금 동작을
// 기록한다. M1a 는 순수 리팩터링이라 제거 로직을 넣지 않는다(설계 §7.5). 그래서
// 개명 전 설치본은 그대로 남고, 새 설치본이 그 옆에 추가된다.
//
//   설치자 상수          구 설치본이 남긴 것            결과
//   ------------------   ---------------------------   ------------------------
//   CAPABILITIES         triple-gstack 등 구 id         capability remove 대상 밖
//   SKILL_MARKER         .triple-crown-skill            uninstall 스캔이 건너뜀
//   ship guard 파일명    triple-crown-ship-guard.cjs    removeShipGuard 대상 밖
//
// **M1c `crew uninstall-legacy` 가 이 단언들을 뒤집는다.** 그때 아래 테스트는
// "구 표면도 제거된다"로 바뀌어야 하며, 그 수정이 M1c 가 실제로 동작한다는 증거다.
// 현재 노출은 0 이다: 이 머신 `legacy targets: 0`, npm 레지스트리 404, 원격
// 부트스트랩 파손, 설치 시점 프리릴리스 펜스. 목록은 docs/RENAME-MAP.md 참조.

const CLI = path.join(ROOT, 'bin', 'crew.cjs');
const OLD_MARKER = '.triple-crown-skill';
const NEW_MARKER = '.crew-skill';

function mkSkill(root, name, marker) {
  const dir = path.join(root, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\n---\n`);
  fs.writeFileSync(path.join(dir, marker), '');
  return dir;
}

test('uninstall removes crew-marked skills and leaves pre-M1a marked ones behind', () => {
  const proj = tempDir('crew-legacy-transition-');
  mkSkill(proj, 'gsd-triple-gstack-code-review', OLD_MARKER);
  mkSkill(proj, 'crew-gsd-review', NEW_MARKER);
  mkSkill(proj, 'unmanaged-skill', '.some-other-marker');

  const r = cp.spawnSync(process.execPath, [CLI, 'uninstall', '--yes', '--project', proj], {
    encoding: 'utf8', timeout: 60000,
  });
  assert.strictEqual(r.status, 0, `uninstall failed: ${r.stderr || r.stdout}`);

  const left = fs.readdirSync(path.join(proj, '.claude', 'skills')).sort();
  // M1c 가 이 목록에서 gsd-triple-gstack-code-review 를 빼야 한다.
  assert.deepStrictEqual(left, ['gsd-triple-gstack-code-review', 'unmanaged-skill'],
    'pre-M1a marked skills are still orphaned by uninstall (M1c owns their removal)');
});

test('the installer capability list carries no pre-M1a id, so old ledger rows are never removed', () => {
  // installCapabilities() 는 CAPABILITIES 를 돌며 capability remove 를 부른다.
  // 목록에 구 id 가 없으면 구 원장 항목은 손대지 않는다.
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const CAPABILITIES = (\[[^\]]*\]);$/m);
  assert.ok(m, 'CAPABILITIES declaration not found in bin/crew.cjs');
  const ids = JSON.parse(m[1].replace(/'/g, '"'));
  assert.deepStrictEqual(ids.filter((id) => /^triple-/.test(id)), [],
    'pre-M1a capability ids must not reappear here — M1c removes them, M1a does not');
  assert.ok(ids.every((id) => id.startsWith('crew-')), `unexpected capability ids: ${ids}`);
});

test('the ship guard the installer removes is the renamed one only', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  assert.ok(src.includes('crew-ship-guard.cjs'), 'renamed ship guard filename not found');
  assert.ok(!src.includes('triple-crown-ship-guard.cjs'),
    'pre-M1a ship guard filename must not linger in the installer — M1c removes that hook');
});

test('the skill ownership marker is the renamed one only', () => {
  const src = fs.readFileSync(CLI, 'utf8');
  const m = src.match(/^const SKILL_MARKER = '([^']*)';$/m);
  assert.ok(m, 'SKILL_MARKER declaration not found in bin/crew.cjs');
  assert.strictEqual(m[1], NEW_MARKER);
  // 양쪽 마커를 보게 만드는 것은 동작 변경이므로 M1a 범위 밖이다.
  // scripts/legacy-backup.cjs 가 그 관용구(SKILL_MARKERS 배열)를 이미 갖고 있다.
  assert.ok(!src.includes(OLD_MARKER),
    'M1a keeps the installer single-marker; dual-marker handling belongs to M1c');
});
```

이 파일은 구 이름을 담으므로 **같은 커밋에서** 펜스 허용 목록에 넣어야 한다. `e2e/contract/brand-names.test.cjs` 의 `ALLOW` 에서 `'e2e/contract/helpers/fake-home.cjs',` 바로 아래에 한 줄 추가한다:

```js
  'e2e/contract/legacy-transition.test.cjs',
```

> **Task 1 이 아니라 Task 2 에서 추가하는 이유.** `ALLOW` 의 세 번째 테스트는 목록의 모든 항목이 **실재하고** 여전히 구 이름을 담는지 본다. Task 1 시점에 이 파일은 없으므로 그때 목록에 넣으면 펜스가 `legacy-transition.test.cjs: missing` 으로 죽는다. 파일과 목록 항목이 늘 같은 커밋에 있어야 한다는 것이 그 테스트의 요점이고, 여기서 그 요점이 실제로 작동한다.

```bash
node --test 'e2e/contract/legacy-transition.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E '^. (tests|pass|fail)'
```

기대: 이행 테스트 `pass 4` · `fail 0`, 펜스 `pass 5` · `fail 0`.

- [ ] **Step 4: 설치 스모크의 스킬 집합 검사를 완전 일치로 조인다**

`tests/run_installer_smoke.py` 는 이미 설치된 스킬 디렉터리 6개·frontmatter 일치·`.crew-skill` 마커를 단언한다(개명이 기대값을 자동으로 바꿔 놓는다). 문제는 **부분집합** 검사라는 것이다:

```python
        present={d.name for d in skills.iterdir() if d.is_dir()}
        assert expected<=present,f"missing skills: {sorted(expected-present)}"
```

`<=` 로는 **디렉터리가 늘어나는 경우를 못 잡는다.** 완전 일치로 바꾼다:

```python
        present={d.name for d in skills.iterdir() if d.is_dir()}
        # 부분집합이 아니라 **완전 일치**다. SKILL_PREFIX 가 되살아나거나 stem 이
        # 하나 늘면 설치된 집합이 커지는데 부분집합 검사는 그걸 통과시킨다 — 그러면
        # Claude Code 가 frontmatter 와 어긋난 디렉터리를 못 읽어 스킬이 사라진다.
        assert expected==present,f"missing: {sorted(expected-present)} unexpected: {sorted(present-expected)}"
```

```bash
python tests/run_installer_smoke.py
```

기대: `PASS installer-install-idempotent-status-uninstall`.

> 이 한 글자가 M1a 의 **유일한 동작 변경**(`SKILL_PREFIX`)의 결과물을 계약으로 만든다. `skill-contract.test.cjs` 는 소스의 상수 선언만 읽는다 — 설치 후 디스크에 실제로 어떤 이름이 생기는지는 이 스모크만 본다.

- [ ] **Step 5: 반증 — 계약이 실제로 무는지 확인한다**

Task 1 이후에 쓰는 테스트라 "빨간불을 본 적이 없다". 여섯 가지를 일부러 깨뜨려 본다. **파괴는 사본에서만 한다** — 반증마다 별도 사본을 떠서 서로 오염되지 않게 한다.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
BASE="$(mktemp -d)"; git archive HEAD | tar -x -C "$BASE"
( cd "$BASE" && git init -q . && git add -A \
    && git -c user.email=t@t -c user.name=t commit -qm base )
CF="$(mktemp -d)"
for k in 1 2a 2b 4 5 9; do cp -r "$BASE" "$CF/cf$k"; done
Q=capabilities/crew-quality

echo "=== 반증 1: SKILL_PREFIX 되살리기 ==="
cd "$CF/cf1"
node -e "const f='bin/crew.cjs',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(\"const SKILL_PREFIX = '';\",\"const SKILL_PREFIX = 'gsd-';\"))"
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E 'SKILL_PREFIX must|^. (pass|fail)'

echo "=== 반증 2a: stem 19자, frontmatter·매니페스트 함께 갱신 ==="
cd "$CF/cf2a"
git mv "$Q/skills/crew-gsd-postship" "$Q/skills/crew-gsd-postshipxx"
node -e "for(const f of ['$Q/capability.json','$Q/skills/crew-gsd-postshipxx/SKILL.md']){const fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').split('crew-gsd-postship').join('crew-gsd-postshipxx'))}"
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E '19 > 18|^. (pass|fail)'

echo "=== 반증 2b: frontmatter 만 어긋나게 ==="
cd "$CF/cf2b"
node -e "const f='$Q/skills/crew-gsd-postship/SKILL.md',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace('name: crew-gsd-postship','name: crew-gsd-elsewhere'))"
node --test 'e2e/contract/skill-contract.test.cjs' 2>&1 | grep -E 'frontmatter name=|^. (pass|fail)'

echo "=== 반증 4: 스킬을 하나 더 추가 (설치 스모크) ==="
cd "$CF/cf4"
mkdir -p capabilities/crew-guide/skills/crew-extra
printf -- '---\nname: crew-extra\n---\nbody\n' > capabilities/crew-guide/skills/crew-extra/SKILL.md
node -e "const f='capabilities/crew-guide/capability.json',fs=require('fs');const j=JSON.parse(fs.readFileSync(f,'utf8'));j.skills=[...j.skills,'crew-extra'];fs.writeFileSync(f,JSON.stringify(j,null,2)+'\n')"
python tests/run_installer_smoke.py 2>&1 | grep -E 'AssertionError|^PASS' | head -2

echo "=== 반증 5: 설치자를 양쪽 마커 인식으로 (M1c 를 앞당긴 셈) ==="
cd "$CF/cf5"
node -e "const f='bin/crew.cjs',fs=require('fs');fs.writeFileSync(f,fs.readFileSync(f,'utf8').replace(\"const SKILL_MARKER = '.crew-skill';\",\"const SKILL_MARKER = '.crew-skill'; // legacy: '.triple-crown-skill'\"))"
node --test 'e2e/contract/legacy-transition.test.cjs' 2>&1 | grep -E 'single-marker|^. (pass|fail)'

echo "=== 반증 9: 저장소 경로를 한 번 더 심는다 ==="
cd "$CF/cf9"
printf '\n<!-- github.com/ungkey/triple-crown -->\n' >> README.md
node --test 'e2e/contract/brand-names.test.cjs' 2>&1 | grep -E 'occurrences, expected|^. (pass|fail)'
cd "$REPO_ROOT"
```

기대 — **여섯 건 전부 실측으로 확인했다.**

| 반증 | 결과 | 실패 메시지 |
|---|---|---|
| 1 SKILL_PREFIX 되살리기 | `pass 4 · fail 1` | `SKILL_PREFIX must stay empty now that stems are self-describing` |
| 2a stem 19자 | `pass 4 · fail 1` | `crew-quality/crew-gsd-postshipxx: 19 > 18` |
| 2b frontmatter 어긋남 | `pass 4 · fail 1` | `crew-quality/crew-gsd-postship: frontmatter name=crew-gsd-elsewhere` |
| 4 스킬 추가 | `AssertionError` | `missing: [] unexpected: ['crew-extra']` |
| 5 마커 이중화 | `pass 3 · fail 1` | `M1a keeps the installer single-marker; dual-marker handling belongs to M1c` |
| 9 저장소 경로 1회 추가 | `pass 4 · fail 1` | `README.md: 12 occurrences, expected 11` |

> **2a 와 2b 를 나눈 이유.** 초판은 반증 2 하나로 "디렉터리만 19자로 바꾸고 `fail 1` 을 기대한다"고 적었는데 **틀렸다** — `SKILL.md` 를 그대로 두면 frontmatter 일치 계약이 함께 죽어 `fail 2` 가 된다. 그 값을 본 실행자는 "계약이 과민하다"고 오판해 멀쩡한 테스트를 지울 수 있다. 둘로 쪼개면 각 반증이 정확히 하나의 계약만 지목하고, 덤으로 반증이 없던 frontmatter 계약의 빈구멍도 메워진다. **초판의 이 기대값은 실측하지 않은 추정이었다.**
>
> **반증 4 가 무엇을 증명하는가.** 같은 상황에서 검사를 `<=` 로 되돌리면 스모크는 `PASS` 를 찍는다. 실측으로 양쪽을 다 확인했다 — 즉 Step 4 의 한 글자가 실제로 무는 것을 만들어냈다.
>
> **반증 3 이 사라진 것이 아니다.** 초판의 "브랜드 문자열 되돌리기"는 Task 1 Step 7 이 이미 초록불을 확인하는 지점이고, 여기서는 반증 9(저장소 경로)가 그 자리를 대신한다 — 펜스에서 실제로 얇은 곳이 그쪽이기 때문이다.

- [ ] **Step 6: 커밋**

```bash
npm run test:l1 2>&1 | grep -E '^. (tests|pass|fail)'
for t in run_installer_smoke run_installed_lib_smoke run_v061_l0 run_local_smoke \
         run_guide_smoke validate_prototype run_bash_installer_smoke; do
  printf '%-28s ' "$t"; python "tests/$t.py" >/dev/null 2>&1 && echo PASS || echo FAIL
done
git status --porcelain | grep '^??'; echo "(미추적 파일 끝 — 신규 2개만)"
git add e2e/contract/skill-contract.test.cjs e2e/contract/legacy-transition.test.cjs \
        e2e/contract/brand-names.test.cjs tests/run_installer_smoke.py
git commit -m "test: pin the skill surface contract and record the pre-M1a install transition"
git status --short; echo "(끝)"
```

기대: **L1 95/95 pass** (81 + 브랜드 5 + 스킬 5 + 이행 4). 파이썬 7종 전부 PASS. 작업 트리 빈 출력.

> 여기서는 경로를 열거한다. Task 1 과 달리 파일 목록이 바뀌지 않으므로 열거가 안전하고, 무엇이 이 커밋에 들어가는지가 명시적으로 남는다.

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

개명 커밋에 개명이 아닌 변경이 섞이지 않았음을 **증명한다**. 휴리스틱이 아니라 재현이다: `v0.7.0-m0` 을 다시 떠서 같은 스크립트를 돌리고, 그 결과가 실제 개명 커밋과 **바이트 단위로 같은지** 본다.

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
RENAME_COMMIT="$(git log --format=%H --grep='rename the brand surface' -1)"

# (1) 개명 전으로 되돌아가 스크립트를 다시 돌린다.
BEFORE="$(mktemp -d)"
git archive v0.7.0-m0 | tar -x -C "$BEFORE"
( cd "$BEFORE" && git init -q . && git add -A \
    && git -c user.email=t@t -c user.name=t commit -qm base \
    && node "$RENAME_DIR/rename-to-crew.cjs" \
    && node scripts/build-capabilities.cjs )

# (2) 실제 개명 커밋을 그대로 뜬다. 작업 트리가 아니라 **커밋**을 떠야
#     무시된 실행 산출물(e2e/E2E-RESULT.json 등)이 섞이지 않는다.
AFTER="$(mktemp -d)"
git archive "$RENAME_COMMIT" | tar -x -C "$AFTER"

# (3) 비교. 그 커밋이 의도적으로 더한 두 파일만 제외한다.
diff -r -q --exclude=.git \
  --exclude=RENAME-MAP.md --exclude=brand-names.test.cjs \
  "$BEFORE" "$AFTER"
echo "(재현 diff 끝 — 비어 있어야 한다)"

# (4) 제외 없이도 한 번 본다. 정확히 그 두 파일만 나와야 한다.
diff -r -q --exclude=.git "$BEFORE" "$AFTER"
cd "$REPO_ROOT"
```

기대: (3)이 **빈 출력**. (4)는 정확히 두 줄 — `Only in …/docs: RENAME-MAP.md`, `Only in …/e2e/contract: brand-names.test.cjs`.

한 줄이라도 더 나오면 개명이 아닌 변경이 섞인 것이므로 그 파일을 되돌리고 별도 커밋으로 분리한다.

> **왜 grep 이 아니라 재현인가.** 초판은 `git diff` 에서 `crew|triple|gsd-|SKILL_PREFIX` 가 든 줄을 걸러내고 남는 것을 보려 했다. 그런데 치환이 거의 **모든** 변경 줄에 `crew` 를 심으므로 거의 모든 줄이 걸러져 나간다 — 손으로 고친 한 줄이 `crew` 를 포함하기만 하면 통과하고, `head -20` 이 나머지를 조용히 자른다. 재현-비교는 그 구멍이 없다: 스크립트가 만든 것과 커밋된 것이 같으면 **정의상** 그 사이에 아무것도 안 들어갔다.
>
> **작업 트리가 아니라 커밋을 뜨는 이유.** 실측에서 작업 트리와 비교했더니 `e2e/E2E-RESULT.json` 하나가 걸렸다 — 추적 대상이 아닌 실행 산출물이다. `git archive` 는 추적 파일만 담으므로 이 잡음이 원천적으로 없다.
>
> `$RENAME_DIR` 를 Task 1 Step 3 에서 만든 뒤 **이 단계가 끝날 때까지 지우지 않는다.** 스크립트를 저장소에 커밋하지 않기로 했으므로(File Structure 참조) 여기서 다시 필요하다. 세션이 끊겼으면 계획서 Task 1 Step 3 의 코드 블록에서 다시 만든다.
>
> 실측: `c42d2b0` 기준으로 (3) 빈 출력, (4) 의도한 파일만 — 확인했다.

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
- **깊이 정렬의 근거를 리뷰에서 고쳤다.** 초판은 "얕은 경로부터 옮기면 부모 이동이 자식 경로를 무효화한다"고 썼다. **그 상황은 일어날 수 없다** — `tracked()` 는 `git ls-files` 이고 그건 **파일만** 반환하므로 디렉터리가 이동 단위가 되는 일이 없다. 모든 이동은 파일 단위이고 서로 독립적이다. 정렬은 무해한 no-op 이며, 미래에 디렉터리 단위 이동을 넣을 경우를 위한 방어로만 남긴다. 자기 검토 기록에 틀린 모델을 남기면 다음 사람에게 반대로 작용한다. 한편 `git mv` 가 비게 된 부모를 지우지 않는다는 것은 사실이므로 `find capabilities -type d -empty -delete` 는 그대로 필요하다.
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
- **`SKILL_PREFIX=''` 가 prune 을 폭주시킬 수 있다는 의심은 근거가 없다.** 리뷰에서 가장 먼저 확인한 것이다. GSD 쪽 prune 은 `if (!entry.startsWith(prefix)) continue;` 형태라 접두사가 빈 문자열이면 `startsWith('')` 가 항상 참이 되어 모든 디렉터리를 대상으로 삼을 수 있다. 그런데 **우리 설치자에는 그런 스캔이 없다** — `bin/triple-crown.cjs:415` 와 `:432` 둘 다 `capabilitySkillStems()` 가 준 stem 목록에서 이름을 **조립**하고, uninstall(`:454`)은 접두사가 아니라 마커 파일 존재로 판단한다(`git grep startsWith -- bin` -> 인자 파싱 2건뿐). 이 개명의 최대 잠재 위험이 실재하지 않음을 소스로 확인했다.
- **설치된 표면은 이미 검증되고 있었다 — 다만 부분집합으로.** 리뷰 초안은 "설치 결과는 Task 3 Step 2 의 수동 절차뿐"이라고 적었는데 **과장이었다**. `tests/run_installer_smoke.py` 가 이미 스킬 6개·frontmatter 일치·`.crew-skill` 마커를 단언한다. 진짜 구멍은 `assert expected<=present` 의 `<=` 였다 — 디렉터리가 **늘어나는** 경우를 못 잡는다. Task 2 Step 4 가 완전 일치로 바꾸고, 반증 4 가 그 차이를 실증한다(`<=` 로 되돌리면 같은 상황에서 `PASS` 가 찍힌다).
- **아웃사이드 보이스가 잡은 것 하나는 리뷰가 놓쳤다.** Task 1 Step 4 의 롤백 `git checkout -- . && git clean -fd` 는 미추적 파일을 지우는데, Step 1 에서 만든 펜스 테스트가 그 시점에 미추적이다. 되돌리는 순간 방금 쓴 산출물이 사라진다. `-e` 두 개로 막았다. 초판의 "작업 트리가 착수 전에 깨끗했으므로 안전하다"는 근거는 착수 **전** 상태를 말하는데 Step 1 이 그 전제를 이미 깼다 — **전제가 언제 깨지는지를 같이 적지 않으면 근거는 반쪽이다.**
- **`e2e/compatibility-baseline.json` 을 동결로 옮겼다.** 파싱하는 코드가 하나도 없고(`tests/validate_prototype.py:82` 가 존재 여부만 확인) `"tripleCrownVersion": "0.6.3"` 을 담은 **v0.6.3 표면의 스냅샷**이다. 개명하면 그 이름이 존재하지 않던 버전의 기록이 바뀐다 — `docs/V0.[0-6]*.md` 를 동결한 것과 정확히 같은 이유인데 초판은 이 파일에만 그 원칙을 적용하지 않았다.
- **실측 숫자는 계획서 자신이 커밋되는 것만으로도 움직인다.** 초판 `75 changed, 21 frozen`(118 파일)이 리뷰 시점에 `74 changed, 23 frozen`(119 파일)이 됐다. baseline 동결로 하나가 옮겨갔고(`75->74`, `21->22`), **이 계획서가 `docs/superpowers/` 아래 커밋되면서 동결이 하나 더 늘었다**(`22->23`). Step 4 에 그 사실과 "멈추기 전에 무엇부터 보는가"를 적어 두었다. 리뷰에서 `74/22` 라고 예측했다가 실측에서 `74/23` 이 나왔다 — **T1 이 고치려던 실수를 반복할 뻔했다.**
- **검증 방법.** `git archive HEAD` 로 임시 트리를 여섯 번 뜨고 계획서의 스크립트·테스트를 그대로 배치해 실행했다. 마지막 한 번은 이 문서의 코드 블록을 **정규식으로 다시 뽑아 그대로** 돌린 것이다 — 계획서에 적힌 것과 검증한 것이 같은 물건임을 보장한다.

  결과: 개명 전 펜스 `pass 1 · fail 3` (Step 2 기대치와 일치), 개명 `content: 75 changed, 21 frozen; paths: 33 moved`, 잔존 구 이름 **0건**(동결·보호 제외), **L1 81/81 -> 90/90**, 파이썬 스모크 7종 PASS, `npm pack` + npx tarball 스모크 PASS, `run-live --mock` PASS, 실제 설치 `READY=true PASS=17 WARN=0 FAIL=0`, 스킬 6개가 `crew-gsd*` 이름으로 설치. 반증 2건(`SKILL_PREFIX` 되살리기, 구 이름 한 줄 심기)이 각각 정확히 1건씩 실패시키는 것도 확인했다.

  **검증한 것과 계획서 사이의 유일한 차이**는 개명 스크립트의 `--check` 드라이런 플래그다. 검증본에는 있었고 계획서에서는 뺐다 — 스크립트가 `git mv` 를 실제로 돌기 전까지는 이동 목록이 확정되지 않아 드라이런이 부분적인 답만 주는데, 부분적인 답은 없느니만 못하다. 대신 실행 후 `content/paths` 숫자 대조(Step 4)와 `git checkout -- . && git clean -fd` 한 줄 되돌리기가 같은 안전망을 제공한다. `--check` 를 뺀 형태로 다시 돌려 동일 결과를 확인했다.

## 범위 밖으로 남긴 것

- **Windows L1 커버리지 0.** Task 5 가 승인 게이트로 남기며 **M1b 이월 권장.** 소유자: M1b (또는 사용자 승인 시 M1a).
- **개명 전 설치본의 제거 — M1a~M1c 사이 중복 노출 창.** `bin/crew.cjs` 의 `CAPABILITIES` 에 구 id 가 없으므로 `installCapabilities()`(`:352`, `:359`)가 `capability remove triple-gstack` 같은 호출을 **하지 않고**, `SKILL_MARKER` 가 `.crew-skill` 이므로 uninstall 스캔(`:454`)이 구 마커 디렉터리를 건너뛴다. 개명 전 설치본이 남은 머신에서 새 버전을 설치하면 capability 원장에 구·신 6개, 스킬 12개, 훅 2개, 벤더 디렉터리 2개가 동시에 산다. **현재 노출 0**: `legacy-backup.cjs detect` -> `legacy targets: 0`, npm 레지스트리 404, 원격 부트스트랩 파손, 설치 시점 프리릴리스 펜스. `e2e/contract/legacy-transition.test.cjs` 가 이 상태를 단언하며 **M1c 는 그 단언을 뒤집는 것으로 완료를 증명한다.** 소유자: M1c.
- **`tc-*` 임시 디렉터리 접두사 전면 개명.** `.gitignore:37` 과 파이썬 스모크 5곳. 사용자 표면이 아니라 `LEGACY` 정규식에 넣지 않았다 — 넣으면 펜스가 지킬 표면만 는다. 소유자: M1b.
- **`REPO_PATH_COUNTS` 장치 제거.** Task 4 B(저장소 개명)가 승인되면 `brand-names.test.cjs` 의 마스킹·격리·횟수 세 장치가 통째로 사라지고 첫 번째 테스트가 저장소 경로까지 자동으로 지킨다 (L1 95 -> 93). 소유자: Task 4 B.
- **`crew-gsd-*` 가 Claude Code 와 GSD 의 discovery 에서 어떻게 취급되는지 독립 검증.** 실측으로 확인한 것은 "설치 후 디스크에 그 이름의 디렉터리가 생기고 `doctor` 가 `READY=true PASS=17` 을 준다"까지다. 전역/프로젝트 스킬 shadowing 과의 상호작용은 검증하지 않았다. 소유자: M1b.
- **`scripts/configure-distribution.cjs` 의 `--repo` 분기는 사문이다.** `REPLACE_WITH_OWNER/triple-crown-workflow` 라는 플레이스홀더를 `README.md`/`docs/INSTALLER.md` 에서 찾는데, 실측상 그 문자열은 저장소 어디에도 없다(자기 자신 제외). 즉 `--repo` 는 `package.json` 만 고치고 문서는 못 고친다. **M1a 는 기능 변화 0 이므로 고치지 않는다.** 소유자: M7 (배포 설정을 실제로 쓰는 시점).
- **`crew.gstack.*` 라는 어색한 중간 마디.** 루트만 개명한 결과다. capability 가 쪼개지는 M1b 에서 네임스페이스를 다시 나눌지 판단한다. 소유자: M1b.
- **기존 설치의 `triple_crown.*` config 값 고아화.** 이 머신은 영향 0. 안내는 `uninstall-legacy` 가 한다. 소유자: M1c.
- **`gsd-shadow` doctor 검사.** 설계 §5.2 가 M1d 에 배치했다. `crew-` 접두사 덕분에 GSD 의 prune 대상에서 빠지는 것은 M1a 시점에 이미 성립한다(상위 문서 §4.1). 소유자: M1d.
- **`fixtures/tiny/` 와 L2 하네스.** M0 가 M1b 로 이월했다. M1a 도 L1 만 돈다 (설계 §6). 소유자: M1b.
- **저장소 디렉터리명 `triple-crown/` 자체.** 로컬 체크아웃 경로이며 어떤 코드도 참조하지 않는다(모든 경로가 `git rev-parse --show-toplevel` 또는 `__dirname` 기준). GitHub 저장소 개명(Task 4 B)과 함께 사용자가 원하면 바꾼다.

---

## 리뷰에서 확정된 변경 (2026-08-21 · `/plan-eng-review`)

**적용 완료 (2026-08-21).** 아래 16개 결정이 전부 계획서 본문에 반영됐고, 새로 생긴
기대값은 **추정이 아니라 임시 트리에서 실측**했다 — `74 changed, 23 frozen; 33 moved`,
L1 `81 -> 95`, 반증 6종 각각 정확히 `fail 1`, 재현-비교 diff 빈 출력, 파이썬 스모크
7종 PASS, 실제 설치 `READY=true PASS=17 WARN=0 FAIL=0`, `test:pack` PASS.
그 과정에서 리뷰 자신의 예측 둘이 실측에 뒤집혔고 아래 표에 그대로 남겼다.

| # | 대상 | 확정 |
|---|---|---|
| D1 | 스코프 | 개명 범위 as-is. 복잡도 게이트(84파일)는 개명의 정의이지 크립이 아니다 |
| D2 | `e2e/compatibility-baseline.json` | **동결**. FROZEN + ALLOW 에 추가, Step 4 기대값 `75/21` -> **`74/23`** (예측은 `74/22` 였고 실측이 뒤집었다 — 계획서 자신이 커밋되며 동결이 하나 더 늘었다) |
| D3 | Task 3 Step 3 | grep 을 **재현-비교 증명**으로 교체 |
| D4 | `tc-*` 임시 접두사 | 개명하지 않고 `RENAME-MAP.md` 에 문서화 |
| D5 | FROZEN / ALLOW_RE | 정규식을 글자 그대로 일치시킨다 |
| D6 | Task 1 Step 9 | `git add -A` **전에** 미추적 파일 확인 |
| D7 | 자기 검토 기록 | `git mv` 깊이 정렬 근거를 사실대로 수정 |
| D8 | Task 1 Step 3 | ASCII 다이어그램 2개 추가 |
| D9 | Task 2 Step 3 | **반증 2 를 2a/2b 로 분할** (기대값 오류) |
| D10 | `tests/run_installer_smoke.py` | 설치된 스킬 디렉터리 6개 단언 추가 |
| D11 | 범위 밖 절 | 중복 스킬 노출 창 기록 |
| D12 | `e2e/contract/` | **상태 전이 characterization 테스트** 신설 (제거 로직은 M1c) |
| D13 | Task 1 Step 4 | 롤백 지침에서 신규 파일 제외 |
| D14 | `brand-names.test.cjs` | `ungkey/triple-crown` 등장 횟수 고정 |
| D15 | Global Constraints | "기능 변화 0" 용어를 둘로 분리 |
| D16 | TODO 보관 | `TODOS.md` 만들지 않는다. 범위 밖 절을 계속 쓴다 |

### 근거가 된 소스 확인 (리뷰가 직접 읽은 것)

```
bin/triple-crown.cjs:21              const SKILL_PREFIX = 'gsd-';
bin/triple-crown.cjs:415             out.push(`${SKILL_PREFIX}${stem}`);   // stem 목록 조립, 디스크 스캔 아님
bin/triple-crown.cjs:432             const name=`${SKILL_PREFIX}${stem}`;
bin/triple-crown.cjs:352,359         for(const id of CAPABILITIES) ... capability remove <id>   // 구 id 미제거
bin/triple-crown.cjs:454             if(!exists(path.join(dir,SKILL_MARKER))) continue;         // uninstall 은 마커 기반
e2e/contract/helpers/fake-home.cjs:32-43   개명 전 설치본 전체를 심는 픽스처가 이미 있다
e2e/contract/legacy-backup.test.cjs        기능 테스트 34건 (문자열 검사가 아니다)
e2e/compatibility-baseline.json:58         "tripleCrownVersion": "0.6.3"    // 파싱하는 코드 0개
tests/validate_prototype.py:82             존재 여부만 확인
.gitignore:27                        .claude/skills/gsd-triple-*/           // .claude/skills/ 로 앵커됨 (안전)
```

`SKILL_PREFIX` 소비 지점 둘 다 stem 목록에서 이름을 **조립**한다. 접두사로 디렉터리를
훑는 코드는 없다(`git grep startsWith -- bin` -> 인자 파싱 2건뿐). 따라서
`SKILL_PREFIX=''` 가 `startsWith('')` 를 항상 참으로 만들어 prune 이 폭주하는 사고는
일어나지 않는다. **이것이 이 개명에서 가장 컸던 잠재 위험이고, 없다.**

## Implementation Tasks

이번 리뷰의 발견에서 유도된 작업. 각 항목은 위 결정 하나에 대응한다.
P1 은 착수 전 필수, P2 는 같은 마일스톤 안, P3 은 후속.

- [x] **T1 (P1, human: ~40min / CC: ~8min)** — Task 2 Step 3 — 반증 2 를 2a/2b 로 쪼갠다
  - Surfaced by: 테스트 리뷰 — 계획서 기대값 `fail 1` 이지만 실제는 `fail 2`. 디렉터리만
    개명하면 `skill-contract.test.cjs` 의 `each SKILL.md frontmatter name equals its
    directory stem` 이 함께 죽는다. 계획서 자기 검토가 "실측으로 반증 1·3 을 확인했다"
    라고 적어 반증 2 는 미실측임을 스스로 밝혔다.
  - Files: `docs/superpowers/plans/2026-08-21-m1a-mechanical-rename.md` (Task 2 Step 3)
  - 내용: 2a = 디렉터리 + SKILL.md frontmatter 둘 다 19자 -> `fail 1` (18자 상한만).
    2b = SKILL.md frontmatter 만 손대 -> `fail 1` (frontmatter 일치만).
  - Verify: 사본 트리에서 실제로 돌려 `fail 1` 두 번을 확인하고 계획서에 실측값 기록

- [x] **T2 (P2, human: ~10min / CC: ~2min)** — Task 1 Step 4 — 롤백이 산출물을 지운다
  - Surfaced by: 아웃사이드 보이스(codex) — `git clean -fd` 는 정의상 미추적 파일을
    지운다. Step 1 에서 만든 `brand-names.test.cjs` 는 Step 4 시점에 미추적이다.
    계획서 근거("작업 트리가 착수 전에 깨끗했으므로 안전")는 착수 **전** 상태를
    말하는데 Step 1 이 그 전제를 이미 깼다.
  - Files: 계획서 Task 1 Step 4
  - 내용: `git checkout -- . && git clean -fd -e e2e/contract/brand-names.test.cjs -e docs/RENAME-MAP.md`
  - Verify: 사본 트리에서 롤백 후 두 파일이 남아 있는지 확인

- [x] **T3 (P2, human: ~30min / CC: ~5min)** — Task 3 Step 3 — "기능 변화 0" 을 증명으로
  - Surfaced by: 아키텍처 리뷰 — 현재 필터가 `crew` 포함 줄을 전부 넘긴다. 치환이 거의
    모든 변경 줄에 `crew` 를 심으므로 섞여 들어간 수정을 원리상 못 잡고 `head -20` 이
    나머지를 자른다.
  - Files: 계획서 Task 3 Step 3
  - 내용: `git archive v0.7.0-m0` -> 개명 스크립트 재실행 -> `build-capabilities`
    -> `diff -r --exclude=.git` 로 실제 커밋 트리와 비교 (신규 3파일 제외).
    `$RENAME_DIR` 를 Task 3 종료까지 지우지 말 것을 Step 3 에 명시.
  - Verify: 두 트리 diff 가 빈 출력

- [x] **T4 (P2, human: ~40min / CC: ~8min)** — 설치된 표면을 자동 검증
  - Surfaced by: 테스트 리뷰 — `SKILL_PREFIX` 가 M1a 의 유일한 동작 변경이다.
    **정정:** 초안은 "설치 결과는 Task 3 Step 2 의 수동 절차뿐"이라고 했으나 과장이었다.
    `run_installer_smoke.py` 가 이미 스킬 6개·frontmatter·마커를 단언한다. 진짜 구멍은
    `assert expected<=present` 의 **부분집합** 검사 — 디렉터리가 늘어나면 못 잡는다.
  - Files: `tests/run_installer_smoke.py`
  - 내용: `assert expected<=present` 를 `assert expected==present` 로. 한 글자다.
  - Verify: 실측 — 스킬을 하나 더 추가하면 `missing: [] unexpected: ['crew-extra']`
    로 죽고, `<=` 로 되돌리면 같은 상황에서 `PASS` 가 찍힌다 (반증 4).

- [x] **T5 (P2, human: ~2h / CC: ~20min)** — 개명 전 설치본 상태 전이 테스트
  - Surfaced by: 테스트 리뷰 + 아웃사이드 보이스 합류 — `installCapabilities()` 는
    `bin/triple-crown.cjs:352` 에서 개명 후 `CAPABILITIES`(crew-* 셋)만 돌며
    `:359` 의 `capability remove` 를 부른다. 구 capability id · 구 마커 스킬 ·
    구 훅 · 구 벤더 트리는 남는다. 픽스처 `mkFakeHome()` 이 이미 그 전부를 심는다.
  - Files: `e2e/contract/legacy-transition.test.cjs` (신규),
    `e2e/contract/helpers/fake-home.cjs` (재사용, 수정 없음)
  - 내용: characterization 테스트 — "개명 전 설치본 + 신규 설치 -> 구 capability id,
    구 마커 스킬, 구 훅, 구 벤더 트리가 **여전히 남는다**" 를 명시적으로 단언하고,
    주석에 "M1c `uninstall-legacy` 가 이 단언을 뒤집는다". **제거 로직은 넣지 않는다**
    (동작 변경 = M1a 제약 위반).
  - Verify: `npm run test:l1` green, 새 단언이 현재 상태를 정확히 기술

- [x] **T6 (P2, human: ~10min / CC: ~2min)** — `compatibility-baseline.json` 동결
  - Surfaced by: 아키텍처 리뷰 — 이 파일은 v0.6.3 표면의 스냅샷이고 파싱하는 코드가
    없다(`tests/validate_prototype.py:82` 가 존재 여부만 확인). 개명하면
    `"crewVersion": "0.6.3"` 처럼 존재한 적 없는 조합이 남는다. 계획서는 같은 이유로
    `docs/V0.[0-6]*.md` 와 `tests/*.md` 를 이미 동결했다.
  - Files: 계획서 Task 1 Step 3(FROZEN) · Step 1(ALLOW) · Step 4(기대값) · Step 6(동결 표)
  - 내용: FROZEN 에 `/^e2e\/compatibility-baseline\.json$/`, ALLOW 에 경로 추가,
    Step 4 기대값을 `content: 74 changed, 23 frozen; paths: 33 moved` 로 갱신 (실측)
  - Verify: 사본 트리에서 재실행해 `74/22/33` 확인, L1 green

- [x] **T7 (P3, human: ~10min / CC: ~2min)** — FROZEN 정규식을 ALLOW_RE 와 글자 일치
  - Surfaced by: 코드 품질 리뷰 — `docs/V0.5/notes.md` 같은 하위 폴더 파일이 생기면
    스크립트는 동결하고 펜스는 문다. 두 목록이 손으로 유지되는 이중 소스다.
  - Files: 계획서 Task 1 Step 3
  - 내용: FROZEN 을 ALLOW_RE 쪽 `[^/]*` 형태로 맞추고 "이 둘은 글자 그대로 같아야
    한다" 한 줄
  - Verify: 두 정규식 리터럴이 문자열 비교로 동일

- [x] **T8 (P3, human: ~5min / CC: ~1min)** — `git add -A` 전 미추적 파일 확인
  - Surfaced by: 코드 품질 리뷰 — 현재 검사는 커밋 **뒤** `git status --short` 라
    정의상 빈 출력이다. 직전 Step 8 이 L1 + 파이썬 스모크 7종을 돌린다.
  - Files: 계획서 Task 1 Step 9
  - 내용: 맨 앞에 `git status --porcelain | grep '^??'` 와 기대 목록
    (`brand-names.test.cjs`, `RENAME-MAP.md` 둘뿐)
  - Verify: 기대 목록과 일치

- [x] **T9 (P3, human: ~30min / CC: ~5min)** — `ungkey/triple-crown` 등장 횟수 고정
  - Surfaced by: 아웃사이드 보이스 — `line.split(REPO_PATH).join('')` 이 모든 줄에서
    그 토큰을 지우므로 `ungkey/triple-crown-guide` 같은 접미 토큰이 빠져나가고,
    `REPO_PATH_FILES` 5개 안에서는 횟수·위치 제한이 없다.
  - Files: `e2e/contract/brand-names.test.cjs` (네 번째 테스트)
  - 내용: 파일별 등장 횟수를 실측값으로 고정하는 단언 추가. Task 4 B 승인 시 이 단언도
    함께 제거된다는 주석.
  - Verify: 임의의 파일에 한 번 더 심으면 FAIL

- [x] **T10 (P3, human: ~15min / CC: ~3min)** — "기능 변화 0" 용어 분리
  - Surfaced by: 아웃사이드 보이스 — 같은 단어가 (1) 실행자 규칙 "동작 고치는 수정 금지"
    와 (2) "외부에서 볼 때 동일" 두 뜻으로 쓰인다. (2)는 사실이 아니다.
  - Files: 계획서 Global Constraints
  - 내용: "**내부 동작 변경 0**" 으로 바꾸고 "**공개 진입점은 바뀐다** — CLI · 환경변수 ·
    config 루트 · capability id · 마커. breaking rename 이며 M7 릴리스 노트에 그렇게
    표시된다" 한 줄 추가
  - Verify: 계획서 안에서 "기능 변화 0" 단독 사용이 0건

- [x] **T11 (P3, human: ~40min / CC: ~8min)** — 개명 파이프라인 ASCII 다이어그램 2개
  - Surfaced by: 코드 품질 리뷰 — 순서가 이 계획의 유일한 위험이고 실측에서 두 번
    물렸는데(`gsd-triple-` 우선순위, 리스트 리터럴) 그림이 없다.
  - Files: 계획서 Task 1 Step 3 앞
  - 내용: (1) `rewrite()` 내부 — 마스킹 -> 규칙표 -> 정규식 -> 언마스킹, 마스킹이 왜
    규칙 순서로 대체 불가한지 보이게. (2) 스크립트 6단계 실행 순서.
  - Verify: 다이어그램이 코드와 일치

- [x] **T12 (P3, human: ~10min / CC: ~2min)** — `git mv` 깊이 정렬 근거 수정
  - Surfaced by: 코드 품질 리뷰 — `tracked()` 은 `git ls-files` 라 파일만 반환하므로
    부모-자식 무효화는 발생할 수 없다. 정렬은 무해한 no-op 이고 설명만 틀렸다.
  - Files: 계획서 Task 1 Step 3 주석 · 자기 검토 기록
  - 내용: "파일 단위 이동이라 실제로는 no-op 이며, 미래에 디렉터리 단위 이동을 넣을
    경우를 대비한 방어적 정렬" 로 정정
  - Verify: 자기 검토 기록에 틀린 주장 0건

- [x] **T13 (P3, human: ~5min / CC: ~1min)** — `tc-*` 접두사 문서화
  - Surfaced by: 아키텍처 리뷰 — `.gitignore:37` 과 파이썬 스모크 5개에 `tc-` 가 남고
    `LEGACY` 정규식에 없어 펜스가 못 본다.
  - Files: `docs/RENAME-MAP.md` "바꾸지 않은 것" 절
  - 내용: `tc-*` 임시 디렉터리 접두사는 사용자 표면이 아니고 시스템 임시 경로에만
    나타나므로 의도적으로 남긴다. 전면 개명은 M1b 후보.
  - Verify: 표에 항목 존재

- [x] **T14 (P3, human: ~10min / CC: ~2min)** — 범위 밖 절 보강
  - Surfaced by: 테스트 리뷰 · TODO 보관 결정 — `TODOS.md` 를 만들지 않기로 했으므로
    이월 항목은 전부 이 절에 들어간다.
  - Files: 계획서 `## 범위 밖으로 남긴 것`
  - 내용 4항목: (a) M1a~M1c 중복 스킬 노출 창 + `installCapabilities:352` 가 구 id 를
    제거하지 않는다는 사실, 현재 노출 0 의 근거, 소유자 M1c. (b) `tc-*` 전면 개명,
    소유자 M1b. (c) `REPO_PATH` 마스킹 장치 제거, 소유자 Task 4 B. (d) GSD/Claude
    discovery 가 `crew-gsd-*` 를 어떻게 취급하는지 독립 검증, 소유자 M1b.
  - Verify: 네 항목 모두 소유자 표기

## GSTACK REVIEW REPORT

| Run | Status | Findings |
|---|---|---|
| Step 0 스코프 도전 | 완료 | 복잡도 게이트(84파일) 트리거 — 위양성 판정. 개명은 원자적이라 축소 불가. 스코프 as-is |
| 1. 아키텍처 | 3건 | `compatibility-baseline.json` 기록 위조 · "기능 변화 0" 검사 취약 · `tc-*` 잔존 |
| 2. 코드 품질 | 4건 | FROZEN/ALLOW DRY · `git add -A` 검토 순서 · `git mv` 근거 오류 · 다이어그램 부재 |
| 3. 테스트 | 3건 | **반증 2 기대값 오류 (P1)** · 설치 표면 자동 검증 부재 · 중복 노출 창 미문서 |
| 4. 성능 | 0건 | L1 런타임 회귀 0. 테스트 1·4 분리는 계약당 assert 하나로 현 설계가 옳다 |
| Outside voice (codex, read-only, effort=high) | 9건 제기 | 4건 채택 · 1건 오류 · 2건 과장 · 2건 이미 계획에 있음 |
| Cross-model tension | 4건 | 전부 해소 (D12 · D13 · D14 · D15) |

**CODEX 흡수 결과**

- 채택: 롤백이 미추적 산출물을 지운다(리뷰가 놓친 유일한 결함) · 레거시 상태 전이
  미검증 · `REPO_PATH` 마스킹 과신 · "기능 변화 0" 라벨 부정확.
- 기각(사실 오류): "allowlist alive 테스트가 legacy backup 을 문자열로만 지킨다" —
  `e2e/contract/legacy-backup.test.cjs` 에 기능 테스트 34건이 있다.
- 축소(과장): "임의의 구 브랜드 토큰이 통과할 수 있다" — 마스킹은 정확히
  `ungkey/triple-crown` 만 지우므로 맨 `triple-crown` 은 여전히 물린다.
  진짜 구멍은 `ungkey/triple-crown-*` 접미 토큰으로 좁다.
- 이미 반영됨: 원격 부트스트랩 파손(Task 4 승인 게이트에 실측 오류 메시지까지 인용).

**CROSS-MODEL TENSION 해소**

1. *레거시 마이그레이션 시점* — 리뷰: 문서만. Codex: M1c 로 미루면 안 된다.
   소스 확인 결과 Codex 가 더 옳았다(`bin/triple-crown.cjs:352` 가 구 id 를
   제거하지 않는다). 다만 현재 노출 0 실측은 Codex 가 못 본 맥락이다.
   **확정: 제거 로직은 M1c, 상태 전이 테스트는 지금 (T5).**
2. *`REPO_PATH` 마스킹* — Task 4 B 가 이 장치를 통째로 제거하므로 수명이 짧다.
   **확정: 등장 횟수 고정으로 최소 보강 (T9).**
3. *"기능 변화 0"* — 계획서는 사실을 이미 다 적어두었고 문제는 라벨이다.
   **확정: 용어 분리 (T10).**
4. *롤백 지침* — 텐션 없음. Codex 가 맞고 리뷰가 놓쳤다. **확정: 제외 플래그 (T2).**

**VERDICT: 승인 — 조건 전부 반영 완료.** (초판 판정은 조건부 승인이었고, 조건 14건이 모두 계획서에 들어갔다.)

초판 계획의 뼈대는 견고하다 — 개명 방식(우선순위 규칙표 +
보호 토큰 마스킹)이 옳고, 임시 트리 여섯 벌 실측이 있고, 실측이 뒤집은 것 넷을
정직하게 기록했다. `SKILL_PREFIX=''` 가 prune 을 폭주시킬 수 있다는 최대 잠재
위험은 소스 확인 결과 **존재하지 않는다**(접두사 소비 지점 둘 다 stem 목록 조립).

T1~T14 는 전부 계획서 본문에 들어갔고, 새 기대값은 임시 트리 실측으로 확정했다.
이 리뷰의 가장 큰 소득은 T5 다 — 두 모델이 독립적으로 같은 곳(레거시 상태 전이)을
가리켰고, 필요한 픽스처(`e2e/contract/helpers/fake-home.cjs`)가 이미 저장소에 있었다.

**반영 도중 실측이 리뷰 자신을 두 번 뒤집었다.** 둘 다 계획서에 그대로 남겼다.

1. Step 4 기대값을 `74/22` 로 예측했는데 실제는 **`74/23`** 이었다 — 이 계획서가
   `docs/superpowers/` 아래 커밋되면서 동결 파일이 하나 더 늘었다. T1 이 고치려던
   "실측 안 한 기대값" 실수를 리뷰가 되풀이할 뻔했다.
2. D10 은 "설치된 표면 검증이 수동 절차뿐"이라고 했으나 **과장이었다.**
   `tests/run_installer_smoke.py` 가 이미 스킬 6개·frontmatter·마커를 단언한다.
   진짜 구멍은 `assert expected<=present` 의 부분집합 검사였고, 수정은 한 글자다.

**남은 판단 두 건은 여전히 사용자 몫이다** (계획서 Task 4·5, 승인 게이트):
`v0.6.5` 태그 push, GitHub 저장소 개명 시점, Windows L1 잡(M1b 이월 권장).

NO UNRESOLVED DECISIONS
