# Triple Crown 정밀 분석 및 재구성 계획서

> 대상: `/home/devkey/works/harness/triple-crown` (v0.6.4)
> 목적: 결함 식별 → 네이밍 재설계 → capability 재구성 → 신규 기능 명세
> 원칙: **구현 없음.** 이 문서가 승인되기 전까지 코드를 건드리지 않는다.
> 작성일: 2026-08-20
>
> **개정 이력**
> - v1.0 (2026-08-20): 초판
> - v1.1 (2026-08-20): 전수 재검증 정오표 반영(§0.4), F5 `crew-concept` 신설(컨셉 기획→프로토타입 단계 누락 보완), §9 결정 확정(권장안 채택), gstack 설치 완료 반영
> - v1.2 (2026-08-20): 스킬 어순 `crew` 선두로 확정(§4.2) + GSD 접두사 동작 소스 실측(§4.1), 마이그레이션을 제거-후-재설치로 단순화(§7.2, 실측 설치 상태 §7.1 근거), D13 신설(`$HOME` 설치 시 scope 붕괴)
> - v1.3 (2026-08-22): M1b 실측 정정 노트 추가(§4.3 · §5.1) — GSD 1.11.0 단일 항목 capMap 이 교차 capability `requires`·`consumes` 를 거부하므로 §5.1 의 9개 분해안은 그대로 설치되지 않는다. 실제 산출은 4개. **분해안 본문은 M2 이후를 위해 보존한다**

---

## 0. 조사 근거

### 실제로 읽은 파일

| 파일 | 라인 | 확인 내용 |
|---|---|---|
| `bin/triple-crown.cjs` | 651 | 설치/제거/doctor 전체 흐름 |
| `capabilities/triple-gstack/capability.json` | — | steps 4, gates 5, config 25키 |
| `capabilities/triple-superpowers/capability.json` | — | contribution 1개 |
| `capabilities/triple-crown-guide/capability.json` | — | 가이드 스킬 |
| `checks/repo-state-lib.cjs` | 194 | `workspaceDigest` 산출 알고리즘 |
| `checks/evidence-store.cjs` | 260 | 증거 저장/무효화 API |
| `checks/verify-ready.cjs` | 78 | verify:pre 게이트 로직 |
| `checks/qa-ready.cjs` | 22 | QA 게이트 |
| `checks/security-ready.cjs` | 18 | 보안 ship 게이트 |
| `checks/security-risk.cjs` | 23 | 위험 분류 규칙 7개 |
| `checks/ship-guard-control.cjs` | 148 | arm/disarm 인가 |
| `checks/plan-review-lib.cjs` / `plan-review-current.cjs` | 82 / 69 | plan 다이제스트 게이트 |
| `checks/resolve-phase-dir.cjs` | 90 | phase 해석 |
| `guards/triple-crown-ship-guard.cjs` | 173 | PreToolUse 차단 로직 |
| `capabilities/triple-crown-guide/checks/workflow-guide.cjs` | 808 | 11단계 상태 머신 |
| `fragments/execute-wave-pre.md` | — | superpowers executor 정책 전문 |
| `docs/*.md` | 2,732 | 계약서 11종 + 설계노트 7종 |
| `CLAUDE-routing-fragment.md` | — | 라우팅 정책 전문 |
| `e2e/E2E-RESULT.json`, `tests/*.py` | — | 테스트 실태 |

### 교차 검증한 GSD 소스 (v1.11.0)

| 파일 | 확인 내용 |
|---|---|
| `gsd-core/workflows/plan-phase.md:1416-1450` | plan:post 게이트 dispatch 및 **blocking → halt** 동작 |
| `gsd-core/workflows/autonomous.md:435,554` | autonomous가 execute:post / verify:post 훅을 렌더링 |
| `docs/reference/capability-manifest.md` | 매니페스트 스키마, 12 extension point |
| `docs/how-to/command-exit-zero-gate.md:33,61` | `${GSD_CAP_DIR}` 보간 지원 확인 |
| `docs/how-to/run-phases-autonomously.md` | autonomous 정지 조건 |
| `gsd-core/bin/shared/config-defaults.manifest.json` | `workflow.auto_advance` 등 기본값 |

### v1.1 전수 재검증에서 추가로 읽은 것

| 소스 | 확인 내용 |
|---|---|
| `~/gstack` (v1.68.2, 빌드 완료) | `browse` 바이너리 94MB 존재, 스킬 스위트 `~/.claude/skills`에 등록 (전체 150개 스킬) |
| `~/.claude/skills/{prototype,office-hours,design-html,design-consultation,grill-me,to-spec,autoplan}/SKILL.md` | 컨셉·목업 단계 재료 스킬의 frontmatter/설명 (§F5 근거) |
| `~/.claude/skills/{gsd-sketch,gsd-spec-phase,gsd-mvp-phase,gsd-ingest-docs,gsd-ui-phase}/SKILL.md` | GSD 측 대응 스킬 확인 |
| `gsd-core/workflows/new-project.md:2,133-145` | new-project 흐름(질문→리서치→요구사항→로드맵), spike/sketch 산출물을 questioning 전에 반영하는 기존 경로 |
| `capabilities/*/checks` 재계수 | triple-gstack 19개 1,969줄 + guide 1개 808줄 |
| `docs/` 재계수 | 계약서 7 + 설계노트 7 + 핫픽스 2 + 운영문서 4 = 20파일 2,732줄 |
| `workflow-guide.cjs` stage id 추출 | 10개: plan/execute/review/evidence/qa/verify/security/ship/deploy/canary |

### 확인 못 한 것

- 실제 GSD 런타임에서의 설치 동작 (설치본 없이 소스만 검토)
- gstack 스킬의 **실행 출력** 형식 (SKILL.md 정의는 확인, 실제 실행은 미수행)
- `wikidocs.net/393632` 원문 (Cloudflare 차단, 이전 대화 참조)
- `works/harness/gstack` 클론은 여전히 미빌드 — 참조용. 실사용 설치본은 `~/gstack`

### 0.4 v1.1 전수 재검증 정오표

초판 수치를 소스와 전수 대조한 결과. 아래 8건 외 인용은 모두 실측과 일치했다.

| # | 위치 | 초판 | 실측 | 상태 |
|---|---|---|---|---|
| 1 | §0·§1.2·D5 | config 키 26개 | **25개** (`gstack.*` 22 + `ship.*` 3) | 본문 수정됨 |
| 2 | D5 | check 스크립트 22개(2,169줄) | **19개(1,969줄)** (guide의 workflow-guide.cjs 808줄은 별도) | 수정됨 |
| 3 | §1.5 | 11개 스테이지 | **10개** | 수정됨 |
| 4 | §1.5 | `… ship → release → canary` | `… ship → **deploy** → canary` | 수정됨 |
| 5 | D3 | `plan-phase.md:1447` | **:1450** (`blocking == true && block == true → halt`) | 수정됨 |
| 6 | D11 | 계약서 11종 + 설계노트 7종 | **계약서 7 + 설계노트 7 + 핫픽스 2 + 운영 4 = 20파일** (2,732줄은 일치) | 수정됨 |
| 7 | §1.1 | `prepareStableSource()` :227-256 | **:224**-256 | 수정됨 |
| 8 | §1.3 | `compareSnapshots()` :141-146 | **:140-148** | 수정됨 |

---

