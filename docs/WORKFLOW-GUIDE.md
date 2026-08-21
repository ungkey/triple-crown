# Crew Workflow Guide v0.6.1

목적은 간단합니다.

```text
지금 어디에 있는가?
무엇이 완료됐는가?
무엇이 막고 있는가?
다음에 정확히 무엇을 실행해야 하는가?
```

를 매번 다시 추론하지 않게 만드는 것입니다.

Crew Guide는 **read-only navigation layer**입니다. 새로운 scheduler나
orchestrator가 아닙니다.

---

## 가장 자주 쓰는 명령

### 현재 상태

```text
/crew-gsd
```

또는:

```text
/crew-gsd status
```

출력 예:

```text
Crew Status

Project: /repo/app
Phase: 3 (03-auth)
State: IN_PROGRESS
Latest durable artifact: .planning/phases/03-auth/GSTACK-QA.json

✓ Plan + gstack plan review    DONE
✓ GSD execute                  DONE
✓ gstack code review           DONE
✓ Mutation/evidence freshness  DONE
✓ gstack QA-only               DONE
→ GSD verification / UAT       CURRENT
○ Security gates               WAITING
○ GSD ship / PR                WAITING
○ Deployment evidence          WAITING
○ gstack Canary                WAITING

NEXT: /gsd-verify-work 3
WHY:  GSD goal verification/UAT is not yet passed.

Help: /crew-gsd help <topic>
GSD native: /gsd-progress [--next | --do "..." | --forensic]
```

---

## 다음 행동만 알고 싶을 때

```text
/crew-gsd next
```

예:

```text
NEXT: /gsd-plan-phase 3 --gaps
WHY: Canonical GSD verification/UAT contains gaps.
```

Guide는 직접 실행을 시작하지 않습니다.

사용자가 명시적으로 다음 명령을 실행하면 GSD 또는 해당 Crew adapter가
원래 책임 범위에서 작업합니다.

---

## 중간에 며칠 쉬었다가 돌아왔을 때

```text
/crew-gsd resume
```

출력:

```text
Phase
Overall state
Current checkpoint
Last durable artifact
Current blocker
Resume command
```

즉 conversation history보다 `.planning` durable state를 우선합니다.

---

## 막혔을 때

```text
/crew-gsd help recovery
```

기본 원칙:

```text
missing/stale gate
  ↓
우회하지 않는다
  ↓
그 checkpoint의 owner를 다시 실행한다
```

그리고 GSD 자체 상태까지 의심되면:

```text
/gsd-progress --forensic
```

을 사용합니다.

현재 GSD의 `/gsd-progress`는 프로젝트 진행상황뿐 아니라 `--next`,
`--do "..."`, `--forensic`을 제공하므로 Crew Guide가 이를 복제하지
않고 external quality/release layer만 추가합니다.

---

# Status pipeline

Guide는 현재 Phase에서 다음 10개 checkpoint를 봅니다.

```text
1. PLAN + gstack plan review
2. GSD execute
3. gstack code review
4. mutation / evidence freshness
5. gstack QA-only
6. GSD verification / UAT
7. security
8. GSD ship / PR
9. deployment evidence
10. gstack Canary
```

상태 아이콘:

```text
✓ DONE
→ CURRENT
○ WAITING
! BLOCKED
~ ADVISORY
? UNKNOWN
– SKIPPED
```

`BLOCKED`가 있으면 가장 먼저 보여줍니다.

---

# Help topics

```text
/crew-gsd help workflow
/crew-gsd help plan
/crew-gsd help execute
/crew-gsd help review
/crew-gsd help qa
/crew-gsd help verify
/crew-gsd help gaps
/crew-gsd help security
/crew-gsd help ship
/crew-gsd help release
/crew-gsd help canary
/crew-gsd help recovery
/crew-gsd help e2e
```

## 전체 흐름 지도

```text
/crew-gsd map
```

## Artifact 설명

```text
/crew-gsd artifacts
```

## 프로젝트 설치 상태

```text
/crew-gsd doctor
```

이는 v0.6의 host compatibility doctor와 다릅니다.

```text
/crew-gsd doctor
  = 현재 프로젝트에 Crew capability/guard가 준비됐는지

node e2e/doctor.cjs
  = Node/GSD/Claude/gstack/Superpowers 등 target host compatibility
```

---

# 다음 행동 결정 규칙

## PLAN 없음

```text
/gsd-progress --next
```

또는 명시적으로:

```text
/gsd-plan-phase N
```

## PLAN은 있지만 gstack plan review 없음/stale

```text
/plan-eng-review
```

승인된 정확한 PLAN set을 marker로 묶은 뒤:

```text
/gsd-progress --next
```

## 실행 미완료

```text
/gsd-execute-phase N
```

## code review 없음/blocked

```text
/crew-gsd-review N
```

## review가 코드를 수정했고 evidence가 stale

review/fresh verification checkpoint를 다시 통과합니다.

Guide는 stale gate를 bypass하는 명령을 제시하지 않습니다.

## QA 없음

```text
/crew-gsd-qa N
```

## QA/UAT gap

```text
/gsd-plan-phase N --gaps
```

이후 gap execution/reverify는 GSD가 소유합니다.

## verification 미완료

```text
/gsd-verify-work N
```

## external CSO 미완료

```text
/crew-gsd-sec N
```

GSD native security는 별개입니다.

## verify/security 완료

```text
/gsd-ship N
```

## PR은 있지만 deployment evidence 없음

```text
/crew-gsd-release N
```

실제 deployment가 생기면:

```text
/crew-gsd-release N \
  --deployment-url <url> \
  --deployed-sha <sha> \
  --canary
```

## deployment SHA 불일치

Canary를 실행하지 않습니다.

먼저 실제 deployed SHA와 effective release SHA를 맞춥니다.

## Canary alert

```text
/gsd-progress --do "Investigate Canary alert for phase N"
```

으로 다시 GSD-owned remediation flow에 진입합니다.

---

# 중요한 경계

Guide는 다음을 **하지 않습니다**.

```text
X 자동 plan
X 자동 execute
X 자동 review fix
X 자동 gap fix
X 자동 ship
X 자동 merge
X 자동 deployment
```

오직:

```text
read state
→ explain
→ recommend owner + command
```

입니다.

따라서 기존 Crew의 핵심 불변식:

```text
One lifecycle owner = GSD
```

을 깨지 않습니다.
