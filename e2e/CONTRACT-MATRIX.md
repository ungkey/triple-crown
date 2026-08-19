# E2E Contract Matrix v0.6

| Contract | L0 | L1 | L2 | Failure owner |
|---|---:|---:|---:|---|
| Workflow guide resolves durable checkpoint + next owner | ✓ | ✓ | ✓ | Triple Crown Guide |
| Capability manifest structure | ✓ | ✓ |  | Triple Crown |
| GSD accepts local capability + consent | mock | ✓ |  | GSD / manifest |
| Project overlay active | mock | ✓ |  | GSD trust/consent |
| `plan:post` plan review gate | mock | ✓ | ✓ | GSD hook registry |
| Superpowers executor contribution | mock | ✓ | ✓ | GSD + policy |
| execute post order review→QA→CSO | mock | ✓ | ✓ | artifact DAG/host |
| mutation invalidates evidence | ✓ |  | ✓ | Triple Crown |
| qa-only does not mutate | ✓ |  | ✓ | gstack semantics |
| QA issue → GSD UAT gap | ✓ |  | ✓ | Triple Crown/GSD UAT |
| CSO ship severity gate | ✓ | ✓ | ✓ | Triple Crown |
| GSD native security remains independent |  | ✓ | ✓ | GSD |
| hard ship guard blocks direct push | ✓ |  | ✓ | Claude hook |
| GSD ship authorization permits bounded effects | ✓ |  | ✓ | Triple Crown |
| RELEASE owner is GSD | ✓ |  | ✓ | Triple Crown |
| deploy SHA must equal release SHA for Canary | ✓ |  | ✓ | Triple Crown |
| gstack Canary works on live deployment |  |  | ✓ | gstack/browser |
| document-release docs-only mutation | ✓ |  | ✓ | gstack + guard |
| retro remains advisory |  |  | ✓ | routing policy |

Legend:

```text
✓    directly tested
mock harness mechanics only
blank not meaningfully testable at that level
```