## 1. 현재 아키텍처 정밀 분석

### 1.1 3중 설치 구조

설치는 **세 곳**에 파일을 쓴다. 이걸 이해 못 하면 이후 논의가 안 된다.

```
①  <project>/.triple-crown/          ← 벤더링된 불변 소스 (installer가 관리)
      capabilities/<id>/…              원자적 교체: tmp → rename, 실패 시 backup 복구
      INSTALL-MANIFEST.json            bin/triple-crown.cjs:224-256 prepareStableSource()

②  <project>/.gsd/capabilities/<id>/ ← GSD capability 레지스트리 (project scope)
      gsd-tools capability install ./.triple-crown/capabilities/<id> --scope project
      게이트/스텝/config가 여기서 loop에 참여

③  <project>/.claude/skills/gsd-*/   ← Claude Code가 실제로 읽는 스킬
      installer가 ①에서 직접 복사 (installProjectSkills, bin/triple-crown.cjs:364-388)
      각 디렉터리에 .triple-crown-skill 소유권 마커
```

**③이 존재하는 이유**는 `docs/V0.6.4-HOTFIX.md`에 기록된 GSD 결함 때문이다:

- `capability install`은 `.gsd/capabilities/<id>/`에 풀기만 하고 스킬 루트를 건드리지 않는다. 스킬 파일이 런타임에 도달하는 유일한 경로는 `surface.applySurface()`이고, 그걸 호출하는 CLI는 `capability set <id> --runtime <r>` 하나뿐이다.
- `capability list`의 `surfaced: true`는 레지스트리 계산값이지 디스크 증거가 아니다.
- 게다가 `install-profiles.cjs → readInstalledCapabilitySkill()`은 서드파티 스킬 소스를 **하드코딩된 글로벌 경로**(`$HOME/.gsd/capabilities/<id>`)에서만 찾는다. project scope 설치는 원리적으로 표면화될 수 없다.
- global scope로 바꾸면 9개 게이트/스텝이 **머신의 모든 저장소**에서 활성화된다. 그래서 거부됨.

→ **판정: ③은 정당한 우회다. 다만 GSD 내부 구현에 대한 암묵적 의존이며, GSD가 이 결함을 고치면 이중 설치가 된다.** (결함 D9 참조)

### 1.2 capability 배선 — 실측

`triple-gstack` (v0.6.4):

| 종류 | point | 대상 | 게이트 조건 | 기본값 |
|---|---|---|---|---|
| step | `execute:post` | `triple-gstack-code-review` | `code_review_enabled` | true |
| step | `execute:post` | `triple-gstack-qa-only` | `qa_enabled` | true |
| step | `execute:post` | `triple-gstack-cso` | `security_enabled` | true |
| step | `ship:post` | `triple-gstack-post-ship` | `post_ship_enabled` | true |
| **gate** | `plan:post` | `plan-review-current.cjs` | `plan_review_required` | **true, blocking** |
| **gate** | `verify:pre` | `verify-ready.cjs` | `code_review_enabled` | true, blocking |
| **gate** | `verify:pre` | `qa-ready.cjs` | `qa_enabled` | true, blocking |
| **gate** | `ship:pre` | `security-ready.cjs` | `security_enabled` | true, blocking |
| **gate** | `ship:pre` | `ship-guard-control.cjs arm-gsd` | `ship.guard_enabled` | true, blocking |

config 키 25개(`triple_crown.gstack.*` 22 + `triple_crown.ship.*` 3) 전부 `triple-gstack` 하나가 소유. `triple-superpowers`는 키 1개, contribution 1개.

`contributions` 배열은 `triple-gstack`에서 **비어 있다.** 즉 gstack 축은 "실행 후 검사"만 하고, 계획/실행 중인 에이전트의 프롬프트에는 아무것도 주입하지 않는다.

### 1.3 증거 엔진 — 이게 이 프로젝트의 진짜 자산

`checks/repo-state-lib.cjs`의 `captureSnapshot()`:

```
workspaceDigest = sha256(JSON.stringify({
  head,              // git rev-parse HEAD
  branch,
  indexDigest,       // sha256(git diff --cached --binary HEAD -- . :(exclude).planning/** :(exclude).gsd/**)
  worktreeDigest,    // sha256(git diff --binary -- 동일 pathspec)
  fileDigests,       // dirty 파일별 내용 해시 (symlink/디렉터리/특수파일 구분 처리)
  untrackedDigests,  // untracked 파일별 내용 해시
}))
```

`.planning/`과 `.gsd/`를 **의도적으로 제외**한다 — 계획 문서 수정이 소스 증거를 무효화하지 않게 하려는 것. 정확한 설계다.

모든 게이트가 같은 패턴을 쓴다:

```
아티팩트.workspace.workspaceDigest !== captureSnapshot(phaseDir).workspaceDigest  →  stale  →  차단
```

`compareSnapshots()`는 커밋 재작성(non-linear history)까지 고려해 fallback을 둔다(repo-state-lib.cjs:140-148). 품질이 높다.

### 1.4 ship 인가 — 2단계 물리 차단

```
ship:pre  gate → ship-guard-control.cjs arm-gsd <phaseDir>
                 → .planning/.triple-crown/ship-auth.json 생성
                   { expiresAt: now + ttl(기본 300초),
                     headAtArm, branch, boundSessionId: null,
                     actionCounts: {gitPush:0, prCreate:0},
                     limits:     {gitPush:4, prCreate:1} }

PreToolUse(Bash) hook → guards/triple-crown-ship-guard.cjs
                 → classify(command): git push / gh pr create / gh pr merge
                                      / glab mr create / glab mr merge
                 → 인가 없음·만료·한도초과 → permissionDecision: "deny"
                 → 첫 사용 시 세션 id에 바인딩
```

문서 push는 별도 인가(`docs-push-auth.json`, TTL 600초, `allowedPaths` 화이트리스트, `VERSION` 범프는 기본 거부).

**판정: 설계·구현 모두 견고. 그대로 유지.**

### 1.5 워크플로우 가이드 — 읽기 전용 상태 머신

`workflow-guide.cjs` 808줄이 10개 스테이지를 계산한다:

```
plan → execute → review → evidence → qa → verify → security → ship → deploy → canary
```

각 스테이지는 `done | current | waiting | blocked | advisory | unknown` 상태를 갖고, 게이트 스크립트를 **실제로 실행해서**(`probe()`, workflow-guide.cjs:122) 판정한다. 채팅 기억이 아니라 디스크 사실 기반. 정확하다.

---

## 2. 유지해야 할 자산

| 자산 | 위치 | 이유 |
|---|---|---|
| `workspaceDigest` 증거 모델 | `repo-state-lib.cjs` | 대체 불가. 모든 stale 판정의 근거 |
| ship 2단계 인가 + PreToolUse 차단 | `ship-guard-control.cjs` + `guards/` | 프롬프트가 아닌 물리적 강제 |
| 원자적 벤더링 설치 | `prepareStableSource()` | 실패 시 backup 복구까지 구현됨 |
| 스킬 소유권 마커 | `.triple-crown-skill` | 사용자 파일 오염 방지 |
| 매니페스트 프리플라이트 | `validateBundledManifests()` | `runtimeCompat: ["*"]` 강제로 GSD 교차검증 실패 회피 |
| 읽기 전용 상태 머신 | `workflow-guide.cjs` | 방향 상실 방지 |
| superpowers executor 정책 | `fragments/execute-wave-pre.md` | 소유권 경계 명문화가 정확 |
| 권한 순서 정의 | `CLAUDE-routing-fragment.md` | 충돌 해소의 근거 |

