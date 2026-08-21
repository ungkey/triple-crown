# M1b — capability 분해(릴리스 표면 분리) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** God capability `crew-quality` 에서 **릴리스 소유권**(ship guard · release ledger · post-ship 문서/카나리/회고)을 `crew-ship` 으로 떼어내 capability 를 3개에서 4개로 만들고, 분해가 다시 깨지지 못하도록 L1 계약 펜스 5종을 세운다. **기능 변화 0. config 키 이름 변경 0. 신규 기능 0.**

**Architecture:** 설계서 [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §5 의 M1b 다. 설계 §5.1 은 9개 분해를 적으나 **그대로는 실행할 수 없다** — GSD 1.11.0 이 capability 경계를 넘는 `requires` 와 `consumes` 를 둘 다 거부한다(아래 §"설계서와 달라지는 점", 전부 실측). 이번 단계는 GSD 가 실제로 허용하는 최대 분해인 4개까지 간다. 분해는 스크립트가 하되, 분해된 상태를 지키는 것은 스크립트가 아니라 **테스트**다.

**Tech Stack:** Node.js ≥24 (실측 v24.14.0), `node:test` 러너, Node stdlib 만 (외부 npm 의존성 0), 시스템 `npm` 11.11.0 · `git` 2.43.0 · `python3` 3.13.13. 러너 GSD: `~/.claude/gsd-core/bin/gsd-tools.cjs` **v1.11.0**.

**Spec:** [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) §5(M1 분할) · §5.1 · §4.2(공유 lib 파이프라인) · §6 L1 · §8(커밋·태그) / [`docs/RESTRUCTURE-PLAN.md`](../../RESTRUCTURE-PLAN.md) §3 D5(God capability) · §5.1(분해안) · §5.2(공유 라이브러리) · §7.5(단계)

**선행 계획:** [`2026-08-21-m1a-mechanical-rename.md`](2026-08-21-m1a-mechanical-rename.md) — 완료. 태그 `v0.7.0-m1a`.

## Global Constraints

- 외부 npm 의존성 추가 금지. `package.json` 에 `dependencies` 없음 유지.
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`/`perf`/`ci`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green.
- **push 금지.** 커밋·태그는 로컬에만. push 는 사용자 승인 후 별도.
- **기능 변화 0.** M1b 는 소유권 재배치다. step·gate·config 의 **값**은 하나도 바뀌지 않고 어느 매니페스트에 적혀 있는가만 바뀐다. 동작이 바뀌는 수정은 발견해도 하지 않고 "범위 밖" 절에 소유자와 함께 기록한다.
- **config 키 이름 불변.** `crew.gstack.*` · `crew.ship.*` 문자열은 그대로다. 설계 §5.1 의 `crew.review.*`/`crew.qa.*`/`crew.security.*` 재명명은 이번 범위가 아니다 — M1a 가 이미 `triple_crown.*` → `crew.*` 로 사용자 설정을 한 번 깼고, 연속 두 마일스톤이 같은 표면을 깨면 마이그레이션 경로가 둘로 갈린다. 소유자: M1d 또는 M7 릴리스 노트 시점.
- **capability 는 4개까지만 늘린다.** `crew-security`·`crew-core`·`crew-flow`·`crew-demo`·`crew-concept` 는 이번에 만들지 않는다. 앞의 하나는 GSD 제약 때문이고(§"설계서와 달라지는 점"), 나머지는 담을 내용물이 M2·M5·M7 에 있기 때문이다.
- **`requires` 는 전부 `[]` 다.** 취향이 아니라 제약이다 — 아래 §"설계서와 달라지는 점" 1번. 의존 순서는 `bin/crew.cjs` 의 `CAPABILITIES` 배열이 소유한다.
- **아티팩트 이름은 바꾸지 않는다** (설계 §3.1). `GSTACK-*.json` · `MUTATION.json` · `EVIDENCE.json`. 이번 단계에서는 이 제약이 특히 무겁다 — 아티팩트 이름이 곧 **step 순서를 결정하는 간선**이기 때문이다(§"설계서와 달라지는 점" 2번).
- **머신·폴더 종속 금지.** 저장소 경로는 `git rev-parse --show-toplevel` 또는 `path.resolve(__dirname,'..')` 로 얻는다. 파괴적 실험은 `git archive` 로 뜬 임시 트리에서만 한다.
- **VERSION 은 `0.7.0-dev` 그대로다.** M1b 는 릴리스가 아니다. `prepublishOnly` 의 프리릴리스 펜스가 계속 배포를 막는다.

## 선행 조건 (착수 전 확인)

아래가 전부 참이 아니면 **착수하지 않는다.** 실측값은 `5c7b286` 기준이다.

```bash
git describe --tags --exact-match HEAD        # v0.7.0-m1a
git status --short; echo "(끝 — 비어 있어야 한다)"
git ls-files | wc -l                          # 123
npm run test:l1 2>&1 | tail -4                # tests 96 · pass 96 · fail 0
ls capabilities                               # crew-discipline crew-guide crew-quality
node -e "console.log(require('./capabilities/crew-quality/capability.json').skills.length)"   # 5
```

GSD 러너가 실제로 있어야 한다. M1b 의 핵심 위험은 전부 GSD 쪽이므로 mock 만으로는 판정할 수 없다:

```bash
test -f ~/.claude/gsd-core/bin/gsd-tools.cjs && cat ~/.claude/gsd-core/VERSION   # 1.11.0
```

## 설계서와 달라지는 점 — 전부 실측

설계 §5.1 은 9개 분해를 `requires: [crew-core]` 와 함께 적는다. **그 형태는 GSD 1.11.0 에서 설치되지 않는다.** 리뷰가 아니라 측정으로 확인했다.

### 1. `requires` 를 쓸 수 없다

`gsd-core` 는 capability 를 설치할 때 교차 검증 맵을 **설치 중인 그 하나로만** 만든다:

```js
// gsd-core/src/capability-source.cts:836  (배포본: bin/lib/capability-source.cjs:681)
const capMap = new Map([[id, cap]]);
const crossErrs = [
  ...capValidator.validateAgainstContract(cap, id),
  ...capValidator.validateConsumesGlobal(capMap),
  ...capValidator.validateCrossCapability(capMap, centralKeys),
];
```

`validateCrossCapability` 의 "requires: all ids exist" 는 이 맵만 본다. 그래서 `requires` 가 비어 있지 않으면 **대상이 이미 설치되어 `active` 여도** 거부된다.

```
$ gsd-tools capability install <crew-core>      --scope project --yes   # exit 0, active
$ gsd-tools capability install <crew-quality2>  --scope project --yes   # requires: ["crew-core"]
Error: capability install blocked: Cross-capability validation failed:
capability "crew-quality2" requires "crew-core" which does not exist
exit=1
```

같은 매니페스트에서 `requires` 만 `[]` 로 바꾸면 exit 0. `requires: ["definitely-not-a-capability"]` 도 **글자 그대로 같은 메시지**로 죽는다 — 검증기는 실재 여부를 볼 방법 자체가 없다.

→ 전 capability `requires: []`. 순서는 우리가 소유하고, Task 1 의 펜스가 그 사실을 못 박는다.

### 2. capability 경계를 넘는 `consumes` 도 거부된다 — 그리고 그게 순서를 옮기던 간선이다

같은 단일 항목 맵이 `validateConsumesGlobal` 도 무력화한다. 그 함수는 `producedAtPoint` 를 GSD 고정 호스트 아티팩트 목록 + **capMap 안의 producer** 로만 채운다. 다른 capability 가 만드는 아티팩트를 consume 하면:

```
$ gsd-tools capability install <crew-security> --scope project --yes
Error: capability install blocked: Cross-capability validation failed: capability "crew-security"
step at point "execute:post" consumes "GSTACK-QA.json" which is never produced by
any host artifact or capability hook
exit=1
```

`crew-quality` 는 이미 설치되어 `active` 였고 그 안의 `crew-gsd-qa` step 이 `GSTACK-QA.json` 을 `produces` 한다. 그래도 보이지 않는다.

**그렇다고 간선을 지우면 안 된다.** GSD 는 같은 point 의 step 을 produces/consumes **위상 정렬**로 배치한다 (`capability-validator.cjs` 의 `topoSortHookEntries`): Kahn 알고리즘, 준비된 노드는 `capId` 로 정렬, **새로 준비된 노드는 큐 뒤에 붙는다.** 그래서 `GSTACK-QA.json` 간선을 지우고 실제 GSD 로 렌더하면:

```
$ gsd-tools loop render-hooks execute:post --raw
0: code-review    code-review        (GSD 1st-party)
1: crew-quality   crew-gsd-review
2: crew-security  crew-gsd-sec       <- qa 보다 먼저
3: crew-quality   crew-gsd-qa
```

`review` 가 빠진 뒤에야 `qa` 가 준비되는데, 그때 `sec` 은 이미 큐에 들어가 있다. **보안 리뷰가 QA 앞에서 돈다.**

→ `SUMMARY.md` → `GSTACK-CODE-REVIEW.json` → `GSTACK-QA.json` 으로 이어진 아티팩트 사슬에 묶인 세 step(review·qa·sec)은 **한 capability 안에 있어야 한다.** `crew-security` 분리는 M1b 에서 불가능하다.

### 3. 그래서 이번 분해는 4개다

| 설계 §5.1 | M1b 결정 | 근거 |
|---|---|---|
| `crew-quality` (review+qa) | **review + qa + sec** 유지 | 위 2번. 아티팩트 사슬이 셋을 묶는다 |
| `crew-security` 분리 | **하지 않는다** | 위 2번. 소유자: Task 4(승인 게이트) |
| `crew-ship` 분리 | **한다** | postship step 이 consume 하는 `UAT.md` 는 **호스트 아티팩트**다. gate 는 produces/consumes 가 없어 `capId` 알파벳 순으로만 정렬되므로 경계를 넘어도 안전. 실측으로 설치·렌더 확인 |
| `crew-core` 신설 | **하지 않는다** | M0 이 공유 lib 을 capability 별 사본으로 해결했다(§5.2 방안 A). crew-core 가 남에게 제공할 것이 없다. `crew.mode`·`crew.gate.*`·`crew.gap.*` 키가 생기는 M2 가 만든다 |
| `crew-flow`·`crew-demo`·`crew-concept` | **하지 않는다** | 내용물이 M2·M5·M7 에 있다. 빈 껍데기를 지금 배포하면 doctor·ledger·제거 대상 표면만 넷 늘어난다 |

이것은 사용자 결정("실재하는 것만 5개")을 실측이 한 칸 더 좁힌 결과다. 5개 중 `crew-security` 가 GSD 제약으로 빠져 **4개**가 됐다.

### 4. L0 의 순서 근거는 실제 GSD 의 것이 아니다

`e2e/mock-gsd.cjs:123` 은 `fs.readdirSync(capsRoot).sort()` 로 capability 를 훑는다 — **단순 알파벳 순**이다. 실제 GSD 는 위상 정렬을 쓴다. 두 규칙이 지금 같은 답을 주는 것은 `crew-quality` < `crew-security` 라는 알파벳 우연 때문이었다. **따라서 hook-contract 가 mock 에서 통과한다는 사실은 순서 증거가 되지 못한다.** Task 3 이 실제 GSD 렌더를 완료 판정에 넣는 이유다.

## 실측 기준점

`5c7b286` (태그 `v0.7.0-m1a`) 기준. 전부 이 계획을 쓰면서 실행한 값이다.

| 항목 | 값 |
|---|---|
| 추적 파일 | 123 |
| L1 | **96 / 96** |
| 파이썬 스모크 4종 | `run_installer_smoke` · `run_installed_lib_smoke` · `run_local_smoke` · `run_v061_l0` 전부 exit 0 |
| `npm run test:pack` | PASS · `crew-harness-0.7.0-dev.tgz` |
| 설치 왕복 (실제 GSD) | 스킬 6 · 마커 6 · `READY=true PASS=17 WARN=0 FAIL=0` |
| capability | 3 (`crew-discipline` · `crew-guide` · `crew-quality`) |

`crew-quality` 의 현재 내용물:

| | 개수 |
|---|---|
| skills | 5 (`crew-gsd-review` `crew-gsd-qa` `crew-gsd-sec` `crew-gsd-postship` `crew-gsd-release`) |
| checks | 16 + `checks/lib/` 3 + `LIB-HASH.json` |
| config 키 | 25 |
| steps | 4 (execute:post × 3, ship:post × 1) |
| gates | 5 (plan:post × 1, verify:pre × 2, ship:pre × 2) |

M1b 이후 기대값 (전부 임시 트리에서 실측):

| | `crew-quality` | `crew-ship` |
|---|---|---|
| skills | 3 | 2 |
| checks | 11 | 5 |
| `checks/lib/` | 3 (`repo-state-lib` `evidence-store` `resolve-phase-dir`) | 2 (`repo-state-lib` `resolve-phase-dir`) |
| config 키 | 12 | 13 |
| steps | 3 | 1 |
| gates | 4 | 1 |

합계는 정확히 여집합이다: `3+2=5` skills · `12+13=25` config · `3+1=4` steps · `4+1=5` gates.

## File Structure

**신규**

- `e2e/contract/capability-split.test.cjs` — 분해 계약 펜스 5종. M1b 가 지키려는 성질 전부가 여기 있다.
- `capabilities/crew-ship/capability.json` — 릴리스 소유권 매니페스트.
- `capabilities/crew-ship/checks/lib/{repo-state-lib.cjs,resolve-phase-dir.cjs,LIB-HASH.json}` — `npm run build:caps` 가 생성한다. **손으로 만들지 않는다.**

**이동** (`git mv`, 내용 무변경)

```
capabilities/crew-quality/checks/ship-guard-control.cjs     -> capabilities/crew-ship/checks/
capabilities/crew-quality/checks/release-ledger.cjs         -> capabilities/crew-ship/checks/
capabilities/crew-quality/checks/canary-session.cjs         -> capabilities/crew-ship/checks/
capabilities/crew-quality/checks/docs-release-session.cjs   -> capabilities/crew-ship/checks/
capabilities/crew-quality/checks/retro-record.cjs           -> capabilities/crew-ship/checks/
capabilities/crew-quality/skills/crew-gsd-postship/         -> capabilities/crew-ship/skills/
capabilities/crew-quality/skills/crew-gsd-release/          -> capabilities/crew-ship/skills/
```

**수정**

| 파일 | 무엇 |
|---|---|
| `bin/crew.cjs` | `CAPABILITIES` 에 `crew-ship` 추가 · `module.exports` + `require.main` 가드 |
| `capabilities/crew-quality/capability.json` | 옮겨간 skills·config·steps·gates 제거 |
| `capabilities/crew-quality/skills/crew-gsd-qa/SKILL.md` · `.../crew-gsd-sec/SKILL.md` | `CREW_CAP` 해석 블록 자기완결화 |
| `capabilities/crew-ship/skills/*/SKILL.md` (이동분 2개) | 같은 블록을 `crew-ship` 으로 재타깃 |
| `scripts/build-capabilities.cjs` | `LIB_MAP` 에 `crew-ship` 추가 |
| `e2e/assert-hooks.cjs` | ship:pre 게이트 · ship:post step 의 `capId` 를 `crew-ship` 으로 |
| `e2e/run-live.cjs` | capability id 리터럴 4곳 → `CAPABILITIES` |
| `e2e/contract/prerelease-fence.test.cjs` | id 리터럴 → 디렉터리 스캔 |
| `tests/run_installer_smoke.py` · `tests/run_npx_tarball_smoke.py` | 기대 id 집합 → 디렉터리 스캔 |
| `tests/run_local_smoke.py` | `CHECKS` 를 `crew-ship` 으로 |
| `tests/run_installed_lib_smoke.py` | `evidence-store` 는 `crew-quality` 사본에만 있다 |
| `tests/validate_prototype.py` | ship 표면 검사 소유자 → `crew-ship` · capability 순회 → 디렉터리 스캔 |

**건드리지 않는 것:** `capabilities/crew-discipline/**` · `capabilities/crew-guide/**` · `lib/**` · `guards/**` · `docs/RENAME-MAP.md`(Task 3 에서만) · `e2e/contract/brand-names.test.cjs` · `e2e/contract/legacy-*.cjs`.

---

### Task 1: 분해 계약 펜스 + `CREW_CAP` 자기완결화

**Files:**
- Create: `e2e/contract/capability-split.test.cjs`
- Modify: `bin/crew.cjs` (끝부분)
- Modify: `capabilities/crew-quality/skills/{crew-gsd-qa,crew-gsd-sec,crew-gsd-postship,crew-gsd-release}/SKILL.md`

**Interfaces:**
- Produces: `require('bin/crew.cjs').CAPABILITIES` — Task 2 의 `e2e/run-live.cjs` 와 펜스 1번이 읽는다.
- Produces: `e2e/contract/capability-split.test.cjs` — Task 2 의 분해가 통과해야 할 계약.

> **왜 분해보다 펜스가 먼저인가.** 이 단계에서 고치는 `CREW_CAP` 버그는 **분해 전에도 이미 존재하는 실제 결함**이고, 분해가 그걸 무해에서 치명으로 바꾼다. 펜스를 먼저 세우면 적색 상태에서 그 사실이 드러난다. 분해 뒤에 세우면 두 변경이 한 커밋에 섞여 무엇이 무엇을 고쳤는지 사후에 못 가른다.

- [ ] **Step 1: `bin/crew.cjs` 를 require 가능하게 만든다**

파일 맨 끝을 통째로 바꾼다.

```js
// before
main().catch(err=>{
  process.stderr.write(`Crew installer: ${err.message}\n`);
  process.exit(err.exitCode || 1);
});
```

```js
// after
// 설치 순서를 소유하는 배열은 계약 테스트와 L2 픽스처가 읽어야 한다. 그런데 이 파일을
// require 하면 CLI 가 그대로 돌아버리므로 main() 은 직접 실행일 때만 부른다.
module.exports = { CAPABILITIES };

if (require.main === module) {
  main().catch(err=>{
    process.stderr.write(`Crew installer: ${err.message}\n`);
    process.exit(err.exitCode || 1);
  });
}
```

확인:

```bash
node -e "console.log(require('./bin/crew.cjs').CAPABILITIES)"
node bin/crew.cjs --help >/dev/null; echo "cli exit=$?"
```

기대: 배열 3개 출력 · `cli exit=0`. **둘 다 봐야 한다** — export 만 확인하면 CLI 를 죽인 채 넘어갈 수 있다.

- [ ] **Step 2: 펜스 테스트를 쓴다**

`e2e/contract/capability-split.test.cjs`:

```js
'use strict';
// M1b 가 세운 분해 계약. 여기 있는 다섯 개는 전부 **실측으로 확인한 실패**를 막는다 —
// 넷은 설치 시점에야 터졌고, 하나는 어디서도 안 터지고 런타임에 조용히 틀렸다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CAPS = path.join(ROOT, 'capabilities');

const capIds = () => fs.readdirSync(CAPS, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();
const manifest = (id) => JSON.parse(fs.readFileSync(path.join(CAPS, id, 'capability.json'), 'utf8'));

// GSD 가 스스로 만들어 주는 아티팩트. capability 가 produce 하지 않아도 consume 할 수 있다.
// 실측으로 좁혔다: 이 둘만 우리 매니페스트에서 producer 없이 consume 된다.
const HOST_ARTIFACTS = new Set(['SUMMARY.md', 'UAT.md']);

test('bin/crew.cjs CAPABILITIES matches the capabilities on disk exactly', () => {
  // 부분집합이 아니라 완전 일치다. 디스크에만 있는 id 는 배포되고도 설치되지 않고,
  // 배열에만 있는 id 는 설치자가 없는 디렉터리를 스테이징하려다 죽는다.
  const { CAPABILITIES } = require(path.join(ROOT, 'bin', 'crew.cjs'));
  assert.deepStrictEqual([...CAPABILITIES].sort(), capIds());
});

test('every capability declares requires: [] — GSD 1.11.0 cannot resolve a non-empty one', () => {
  // gsd-core src/capability-source.cts:836 은 검증 맵을 `new Map([[id, cap]])` 로 만든다 —
  // 설치 중인 capability 하나뿐이다. 그래서 requires 에 이름이 하나라도 있으면 그 대상이
  // 이미 active 여도 `requires "X" which does not exist` 로 거부된다(실측).
  // 의존 순서는 bin/crew.cjs 의 CAPABILITIES 배열이 소유한다.
  const bad = capIds().filter((id) => (manifest(id).requires || []).length);
  assert.deepStrictEqual(bad, [], 'a non-empty requires makes the capability uninstallable');
});

test('no step consumes an artifact produced by a different capability', () => {
  // 같은 단일 항목 capMap 결함이 consumes 도 문다: 다른 capability 가 만드는 아티팩트를
  // consume 하면 설치가 `never produced by any host artifact or capability hook` 으로
  // 거부된다(실측 — crew-security 를 떼어내려다 여기서 막혔다).
  //
  // 그렇다고 간선을 지우면 안 된다. GSD 는 같은 point 의 step 을 produces/consumes 위상
  // 정렬로 배치하므로(capability-validator.cjs topoSortHookEntries) 간선이 사라지면 순서가
  // 바뀐다 — 실측: sec 의 GSTACK-QA.json 간선을 지우자 실제 GSD 가 review, sec, qa 로
  // 렌더했다. 따라서 **아티팩트 사슬로 묶인 step 들은 한 capability 안에 있어야 한다.**
  const violations = [];
  for (const id of capIds()) {
    const cap = manifest(id);
    const own = new Set();
    for (const s of cap.steps || []) for (const a of s.produces || []) own.add(a);
    for (const s of cap.steps || []) {
      for (const a of s.consumes || []) {
        if (own.has(a) || HOST_ARTIFACTS.has(a)) continue;
        violations.push(`${id}: step at ${s.point} consumes ${a}, produced by no step in ${id}`);
      }
    }
  }
  assert.deepStrictEqual(violations, [], 'split a produces/consumes chain and the install refuses it');
});

test('every SKILL.md names its own capability and no other', () => {
  // 실측: 다섯 스킬 중 넷이 CREW_CAP 을 "다른 Crew 래퍼와 같은 방식으로 정하라"는 산문으로
  // 넘겼고, 실제 대입 블록은 crew-quality 리터럴을 든 한 곳뿐이었다. 스킬이 흩어지면 그
  // 산문은 남의 디렉터리를 가리키는데 어떤 테스트도 마크다운을 실행하지 않는다.
  const ids = capIds();
  const bad = [];
  for (const id of ids) {
    const skillsDir = path.join(CAPS, id, 'skills');
    if (!fs.existsSync(skillsDir)) continue;
    for (const stem of fs.readdirSync(skillsDir)) {
      const f = path.join(skillsDir, stem, 'SKILL.md');
      if (!fs.existsSync(f)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (!src.includes('CREW_CAP')) continue;
      if (!src.includes(id)) bad.push(`${id}/${stem}: never names its own capability id`);
      for (const other of ids) {
        if (other === id) continue;
        if (src.includes(other)) bad.push(`${id}/${stem}: names a foreign capability ${other}`);
      }
    }
  }
  assert.deepStrictEqual(bad, [], 'a skill that resolves CREW_CAP must name its own capability');
});

test('no config key is declared by two capabilities', () => {
  // 분해는 config 소유권을 나누는 일이기도 하다. 같은 키를 둘이 선언하면 어느 쪽 기본값이
  // 이기는지가 설치 순서에 달리고, 그 순서는 이 저장소 밖에서 정해질 수도 있다.
  const owner = new Map();
  const dupes = [];
  for (const id of capIds()) {
    for (const key of Object.keys(manifest(id).config || {})) {
      if (owner.has(key)) dupes.push(`${key}: ${owner.get(key)} and ${id}`);
      else owner.set(key, id);
    }
  }
  assert.deepStrictEqual(dupes, [], 'a config key must have exactly one owning capability');
});
```

- [ ] **Step 3: 적색 확인 — 펜스가 실제로 무언가를 잡는지 본다**

```bash
node --test e2e/contract/capability-split.test.cjs
```

기대: **`pass 4` · `fail 1`.** 죽는 것은 네 번째이고, 메시지가 대상 넷을 정확히 열거해야 한다:

```
✖ every SKILL.md names its own capability and no other
  + 'crew-quality/crew-gsd-postship: never names its own capability id',
  + 'crew-quality/crew-gsd-qa: never names its own capability id',
  + 'crew-quality/crew-gsd-release: never names its own capability id',
  + 'crew-quality/crew-gsd-sec: never names its own capability id'
```

다른 조합이 나오면 멈춘다. 특히 `pass 5` 가 나오면 테스트가 아무것도 안 보고 있는 것이다.

- [ ] **Step 4: 네 SKILL.md 를 자기완결로 만든다**

`crew-gsd-review/SKILL.md` 만 실제 대입 블록을 갖고 있고, 나머지 넷은 그걸 산문으로 가리킨다. 넷 각각에서 그 산문 한두 줄을 아래 블록으로 **교체**한다. 이 시점에 리터럴은 전부 `crew-quality` 다 (Task 2 가 옮겨간 둘을 재타깃한다).

교체 대상 산문 (파일마다 문구가 조금씩 다르다):

```
Resolve `CREW_CAP` and `PHASE_DIR` as in the other Crew wrappers.
Resolve `CREW_CAP` exactly as the code-review wrapper does, then:
Resolve `CREW_CAP` and `PHASE_DIR` using the same pattern as other Crew
Resolve `CREW_CAP` and `PHASE_DIR`.
```

넣을 블록:

````markdown
Resolve the capability directory in this order:

```bash
if [ -d ".gsd/capabilities/crew-quality" ]; then
  CREW_CAP=".gsd/capabilities/crew-quality"
elif [ -d "$HOME/.gsd/capabilities/crew-quality" ]; then
  CREW_CAP="$HOME/.gsd/capabilities/crew-quality"
elif [ -d "capabilities/crew-quality" ]; then
  CREW_CAP="capabilities/crew-quality"
else
  echo "BLOCKED: crew-quality capability directory not found"
  exit 1
fi
```

Use the first positional `$ARGUMENTS` token as a phase number/path when present.
Resolve it with:

```bash
PHASE_TOKEN=${PHASE_NUMBER:-$(printf '%s' "$ARGUMENTS" | awk '{print $1}')}
PHASE_DIR=$(node "$CREW_CAP/checks/lib/resolve-phase-dir.cjs" "$PHASE_TOKEN")
```

If phase resolution fails, stop with `BLOCKED` rather than guessing.
````

> `crew-guide/skills/crew-gsd/SKILL.md` 는 **건드리지 않는다.** 셸 대입 블록은 없지만 산문에서 자기 id 인 `crew-guide` 를 이미 명시하므로 펜스를 통과한다. 형식을 통일하려고 손대면 무변경이어야 할 capability 에 커밋이 생긴다.

- [ ] **Step 5: 녹색 확인**

```bash
node --test e2e/contract/capability-split.test.cjs
npm run test:l1 2>&1 | tail -4
```

기대: 펜스 `pass 5` · `fail 0`. 전체 L1 **`tests 101` · `pass 101` · `fail 0`** (기준 96 + 펜스 5).

- [ ] **Step 6: 반증 — 다섯 펜스가 각각 무엇을 막는지 실증한다**

임시 복사본에서만 한다. **저장소에서 하지 않는다.** 각 변조를 서로 다른 복사본에 하나씩 적용하고 `node --test e2e/contract/capability-split.test.cjs` 를 돌린다.

| # | 변조 | 기대 실패 메시지 |
|---|---|---|
| 1 | `capabilities/crew-extra/capability.json` 을 하나 더 놓는다 | `Expected values to be strictly deep-equal` (CAPABILITIES ≠ 디스크) |
| 2 | 아무 매니페스트에 `"requires": ["crew-quality"]` | `a non-empty requires makes the capability uninstallable` |
| 3 | 아무 step 의 `consumes` 에 남의 아티팩트 추가 | `split a produces/consumes chain and the install refuses it` |
| 4 | 아무 SKILL.md 의 capability 리터럴을 남의 것으로 | `a skill that resolves CREW_CAP must name its own capability` |
| 5 | config 키 하나를 두 매니페스트에 선언 | `a config key must have exactly one owning capability` |

기대: **다섯 전부 정확히 `pass 4` · `fail 1`.** 두 개 이상 죽으면 펜스끼리 겹치는 것이고, 하나도 안 죽으면 그 펜스는 빈 껍데기다.

- [ ] **Step 7: 커밋**

```bash
git status --porcelain | grep '^??'; echo "(미추적 파일 끝)"
```

기대: 정확히 한 줄 — `?? e2e/contract/capability-split.test.cjs`. 그 외에 있으면 Step 6 이 저장소 안에 산출물을 떨군 것이므로 지우고 다시 본다.

```bash
git add bin/crew.cjs e2e/contract/capability-split.test.cjs capabilities/crew-quality/skills
git commit -m "test: fence the capability split contract and make every skill name its own capability"
git status --short; echo "(끝 — 비어 있어야 한다)"
```

기대 diffstat: **6 files changed, 204 insertions(+), 9 deletions(-)** (실측).

---

### Task 2: 릴리스 표면을 `crew-ship` 으로 분리

**Files:**
- Create: `capabilities/crew-ship/capability.json`
- Move: checks 5개 · skills 2개 (위 File Structure 표)
- Modify: `capabilities/crew-quality/capability.json` · `scripts/build-capabilities.cjs` · `bin/crew.cjs` · `e2e/assert-hooks.cjs` · `e2e/run-live.cjs` · `e2e/contract/prerelease-fence.test.cjs` · `tests/` 파이썬 5개

**Interfaces:**
- Consumes: Task 1 의 `require('bin/crew.cjs').CAPABILITIES` 와 `capability-split.test.cjs`.
- Produces: `capabilities/crew-ship/` — Task 3 의 완료 판정 대상.

> **왜 한 커밋인가.** 분해와 배선 사이의 트리는 어느 쪽도 아니다 — 매니페스트는 쪼개졌는데 `LIB_MAP` 과 `CAPABILITIES` 는 셋을 가리키고, 파이썬 스모크는 옛 경로를 부른다. 그 중간 상태를 커밋하면 `git bisect` 가 M1b 안에서 길을 잃는다. M1a Task 1 과 같은 규율이다.

- [ ] **Step 1: 분해 스크립트를 쓴다**

`scripts/` 가 아니라 임시 디렉터리에 쓴다. **저장소에 남기지 않는다** — 한 번만 도는 일회용이고, 남기면 다음 사람이 다시 돌릴 수 있는 무언가로 오해한다.

```bash
SPLIT_DIR=$(mktemp -d); echo "$SPLIT_DIR"
```

`"$SPLIT_DIR/split-to-crew-ship.cjs"`:

```js
#!/usr/bin/env node
'use strict';
// M1b: crew-quality(God capability) 에서 릴리스 표면을 crew-ship 으로 떼어낸다.
// 스킬·checks 는 git mv, 매니페스트는 키 단위 이관. 새 내용은 만들지 않고 기존 것만 옮긴다.
//
// requires 는 [] 로 둔다. GSD 1.11.0 은 capability-source.cts:836 에서 검증 맵에 설치
// 중인 capability 하나만 넣으므로 requires 가 비어 있지 않으면 대상이 이미 active 여도
// 거부한다(실측). 의존 순서는 bin/crew.cjs 의 CAPABILITIES 배열이 소유한다.

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = cp.execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
const CAPS = path.join(ROOT, 'capabilities');
const SRC = 'crew-quality';

// 분해표. checks 는 SKILL.md 와 게이트가 실제로 부르는 것만 실측해서 배분했다.
const SPLIT = {
  'crew-ship': {
    title: 'Crew Release Ownership',
    description: 'Release ownership for Crew. Owns the ship guard, the release ledger, and the post-ship document/canary/retro sessions.',
    skills: ['crew-gsd-postship', 'crew-gsd-release'],
    checks: ['ship-guard-control.cjs', 'release-ledger.cjs', 'canary-session.cjs',
             'docs-release-session.cjs', 'retro-record.cjs'],
    config: (k) => k.startsWith('crew.ship.')
      || k === 'crew.gstack.post_ship_enabled'
      || k.startsWith('crew.gstack.document_release_')
      || k.startsWith('crew.gstack.canary_')
      || k.startsWith('crew.gstack.retro_'),
    stepSkills: ['crew-gsd-postship'],
    gateChecks: ['ship-guard-control.cjs'],
  },
};

const git = (...a) => cp.execSync(`git ${a.join(' ')}`, { cwd: ROOT, stdio: 'pipe' });
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');

const srcManifestPath = path.join(CAPS, SRC, 'capability.json');
const src = readJson(srcManifestPath);

// 1) 매니페스트를 먼저 계획한다. 파일을 옮기기 전에 전수 판정이 끝나야 반쪽 트리가
//    남지 않는다 (build-capabilities 의 2-패스와 같은 규율).
const plans = [];
for (const [id, spec] of Object.entries(SPLIT)) {
  const cfg = {};
  for (const k of Object.keys(src.config)) if (spec.config(k)) cfg[k] = src.config[k];
  const steps = src.steps.filter((s) => spec.stepSkills.includes(s.ref && s.ref.skill));
  const gates = src.gates.filter((g) => spec.gateChecks.some(
    (c) => g.check.predicate.command.includes(`/checks/${c}"`)));
  if (!Object.keys(cfg).length) throw new Error(`${id}: no config keys matched`);
  if (!steps.length) throw new Error(`${id}: no steps matched`);
  if (!gates.length) throw new Error(`${id}: no gates matched`);
  plans.push({ id, spec, cfg, steps, gates });
}

// 2) 남는 쪽이 정확히 여집합인지 확인한다. 하나라도 새거나 겹치면 멈춘다.
const takenCfg = new Set(plans.flatMap((p) => Object.keys(p.cfg)));
const takenSteps = new Set(plans.flatMap((p) => p.steps));
const takenGates = new Set(plans.flatMap((p) => p.gates));
if (takenCfg.size !== plans.reduce((n, p) => n + Object.keys(p.cfg).length, 0)) {
  throw new Error('config key claimed by two capabilities');
}
const keepCfg = {};
for (const k of Object.keys(src.config)) if (!takenCfg.has(k)) keepCfg[k] = src.config[k];
const keepSteps = src.steps.filter((s) => !takenSteps.has(s));
const keepGates = src.gates.filter((g) => !takenGates.has(g));
const keepSkills = src.skills.filter((s) => !plans.some((p) => p.spec.skills.includes(s)));

// 3) 적용.
for (const { id, spec, cfg, steps, gates } of plans) {
  const dir = path.join(CAPS, id);
  fs.mkdirSync(path.join(dir, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'checks'), { recursive: true });
  writeJson(path.join(dir, 'capability.json'), {
    id, role: src.role, version: src.version,
    title: spec.title, description: spec.description,
    tier: src.tier, requires: [], engines: src.engines, runtimeCompat: src.runtimeCompat,
    skills: spec.skills, agents: [], hooks: [], config: cfg,
    steps, contributions: [], gates,
  });
  for (const stem of spec.skills) {
    git('mv', `capabilities/${SRC}/skills/${stem}`, `capabilities/${id}/skills/${stem}`);
  }
  for (const f of spec.checks) {
    git('mv', `capabilities/${SRC}/checks/${f}`, `capabilities/${id}/checks/${f}`);
  }
  // checks/lib 사본은 옮기지 않는다 — build-capabilities 가 canonical lib/ 에서 다시 심는다.
  // 손으로 복사하면 LIB-HASH.json 없는 사본이 되어 "출처 증명 불가"로 빌드가 거부된다.
}

src.skills = keepSkills;
src.config = keepCfg;
src.steps = keepSteps;
src.gates = keepGates;
writeJson(srcManifestPath, src);

console.log(JSON.stringify({
  moved: plans.map((p) => ({
    id: p.id, skills: p.spec.skills.length, checks: p.spec.checks.length,
    config: Object.keys(p.cfg).length, steps: p.steps.length, gates: p.gates.length })),
  kept: { skills: keepSkills.length, config: Object.keys(keepCfg).length,
          steps: keepSteps.length, gates: keepGates.length },
}, null, 2));
```

`tier` 는 `crew-quality` 의 것을 그대로 물려받는다(현재 `"full"`). 설계 §5.1 은 `standard` 를 적지만 **우리 저장소에도 GSD 에도 tier 소비처가 없다** — GSD 는 `requires` 단조성 규칙에만 쓰는데 `requires` 가 비어 있어 무효다. 값을 바꾸면 무변경이어야 할 것에 변경이 생긴다. 소유자: 범위 밖.

- [ ] **Step 2: 돌리고 산술을 확인한다**

```bash
node "$SPLIT_DIR/split-to-crew-ship.cjs"
```

기대 출력:

```json
{
  "moved": [{ "id": "crew-ship", "skills": 2, "checks": 5, "config": 13, "steps": 1, "gates": 1 }],
  "kept":  { "skills": 3, "config": 12, "steps": 3, "gates": 4 }
}
```

합계가 여집합인지 눈으로 다시 센다: `3+2=5` skills · `12+13=25` config · `3+1=4` steps · `4+1=5` gates. 하나라도 어긋나면 멈춘다.

되돌리기 (Task 1 을 이미 커밋했으므로 펜스 파일은 추적 상태라 안전하다):

```bash
git checkout -- . && git clean -fd
```

- [ ] **Step 3: 옮겨간 두 SKILL.md 를 재타깃한다**

Task 1 Step 4 에서 넣은 블록의 리터럴이 아직 `crew-quality` 다. `capabilities/crew-ship/skills/crew-gsd-postship/SKILL.md` 와 `.../crew-gsd-release/SKILL.md` 안의 `crew-quality` 를 전부 `crew-ship` 으로 바꾼다 — 경로 세 줄과 `BLOCKED:` 메시지 한 줄, 파일당 4곳이다.

```bash
grep -c crew-quality capabilities/crew-ship/skills/*/SKILL.md   # 각각 0 이어야 한다
grep -c crew-ship    capabilities/crew-ship/skills/*/SKILL.md   # 각각 6 이어야 한다
```

- [ ] **Step 4: `LIB_MAP` 을 늘린다**

`scripts/build-capabilities.cjs`:

```js
const LIB_MAP = {
  'crew-quality': ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs'],
  'crew-ship': ['repo-state-lib.cjs', 'resolve-phase-dir.cjs'],
};
```

> **정렬하지 말 것.** `e2e/contract/lib-hash.test.cjs:206` 이 이 리터럴을 **문자열로 치환**해 키 순서 무관성을 검사한다. 콜론 뒤에 공백을 하나 더 넣어 열을 맞추면 그 치환이 실패하고 테스트가 `the LIB_MAP literal must be substitutable` 로 죽는다(실측). 보기 좋게 만드는 편집이 계약을 깨는 자리다.

`crew-ship` 이 `evidence-store.cjs` 를 안 받는 이유: 옮겨간 다섯 checks 중 그것을 `require` 하는 것이 없고 두 SKILL.md 도 부르지 않는다. `resolve-phase-dir.cjs` 는 Step 3 이 넣은 `PHASE_DIR` 해석 줄이 부르므로 필요하다.

```bash
npm run build:caps
```

기대: `created capabilities/crew-ship/checks/lib/repo-state-lib.cjs` · `...resolve-phase-dir.cjs` · `recorded .../LIB-HASH.json` · `build-capabilities: ok`.

- [ ] **Step 5: 설치 목록을 늘린다**

`bin/crew.cjs`:

```js
const CAPABILITIES = ['crew-discipline', 'crew-quality', 'crew-ship', 'crew-guide'];
```

> 이 배열은 설치·갱신 순서이자 (역순으로) 제거 순서다. `requires` 를 못 쓰는 지금 **의존 순서를 표현하는 유일한 자리**다. `crew-ship` 을 `crew-quality` 뒤에 두는 것은 릴리스 표면이 품질 표면 뒤에 온다는 파이프라인 순서를 그대로 적은 것이다.

- [ ] **Step 6: 배선을 고친다 — 여덟 파일**

각각이 왜 지금 틀렸는지가 중요하다. 전부 "capability id 를 리터럴로 들고 있다"는 같은 병이다.

**`e2e/assert-hooks.cjs`** — `capId` 두 곳:

```js
requireOne(shipPre, {capId:'crew-ship',kind:'gate',commandIncludes:'ship-guard-control.cjs'}, 'GSD ship authorization gate');
const post = requireOne(shipPost, {capId:'crew-ship',kind:'step',skill:'crew-gsd-postship'}, 'post-ship release adapter');
```

`security-ready.cjs` 게이트는 `crew-quality` 그대로다 — `crew-gsd-sec` 은 옮기지 않는다.

**`e2e/run-live.cjs`** — `ROOT` 정의 바로 뒤에 한 줄 추가하고, `['crew-discipline','crew-quality','crew-guide']` 리터럴 **4곳**과 `copyTree` 3줄을 그것으로 바꾼다:

```js
const CAP_IDS = require(path.join(ROOT,'bin','crew.cjs')).CAPABILITIES;
```

```js
  // 설치자가 소유한 목록을 그대로 쓴다. L2 가 자기 목록을 따로 들면 갈라져도 아무도 모른다.
  for (const id of CAP_IDS) copyTree(path.join(ROOT,'capabilities',id), path.join(root,'capabilities',id));
```

**`e2e/contract/prerelease-fence.test.cjs`** — 리터럴 순회를 디렉터리 스캔으로:

```js
  // 디스크를 읽는다. id 를 리터럴로 열거하면 capability 가 늘어날 때 이 테스트만 조용히
  // 낡아 프리릴리스 펜스가 아니라 버전 불일치를 검사하게 된다.
  for (const id of fs.readdirSync(path.join(pkg, 'capabilities'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name)) {
```

**`tests/run_installer_smoke.py`**:

```python
        expected_caps={p.name for p in (ROOT/"capabilities").iterdir() if p.is_dir()}
        assert ids==expected_caps,(ids,expected_caps)
```

**`tests/run_npx_tarball_smoke.py`** — 같은 모양. 이 줄은 `try:` 안이라 **들여쓰기 8칸**이다 (4칸으로 넣으면 `SyntaxError: expected 'except' or 'finally' block` 이 난다 — 실측):

```python
        expected={p.name for p in (ROOT/"capabilities").iterdir() if p.is_dir()}
        assert {x["id"] for x in rows}==expected,({x["id"] for x in rows},expected)
```

**`tests/run_local_smoke.py`**:

```python
# 이 스모크가 부르는 것은 ship-guard-control · release-ledger · canary-session ·
# docs-release-session 넷뿐이고 M1b 가 전부 crew-ship 으로 옮겼다.
CHECKS=ROOT/"capabilities"/"crew-ship"/"checks"
```

**`tests/run_installed_lib_smoke.py`** — 이 스모크는 설치된 `checks/lib/repo-state-lib.cjs` 를 전부 찾아 각각의 형제 `evidence-store.cjs` 를 같이 `require` 한다. 분해 후 `crew-ship` 사본에는 그게 없어 `MODULE_NOT_FOUND` 로 죽는다. 형제 참조 증명은 유지하되 없는 곳은 건너뛰고, **한 번도 못 돌면 실패**하게 한다:

```python
    # M1b 이후 evidence-store 사본은 crew-quality 에만 심긴다(LIB_MAP). 형제 참조 해석은
    # 그 사본에서 증명하고, 나머지 사본은 단독 로드만 확인한다. 형제 쌍을 한 번도 못
    # 돌았으면 아래에서 실패한다 — 증명이 조용히 사라지는 것을 막는다.
    siblings_exercised = 0
    for lib in hits:
        args = [str(lib)]
        ev = lib.parent / "evidence-store.cjs"
        if ev.exists():
            args.append(str(ev)); siblings_exercised += 1
        r = subprocess.run(
            ["node", "-e",
             "for(const m of process.argv.slice(1))require(m);console.log('ok')",
             *args],
            capture_output=True, text=True)
        assert r.returncode == 0 and "ok" in r.stdout, f"{lib}: {r.stderr}"

    assert siblings_exercised, ("no installed copy paired repo-state-lib with "
                                "evidence-store — the sibling-require proof stopped running")
```

**`tests/validate_prototype.py`** — ship 표면 검사의 소유자와 capability 순회 둘 다:

```python
    if name == "crew-ship":
```

```python
    for name in sorted(p.name for p in CAPS.iterdir() if p.is_dir()):
```

- [ ] **Step 7: L1**

```bash
npm run test:l1 2>&1 | tail -4
```

기대: **`tests 101` · `pass 101` · `fail 0`.** 새 테스트는 없다 — Task 1 이 이미 101 로 올려놓았고 Task 2 는 그 101 을 계속 통과시킨다. 개수가 늘었다면 의도치 않은 테스트가 딸려 들어온 것이다.

- [ ] **Step 8: 파이썬 스모크 4종 — 종료 코드를 명시적으로 본다**

```bash
for t in run_installer_smoke run_installed_lib_smoke run_local_smoke run_v061_l0; do
  python tests/$t.py >/tmp/$t.log 2>&1; printf "%-26s exit=%s\n" $t $?
done
```

기대: 넷 다 `exit=0`.

> **파이프 뒤에서 `$?` 를 읽지 말 것.** `python tests/x.py 2>&1 | grep PASS; echo $?` 는 `grep` 의 종료 코드를 준다. 이 계획을 쓰는 동안 실제로 그렇게 읽어 "L0 전부 PASS" 라고 잘못 결론냈다 — `run_v061_l0.py` 는 그때 `run_local_smoke.py` 에서 죽고 있었다.

- [ ] **Step 9: 패키징**

```bash
npm run test:pack 2>&1 | tail -3
```

기대: `PASS npx-local-tarball-install` · `crew-harness-0.7.0-dev.tgz`.

- [ ] **Step 10: 커밋**

```bash
git status --porcelain | grep '^??'; echo "(미추적 파일 끝)"
```

기대: `capabilities/crew-ship/` 하나. `e2e/E2E-RESULT.json` 이 보이면 M0 의 ignore 설정이 깨진 것이다.

```bash
git add -A
git commit -m "refactor: split the release surface out of crew-quality into crew-ship"
git status --short; echo "(끝 — 비어 있어야 한다)"
git diff --stat v0.7.0-m1a | tail -1
```

기대 누계 diffstat (Task 1 + Task 2, `v0.7.0-m1a` 대비): **25 files changed, 681 insertions(+), 145 deletions(-)** — 이동 7 · 신규 5 · 수정 13 (실측).

---

### Task 3: M1b 완료 판정 + 롤백 태그

**Files:** 검증 전용. 마지막에 태그 하나와 `docs/RENAME-MAP.md` 갱신.

**Interfaces:**
- Consumes: Task 2 의 커밋.
- Produces: 태그 `v0.7.0-m1b`.

> **왜 별도 태스크인가.** M1b 의 통과 조건(설계 §5)은 "L1 통과 + `crew doctor` READY" 인데, 이 단계의 진짜 위험은 **L1 도 mock L0 도 보지 못하는 곳**에 있다 — capability 경계를 넘는 step 순서. 그건 실제 GSD 로 렌더해야만 보인다.

- [ ] **Step 1: 실제 GSD 설치 왕복**

```bash
PROJ=$(mktemp -d); (cd "$PROJ" && git init -q . && git commit -q --allow-empty -m base)
node bin/crew.cjs install --project "$PROJ" --yes --no-bootstrap --allow-prerelease
ls "$PROJ/.claude/skills"
find "$PROJ/.claude/skills" -name '.crew-skill' | wc -l
node bin/crew.cjs doctor --project "$PROJ" | tail -1
```

기대:
- 스킬 6개: `crew-gsd crew-gsd-postship crew-gsd-qa crew-gsd-release crew-gsd-review crew-gsd-sec`
- 마커 6개
- **`READY=true PASS=18 WARN=0 FAIL=0`**

> `PASS` 가 17 에서 **18** 로 는다. capability 하나가 늘면 스테이징 검사가 하나 붙는다. 17 이 그대로 나오면 `crew-ship` 이 설치 경로에 안 들어간 것이다 — `CAPABILITIES` 를 다시 본다.

```bash
node bin/crew.cjs uninstall --project "$PROJ" --yes
ls "$PROJ/.claude/skills" 2>/dev/null; ls -d "$PROJ/.crew" 2>/dev/null
grep -c 'crew:managed-routing' "$PROJ/CLAUDE.md" 2>/dev/null || echo 0
```

기대: 셋 다 비어 있음 / 없음 / `0`.

- [ ] **Step 2: 실제 GSD 렌더 — 이 단계의 핵심 판정**

```bash
RP=$(mktemp -d); (cd "$RP" && git init -q . && git commit -q --allow-empty -m base)
GSD=~/.claude/gsd-core/bin/gsd-tools.cjs
for id in crew-discipline crew-quality crew-ship crew-guide; do
  (cd "$RP" && node "$GSD" capability install "$PWD/capabilities/$id" --scope project --yes) >/dev/null || echo "FAIL $id"
done
(cd "$RP" && node "$GSD" loop render-hooks execute:post --raw)
(cd "$RP" && node "$GSD" loop render-hooks ship:pre --raw)
```

기대 — `execute:post` 의 `activeHooks` 순서:

```
0: code-review    code-review        (GSD 1st-party)
1: crew-quality   crew-gsd-review
2: crew-quality   crew-gsd-qa
3: crew-quality   crew-gsd-sec
```

기대 — `ship:pre`:

```
0: crew-quality  gate  security-ready.cjs
1: crew-ship     gate  ship-guard-control.cjs
2: security      gate  (GSD 1st-party)
```

`FAIL <id>` 가 한 줄이라도 나오면 멈춘다. 순서가 다르면 멈춘다 — 특히 `crew-gsd-sec` 이 `crew-gsd-qa` 앞으로 오면 아티팩트 사슬이 끊어진 것이고, 그건 M1b 가 막으려던 바로 그 회귀다.

- [ ] **Step 3: 재현-비교 증명 — 커밋에 계획 밖의 것이 섞이지 않았는지**

`v0.7.0-m1a` 트리에 이 계획의 편집만 다시 적용해서 만든 트리가, 실제 커밋된 트리와 **바이트 동일**해야 한다.

```bash
A=$(mktemp -d); B=$(mktemp -d)
git archive v0.7.0-m1a | tar -x -C "$A"
git archive HEAD       | tar -x -C "$B"
# A 에서 Task 1·2 의 편집을 재적용한 뒤:
diff -r "$A" "$B"
```

기대: **빈 출력.**

> `git archive` 에 넘기는 것은 **커밋(또는 태그)** 이지 작업 트리가 아니다. 작업 트리를 비교하면 gitignore 된 `e2e/E2E-RESULT.json` 이 diff 에 뜬다 — M1a 에서 실제로 겪었다.

- [ ] **Step 4: 매핑 문서 갱신**

`docs/RENAME-MAP.md` 의 capability 표 아래에 M1b 의 분해를 한 문단으로 적는다 — 어떤 checks·skills·config 가 `crew-ship` 으로 갔는지, 그리고 **`crew-security` 가 왜 없는지**. 다음 사람이 설계 §5.1 을 읽고 "왜 9개가 아닌가"를 물을 때 답이 저장소 안에 있어야 한다.

```bash
git add docs/RENAME-MAP.md
git commit -m "docs: record the M1b capability split and why crew-security stayed"
npm run test:l1 2>&1 | tail -4
```

기대: `101/101`. `brand-names.test.cjs` 의 허용목록에 `docs/RENAME-MAP.md` 가 이미 있으므로 이 편집은 브랜드 펜스를 건드리지 않는다.

- [ ] **Step 5: 태그**

```bash
git tag -a v0.7.0-m1b -m "M1b: split the release surface into crew-ship; capabilities 3 -> 4, review/qa/security chain intact"
git tag | tail -4
git status --short; echo "(끝 — 비어 있어야 한다)"
```

기대: `v0.6.5` · `v0.7.0-m0` · `v0.7.0-m1a` · `v0.7.0-m1b`. **push 하지 않는다.**

---

### Task 4 (승인 게이트): `crew-security` 분리 경로

**사용자 승인 없이 착수하지 않는다.** 여기부터는 M1b 의 통과 조건 밖이다.

`crew-security` 를 떼어내려면 GSD 가 capability 경계를 넘는 `consumes` 를 해석해야 한다. 길은 둘뿐이다.

**A. `ungkey/gsd-core` 포크를 패치한다.** `capability-source.cts:836` 의 `new Map([[id, cap]])` 를 설치된 레지스트리 전체로 바꾼다. 그러면 `requires` 도 같이 살아난다. 비용: 상류 추적 포크가 갈라지고, 사용자 머신의 `~/.claude/gsd-core` 도 같이 갱신돼야 하며, 이후 모든 마일스톤이 GSD 코어 변경에 묶인다.

**B. 상류에 이슈로 올리고 기다린다.** 비용 0, 일정 통제 0.

두 경우 모두 분리 절차 자체는 이미 검증됐다 — 이 계획을 쓰는 동안 임시 트리에서 끝까지 돌렸고 L1·파이썬 스모크·mock L0·`test:pack` 이 전부 통과했으며, **실제 GSD 설치의 `consumes` 한 줄에서만** 막혔다. 되살릴 때 필요한 값:

| 항목 | 값 (실측) |
|---|---|
| skills | `crew-gsd-sec` |
| checks | `security-ready.cjs` · `security-risk.cjs` · `security-session.cjs` |
| `LIB_MAP` | `repo-state-lib.cjs` · `resolve-phase-dir.cjs` |
| config | `crew.gstack.security_*` 6개 |
| steps | execute:post × 1 (`consumes: ["SUMMARY.md","GSTACK-QA.json"]` — **이 줄이 관문이다**) |
| gates | ship:pre × 1 (`security-ready.cjs`) |
| `CAPABILITIES` | `['crew-discipline','crew-quality','crew-security','crew-ship','crew-guide']` |

`capability-split.test.cjs` 의 세 번째 펜스는 그때 **완화되어야 한다** — 지금은 그 분리를 막는 것이 옳지만, GSD 가 고쳐지면 같은 펜스가 정상적인 분해를 막는 장애물이 된다.

---

### Task 5 (승인 게이트): Windows L1 잡

M1a 에서 이월된 항목이다. `.github/workflows/l1.yml` 은 리눅스 러너 하나뿐이다. 판단은 사용자 몫이며 **M1c 이월 권장** — M1b 는 경로 조립 방식을 바꾸지 않았고 새 위험도 만들지 않았다.

---

## 자기 검토 기록

계획을 쓰면서 임시 트리에서 실제로 돌려 확인한 것들. 예측이 아니라 측정이다.

- **설계서의 분해안이 실행 불가라는 것을 리뷰가 아니라 설치가 알려줬다.** 처음에는 사용자 결정대로 5개(`crew-security` 포함)로 쪼갰다. L1 96/96 통과, 파이썬 스모크 전부 통과, mock L0 통과, `test:pack` 통과 — **그리고 실제 GSD 설치에서 죽었다.** 우리 테스트 전부가 초록인 상태에서 배포했다면 사용자 머신에서 처음 터졌을 것이다. Task 1 의 세 번째 펜스는 그 실패를 커밋 시점으로 당긴다.

- **`consumes` 를 지워서 통과시키는 것이 최악의 수였다.** 간선을 지우면 설치는 되지만 실제 GSD 렌더가 `review, sec, qa` 로 바뀐다 — 보안 리뷰가 QA 앞에서 돈다. "테스트가 통과하도록 매니페스트를 고친다"가 정확히 그 함정이었고, 실제 GSD 로 렌더해 보기 전까지는 아무 신호도 없었다.

- **`mock-gsd.cjs` 는 순서를 다른 규칙으로 정한다.** `readdirSync().sort()` 대 위상 정렬. 둘이 지금 같은 답을 주는 것은 `crew-quality` < `crew-security` 라는 알파벳 우연이다. **mock 이 초록이라는 사실은 순서 증거가 아니다.** Task 3 Step 2 가 mock 을 믿지 않는 이유다.

- **`CREW_CAP` 산문 크로스 참조는 분해 전에도 이미 결함이었다.** 다섯 스킬 중 넷이 "다른 Crew 래퍼와 같은 방식으로 정하라"고만 적었고, 실제 대입 블록은 `crew-quality` 리터럴을 든 한 곳뿐이었다. 같은 capability 안에 있을 때는 무해했지만 분해가 그걸 "남의 디렉터리를 가리키는 지시"로 바꾼다. 마크다운을 실행하는 테스트가 없으므로 런타임까지 조용하다. **분해가 만든 버그가 아니라 분해가 드러낸 버그다.**

- **`git mv` 로 옮기는 것은 checks 와 skills 뿐이다.** `checks/lib/` 사본은 옮기지 않는다 — `LIB-HASH.json` 없는 사본이 되어 `build-capabilities` 가 "출처 증명 불가"로 거부한다. M0 이 세운 규율이 그대로 작동한다: 사본의 출처는 도구만 만들 수 있다.

- **`LIB_MAP` 을 보기 좋게 정렬하면 계약이 깨진다.** `lib-hash.test.cjs:206` 이 그 리터럴을 문자열로 치환한다. 콜론 뒤 공백 하나가 `the LIB_MAP literal must be substitutable` 을 만든다 — 실측으로 겪었다. 코드 포매팅이 테스트의 전제인 자리다.

- **여덟 파일이 capability id 를 리터럴로 들고 있었다.** `prerelease-fence` · `run_installer_smoke` · `run_npx_tarball_smoke` · `validate_prototype` · `run-live` · `run_local_smoke` · `run_installed_lib_smoke` · `assert-hooks`. 전부 M1b 가 처음 늘리는 표면이라 지금까지 드러날 일이 없었다. 가능한 곳은 디렉터리 스캔이나 `CAPABILITIES` 참조로 바꿔 다음 분해(M2 의 `crew-flow`)가 같은 여덟 곳을 다시 고치지 않게 한다.

- **파이프 뒤의 `$?` 를 읽어 한 번 틀렸다.** "L0 12단계 전부 PASS" 라고 썼는데 그건 `E2E-RESULT.json` 안의 `run-live` 자체 단계였고, 래퍼 `run_v061_l0.py` 는 그 뒤 `run_local_smoke.py` 에서 죽고 있었다. `grep` 의 종료 코드를 python 의 것으로 읽은 결과다. Task 2 Step 8 이 종료 코드를 따로 찍는 형태인 이유다.

- **tier 는 아무도 안 본다.** 우리 저장소에 소비처 0, GSD 는 `requires` 단조성 규칙에만 쓰는데 그 `requires` 가 비어 있어 무효. 설계 §5.1 의 값(`standard`)으로 맞추고 싶은 유혹이 있었지만 그러면 무변경이어야 할 필드에 변경이 생긴다. 부모의 `full` 을 그대로 물려받는다.

- **`crew-guide` 스킬은 세 번째 형태였다.** 셸 대입 블록도 산문 위임도 아니고, 산문에서 자기 id 를 직접 명시한다. 펜스를 "자기 id 를 포함하고 남의 id 는 포함하지 않는다"로 잡으니 세 형태가 전부 판정된다 — 형식을 통일하려 했다면 무변경이어야 할 capability 를 건드렸을 것이다.

- **검증 방법.** `git archive` 로 임시 트리를 여섯 번 뜨고 그 안에서만 분해·반증·설치를 돌렸다. 실제 GSD 설치는 `mktemp -d` 로 만든 빈 git 저장소에 `--scope project` 로만 했다 — `~/.gsd` 는 건드리지 않았고 사후 확인했다. 저장소 작업 트리는 이 계획서 한 파일 외에 변경 없음.

## 범위 밖으로 남긴 것

발견했지만 M1b 에서 하지 않는 것들. 전부 소유자를 적었다.

- **`crew-security` 분리.** GSD 1.11.0 의 단일 항목 capMap 이 막는다. 소유자: Task 4(승인 게이트).
- **`crew-core` 신설.** M0 이 공유 lib 을 capability 별 사본으로 해결해 담을 것이 없다. `crew.mode`·`crew.gate.*`·`crew.gap.*` 키가 생기는 시점에 만든다. 소유자: M2.
- **`crew-flow`·`crew-demo`·`crew-concept`.** 내용물이 각 마일스톤에 있다. 소유자: M2·M5·M7.
- **config 키 재명명** (`crew.gstack.*` → `crew.review.*`/`crew.qa.*`/`crew.security.*`/`crew.ship.*`). 설계 §5.1 이 적지만 M1a 직후 두 번째 breaking config 변경이 된다. 소유자: M1d 또는 M7 릴리스 노트.
- **tier 값을 설계 §5.1 에 맞추기.** 소비처가 없어 순수 표기 변경이다. 소유자: M1d.
- **`capabilities/crew-guide/checks/workflow-guide.cjs` 의 교차 capability 경로 추측.** 137~139 행이 `crew-quality/checks` 를 세 후보 경로로 찾는다. `${GSD_CAP_DIR}` 경계를 우회하는 구조이고, M1b 는 plan-review 를 `crew-quality` 에 남겨 두어 지금은 맞는다. 소유자: M1d(doctor 신규 검사와 함께).
- **`gsd-core` 의 단일 항목 capMap 을 상류에 보고.** 우리 쪽 수정은 아니지만 M2 이후의 모든 분해가 여기 걸린다. 소유자: 사용자(이슈 제출 여부).
- **Windows L1 잡.** 소유자: Task 5(승인 게이트) 또는 M1c.
- **`tc-*` 임시 디렉터리 접두사 개명.** M1a 에서 이월. 소유자: M1c.

## Implementation Tasks

- [ ] **T1** `bin/crew.cjs` 에 `module.exports = { CAPABILITIES }` 와 `require.main` 가드 추가 (Task 1 Step 1)
- [ ] **T2** `e2e/contract/capability-split.test.cjs` 5종 작성 (Task 1 Step 2)
- [ ] **T3** 적색 확인 `pass 4 · fail 1`, 대상 스킬 4개 열거 확인 (Task 1 Step 3)
- [ ] **T4** SKILL.md 4개의 `CREW_CAP` 블록 자기완결화 (Task 1 Step 4)
- [ ] **T5** 녹색 확인 — 펜스 `pass 5`, 전체 L1 `101/101` (Task 1 Step 5)
- [ ] **T6** 반증 5종 — 각각 정확히 `fail 1` (Task 1 Step 6)
- [ ] **T7** Task 1 커밋 (기대 `6 files changed, +204/-9`)
- [ ] **T8** 분해 스크립트 작성·실행, 산술 `2/5/13/1/1` + `3/12/3/4` 확인 (Task 2 Step 1~2)
- [ ] **T9** 옮겨간 SKILL.md 2개 `crew-ship` 재타깃 (Task 2 Step 3)
- [ ] **T10** `LIB_MAP` 에 `crew-ship` 추가 + `npm run build:caps` (Task 2 Step 4)
- [ ] **T11** `CAPABILITIES` 에 `crew-ship` 추가 (Task 2 Step 5)
- [ ] **T12** 배선 8파일 수정 (Task 2 Step 6)
- [ ] **T13** L1 `101/101` · 파이썬 4종 `exit=0` · `test:pack` PASS (Task 2 Step 7~9)
- [ ] **T14** Task 2 커밋 (기대 누계 `25 files changed, +681/-145`)
- [ ] **T15** 실제 GSD 설치 왕복 — 스킬 6 · 마커 6 · `READY=true PASS=18` · 제거 후 잔여 0 (Task 3 Step 1)
- [ ] **T16** 실제 GSD 렌더 — `execute:post` 가 review·qa·sec 정순, `ship:pre` 가 security-ready·arm (Task 3 Step 2)
- [ ] **T17** 재현-비교 diff 빈 출력 (Task 3 Step 3)
- [ ] **T18** `docs/RENAME-MAP.md` 에 분해 기록 + `crew-security` 부재 사유 (Task 3 Step 4)
- [ ] **T19** 태그 `v0.7.0-m1b` (push 금지) (Task 3 Step 5)
