# 이름 매핑 (M1a)

`v0.7.0-m1a` 에서 브랜드 식별자를 `crew` 계열로 1:1 개명했다. 구 이름은 이 문서와
아래 동결 목록, 그리고 아직 개명되지 않은 GitHub 저장소 경로 `ungkey/triple-crown`
(`install.sh`, `install.ps1`, `package.json`, `README.md`, `docs/INSTALLER.md` — 아래
'바꾸지 않은 것' 참조. 이 파일들은 동결 목록이 아니다)에만 남는다.
`e2e/contract/brand-names.test.cjs` 가 그 외 어디에도 구 이름이 없음을 매 커밋 검사한다.

## 매핑표

| 구분 | 구 이름 | 신 이름 |
|---|---|---|
| npm 패키지 | `triple-crown-workflow-installer` | `crew-harness` |
| CLI | `triple-crown` | `crew` |
| npm bin alias | `triple-crown-install` | `crew-install` |
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

## M1b 분해 — `crew-ship` (v0.7.0-m1b)

`v0.7.0-m1b` 에서 `crew-quality` 의 **릴리스 표면**을 `crew-ship` 으로 떼어냈다. capability 는
3개에서 **4개**가 됐다 — `crew-discipline` · `crew-quality` · `crew-ship` · `crew-guide`.
`bin/crew.cjs` 의 `CAPABILITIES` 배열이 이 순서를 소유하고, `e2e/contract/capability-split.test.cjs`
의 첫 펜스가 디스크와의 완전 일치를 매 커밋 검사한다.

| 구분 | 구 위치 (`crew-quality`) | 신 위치 (`crew-ship`) |
|---|---|---|
| check | `checks/ship-guard-control.cjs` | `checks/ship-guard-control.cjs` |
| check | `checks/release-ledger.cjs` | `checks/release-ledger.cjs` |
| check | `checks/canary-session.cjs` | `checks/canary-session.cjs` |
| check | `checks/docs-release-session.cjs` | `checks/docs-release-session.cjs` |
| check | `checks/retro-record.cjs` | `checks/retro-record.cjs` |
| 스킬 | `skills/crew-gsd-postship/` | `skills/crew-gsd-postship/` |
| 스킬 | `skills/crew-gsd-release/` | `skills/crew-gsd-release/` |
| step | `ship:post` (`crew-gsd-postship`) | 값 동일 — 소유 capability 만 바뀐다 |
| gate | `ship:pre` (`ship-guard-control.cjs arm-gsd`) | 값 동일 — 소유 capability 만 바뀐다 |
| config 13개 | `crew.ship.*` 3 · `crew.gstack.post_ship_enabled` · `crew.gstack.document_release_*` 3 · `crew.gstack.canary_*` 3 · `crew.gstack.retro_*` 3 | 동일 키, 소유자만 `crew-ship` |

`crew-quality` 는 config 키 12개(plan review 1 · code review 3 · qa 2 · security 6), check 11개,
스킬 3개(`crew-gsd-review` · `crew-gsd-qa` · `crew-gsd-sec`)를 유지한다. 13 + 12 = 25 로, 상위 문서
`docs/RESTRUCTURE-PLAN.md` D5 가 센 "config 키 25개"와 같다 — **키는 하나도 늘거나 줄지 않았다.**

**옮긴 check 다섯은 내용이 한 글자도 바뀌지 않았다** — `git diff -M --find-renames --summary
v0.7.0-m1a v0.7.0-m1b -- capabilities` 가 다섯 개 전부 `(100%)` 로 잡는다. 스킬 두 개는 `CREW_CAP`
대입만 `crew-ship` 으로 재타깃했다. `crew-ship/checks/lib/` 는 M0 빌드 규약대로
`repo-state-lib.cjs` · `resolve-phase-dir.cjs` 사본과 `LIB-HASH.json` 을 새로 갖는다 —
`crew-quality/checks/lib/` 는 손대지 않았다(`evidence-store.cjs` 포함 3개 그대로).

### `crew-security` 가 왜 없는가

`docs/RESTRUCTURE-PLAN.md` §5.1 의 분해안과 `docs/V0.7-IMPLEMENTATION-DESIGN.md` §5 는 M1b 가
`crew-quality` 를 9개로 쪼갠다고 적었다. **GSD 1.11.0 에서는 성립하지 않는다.**
`gsd-core src/capability-source.cts:836` 이 검증 맵을 `new Map([[id, cap]])` — **설치 중인
capability 하나뿐** — 으로 만들기 때문에

- 교차 capability `requires` 는 대상이 이미 active 여도 `requires "X" which does not exist` 로
  거부된다. 그래서 네 capability 전부 `requires: []` 이고, 의존 순서는 `CAPABILITIES` 배열이
  대신 소유한다.