**이 8개를 깨뜨리는 재구성안은 채택하지 않는다.**

---

## 3. 결함 정밀 목록

### D1. 스킬 이름이 최대 33자 — 사용자 요청 사항

| 현재 이름 | 길이 |
|---|---|
| `gsd-triple-gstack-release-observe` | **33** |
| `gsd-triple-gstack-code-review` | 29 |
| `gsd-triple-gstack-post-ship` | 27 |
| `gsd-triple-gstack-qa-only` | 25 |
| `gsd-triple-gstack-cso` | 21 |
| `gsd-triple-crown` | 16 |

`triple-` 이 6자를 먹고, `gstack-`이 또 7자를 먹는다. 사용자가 매번 타이핑해야 하는 문자열이다.

**제약**: capability id는 `gsd-`, `gsd-core-`, `anthropic-` 접두사를 쓸 수 없다(GSD 예약, `capability-manifest.md` envelope 표). 스킬 디렉터리명은 SKILL.md frontmatter `name`과 **정확히 일치**해야 Claude Code가 인식한다(`bin/triple-crown.cjs:17-20` 주석).

### D2. phase당 수동 명령 11개 — 사용자가 호소한 핵심 고통

`docs/WORKFLOW-GUIDE.md:215-290`의 "다음 행동 결정 규칙"을 순서대로 펼치면:

```
 1  /gsd-plan-phase N
 2  /plan-eng-review                              ← gstack, 대화형
 3  node .gsd/capabilities/triple-gstack/checks/mark-plan-reviewed.cjs <dir> --status pass
 4  /gsd-execute-phase N
 5  /gsd-triple-gstack-code-review N
 6  /gsd-triple-gstack-qa-only N
 7  /gsd-verify-work N
 8  /gsd-plan-phase N --gaps                      ← gap 발생 시 1~7 반복
 9  /gsd-triple-gstack-cso N
10  /gsd-ship
11  /gsd-triple-gstack-release-observe N
```

gap 1회 발생 시 **+7개**. gap 2회면 +14개. 이것이 "끝나지 않아"의 정확한 정체다.

### D3. plan:post 게이트가 `/gsd-autonomous`를 매 phase 정지시킨다 — 치명적

검증 경로:

1. `triple-gstack/capability.json` — plan:post 게이트, `blocking: true`, `when: triple_crown.gstack.plan_review_required`, **기본값 true**
2. 게이트 검사는 `plan-review-current.cjs` — `GSTACK-PLAN-REVIEW.json` 마커가 없거나, `reviewer !== 'gstack/plan-eng-review'`거나, `status !== 'pass'`거나, `planDigest`가 현재 PLAN 바이트셋과 다르면 non-zero exit
3. 그 마커를 만드는 유일한 경로는 **인간이 대화형 `/plan-eng-review`를 돌린 뒤 `mark-plan-reviewed.cjs`를 손으로 실행**하는 것 (`plan-review-current.cjs:14-21`의 recovery 안내가 이를 명시)
4. `gsd-core/workflows/plan-phase.md:1416`이 plan:post 훅을 렌더링하고, 같은 파일 1450행: **`hook.blocking == true` 이고 `GATE_RESULT.block == true` → halt**
5. `/gsd-autonomous`는 각 phase에서 `/gsd-plan-phase`를 호출한다

**결론: 기본 설정의 Triple Crown이 설치된 프로젝트에서 `/gsd-autonomous`는 모든 phase의 계획 단계에서 halt한다.** 자동화 축과 품질 축이 정면 충돌하고 있으며, 어느 문서에도 이 상호작용이 기록돼 있지 않다.

### D4. gap 루프에 수렴 상한이 없다

GSD `autonomous.md`는 blocker에 재시도 상한 3을 둔다(같은 파일 784행, `#3210`). 그러나 **gap 폐쇄 루프**(verify → gaps_found → `plan-phase --gaps` → execute → verify)에는 상한이 없다. Triple Crown은 여기에 QA gap(`uat-bridge.cjs`가 `GSTACK-QA.json`의 issue를 UAT `## Gaps`로 주입)을 **추가로** 밀어넣어 루프를 더 길게 만든다.

### D5. `triple-gstack`이 God capability

한 capability가 소유한 것: 스킬 5개, config 키 **25개**, step 4개, gate 5개, check 스크립트 **19개(1,969줄)**.

문제:
- config 키 하나를 끄려면 25개 중 어느 것인지 알아야 한다
- tier가 전부 `full` — 최소 설치 프로파일에서 부분 채택 불가
- `onError` 격리 단위가 너무 크다
- 테스트 단위가 capability 전체

### D6. superpowers 통합이 contribution 1개

`execute:wave:pre → executor` 하나뿐. 반면 GSD가 제공하는 접점은 12개. 규율이 필요한 지점 중 **계획 품질(plan:post)과 완료 판정(verify:pre)** 이 비어 있다. superpowers의 최대 약점은 강제력 부재이고, GSD의 최대 강점은 blocking gate다. 붙일 수 있는데 안 붙였다.

### D7. 시연/보고 레이어 없음

산출물 전부가 개발자용 JSON/Markdown이다. 비개발자가 "무엇이 만들어졌는지" 볼 수 있는 것은 `/gsd-verify-work`의 대화형 텍스트 문답뿐. gstack의 브라우저(`browse` 데몬, Chromium CDP, 명령당 ~100-200ms — `~/gstack`에 빌드·설치 확인됨)를 보유하고도 스크린샷 기반 시연을 만들지 않는다.

같은 공백이 파이프라인 **앞단**에도 있다 — 컨셉/프로토타입 단계 부재. §F5에서 다룬다.

### D8. 역할/팀 추상 없음

`contributions: []`. 도메인 전문성이 어떤 에이전트에도 주입되지 않는다.

### D9. `.claude/skills` 복사 우회가 GSD 내부에 결합

`bin/triple-crown.cjs:357-363` 주석이 GSD 내부 동작(surface-apply 경로, 글로벌 하드코딩 경로)을 전제로 한다. GSD가 project-scope 표면화를 고치면 스킬이 **양쪽에 설치**되고, `doctor`의 `skills-no-global-shadow` 체크는 글로벌 섀도만 보므로 이를 잡지 못한다.

`engines.gsd: ">=1.10.0 <2.0.0"` 범위가 이 위험을 커버하지 못한다 — 1.x 마이너 릴리스에서 고쳐질 수 있다.

### D10. 테스트가 mock 기반

`e2e/E2E-RESULT.json`의 `"mode": "mock"`. `e2e/mock-gsd.cjs`(5,383 bytes)가 GSD를 흉내낸다. `tests/*.py`는 설치 스모크. **실제 GSD 런타임에서 게이트가 halt하는지 검증하는 테스트가 없다.** D3이 발견되지 않은 이유다.

### D11. 문서가 20파일로 분산

`EVIDENCE / MUTATION / QA / SECURITY / SHIP-OWNERSHIP / POST-SHIP / RELEASE-EVIDENCE` 계약서 7종 + 설계노트 7종 + 핫픽스 기록 2종 + 운영문서 4종(`INSTALL / INSTALLER / SMOKE-TEST / WORKFLOW-GUIDE`) = 20파일, 총 2,732줄. 단일 진입 문서가 `WORKFLOW-GUIDE.md`(354줄) 하나이고, 여기에도 D3 같은 상호작용은 없다.

