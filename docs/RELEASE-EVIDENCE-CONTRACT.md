# Release & Deployment Evidence Contract v0.5

## RELEASE.json

Canonical location:

```text
.planning/phases/<phase>/RELEASE.json
```

Example:

```json
{
  "schema": 1,
  "owner": "gsd",
  "phase": "03-auth",
  "git": {
    "head": "abc...",
    "branch": "phase/03-auth"
  },
  "pr": {
    "number": 42,
    "url": "...",
    "state": "OPEN",
    "mergedAt": null,
    "mergeCommitSha": null,
    "headSha": "abc..."
  },
  "releaseState": "pr_open",
  "effectiveReleaseSha": "abc...",
  "deployment": null,
  "postShip": {}
}
```

## Effective release SHA

Resolution:

```text
merged PR with merge SHA
  -> mergeCommitSha

otherwise open PR with head SHA
  -> pr.headSha

otherwise
  -> local git HEAD
```

## Deployment evidence is explicit

PR creation is not deployment.

Deployment is recorded with:

```bash
node .gsd/capabilities/crew-quality/checks/release-ledger.cjs \
  record-deployment ".planning/phases/03-auth" \
  --status deployed \
  --url https://app.example.com \
  --sha <deployed-sha> \
  --environment production
```

Fields:

```text
status: pending | deployed | failed | rolled_back
url
environment
deployedSha
deployedAt
source
evidence
matchesRelease
```

## Canary readiness

Canary is ready only if all are true:

```text
deployment.status == deployed
deployment.url is non-empty
deployment.deployedSha is non-empty
deployment.deployedSha == effectiveReleaseSha
```

This prevents monitoring an older/newer production build and attributing its
health to the current release.

## Post-ship mutation

A docs-only commit may update PR HEAD after the initial GSD ship.

After document-release, the ledger is captured again so:

```text
effectiveReleaseSha
```

follows the actual PR head.

Existing deployment evidence may then become:

```text
matchesRelease: false
```

until that new PR head is deployed.

That automatically prevents Canary from treating an old deployment as the current
release.