- 교차 capability `consumes` 는 `never produced by any host artifact or capability hook` 으로
  거부된다.

`crew-gsd-sec` 의 `execute:post` step 은 `crew-gsd-qa` 가 만드는 `GSTACK-QA.json` 을 consume 한다.
떼어내면 두 번째 규칙에 걸려 설치가 거부되고, 간선을 지워 피하면 GSD 의 위상 정렬
(`capability-validator.cjs` `topoSortHookEntries`)이 바뀌어 `review → qa → sec` 사슬이
`review → sec → qa` 로 렌더된다(실측). 즉 **아티팩트 사슬로 묶인 step 은 같은 capability 안에
있어야 한다.** `crew-ship` 이 먼저 나갈 수 있었던 이유는 그 `ship:post` step 의 `consumes` 가
GSD 자신이 만드는 `UAT.md` 하나뿐이라 사슬을 끊지 않기 때문이다.

`crew-core`(M2) · `crew-flow`(M2) · `crew-demo`(M5) · `crew-concept`(M7) 도 M1b 에 없다 — 각자
시점 소관이다(`docs/V0.7-IMPLEMENTATION-DESIGN.md` §5 · §10). `crew-security` 는 GSD 가 단일 항목
capMap 을 고친 뒤에 다시 본다. 실측 근거는
`docs/superpowers/plans/2026-08-21-m1b-capability-split.md` 에, 계약은
`e2e/contract/capability-split.test.cjs` 의 펜스 8종에 있다.

## 바꾸지 않은 것

- **아티팩트 이름** — `GSTACK-CODE-REVIEW.json`, `GSTACK-QA.json`, `GSTACK-PLAN-REVIEW.json`,
  `GSTACK-SECURITY.json`, `GSTACK-CANARY.json`, `GSTACK-RETRO.json`, `GSTACK-DOCUMENT-RELEASE.json`,
  `GSTACK-QA-UAT-BRIDGE.json`, `MUTATION.json`, `EVIDENCE.json`. 이름을 바꾸면 진행 중인
  phase 의 증거가 통째로 무효화된다 (설계 §3.1). 단, `EVIDENCE.json` **레코드 안**의
  `producer` 필드 값(`lib/evidence-store.cjs:182` — `opts.producer || 'crew'`)은 개명
  대상이라 바뀌었다: `docs/EVIDENCE-CONTRACT.md:30` 은 새 값(`"crew-gsd-review"` 등)을
  문서화하지만, M1a 이전에 기록된 레코드는 구 문자열을 그대로 담고 있다. 이 필드를
  읽거나 걸러내는 코드가 없으므로(확인됨) 진행 중인 phase 의 증거는 무효화되지 않는다.
- **`gstack` 단독 토큰** — 외부 도구(garrytan/gstack)를 가리킨다. `~/.gstack`,
  `~/.claude/skills/gstack/`, `/plan-eng-review`, `/review`. config 키의 중간 마디
  `crew.gstack.*` 도 이 도구와의 다리를 뜻하므로 유지한다.
- **GSD 표면** — `.gsd/`, `gsd-tools`, `gsd-` capability id 예약 접두사.
- **GitHub 경로** — `ungkey/triple-crown`. 저장소 개명은 별도 승인 작업이다.
- **`crew.superpowers.*` config 키** — `crew-discipline` capability
  (`capabilities/crew-discipline/capability.json:25`)가 여전히
  `crew.superpowers.enabled` 를 선언한다. `docs/RESTRUCTURE-PLAN.md:436` 은 이를
  최종적으로 `crew.discipline.*` 로 정리하는 것을 목표로 하지만, M1a 는 문자열
  치환만 수행했고 config 네임스페이스 재설계는 그 범위 밖이다. `crew.gstack.*` 와
  같은 이유로 지금은 남겨둔다 — M1b 가 이 괴리를 버그로 읽지 않도록 여기 기록한다.
- **`tripleCrownVersion` → `crewVersion` 치환 규칙** — 개명 계획에는 있었지만 실제로는
  한 번도 발동하지 않았다. 유일한 등장 위치가 동결 대상인
  `e2e/compatibility-baseline.json:58` 이었기 때문이다 (§ 동결 목록 참조). 매핑표에는
  올리지 않는다 — 규칙은 존재했지만 결과가 없었다.
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
7. isGuardHook() 이 인식하지 못해 남는 중복 PreToolUse(Bash) 훅 그룹 — 옛/새 가드가
   Bash 호출마다 둘 다 실행된다. doctor 의 ship-guard-registered 검사(bin/crew.cjs:540)는
   이를 보지 못하고 READY=true 로 보고한다