### D13. `$HOME` 설치 시 project scope가 global scope로 붕괴 (v1.2 신규)

실측(§7.1): 현재 설치는 `$HOME`을 프로젝트 루트로 실행됐고, `<project>/.gsd/capabilities/`가 글로벌 경로 `~/.gsd/capabilities/`와 같은 디렉터리가 됐다. 설치자는 "project-scoped 유지 → 게이트가 무관한 저장소로 새지 않게"(`bin/triple-crown.cjs:358-362`)를 설계 의도로 명시하지만, 이 설치에서는 무효다. 게이트 9개가 머신 전역에서 활성.

동시에 훅 등록 경로 `"$CLAUDE_PROJECT_DIR"/.claude/hooks/triple-crown-ship-guard.cjs`가 실제 파일 위치(`~/.claude/hooks/`)와 `CLAUDE_PROJECT_DIR == $HOME`일 때만 일치한다. 다른 프로젝트에서는 존재하지 않는 경로.

설치자에 프로젝트 루트 == `$HOME` 거부 검사가 없다. → M1에서 추가.

### D12. 자동화 진입점 부재

Triple Crown에는 `/gsd-autonomous`에 대응하는 진입점이 없다. `/gsd-triple-crown next`가 **다음 명령 하나를 알려줄 뿐** 실행하지 않는다(설계상 read-only). 사용자는 가이드가 알려준 명령을 손으로 친다. D2가 여기서 나온다.

---

## 4. 네이밍 재설계

### 제약 (변경 불가)

1. capability id는 `gsd-` / `gsd-core-` / `anthropic-` 로 시작 불가
2. 스킬 디렉터리명 == SKILL.md `name` frontmatter
3. 스킬 stem은 병합 레지스트리 전체에서 유일
4. stem 형식은 `/^[a-z0-9][a-z0-9-]*$/` (`installed-surface-resolver.cts:168` `SAFE_STEM`)

### 4.1 `gsd-` 접두사의 실체 — v1.2 소스 실측

초판은 "GSD가 `gsd-` 접두사를 붙이므로 유지 권장"이라고만 적었다. 실제 동작을 GSD 소스에서 확인한 결과:

| 근거 | 내용 |
|---|---|
| `install-profiles.cts:818` | capability 스킬 표면화 시 `const skillName = \`${prefix}${stem}\`` — 런타임 접두사(`claude` = `gsd-`)를 **무조건** 앞에 붙인다 |
| `install-profiles.cts:753` | first-party 스킬도 동일 규칙 |
| `surface.cts:511-513` | prune은 `if (!entry.startsWith(prefix)) continue; // 사용자 소유, 보존` — **접두사 불일치 디렉터리는 GSD가 절대 건드리지 않는다** |
| `installed-surface-resolver.cts:211-212` | stem 파생도 `dirSegment.startsWith(prefix)` 불일치 시 skip |

**따라서:**

- `crew-` 로 시작하는 스킬 디렉터리는 **GSD의 prune 대상에서 완전히 제외**된다 → 실수로 삭제될 위험 없음. 안전.
- 다만 GSD가 언젠가 project-scope 표면화를 고치면(D9), GSD는 같은 스킬을 **`gsd-crew-gsd-review`** 라는 다른 이름으로 한 벌 더 깐다. 현행(이름이 정확히 일치해 덮어쓰기)보다 나쁜 **이름 분기형 이중 설치**가 된다.

→ **완화 조치 (필수, M1 범위)**: `crew doctor` 에 `gsd-<stem>` 섀도 검사를 추가한다. 각 `crew-*` 스킬에 대해 `.claude/skills/gsd-<동일 stem>/` 존재 여부를 확인하고 발견 시 경고 + 제거 안내. 기존 `skills-no-global-shadow` 검사와 별개 항목. 이 검사 없이 crew 선두 네이밍을 채택하면 D9 위험이 커진다.

### 4.2 브랜드 및 어순 — 확정

브랜드 `crew` 확정(§9-1). **어순은 `crew` 선두**로 확정 (2026-08-20 사용자 지시).

```
gsd-crew-review   (초판)   →   crew-gsd-review   (확정)
```

어순 변경의 근거:

- 현재 머신에 스킬 **150개**가 설치돼 있고 그중 `gsd-*` 가 40개 이상이다. `gsd-` 선두면 crew 스킬이 GSD 본체 스킬 사이에 묻힌다.
- `crew-` 선두면 `/crew` 입력만으로 crew 스킬만 자동완성된다. 탐색성이 실질적으로 개선된다.
- 길이는 동일하다 — 토큰 순서만 바뀌므로 §4.3의 절감 수치는 변하지 않는다.

`gsd` 토큰을 중간에 남기는 이유: 이 스킬들이 GSD 라이프사이클을 구동한다는 신호. 떼면 각 4자 더 짧아지지만(`crew-review` = 11자) GSD 연관성이 사라진다. 현 확정안은 `gsd` 유지.

### 4.3 이름 매핑표

| 구분 | 현재 | 확정 | 길이 변화 |
|---|---|---|---|
| capability | `triple-gstack` | `crew-quality` / `crew-security` / `crew-ship` (분해) | — |
| capability | `triple-superpowers` | `crew-discipline` | — |
| capability | `triple-crown-guide` | `crew-guide` | — |
| capability | (신규) | `crew-core` / `crew-flow` / `crew-demo` / `crew-concept` | — |
| 스킬 | `gsd-triple-crown` | `crew-gsd` | 16 → 8 |
| 스킬 | `gsd-triple-gstack-code-review` | `crew-gsd-review` | 29 → 15 |
| 스킬 | `gsd-triple-gstack-qa-only` | `crew-gsd-qa` | 25 → 11 |
| 스킬 | `gsd-triple-gstack-cso` | `crew-gsd-sec` | 21 → 12 |
| 스킬 | `gsd-triple-gstack-post-ship` | `crew-gsd-postship` | 27 → 17 |
| 스킬 | `gsd-triple-gstack-release-observe` | `crew-gsd-release` | 33 → 16 |
| 스킬 | (신규) | `crew-gsd-run` | — |
| 스킬 | (신규) | `crew-gsd-demo` | — |
| 스킬 | (신규) | `crew-gsd-concept` | — |
| config 루트 | `triple_crown.*` | `crew.*` | — |
| 벤더 디렉터리 | `.triple-crown/` | `.crew/` | — |
| 소유권 마커 | `.triple-crown-skill` | `.crew-skill` | — |
| 인가 디렉터리 | `.planning/.triple-crown/` | `.planning/.crew/` | — |
| CLAUDE.md 마커 | `triple-crown:managed-routing` | `crew:managed-routing` | — |
| 가드 훅 | `triple-crown-ship-guard.cjs` | `crew-ship-guard.cjs` | — |
| npm 패키지 | `triple-crown-workflow-installer` | `crew-harness` | — |
| CLI | `triple-crown` | `crew` | — |

**총 문자 절감: 스킬 6개 기준 151자 → 79자 (48% 감소)** — 어순 변경과 무관하게 동일.

