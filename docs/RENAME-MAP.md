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