```

**M1a~M1c 사이의 증상.** 개명 전 설치본이 남은 머신에서 새 버전을 설치하면 위 여섯
가지가 그대로 남고 새 표면이 그 옆에 추가된다 — 스킬이 구·신 각 6개씩 **12개 동시
노출**된다. `bin/crew.cjs` 의 `CAPABILITIES` 에 구 id 가 없어 `capability remove` 가
구 원장을 건드리지 않고, `SKILL_MARKER` 가 `.crew-skill` 이라 uninstall 스캔이 구
마커 디렉터리를 건너뛰기 때문이다. `e2e/contract/legacy-transition.test.cjs` 가 이
상태를 명시적으로 단언하며, **M1c 는 그 단언을 뒤집는 것으로 완료를 증명한다.**

더 심각한 증상도 있다. `scripts/install-claude-ship-guard.cjs` 의 `isGuardHook()`
(`:15`)이 `triple-crown-ship-guard.cjs` 를 인식하지 못해 `migrateLegacyRegistrations()`
(`:25`)가 그 등록을 그대로 두고 새 `crew-ship-guard.cjs` 그룹을 별도로 추가한다 —
Bash 호출마다 옛 가드와 새 가드가 **둘 다** 실행된다. 옛 가드는 이제 아무도 쓰지
않는 `.planning/.triple-crown/ship-auth.json` 을 읽으므로
(`capabilities/crew-ship/checks/ship-guard-control.cjs:9`, `guards/crew-ship-guard.cjs:120`
은 둘 다 `.planning/.crew` 를 쓴다) 항상 실패해 `guards/crew-ship-guard.cjs:169` 의
최종 `deny()` 로 떨어진다 — 이런 머신에서는 **모든 `git push`/PR 이 막힌다.** 그런데
`bin/crew.cjs:540` 의 `doctor` 는 `crew-ship-guard.cjs` 를 포함하는 명령만 세므로 이
상태에서도 `READY=true` 로 보고한다 — 진단 도구가 이 증상에 대해 눈이 멀어 있다.
`e2e/contract/legacy-transition.test.cjs` 의 다섯 번째 단언이 이 상태를 기록하며,
M1c 는 그 단언도 함께 뒤집어야 한다.

현재 노출은 0 이다: `legacy-backup.cjs detect` -> `legacy targets: 0`, npm 레지스트리
404, 원격 부트스트랩 파손, 설치 시점 프리릴리스 펜스.

기존 설치가 GSD config 에 `triple_crown.*` 값을 갖고 있으면 M1a 이후 그 값은 읽히지
않고 `crew.*` 기본값이 적용된다. `uninstall-legacy` 는 이 사실을 사용자에게 고지한다.

## M7 입력: 부트스트랩 예시가 존재한 적 없는 조합을 이름한다

`ungkey/triple-crown` 저장소 개명(M7) 전까지는 고칠 수 없는 조합이 문서에 두 군데
남아 있다. 지금은 노출이 0 이다 — v0.6.5 태그가 원격에 없다 — 이지만, M7 이 부트스트랩
참조를 개명 후 태그로 옮길 때 반드시 같이 정리해야 한다.

- **`README.md:42`** — `npx --yes --package github:ungkey/triple-crown#v0.6.5 crew install --yes`.
  `--package X cmd` 형태에서 npx 는 지정한 패키지 **그 태그 안의** `cmd` bin 을
  찾는데, `v0.6.5` 태그의 유일한 bin 은 `triple-crown` 이지 `crew` 가 아니다 — 이
  명령은 실행될 수 없다. 개명 전 태그와 개명 후 바이너리 이름이 한 줄에 섞였다.
- **`README.md:78-79`**, **`bin/crew.cjs:700`**, **`docs/INSTALLER.md:16,24,30,38,380`** —
  `crew-harness-0.6.5.tgz` 는 어떤 태그도 만들 수 없는 파일명이다. v0.6.5 는
  `triple-crown-workflow-installer-0.6.5.tgz` 로 packing 됐고, 이 트리는
  `crew-harness-0.7.0-dev.tgz` 로 packing 된다.

수정은 M7 의 일이다 — 부트스트랩 참조가 처음으로 개명 후 태그를 가리키게 될 때. 지금
`README.md` / `docs/INSTALLER.md` / `bin/crew.cjs:700` 을 건드리면 "문서화된 모든
tarball 예시가 이 트리가 packing 되는 버전과 일치한다"는 계약(`install-entrypoints.test.cjs`)
을 깨뜨리거나, 존재하지 않는 릴리스를 문서가 주장하게 만든다.