**설치자 변경점**: `bin/crew.cjs` 의 `SKILL_PREFIX` 를 `'gsd-'` 에서 `''` 로 바꾸고, 스킬 stem 자체를 `crew-gsd-*` 로 명명한다. capability의 `skills/<stem>/SKILL.md` frontmatter `name` 도 동일 문자열이어야 한다(제약 2).

**충돌 검사 결과**: 현재 설치된 스킬 150개 중 `crew-` 로 시작하는 것은 없다. 충돌 없음.

> **정정 (2026-08-22, M1b 실측).** 위 표의 capability 행 두 개(9개 분해)는 GSD 1.11.0 에서 성립하지 않는다. 실제로 만들어진 것은 4개다 — §5.1 끝의 정정 노트를 볼 것.

---

## 5. Capability 재구성

### 5.1 분해안

```
crew-core        role=feature  tier=core      공유 라이브러리 + 루트 config
  ├─ checks/repo-state-lib.cjs      (이동, 무변경)
  ├─ checks/evidence-store.cjs      (이동, 무변경)
  ├─ checks/resolve-phase-dir.cjs   (이동, 무변경)
  └─ config: crew.mode, crew.gate.*, crew.gap.*
  skills: []   steps: []   gates: []          ← 순수 기반

crew-flow        role=feature  tier=core      ★신규★ 자동 진행 정책
  requires: [crew-core]
  skills: [crew-run]
  steps:   execute:pre  → 모드 해석 → MODE.json
  gates:   verify:post  → gap 수렴 상한 검사

crew-quality     role=feature  tier=standard  코드리뷰 + QA
  requires: [crew-core]
  skills: [crew-review, crew-qa]
  steps:   execute:post × 2
  gates:   verify:pre  × 2
  config:  crew.review.*, crew.qa.*, crew.plan_review.*

crew-security    role=feature  tier=standard  독립 보안 렌즈
  requires: [crew-core]
  skills: [crew-sec]
  steps:   execute:post × 1
  gates:   ship:pre    × 1
  config:  crew.security.*

crew-ship        role=feature  tier=standard  릴리스 소유권
  requires: [crew-core]
  skills: [crew-postship, crew-release]
  steps:   ship:post   × 1
  gates:   ship:pre    × 1 (guard arm)
  config:  crew.ship.*, crew.release.*

crew-discipline  role=feature  tier=standard  superpowers 규율
  requires: []
  contributions: plan:pre, plan:post, execute:wave:pre, verify:pre
  config:  crew.discipline.*

crew-demo        role=feature  tier=full      ★신규★ 시연/보고
  requires: [crew-core, crew-quality]
  skills: [crew-demo]
  steps:   verify:post → DEMO 번들 생성

crew-concept     role=feature  tier=standard  ★신규★ 컨셉 기획 + 프로토타입 (GSD 라이프사이클 이전)
  requires: [crew-core]
  skills: [crew-concept]
  steps: []   gates: []                        ← pre-GSD 단계라 extension point 없음. 스킬 주도 (§F5)

crew-guide       role=feature  tier=core      읽기 전용 상태 머신
  requires: []
  skills: [crew]
```

> **정정 (2026-08-22, M1b 실측). 위 분해안은 그대로 두되, 아래 사실과 함께 읽는다.**
>
> **GSD 1.11.0 은 위 분해안을 설치할 수 없다.** `gsd-core src/capability-source.cts:836` 이
> 검증 맵을 `new Map([[id, cap]])` — **설치 중인 capability 하나뿐** — 으로 만든다. 결과:
>
> - 위에 다섯 번 적힌 `requires: [crew-core]` 는 `crew-core` 가 이미 active 여도
>   `requires "X" which does not exist` 로 **거부된다**. `crew-demo` 의
>   `requires: [crew-core, crew-quality]` 도 같다.
> - 같은 결함이 `consumes` 도 문다 — 다른 capability 가 produce 하는 아티팩트를 consume 하면
>   `never produced by any host artifact or capability hook` 으로 거부된다.
>
> **M1b 가 실제로 만든 것은 9개가 아니라 4개다** — `crew-discipline` · `crew-quality` ·
> `crew-ship` · `crew-guide`. `crew-quality` 에서 릴리스 표면만 `crew-ship` 으로 떼어냈다
> (`v0.7.0-m1b`). 네 capability 모두 `requires: []` 이고, 의존 순서는 `bin/crew.cjs` 의
> `CAPABILITIES` 배열이 소유한다.
>
> - **`crew-security` 는 보류다.** `crew-gsd-sec` 의 `execute:post` step 이 `crew-gsd-qa` 가
>   만드는 `GSTACK-QA.json` 을 consume 한다. 떼어내면 위 두 번째 규칙에 걸리고, 간선을 지워
>   피하면 위상 정렬이 바뀌어 `review → qa → sec` 이 `review → sec → qa` 로 렌더된다(실측).
>   **아티팩트 사슬로 묶인 step 은 같은 capability 안에 있어야 한다.** GSD 가 단일 항목
>   capMap 을 고친 뒤에 다시 본다.
> - **`crew-core`(M2) · `crew-flow`(M2) · `crew-demo`(M5) · `crew-concept`(M7)** 은 각자 시점
>   소관이다(`docs/V0.7-IMPLEMENTATION-DESIGN.md` §5 · §10). 공유 lib 는 §5.2 방안 A(빌드 시
>   번들 복제)로 M0 에서 이미 해결됐으므로, **의존 대상**으로서의 `crew-core` 는 단일 항목
>   capMap 이 고쳐진 뒤에야 의미가 있다.
>
> M2 이후가 이 절의 논거(§5.3 분해의 실익, §5.2 방안 A)를 계속 쓰기 때문에 분해안 자체는
> 지우지 않았다. 다만 **`requires:` 줄과 capability 개수는 위 제약 아래에서 다시 계산해야
> 한다.** 계획·실측·펜스는 `docs/superpowers/plans/2026-08-21-m1b-capability-split.md` 와
> `e2e/contract/capability-split.test.cjs`(펜스 8종), 매핑은 `docs/RENAME-MAP.md` 에 있다.

### 5.2 공유 라이브러리 문제 — 반드시 먼저 해결

`${GSD_CAP_DIR}`은 **해당 capability 자신의 디렉터리**를 가리킨다. `crew-quality`의 게이트가 `crew-core`의 `repo-state-lib.cjs`를 참조하려면 capability 경계를 넘어야 한다.

세 가지 방안:

| 방안 | 내용 | 평가 |
|---|---|---|
| A. 패키징 시 복제 | 저장소에 단일 소스(`lib/`), `npm pack` 전 빌드 스크립트가 각 capability 번들로 복사 | **권장.** 런타임 결합 0, 소스 중복 0 |
| B. 절대경로 참조 | 게이트 command가 `crew-core` 절대경로 참조 | 설치 순서/스코프에 취약 |
| C. 분해 포기 | God capability 유지 | D5 미해결 |

→ **A 채택.** `scripts/build-capabilities.cjs` 신설 필요. 프리플라이트(`validateBundledManifests`)에 "각 번들의 lib 해시 일치" 검사 추가.

### 5.3 분해의 실익

- config 키 25개가 4개 capability로 분산 → 소유권 명확
- tier 분리 → `core`만 설치해 게이트 없이 시작 가능
- `crew-security` 단독 비활성화 가능
- `onError` 격리 단위 축소
- 테스트를 capability 단위로 분리 가능

---

