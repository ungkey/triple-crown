# Triple Crown — Don't Get Lost

작업 중 방향을 잃으면 아래 네 개만 기억하면 됩니다.

```text
/gsd-triple-crown
```

현재 Triple Crown 전체 checkpoint 상태.

```text
/gsd-triple-crown next
```

다음 실행 명령만 표시.

```text
/gsd-triple-crown resume
```

오랜만에 돌아왔을 때 마지막 durable checkpoint와 재개 지점.

```text
/gsd-triple-crown help recovery
```

왜 막혔는지 / 어느 owner가 해결해야 하는지.

GSD 자체 진행상태와 route가 필요하면:

```text
/gsd-progress
/gsd-progress --next
/gsd-progress --forensic
```

## 전체 순서

```text
PLAN
 ↓
PLAN REVIEW
 ↓
EXECUTE
 ↓
CODE REVIEW
 ↓
EVIDENCE
 ↓
QA-ONLY
 ↓
VERIFY / UAT / GAPS
 ↓
SECURITY
 ↓
GSD SHIP
 ↓
DEPLOYMENT EVIDENCE
 ↓
CANARY
```

자세한 설명:

```text
docs/WORKFLOW-GUIDE.md
```