## 6. 신규 기능 명세

### F1. `crew-flow` — 자동 진행 정책 (D2·D3·D4·D12 해결)

#### F1-a. plan review 3단 모드 — D3의 직접 해결

```jsonc
"crew.plan_review.mode": {
  "type": "enum",
  "values": ["off", "agent", "human"],
  "default": "agent",
  "description": "off=게이트 비활성 / agent=서브에이전트가 자동 리뷰 후 마커 기록 / human=현행(대화형 필수)"
}
```

| 모드 | plan:post 게이트 | 마커 생성자 | `/gsd-autonomous` 호환 |
|---|---|---|---|
| `off` | 비활성 | — | ✅ |
| `agent` | blocking | `crew-review` 스킬이 gstack plan-eng-review를 서브에이전트로 실행 후 `mark-plan-reviewed.cjs` 자동 호출 | ✅ |
| `human` | blocking | 인간 (현행) | ❌ halt |

**agent 모드 구현 재료가 이미 있다**: gstack `autoplan` 스킬(v1.1 검증에서 확인)이 CEO/design/eng/DX 리뷰 4종을 "6 decision principles" 기반 자동 결정으로 순차 실행하는 파이프라인이다. agent 모드는 이를 재사용하고 결과를 `mark-plan-reviewed.cjs`로 기록하면 된다 — 리뷰 로직 신규 구현 불필요.

기본값을 `agent`로 바꾸는 것이 D3의 해결이다. `human`은 옵트인으로 남긴다.

**마커 스키마는 변경하지 않는다.** `reviewer` 필드에 `gstack/plan-eng-review-agent`를 추가하고, `plan-review-current.cjs`가 두 값을 모두 수용하도록 확장한다(현재 `plan-review-current.cjs:47`은 단일 값 비교).

#### F1-b. 게이트 예산

```jsonc
"crew.gate.budget_per_milestone": { "type": "number", "default": 3 },
"crew.gate.always_escalate": {
  "type": "string",
  "default": "irreversible,cost,scope_change,security_high",
  "description": "예산과 무관하게 항상 인간에게 올릴 결정 유형 (쉼표 구분)"
}
```

동작:
- 결정 필요 시 유형 판정 → `always_escalate`에 해당하면 인간에게
- 아니면 총괄이 결정하고 `.planning/DECISIONS.md`에 **근거 / 대안 / 되돌리는 법 / 커밋 SHA** 기록
- 예산 소진 후에는 전부 자율 + 기록
- 시연 시 결정 로그 일괄 제시 → 뒤집으면 `/gsd-undo`로 롤백

**전제 조건**: GSD의 atomic commit이 살아 있어야 한다. 이것 없이는 예산제가 도박이 된다.

#### F1-c. gap 수렴 상한 (D4 해결)

```jsonc
"crew.gap.max_rounds":     { "type": "number", "default": 2 },
"crew.gap.deferred_below": {
  "type": "enum", "values": ["critical","high","medium","low"], "default": "high",
  "description": "이 심각도 미만의 gap은 상한 도달 시 backlog로 이월"
}
```

`verify:post` 게이트가 `.planning/phases/<N>/GAP-ROUNDS.json`의 라운드 수를 읽고 상한 초과 시:
1. 남은 gap을 심각도로 분류
2. `deferred_below` 미만은 `.planning/BACKLOG.md`로 이월
3. 이월 사실을 `DEMO/OPEN.md`에 기록 (조용한 누락 금지)
4. phase를 완료 처리

#### F1-d. `crew-run` 스킬 — 자동 진행 진입점 (D12 해결)

`/gsd-autonomous`를 **대체하지 않고 감싼다.**

```
/crew-gsd-run [--from N] [--to N] [--milestone]
  0. .planning/ 부재 시: /crew-gsd-concept 부터 시작 제안 (F5, v1.1 추가)
  1. 프리플라이트: crew.plan_review.mode != "human" 확인, 아니면 경고 후 중단
  2. gstack 스킬 존재 확인 (없으면 해당 게이트를 자동 강등 + 경고)
  3. /gsd-autonomous 위임
  4. 마일스톤 종료 시 crew-demo 트리거
```

`/gsd-autonomous`의 로직을 복제하지 않는다 — GSD가 라이프사이클 소유자라는 불변식(§CLAUDE-routing-fragment) 유지.

### F2. `crew-demo` — 시연 번들 (D7 해결)

`verify:post` step이 생성:

```
.planning/milestones/<M>/DEMO/
  index.html        단일 파일 시연 페이지 (스크린샷 인라인, 외부 의존 없음)
  shots/*.png       gstack browse 로 캡처
  REPORT.md         요구사항 ID별 상태표 (REQ-xxx → done/partial/deferred + 증거 링크)
  DECISIONS.md      crew-flow가 자율 결정한 항목 + 롤백 명령
  OPEN.md           이월된 gap / 미결 항목
```

**gstack browse 미가용 시**: 스크린샷 없이 텍스트 REPORT만 생성하고 `index.html`에 "브라우저 증거 없음" 배너 표시. 조용한 성공 금지.

### F3. `crew-discipline` 확장 (D6 해결)

| point | into | 내용 | 신규 |
|---|---|---|---|
| `plan:pre` | planner | 설계 결정이 CONTEXT.md에 기록됐는지 / 대안 검토 흔적 요구 | ✅ |
| `plan:post` | (step, advisory) | superpowers `writing-plans` 리뷰어 기준으로 PLAN 품질 검사 — task 2~5분 단위, 정확한 파일 경로, 검증 단계 존재 | ✅ |
| `execute:wave:pre` | executor | **현행 유지** (`fragments/execute-wave-pre.md` 무변경) | — |
| `verify:pre` | (gate) | `verification-before-completion` 체크리스트를 `command-exit-zero`로 환원 | ✅ |

`verify:pre` 게이트가 이 계획의 핵심 가치다. superpowers의 규율을 GSD의 강제력으로 승격시킨다.

### F4. 역할 주입 (D8) — **이번 범위에서 제외**

legion 페르소나 이식은 토큰 비용 영향이 크고, 위 F1~F3 없이는 효과를 측정할 수 없다. **v0.8 이후로 연기.** 대신 `crew-discipline`의 contribution 구조를 페르소나 주입이 나중에 들어올 수 있는 형태로 설계해 둔다.

### F5. `crew-concept` — 컨셉 기획 → 프로토타입(목업) 단계 (v1.1 신설)

#### 문제 — 파이프라인 최앞단이 비어 있다

사용자 목표 파이프라인:

```
아이디어/자료 → 컨셉 기획 → 프로토타입(목업) → 요구사항 확정 → 마일스톤 → 스펙 → 계획 → 구현 → QA → 보고
                └────────── 이 구간이 없다 ──────────┘        └────── GSD + F1~F3 ──────┘└ crew-demo ┘
```

GSD의 시작점은 `/gsd-new-project`(질문 → 리서치 → REQUIREMENTS.md → ROADMAP.md, `new-project.md:2`)다. 즉 GSD는 **요구사항을 말로 확정하는 것부터** 시작하고, 비개발자가 요구사항을 말로 표현하기 전에 눈으로 확인할 목업 단계가 없다. Triple Crown도 이 구간을 다루지 않는다. `CLAUDE-routing-fragment.md`에 "Before GSD project initialization: use gstack /office-hours and product review where useful"라는 **권고 한 줄**만 있고 구현이 없다.

#### 재료는 전부 존재한다 (v1.1 검증 완료 — 신규 구현 최소화)

| 단계 | 기존 스킬 | 출처 | 확인 근거 |
|---|---|---|---|
| 요구사항 인터뷰 | `grill-me` / `grilling` | gstack | "A relentless interview to sharpen a plan or design" |
| 제품 관점 리뷰 | `office-hours` | gstack | "YC Office Hours — two modes" |
| 디자인 방향 | `design-consultation` | gstack | 제품 이해 → 경쟁 조사 → 디자인 시스템(타이포/컬러/레이아웃) 제안 + 프리뷰 생성 |
| 목업 HTML | `design-html` | gstack | "production-quality HTML/CSS", 트리거 "code the mockup" |
| 스케치형 목업 | `gsd-sketch` | GSD | "throwaway HTML mockups" |
| 대화 → PRD 합성 | `to-spec` | gstack | "Turn the current conversation into a spec (PRD)" |
| 목업 스크린샷 | `browse` 데몬 | gstack | `~/gstack/browse/dist/browse` 빌드 확인됨 |
| GSD 인계 | `/gsd-ingest-docs` | GSD | "Bootstrap or merge a .planning/ setup from existing ADRs, PRDs, SPECs" |
| questioning 반영 | `new-project.md:133-145` | GSD | spike/sketch 산출물을 questioning 전에 읽어 반영하는 기존 경로 |

`crew-concept`는 **이 스킬들의 오케스트레이션 + 산출물 규약**만 새로 만든다.

#### 배선 위치 — 게이트가 아니라 스킬

이 단계는 `.planning/`이 생기기 **전**에 실행된다. GSD의 12개 extension point는 전부 phase 라이프사이클 내부이므로 여기에 걸 수 없다. 따라서 `crew-concept`는 steps/gates 없이 스킬 `crew-gsd-concept` 하나로 구성하고, `/crew-gsd-run`이 `.planning/` 부재를 감지하면 이 스킬부터 시작하도록 연결한다(F1-d 프리플라이트에 0단계 추가).

#### `/crew-gsd-concept` 흐름

```
/crew-gsd-concept [아이디어 텍스트 | --from <자료 파일/디렉터리>]

 1. 접수      아이디어/자료 읽기 → .planning-draft/concept/INTAKE.md
 2. 인터뷰    grilling 방식 요구사항 인터뷰            ← 인간 대화 (유일한 필수 상호작용 ①)
 3. 컨셉      컨셉 기획서 CONCEPT.md (타깃/문제/핵심 흐름/범위 제외 목록)
 4. 디자인    design-consultation 서브에이전트 → 디자인 방향 1페이지
 5. 목업      design-html / gsd-sketch 방식 → PROTOTYPE/*.html
              (단일 파일, 외부 의존 없음 — crew-demo 규약과 동일)
 6. 시연      browse로 SHOTS/*.png 캡처 → 인간에게 제시 → 피드백  ← 인간 상호작용 ②
              라운드 반복, 상한 crew.concept.max_rounds (기본 3)
 7. 확정      to-spec 방식으로 PRD.md 합성 → 인간 승인            ← 인간 상호작용 ③ (human gate 유지)
 8. 인계      /gsd-ingest-docs 로 .planning/ 부트스트랩
              → 이후 /gsd-new-project questioning이 CONCEPT/PRD를 컨텍스트로 사용
```

산출물 규약:

```
.planning/concept/            (인계 후 이 위치로 이동; 인계 전엔 .planning-draft/concept/)
  INTAKE.md        원본 아이디어/자료 요약 + 출처
  CONCEPT.md       컨셉 기획서
  DESIGN.md        디자인 방향 (design-consultation 결과)
  PROTOTYPE/*.html 목업 (throwaway 명시 — 구현 코드로 승격 금지)
  SHOTS/*.png      스크린샷
  FEEDBACK.md      라운드별 인간 피드백 기록
  PRD.md           확정 요구사항 초안 → REQUIREMENTS.md 의 입력
```

config:

```jsonc
"crew.concept.max_rounds":    { "type": "number", "default": 3 },
"crew.concept.design_review": { "type": "boolean", "default": true,  "description": "office-hours 제품 리뷰 포함 여부" },
"crew.concept.screenshots":   { "type": "boolean", "default": true,  "description": "browse 미가용 시 자동 false + 배너 (F2와 동일 규약)" }
```

#### 원칙

- **인간 상호작용은 정확히 3곳** — 인터뷰(②는 피드백 라운드), 목업 피드백, PRD 승인. 요구사항 확정은 F1-b의 `always_escalate: scope_change`에 해당하므로 게이트 예산과 무관하게 항상 인간 승인. 그 외 전부 자동.
- **목업은 throwaway.** PROTOTYPE/*.html을 구현 단계에서 재사용하지 않는다(`prototype` 스킬의 원칙과 동일). 구현은 GSD 계획이 소유.
- **GSD 소유권 불변식 유지.** crew-concept는 `.planning/`을 직접 편집하지 않고 `/gsd-ingest-docs`를 통해 인계한다. REQUIREMENTS.md의 최종 편집권은 GSD.
- 이 단계가 사용자 최종 목표(에이전트 개발 회사)의 "기획팀 + 디자인팀" 축이다. F4 페르소나가 v0.8에 들어오면 이 흐름의 각 단계에 주입된다.

---

## 7. 마이그레이션 계획

### 7.1 실측 설치 상태 (v1.2, 2026-08-20)

마이그레이션 설계 전에 **실제로 무엇이 설치돼 있는지** 확인했다. 결과가 초판 전제를 뒤집는다.

| 항목 | 실측 |
|---|---|
| 벤더 디렉터리 | `/home/devkey/.triple-crown` — **v0.6.3** (소스는 v0.6.4). 설치 2026-08-19 |
| capability 레지스트리 | `~/.gsd/capabilities/{triple-gstack, triple-superpowers, triple-crown-guide}` |
| 표면화된 스킬 | **0개**. `~/.claude/skills` 에 crown 계열 없음 (v0.6.3은 `installProjectSkills` 이전 버전) |
| 라우팅 블록 | `~/CLAUDE.md:1-150` 에 `triple-crown:managed-routing` 블록 설치됨 |
| ship 가드 훅 | `~/.claude/settings.json:198` 에 `"$CLAUDE_PROJECT_DIR"/.claude/hooks/triple-crown-ship-guard.cjs` 등록. 실제 파일은 `~/.claude/hooks/` |
| `triple_crown.*` config | **어느 프로젝트에도 없음** |
| 진행 중인 phase 증거 | 없음 |

**결론: 보존할 상태가 없다.** 초판 §7.1의 config 백업·키 변환·롤백 10단계는 이 상황에서 과설계다.

### 7.2 마이그레이션 = 제거 후 재설치 (확정)

사용자 확인(2026-08-20): "기존에 설치는 제거하고 다시 설치하면 된다." 실측 결과가 이를 뒷받침한다.

```
crew uninstall-legacy      # 구 Triple Crown 잔재 제거
crew install               # crew-* 9개 신규 설치
```

`uninstall-legacy` 가 제거할 대상 — 위 실측 표의 6곳 전부:

```
1. gsd-tools capability remove triple-gstack       (설치 스코프 자동 판별)
                        remove triple-superpowers
                        remove triple-crown-guide
2. .claude/skills/ 에서 .triple-crown-skill 마커 달린 디렉터리   (v0.6.4 설치본 대비)
3. CLAUDE.md 의 triple-crown:managed-routing 블록 (마커 쌍 사이만 제거, 사용자 작성분 보존)
4. .claude/hooks/triple-crown-ship-guard.cjs
5. settings.json 의 해당 훅 등록 항목
6. .triple-crown/ 벤더 디렉터리
```

**config 키 변환은 하지 않는다.** `triple_crown.*` 키가 실제로 설정된 프로젝트가 없다. 대신 `docs/MIGRATION.md` 에 구↔신 키 대응표를 **문서로만** 남긴다. 손으로 설정한 사용자가 있으면 표를 보고 직접 옮긴다.

**단, 진행 중인 phase가 있으면 거부한다.** `uninstall-legacy` 프리플라이트:

- `.planning/phases/*/GSTACK-*.json` 존재 → 경고 후 `--force` 요구
- `.planning/.triple-crown/ship-auth.json` 이 arm 상태 → disarm 후 진행

### 7.3 부수 발견 — D13 (아래 §3 추가)

실측 중 발견: 현재 설치는 **`$HOME` 을 프로젝트 루트로 삼아 실행됐다.** 그 결과 `<project>/.gsd/capabilities/` 가 글로벌 경로 `~/.gsd/capabilities/` 와 **동일 경로로 붕괴**했다. 설치자 주석(`bin/triple-crown.cjs:358-362`)이 명시한 "project-scoped 유지 → 게이트가 무관한 저장소로 새지 않게" 라는 설계 의도가 이 설치에서는 무효다. 게이트 9개가 머신 전역에서 활성 상태다.

또한 훅 등록 경로 `"$CLAUDE_PROJECT_DIR"/.claude/hooks/…` 는 실제 파일 위치(`~/.claude/hooks/`)와 `CLAUDE_PROJECT_DIR == /home/devkey` 일 때만 일치한다. 다른 프로젝트에서는 존재하지 않는 경로를 가리킨다.

→ **`crew install` 프리플라이트에 "프로젝트 루트가 `$HOME` 이면 거부" 검사를 추가한다.** (M1 범위)

### 7.4 진행 중인 phase 아티팩트

`.planning/phases/<N>/`의 아티팩트 이름(`GSTACK-CODE-REVIEW.json` 등)은 **변경하지 않는다.** 이름을 바꾸면 진행 중인 phase의 증거가 전부 무효화된다. 아티팩트 이름은 브랜드와 무관하게 유지.

`.planning/.triple-crown/` → `.planning/.crew/`는 인가 파일(TTL 300초)만 들어 있으므로 이동 없이 새로 만든다.

### 7.5 단계

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| M0 | 공유 lib 빌드 파이프라인 (§5.2 방안 A) | 각 번들의 lib 해시 일치 검사 통과 |
| M1 | 이름 변경(crew 선두) + capability 분해 + `uninstall-legacy` + doctor 신규 검사 2건(§4.1 섀도, §7.3 `$HOME` 거부) | 기존 e2e 전부 통과, doctor READY=true, 실제 머신에서 구 설치 제거 → 신규 설치 확인 |
| M2 | `crew-flow` F1-a (plan review agent 모드) | **실제 GSD에서 `/gsd-autonomous` 3 phase 무정지 완주** |
| M3 | `crew-flow` F1-b/c (예산 + gap 수렴) | gap 3라운드 시나리오에서 이월 동작 확인 |
| M4 | `crew-discipline` 확장 (F3) | verify:pre 게이트가 미검증 완료 주장을 차단 |
| M5 | `crew-demo` (F2) | 시연 번들이 브라우저 없이도 생성 |
| M6 | `crew-run` 진입점 (F1-d) | 명령 1개로 마일스톤 완주 |
| M7 | `crew-concept` (F5) | 아이디어 1개 입력 → 컨셉 → 목업 → PRD → `/gsd-ingest-docs` 부트스트랩 완주 |

**M1과 M2를 섞지 않는다.** 이름 변경은 순수 리팩터링으로 격리해야 회귀 원인을 특정할 수 있다.

---

## 8. 검증 계획 (D10 해결)

현재 테스트는 mock 기반이라 D3을 못 잡았다. 추가할 것:

| 테스트 | 내용 | 잡는 결함 |
|---|---|---|
| `live-autonomous.test` | 실제 GSD + 픽스처 프로젝트에서 `/gsd-autonomous --only N` 완주 | D3 |
| `gate-halt-matrix.test` | 각 게이트를 의도적으로 실패시켜 halt/skip 동작 확인 | 게이트 회귀 |
| `gap-convergence.test` | gap 3라운드 시나리오에서 이월 발생 확인 | D4 |
| `migration.test` | v0.6.4 설치 상태 → v0.7 마이그레이션 → config 보존 확인 | 마이그레이션 |
| `skill-name-length.test` | 모든 스킬명 ≤ 18자 **및 `crew-` 로 시작** | D1 회귀 |
| `shadow-skill.test` | `.claude/skills/gsd-<stem>/` 섀도 디렉터리를 doctor가 검출 | §4.1 |
| `home-root-refusal.test` | 프로젝트 루트가 `$HOME` 이면 install 거부 | D13 |
| `lib-hash.test` | 복제된 공유 lib 해시 일치 | §5.2 |
| `double-install.test` | GSD가 스킬을 표면화하는 경우 이중 설치 감지 | D9 |
| `concept-handoff.test` | 픽스처 아이디어 → concept 산출물 규약 준수 → ingest-docs가 PRD를 인식 | F5 |

`mock-gsd.cjs`는 유지하되 **live 테스트가 릴리스 게이트**가 되어야 한다.

---

## 9. 결정 사항 — **확정 (2026-08-20, 사용자 승인: 전 항목 권장안 채택)**

| # | 항목 | 확정 | 비고 |
|---|---|---|---|
| 1 | 브랜드 | **`crew`** | 에이전트 팀 은유와 일치 |
| 2 | plan review 기본 모드 | **`agent`** | D3 해결. 구현은 gstack `autoplan` 재사용 (F1-a) |
| 3 | 게이트 예산 기본값 | **3** | |
| 4 | gap 상한 기본값 | **2** | |
| 5 | 저장소 전략 | **기존 `triple-crown` 저장소 개명** | git 이력 보존 |
| 6 | v0.6.4 지원 | **마이그레이션만** | |
| 7 | 페르소나(F4) | **v0.8 연기** | |
| 8 | gstack 빌드 | **해소됨** | `~/gstack` v1.68.2 빌드·설치 완료 확인 (v1.1 검증). 선결 조건 이미 충족 |

이 확정으로 본 문서는 **승인된 계획**이다. 다음 단계는 §7.3 M0부터 순서대로 — 단, 각 M 단계 착수 전 해당 범위 재확인.

---

## 10. 이 문서가 다루지 않은 것

- 실제 코드 diff (의도적 — M 단계별 착수 시 작성)
- gstack 스킬의 실행 출력 스키마 (SKILL.md 정의는 확인, 실행 검증은 M2/M7에서)
- legion 페르소나 이식 상세 (F4로 연기)
- 멀티 프로젝트/포트폴리오 (범위 밖)
- `wikidocs.net/393632` 원문 반영 (접근 불가)
