# M-1 준비 커밋 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** v0.7 재구성(M0~M7) 착수 전 안전장치 4종 — 프리릴리스 설치 거부, `$HOME` 루트 설치 거부, 레거시 백업/복구 도구, 부트스트랩 자기일관 태그 `v0.6.5` — 를 `main`에 커밋하고, 백업·레거시 제거 런북을 준비한다.

**Architecture:** 설계서 [`docs/V0.7-IMPLEMENTATION-DESIGN.md`](../../V0.7-IMPLEMENTATION-DESIGN.md) v1.3 §2.0(M-1)·§2.1~2.5(백업/제거)·§4.5(부트스트랩 자기일관성)의 실행 계획이다. 개명도 capability 분해도 하지 않는다 — 그것은 M1a/M1b다. 신규 코드는 `bin/triple-crown.cjs`의 거부 2건, `scripts/legacy-backup.cjs`, `e2e/contract/` L1 계약 테스트뿐이다.

**Tech Stack:** Node.js ≥24 (실측 24.18.0), `node:test` 러너, Node stdlib만 (외부 npm 의존성 0), 시스템 `tar`·`git`.

## Global Constraints

- 외부 npm 의존성 추가 금지. 설치자는 stdlib + 시스템 `tar`/`git`만 쓴다 (`package.json`에 dependencies 없음 유지).
- 커밋 메시지 형식: `<type>: <description>` (`feat`/`fix`/`refactor`/`docs`/`test`/`chore`).
- 매 태스크 종료 커밋 전 `npm run test:l1` green (Task 1이 이 스크립트를 만든다).
- **push 금지.** 커밋·태그는 로컬에만. push는 사용자 승인 후 별도.
- M-1은 개명 단계가 아니다. `crew` 명명은 백업 디렉터리 `~/.crew-legacy-backup` 하나뿐 (설계 §2.1 명시값). 코드 식별자·스킬명·환경변수는 전부 `triple-crown`/`TRIPLE_CROWN_*` 유지.
- 파일 800줄 이하. `scripts/legacy-backup.cjs` 목표 ~400줄.
- Task 8(릴리스 커밋)은 **스크립트 상수 + 문서 예시 + VERSION을 한 커밋**으로 만들고 **그 커밋에** `v0.6.5` 태그를 찍는다. 순서 뒤집기 금지 (§4.5 불변식).
- Task 9는 수동·파괴적 작업. **실행 전 반드시 사용자 확인.** 자동 실행 금지.

## File Structure

```
bin/triple-crown.cjs            수정 — parse()에 --allow-prerelease, install() 상단 거부 2건 (+~15줄)
scripts/legacy-backup.cjs       신규 — backup / verify / restore CLI (~400줄)
e2e/contract/                   신규 — L1 계약 테스트 (node --test)
  prerelease-fence.test.cjs       Task 1
  home-root-refusal.test.cjs      Task 2
  legacy-backup.test.cjs          Task 3~6
  install-entrypoints.test.cjs    Task 8 (릴리스 커밋에 포함)
  helpers/fake-home.cjs           Task 3 — 가짜 HOME 픽스처 빌더
package.json                    수정 — scripts["test:l1"], version 0.6.5 (Task 8)
install.sh / install.ps1        수정 — 기본 ref v0.6.5 (Task 8, 한 커밋)
README.md / docs/INSTALLER.md   수정 — 모든 github:/curl 예시 v0.6.5 고정 (Task 8, 같은 커밋)
VERSION                         수정 — 0.6.5 (Task 8, 같은 커밋)
tests/run_installer_smoke.py    수정 — 버전 하드코딩 제거 (Task 7)
tests/run_npx_tarball_smoke.py  수정 — 동일 (Task 7)
```

실측 기준점 (2026-08-20 확인):

- `install.sh:34` → `REF="${TRIPLE_CROWN_REF:-main}"` · `install.sh:11` 주석 curl 예시 `/main/`
- `install.ps1:22` → `$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "main" }`
- `bin/triple-crown.cjs:11` `VERSION` 파일 읽음 · `:85 parse()` · `:510 install()` 첫 줄이 root 존재 검사
- ref 미고정 예시: `README.md:29,35,41,48,67,73,85,112,127,128` · `docs/INSTALLER.md:93,99,106,113`
- 버전 하드코딩: `tests/run_installer_smoke.py:48` · `tests/run_npx_tarball_smoke.py:6,46`
- 실제 레거시 훅 그룹 (`~/.claude/settings.json`): `{"matcher":"Bash","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/triple-crown-ship-guard.cjs"}]}`
- `~/CLAUDE.md` 마커: 1행 start, 150행 end

---

### Task 1: 프리릴리스 설치 거부 + L1 러너 신설

**Files:**
- Create: `e2e/contract/prerelease-fence.test.cjs`
- Modify: `bin/triple-crown.cjs` (`parse()` ~85행, `install()` ~510행)
- Modify: `package.json` (`scripts`)

**Interfaces:**
- Produces: `npm run test:l1` = `node --test e2e/contract/` (이후 모든 태스크가 사용). `triple-crown install`은 `VERSION`에 하이픈이 있으면 exit 4 + stderr에 `prerelease` 포함, `--allow-prerelease`면 진행.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/prerelease-fence.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');

function copyPackage() {
  const pkg = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-prerelease-'));
  fs.cpSync(ROOT, pkg, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules');
    },
  });
  return pkg;
}

test('prerelease VERSION refuses install without --allow-prerelease', () => {
  const pkg = copyPackage();
  fs.writeFileSync(path.join(pkg, 'VERSION'), '0.7.0-test\n');
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const run = (args) => cp.spawnSync(
    process.execPath, [path.join(pkg, 'bin', 'triple-crown.cjs'), ...args],
    { encoding: 'utf8' }
  );

  const refused = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.notStrictEqual(refused.status, 0, 'prerelease install must be refused');
  assert.match(refused.stderr, /prerelease/i);

  const allowed = run(['install', '--yes', '--dry-run', '--project', proj, '--allow-prerelease']);
  assert.strictEqual(allowed.status, 0, allowed.stderr);
  assert.match(allowed.stdout, /DRY RUN/);
});

test('repo tree install behavior matches its own VERSION prerelease state', () => {
  // M0 이후 main의 VERSION은 0.7.0-dev가 되므로, 이 테스트는 상태에 따라
  // 기대를 뒤집는다 — 안정판이면 무플래그 설치 진행, 프리릴리스면 거부.
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const r = cp.spawnSync(
    process.execPath,
    [path.join(ROOT, 'bin', 'triple-crown.cjs'), 'install', '--yes', '--dry-run', '--project', proj],
    { encoding: 'utf8' }
  );
  if (version.includes('-')) {
    assert.notStrictEqual(r.status, 0, 'prerelease tree must refuse plain install');
    assert.match(r.stderr, /prerelease/i);
  } else {
    assert.strictEqual(r.status, 0, r.stderr);
    assert.match(r.stdout, /DRY RUN/);
  }
});
```

`package.json`의 `scripts`에 추가 (기존 `test`·`pack:check`는 그대로):

```jsonc
"test:l1": "node --test e2e/contract/"
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `unknown option: --allow-prerelease` (parse가 모르는 플래그) 그리고/또는 거부 미구현으로 refused.status가 0.

- [ ] **Step 3: 최소 구현**

`bin/triple-crown.cjs` `parse()`의 `out` 초기값에 `allowPrerelease:false` 추가, 옵션 루프에 한 줄 추가:

```js
    else if(a==='--allow-prerelease') out.allowPrerelease=true;
```

`install(root,opts)` 첫 줄(root 존재 검사) **바로 다음**에:

```js
  if(VERSION.includes('-') && !opts.allowPrerelease) {
    fail(`Triple Crown v${VERSION} is a prerelease build from a development branch. Install a tagged release instead, or pass --allow-prerelease to proceed anyway.`,4);
  }
```

`help()`의 Install options 목록에 한 줄 추가:

```
  --allow-prerelease   Install even when VERSION is a prerelease build
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (2 tests)

- [ ] **Step 5: 기존 스모크 회귀 확인**

Run: `npm test`
Expected: PASS — 스모크는 `--allow-prerelease`를 쓰지 않고 VERSION=0.6.4는 프리릴리스가 아니므로 영향 없음.

- [ ] **Step 6: 커밋**

```bash
git add e2e/contract/prerelease-fence.test.cjs bin/triple-crown.cjs package.json
git commit -m "feat: refuse installing prerelease builds unless --allow-prerelease"
```

---

### Task 2: `$HOME` 루트 설치 거부

**Files:**
- Create: `e2e/contract/home-root-refusal.test.cjs`
- Modify: `bin/triple-crown.cjs` (`install()` 상단)

**Interfaces:**
- Consumes: Task 1의 `npm run test:l1`.
- Produces: `install`은 프로젝트 루트가 `os.homedir()`와 같으면(realpath 비교) exit 4 + stderr에 `$HOME` 포함. D13 재발 방지의 사전 거부 (설계 §2.0 4번).

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/home-root-refusal.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const CLI = path.join(ROOT, 'bin', 'triple-crown.cjs');

test('installer refuses $HOME as project root', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-home-'));
  const run = (args) => cp.spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, HOME: fakeHome },
  });

  const refused = run(['install', '--yes', '--dry-run', '--project', fakeHome]);
  assert.notStrictEqual(refused.status, 0, 'installing into $HOME must be refused');
  assert.match(refused.stderr, /\$HOME/);

  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-proj-'));
  const ok = run(['install', '--yes', '--dry-run', '--project', proj]);
  assert.strictEqual(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /DRY RUN/);
});
```

(POSIX에서 `os.homedir()`는 `HOME` 환경변수를 우선한다 — 자식 프로세스에 `HOME`만 바꿔 넘기면 된다.)

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `refused.status`가 0 (거부 미구현, dry-run이 그냥 성공).

- [ ] **Step 3: 최소 구현**

`bin/triple-crown.cjs` — `versionTuple` 근처 유틸 영역에 추가:

```js
function sameRealPath(a,b) {
  try { return fs.realpathSync(a)===fs.realpathSync(b); }
  catch { return path.resolve(a)===path.resolve(b); }
}
```

`install()`의 프리릴리스 거부(Task 1) **바로 다음**에:

```js
  if(sameRealPath(root, os.homedir())) {
    fail(`Refusing to install with the home directory as project root ($HOME = ${os.homedir()}). A $HOME-rooted install collapses project scope into global scope. Run from inside a project, or pass --project <project path>.`,4);
  }
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add e2e/contract/home-root-refusal.test.cjs bin/triple-crown.cjs
git commit -m "feat: refuse \$HOME as project root to prevent scope collapse"
```

---

### Task 3: `legacy-backup.cjs backup` + fake-home 헬퍼

**Files:**
- Create: `e2e/contract/helpers/fake-home.cjs`
- Create: `e2e/contract/legacy-backup.test.cjs`
- Create: `scripts/legacy-backup.cjs`

**Interfaces:**
- Produces:
  - `node scripts/legacy-backup.cjs backup [--dest DIR]` — 기본 dest `~/.crew-legacy-backup/<YYYY-MM-DD>/`. 산출물: `archive.tar.gz`, `MANIFEST.json`, `CLAUDE.md.fragment`, `settings.json.hookgroup`, `restore.sh`, `legacy-backup.cjs`(자기 사본 — 백업만으로 복구 가능해야 하므로).
  - `MANIFEST.json` 스키마: `{schema:1, createdAt, home, restoreOrder:[rel...], targets:[{rel,kind}], files:[{path,kind,sha256,bytes,mode}], claudeMd:{present,startLine,endLine,fragmentSha256}, settings:{present,sha256,hasHookGroup}}`
  - 헬퍼 `mkFakeHome()` → 레거시 6곳이 심어진 임시 HOME 경로. `runBackupTool(args, env)` → `spawnSync` 결과. Task 4~6이 사용.

- [ ] **Step 1: 헬퍼 작성**

`e2e/contract/helpers/fake-home.cjs`:

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const ROUTING_BLOCK = [
  '<!-- triple-crown:managed-routing:start -->',
  '## Triple Crown routing (legacy fixture)',
  'routing body line',
  '<!-- triple-crown:managed-routing:end -->',
].join('\n') + '\n';

const HOOK_GROUP = {
  matcher: 'Bash',
  hooks: [{
    type: 'command',
    command: '"$CLAUDE_PROJECT_DIR"/.claude/hooks/triple-crown-ship-guard.cjs',
  }],
};

const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];

function mkFakeHome() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-fake-home-'));
  const w = (rel, content) => {
    const p = path.join(home, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  };
  for (const id of CAPABILITIES) {
    w(`.gsd/capabilities/${id}/capability.json`, JSON.stringify({ id }) + '\n');
  }
  w('.triple-crown/VERSION', '0.6.3\n');
  w('.triple-crown/INSTALL-MANIFEST.json', '{}\n');
  w('.claude/hooks/triple-crown-ship-guard.cjs', '#!/usr/bin/env node\nprocess.exit(0);\n');
  w('CLAUDE.md', ROUTING_BLOCK + '\n# user content\nuser line kept\n');
  w('.claude/settings.json',
    JSON.stringify({ hooks: { PreToolUse: [HOOK_GROUP] }, userSetting: true }, null, 2) + '\n');
  w('.claude/skills/gsd-triple-crown/SKILL.md', '---\nname: gsd-triple-crown\n---\n');
  w('.claude/skills/gsd-triple-crown/.triple-crown-skill', '');
  return home;
}

function runBackupTool(args, env) {
  const script = path.join(__dirname, '..', '..', '..', 'scripts', 'legacy-backup.cjs');
  return cp.spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

module.exports = { mkFakeHome, runBackupTool, ROUTING_BLOCK, HOOK_GROUP, CAPABILITIES };
```

- [ ] **Step 2: 실패하는 테스트 작성**

`e2e/contract/legacy-backup.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { mkFakeHome, runBackupTool, CAPABILITIES } = require('./helpers/fake-home.cjs');

test('backup captures all legacy targets into manifest + archive', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const manifest = JSON.parse(fs.readFileSync(path.join(dest, 'MANIFEST.json'), 'utf8'));
  const rels = manifest.targets.map((t) => t.rel);
  assert.ok(rels.includes('.triple-crown'));
  for (const id of CAPABILITIES) assert.ok(rels.includes(`.gsd/capabilities/${id}`), id);
  assert.ok(rels.includes('.claude/hooks/triple-crown-ship-guard.cjs'));
  assert.ok(rels.includes('.claude/skills/gsd-triple-crown'));
  assert.ok(rels.includes('CLAUDE.md'));
  assert.ok(rels.includes('.claude/settings.json'));

  assert.strictEqual(manifest.claudeMd.present, true);
  assert.strictEqual(manifest.claudeMd.startLine, 1);
  assert.strictEqual(manifest.settings.hasHookGroup, true);
  assert.ok(manifest.files.some((f) => f.kind === 'file' && f.sha256.startsWith('sha256:')));

  const frag = fs.readFileSync(path.join(dest, 'CLAUDE.md.fragment'), 'utf8');
  assert.ok(frag.startsWith('<!-- triple-crown:managed-routing:start -->'));
  assert.ok(frag.trimEnd().endsWith('<!-- triple-crown:managed-routing:end -->'));

  const group = JSON.parse(fs.readFileSync(path.join(dest, 'settings.json.hookgroup'), 'utf8'));
  assert.strictEqual(group.matcher, 'Bash');
  assert.match(group.hooks[0].command, /triple-crown-ship-guard\.cjs/);

  assert.ok(fs.existsSync(path.join(dest, 'archive.tar.gz')));
  assert.ok(fs.existsSync(path.join(dest, 'legacy-backup.cjs')));
  assert.ok(fs.statSync(path.join(dest, 'restore.sh')).mode & 0o100, 'restore.sh must be executable');
});

test('backup refuses a non-empty destination and an empty home', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  fs.mkdirSync(dest, { recursive: true });
  fs.writeFileSync(path.join(dest, 'existing'), 'x');
  const r = runBackupTool(['backup', '--dest', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0);

  const emptyHome = fs.mkdtempSync(path.join(require('os').tmpdir(), 'crew-empty-'));
  const r2 = runBackupTool(['backup', '--dest', path.join(emptyHome, 'b')], { HOME: emptyHome });
  assert.notStrictEqual(r2.status, 0);
  assert.match(r2.stderr, /nothing to back up/i);
});
```

- [ ] **Step 3: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `scripts/legacy-backup.cjs` 부재로 spawn 실패(status ≠ 0), MANIFEST 부재로 readFileSync throw.

- [ ] **Step 4: 구현**

`scripts/legacy-backup.cjs` (신규 — backup 부분. verify/restore는 Task 4~6에서 추가):

```js
#!/usr/bin/env node
'use strict';

// Legacy Triple Crown installation backup / verify / restore.
// Self-contained: a copy of this file is placed inside every backup so the
// backup alone can restore the machine (design doc §2.1, §2.5).

const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const crypto = require('crypto');

const ROUTING_START = '<!-- triple-crown:managed-routing:start -->';
const ROUTING_END = '<!-- triple-crown:managed-routing:end -->';
const SHIP_GUARD = 'triple-crown-ship-guard.cjs';
const CAPABILITIES = ['triple-gstack', 'triple-superpowers', 'triple-crown-guide'];
const SKILL_MARKERS = ['.triple-crown-skill', '.crew-skill'];

function log(m = '') { process.stdout.write(String(m) + '\n'); }
function fail(msg, code = 1) { process.stderr.write(`legacy-backup: ${msg}\n`); process.exit(code); }
function sha256(buf) { return 'sha256:' + crypto.createHash('sha256').update(buf).digest('hex'); }
function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function walkFiles(abs, rel, out) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) {
    out.push({ path: rel, kind: 'symlink',
      sha256: sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))), bytes: 0, mode: st.mode & 0o777 });
    return;
  }
  if (st.isFile()) {
    const buf = fs.readFileSync(abs);
    out.push({ path: rel, kind: 'file', sha256: sha256(buf), bytes: buf.length, mode: st.mode & 0o777 });
    return;
  }
  if (st.isDirectory()) {
    out.push({ path: rel, kind: 'dir', sha256: null, bytes: 0, mode: st.mode & 0o777 });
    for (const e of fs.readdirSync(abs).sort()) walkFiles(path.join(abs, e), `${rel}/${e}`, out);
  }
}

function collectTargets(home) {
  const targets = [];
  const dir = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'dir' }); };
  const file = (rel) => { if (exists(path.join(home, rel))) targets.push({ rel, kind: 'file' }); };
  dir('.triple-crown');
  for (const id of CAPABILITIES) dir(`.gsd/capabilities/${id}`);
  file(`.claude/hooks/${SHIP_GUARD}`);
  const skillsRoot = path.join(home, '.claude', 'skills');
  if (exists(skillsRoot)) {
    for (const e of fs.readdirSync(skillsRoot).sort()) {
      const d = path.join(skillsRoot, e);
      if (fs.statSync(d).isDirectory() && SKILL_MARKERS.some((m) => exists(path.join(d, m)))) {
        targets.push({ rel: `.claude/skills/${e}`, kind: 'dir' });
      }
    }
  }
  file('CLAUDE.md');
  file('.claude/settings.json');
  return targets;
}

function extractFragment(home) {
  const p = path.join(home, 'CLAUDE.md');
  if (!exists(p)) return { present: false };
  const lines = fs.readFileSync(p, 'utf8').split('\n');
  const s = lines.findIndex((l) => l.trim() === ROUTING_START);
  const e = lines.findIndex((l) => l.trim() === ROUTING_END);
  if (s === -1 || e === -1 || e < s) return { present: false };
  const fragment = lines.slice(s, e + 1).join('\n') + '\n';
  return { present: true, startLine: s + 1, endLine: e + 1, fragment,
    fragmentSha256: sha256(Buffer.from(fragment)) };
}

function extractHookGroup(home) {
  const p = path.join(home, '.claude', 'settings.json');
  if (!exists(p)) return { present: false };
  const raw = fs.readFileSync(p);
  let parsed;
  try { parsed = JSON.parse(raw.toString('utf8')); }
  catch (err) { fail(`~/.claude/settings.json is not valid JSON: ${err.message}`, 2); }
  const pre = parsed && parsed.hooks && parsed.hooks.PreToolUse;
  const groups = Array.isArray(pre) ? pre.filter((g) =>
    Array.isArray(g && g.hooks) &&
    g.hooks.some((h) => String((h && h.command) || '').includes(SHIP_GUARD))) : [];
  if (groups.length > 1) fail(`unexpected: ${groups.length} ship-guard hook groups in settings.json`, 2);
  return { present: true, sha256: sha256(raw), group: groups[0] || null };
}

function backup(opts) {
  const home = os.homedir();
  const dest = opts.dest || path.join(home, '.crew-legacy-backup', new Date().toISOString().slice(0, 10));
  if (exists(dest) && fs.readdirSync(dest).length) {
    fail(`backup destination already exists and is not empty: ${dest}`, 2);
  }
  const targets = collectTargets(home);
  if (!targets.length) fail('nothing to back up: no legacy installation found', 2);
  const files = [];
  for (const t of targets) walkFiles(path.join(home, t.rel), t.rel, files);
  const frag = extractFragment(home);
  const hook = extractHookGroup(home);

  fs.mkdirSync(dest, { recursive: true });
  const tar = cp.spawnSync('tar',
    ['-czf', path.join(dest, 'archive.tar.gz'), '-C', home, '--', ...targets.map((t) => t.rel)],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (tar.error || tar.status !== 0) {
    fail(`tar failed: ${(tar.stderr || (tar.error && tar.error.message) || '').trim()}`, 2);
  }
  if (frag.present) fs.writeFileSync(path.join(dest, 'CLAUDE.md.fragment'), frag.fragment);
  if (hook.present && hook.group) {
    fs.writeFileSync(path.join(dest, 'settings.json.hookgroup'), JSON.stringify(hook.group, null, 2) + '\n');
  }
  const semantic = new Set(['CLAUDE.md', '.claude/settings.json']);
  const manifest = {
    schema: 1,
    createdAt: new Date().toISOString(),
    home,
    restoreOrder: targets.filter((t) => !semantic.has(t.rel)).map((t) => t.rel),
    targets,
    files,
    claudeMd: frag.present
      ? { present: true, startLine: frag.startLine, endLine: frag.endLine, fragmentSha256: frag.fragmentSha256 }
      : { present: false },
    settings: hook.present
      ? { present: true, sha256: hook.sha256, hasHookGroup: !!hook.group }
      : { present: false },
  };
  fs.writeFileSync(path.join(dest, 'MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  fs.copyFileSync(__filename, path.join(dest, 'legacy-backup.cjs'));
  fs.writeFileSync(path.join(dest, 'restore.sh'),
    '#!/usr/bin/env bash\nset -euo pipefail\nHERE="$(cd "$(dirname "$0")" && pwd -P)"\n' +
    'exec node "$HERE/legacy-backup.cjs" restore --from "$HERE" "$@"\n',
    { mode: 0o755 });
  log(`backup complete: ${dest}`);
  log(`targets: ${targets.length}, files: ${files.length}`);
}

function parseArgs(argv) {
  const out = { command: argv[0], dest: null, from: null, dryRun: false };
  const rest = argv.slice(1);
  while (rest.length) {
    const a = rest.shift();
    if (a === '--dest') out.dest = rest.shift() || fail('--dest requires a path', 2);
    else if (a === '--from') out.from = rest.shift() || fail('--from requires a path', 2);
    else if (a === '--dry-run') out.dryRun = true;
    else fail(`unknown option: ${a}`, 2);
  }
  return out;
}

const opts = parseArgs(process.argv.slice(2));
if (opts.command === 'backup') backup(opts);
else fail('usage: legacy-backup.cjs backup [--dest DIR] | verify --from DIR | restore --from DIR [--dry-run]', 2);
```

- [ ] **Step 5: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (5 tests)

- [ ] **Step 6: 커밋**

```bash
git add e2e/contract/helpers/fake-home.cjs e2e/contract/legacy-backup.test.cjs scripts/legacy-backup.cjs
git commit -m "feat: legacy-backup backup subcommand with manifest + archive"
```

---

### Task 4: `legacy-backup.cjs verify` + `restore --dry-run`

**Files:**
- Modify: `scripts/legacy-backup.cjs`
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 3의 `backup`, 헬퍼 `mkFakeHome()`/`runBackupTool()`.
- Produces:
  - `verify --from DIR` — 아카이브를 임시 디렉터리에 풀어 `MANIFEST.json`의 `files[]` sha256 전수 대조. 불일치 목록 출력 + exit 2, 전부 일치 시 exit 0.
  - `restore --from DIR --dry-run` — verify를 먼저 수행한 뒤 복구 대상·충돌 목록만 출력. **쓰기 없음.** exit 0.
  - 내부 함수 `verifyArchive(from)` → `{manifest, problems}` (Task 5의 restore가 §2.5 1단계로 재사용). `restoreClaudeMd(home, from, manifest, actions, dryRun)`/`restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처를 스텁으로 고정 (Task 5·6이 본문 교체).

- [ ] **Step 1: 실패하는 테스트 추가**

`e2e/contract/legacy-backup.test.cjs`에 추가:

```js
test('verify passes on intact backup and fails on tampered manifest', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  assert.strictEqual(runBackupTool(['verify', '--from', dest], { HOME: home }).status, 0);

  const mp = path.join(dest, 'MANIFEST.json');
  const manifest = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const target = manifest.files.find((f) => f.kind === 'file');
  target.sha256 = 'sha256:' + '0'.repeat(64);
  fs.writeFileSync(mp, JSON.stringify(manifest, null, 2) + '\n');
  const bad = runBackupTool(['verify', '--from', dest], { HOME: home });
  assert.notStrictEqual(bad.status, 0);
  assert.match(bad.stdout + bad.stderr, /mismatch/i);
});

test('restore --dry-run reports actions without writing', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 벤더 디렉터리와 훅 파일 삭제
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  const claudeMdBefore = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');

  const r = runBackupTool(['restore', '--from', dest, '--dry-run'], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.match(r.stdout, /\[dry-run\]/);
  assert.match(r.stdout, /\.triple-crown/);

  assert.strictEqual(fs.existsSync(path.join(home, '.triple-crown')), false, 'dry-run must not write');
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), claudeMdBefore);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — `verify`/`restore` 분기 부재로 usage 오류 (exit 2).

- [ ] **Step 3: 구현**

`scripts/legacy-backup.cjs`의 `backup()` 뒤에 추가:

```js
function extractArchive(from) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-legacy-x-'));
  const r = cp.spawnSync('tar', ['-xzf', path.join(from, 'archive.tar.gz'), '-C', tmp],
    { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    fail(`tar extract failed: ${(r.stderr || (r.error && r.error.message) || '').trim()}`, 2);
  }
  return tmp;
}

function verifyArchive(from) {
  if (!exists(path.join(from, 'MANIFEST.json'))) fail(`no MANIFEST.json in ${from}`, 2);
  const manifest = readJson(path.join(from, 'MANIFEST.json'));
  if (manifest.schema !== 1) fail(`unsupported manifest schema: ${manifest.schema}`, 2);
  const tmp = extractArchive(from);
  const problems = [];
  try {
    for (const f of manifest.files) {
      const abs = path.join(tmp, f.path);
      if (!exists(abs)) { problems.push(`missing in archive: ${f.path}`); continue; }
      if (f.kind === 'file') {
        if (sha256(fs.readFileSync(abs)) !== f.sha256) problems.push(`sha256 mismatch: ${f.path}`);
      } else if (f.kind === 'symlink') {
        const st = fs.lstatSync(abs);
        if (!st.isSymbolicLink() ||
            sha256(Buffer.from('symlink:' + fs.readlinkSync(abs))) !== f.sha256) {
          problems.push(`symlink mismatch: ${f.path}`);
        }
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { manifest, problems };
}

function verify(opts) {
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail(`${problems.length} mismatch(es) between MANIFEST.json and archive`, 2);
  }
  log(`verify OK: ${manifest.files.length} entries match archive`);
}

function restoreClaudeMd(home, from, manifest, actions, dryRun) {
  actions.push('CLAUDE.md: (not implemented yet)');
}

function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  actions.push('settings.json: (not implemented yet)');
}

function restore(opts) {
  const home = os.homedir();
  if (!opts.from) fail('--from <backup dir> is required', 2);
  const { manifest, problems } = verifyArchive(opts.from);   // 설계 §2.5 1단계
  if (problems.length) {
    for (const p of problems) log(`FAIL ${p}`);
    fail('archive does not match MANIFEST.json — aborting restore', 2);
  }
  const tmp = extractArchive(opts.from);
  const actions = [];
  try {
    for (const rel of manifest.restoreOrder) {
      const dst = path.join(home, rel);
      actions.push(`${exists(dst) ? 'overwrite' : 'create'}: ~/${rel}`);
      if (!opts.dryRun) {
        fs.rmSync(dst, { recursive: true, force: true });
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.cpSync(path.join(tmp, rel), dst, { recursive: true });
      }
    }
    restoreClaudeMd(home, opts.from, manifest, actions, opts.dryRun);
    restoreSettings(home, tmp, opts.from, manifest, actions, opts.dryRun);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  for (const a of actions) log((opts.dryRun ? '[dry-run] ' : '') + a);
  if (opts.dryRun) { log('dry-run: no writes performed'); return; }
  log('restore complete. Verify capability registrations with: gsd-tools capability list');
}
```

디스패처 마지막 분기 교체:

```js
if (opts.command === 'backup') backup(opts);
else if (opts.command === 'verify') verify(opts);
else if (opts.command === 'restore') restore(opts);
else fail('usage: legacy-backup.cjs backup [--dest DIR] | verify --from DIR | restore --from DIR [--dry-run]', 2);
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup verify and restore --dry-run"
```

---

### Task 5: `restore` 실쓰기 — 파일·디렉터리 원복 + CLAUDE.md 마커 재삽입

**Files:**
- Modify: `scripts/legacy-backup.cjs` (`restoreClaudeMd` 스텁 교체)
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 4의 `restore()` 골격 (restoreOrder 복사는 이미 동작), `restoreClaudeMd` 시그니처.
- Produces: `restoreClaudeMd` 의미론 —
  - `~/CLAUDE.md` 부재 → fragment로 새로 생성
  - 마커 쌍이 이미 있음 → 무동작 (멱등)
  - 마커 없음 + 원래 startLine이 1 → fragment를 파일 앞에 삽입, 그 외 → 끝에 추가
  - 사용자 작성분은 어떤 경우에도 보존. **위치가 아니라 정체(마커)로 판단** (설계 §2.5 3항)

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('restore puts back removed targets and reinserts CLAUDE.md fragment', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거를 흉내: 디렉터리·훅 삭제 + CLAUDE.md에서 마커 블록만 제거
  fs.rmSync(path.join(home, '.triple-crown'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.gsd/capabilities/triple-gstack'), { recursive: true, force: true });
  fs.rmSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs'), { force: true });
  fs.writeFileSync(path.join(home, 'CLAUDE.md'), '# user content\nuser line kept\nuser added later\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  assert.ok(fs.existsSync(path.join(home, '.triple-crown/VERSION')));
  assert.ok(fs.existsSync(path.join(home, '.gsd/capabilities/triple-gstack/capability.json')));
  assert.ok(fs.existsSync(path.join(home, '.claude/hooks/triple-crown-ship-guard.cjs')));

  const md = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  assert.match(md, /triple-crown:managed-routing:start/);
  assert.match(md, /user added later/, 'user content must survive');
  assert.ok(md.indexOf('managed-routing:start') < md.indexOf('# user content'),
    'fragment restored at original position (line 1 -> prepend)');
});

test('restore is idempotent for CLAUDE.md when markers already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);
  const before = fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8');
  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(fs.readFileSync(path.join(home, 'CLAUDE.md'), 'utf8'), before);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — 첫 테스트의 `assert.match(md, /triple-crown:managed-routing:start/)` (스텁이라 재삽입 안 됨).

- [ ] **Step 3: 구현 — `restoreClaudeMd` 스텁 교체**

```js
function restoreClaudeMd(home, from, manifest, actions, dryRun) {
  if (!manifest.claudeMd.present) { actions.push('CLAUDE.md: no fragment in backup — skip'); return; }
  const p = path.join(home, 'CLAUDE.md');
  const fragment = fs.readFileSync(path.join(from, 'CLAUDE.md.fragment'), 'utf8');
  if (!exists(p)) {
    actions.push('CLAUDE.md: missing — create with fragment');
    if (!dryRun) fs.writeFileSync(p, fragment);
    return;
  }
  const text = fs.readFileSync(p, 'utf8');
  if (text.includes(ROUTING_START) && text.includes(ROUTING_END)) {
    actions.push('CLAUDE.md: marker block already present — no-op');
    return;
  }
  if (manifest.claudeMd.startLine === 1) {
    actions.push('CLAUDE.md: prepend fragment (original position: line 1)');
    if (!dryRun) fs.writeFileSync(p, fragment + text);
  } else {
    actions.push('CLAUDE.md: append fragment');
    if (!dryRun) fs.writeFileSync(p, text.replace(/\n?$/, '\n') + fragment);
  }
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (9 tests)

- [ ] **Step 5: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup restore with marker-based CLAUDE.md reinsertion"
```

---

### Task 6: `restore` settings.json 의미 기반 재삽입 (§2.5.1)

**Files:**
- Modify: `scripts/legacy-backup.cjs` (`restoreSettings` 스텁 교체)
- Modify: `e2e/contract/legacy-backup.test.cjs` (테스트 추가)

**Interfaces:**
- Consumes: Task 3의 `settings.json.hookgroup` 산출물, Task 4의 `restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처.
- Produces: `restoreSettings` 의미론 (설계 §2.5.1 그대로) —
  1. 현재 sha256 == 백업 sha256 → 파일 전체 복원 (안전)
  2. 다르면 덮어쓰지 않고 의미 기반 재삽입: (a) JSON 파싱 실패 또는 `hooks`/`hooks.PreToolUse`가 존재하는데 타입 불일치 → 충돌 보고 + exit 3, 자동 쓰기 없음, 수동 복구 안내 (b) ship-guard command 포함 그룹 존재 → 무동작 (c) 없으면 hookgroup 객체를 배열 끝에 push
  3. 다른 배열 요소 불변. 인덱스 미참조
- 설계 결정: `hooks`/`hooks.PreToolUse` 키 자체가 **없으면** 생성 후 push한다. §2.5.1 2a의 "배열이 아님"은 존재하는 값의 타입 불일치를 뜻하며, 부재는 불일치가 아니다 — `scripts/install-claude-ship-guard.cjs`가 설치 시 같은 의미론으로 구조를 만든다.

- [ ] **Step 1: 실패하는 테스트 추가**

```js
test('settings restore: predicate-based reinsert preserves user hooks', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // 제거 흉내(그룹 삭제) + 사용자가 자기 훅 추가
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.hooks.PreToolUse = [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'my-user-hook.sh' }] }];
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);

  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.strictEqual(after.userSetting, true, 'unrelated keys preserved');
  assert.strictEqual(after.hooks.PreToolUse.length, 2);
  assert.strictEqual(after.hooks.PreToolUse[0].hooks[0].command, 'my-user-hook.sh',
    'user hook untouched, index not referenced');
  assert.match(after.hooks.PreToolUse[1].hooks[0].command, /triple-crown-ship-guard\.cjs/);
});

test('settings restore: no duplicate when group already present', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  // sha를 어긋나게 하되 그룹은 그대로 둠
  const sp = path.join(home, '.claude/settings.json');
  const settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
  settings.newUserKey = 1;
  fs.writeFileSync(sp, JSON.stringify(settings, null, 2) + '\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.strictEqual(r.status, 0, r.stderr);
  const after = JSON.parse(fs.readFileSync(sp, 'utf8'));
  const guardGroups = after.hooks.PreToolUse.filter((g) =>
    g.hooks.some((h) => String(h.command || '').includes('triple-crown-ship-guard.cjs')));
  assert.strictEqual(guardGroups.length, 1, 'idempotent — no duplicate');
  assert.strictEqual(after.newUserKey, 1);
});

test('settings restore: aborts without writing when current file is invalid JSON', () => {
  const home = mkFakeHome();
  const dest = path.join(home, 'backup');
  assert.strictEqual(runBackupTool(['backup', '--dest', dest], { HOME: home }).status, 0);

  const sp = path.join(home, '.claude/settings.json');
  fs.writeFileSync(sp, '{ broken json\n');

  const r = runBackupTool(['restore', '--from', dest], { HOME: home });
  assert.notStrictEqual(r.status, 0);
  assert.match(r.stderr, /manual/i);
  assert.strictEqual(fs.readFileSync(sp, 'utf8'), '{ broken json\n', 'no automatic write on conflict');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm run test:l1`
Expected: FAIL — 첫 테스트 `after.hooks.PreToolUse.length` 1 ≠ 2 (스텁이라 재삽입 안 됨).

- [ ] **Step 3: 구현 — `restoreSettings` 스텁 교체**

```js
function restoreSettings(home, tmp, from, manifest, actions, dryRun) {
  if (!manifest.settings.present) { actions.push('settings.json: not in backup — skip'); return; }
  const dst = path.join(home, '.claude', 'settings.json');
  const backupRaw = fs.readFileSync(path.join(tmp, '.claude', 'settings.json'));
  if (!exists(dst)) {
    actions.push('settings.json: missing — restore full file from backup');
    if (!dryRun) { fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, backupRaw); }
    return;
  }
  const currentRaw = fs.readFileSync(dst);
  if (sha256(currentRaw) === manifest.settings.sha256) {
    actions.push('settings.json: unchanged since backup — full restore is safe');
    if (!dryRun) fs.writeFileSync(dst, backupRaw);
    return;
  }
  if (!manifest.settings.hasHookGroup) {
    actions.push('settings.json: changed since backup, no hook group to reinsert — leaving as is');
    return;
  }
  const manual = `settings.json changed since backup and cannot be merged automatically. ` +
    `No write performed. Reinsert the group from ${path.join(from, 'settings.json.hookgroup')} ` +
    `into hooks.PreToolUse manually.`;
  let parsed;
  try { parsed = JSON.parse(currentRaw.toString('utf8')); }
  catch (err) { fail(`${manual} (parse error: ${err.message})`, 3); }
  if (parsed.hooks !== undefined && (typeof parsed.hooks !== 'object' || parsed.hooks === null)) fail(manual, 3);
  if (parsed.hooks && parsed.hooks.PreToolUse !== undefined && !Array.isArray(parsed.hooks.PreToolUse)) {
    fail(manual, 3);
  }
  parsed.hooks = parsed.hooks || {};
  parsed.hooks.PreToolUse = parsed.hooks.PreToolUse || [];
  const present = parsed.hooks.PreToolUse.some((g) =>
    Array.isArray(g && g.hooks) &&
    g.hooks.some((h) => String((h && h.command) || '').includes(SHIP_GUARD)));
  if (present) { actions.push('settings.json: ship-guard group already present — no-op'); return; }
  const group = readJson(path.join(from, 'settings.json.hookgroup'));
  parsed.hooks.PreToolUse.push(group);
  actions.push('settings.json: reinserted ship-guard hook group (predicate match, appended)');
  if (!dryRun) fs.writeFileSync(dst, JSON.stringify(parsed, null, 2) + '\n');
}
```

- [ ] **Step 4: 통과 확인**

Run: `npm run test:l1`
Expected: PASS (12 tests)

- [ ] **Step 5: 줄 수 확인**

Run: `wc -l scripts/legacy-backup.cjs`
Expected: 800줄 미만 (목표 ~400).

- [ ] **Step 6: 커밋**

```bash
git add scripts/legacy-backup.cjs e2e/contract/legacy-backup.test.cjs
git commit -m "feat: legacy-backup settings restore via semantic predicate merge"
```

---

### Task 7: 스모크 테스트 버전 하드코딩 제거

**Files:**
- Modify: `tests/run_installer_smoke.py:48`
- Modify: `tests/run_npx_tarball_smoke.py:6,46`

**Interfaces:**
- Produces: 스모크가 기대 버전을 저장소 `VERSION` 파일에서 읽는다. Task 8의 0.6.5 범프가 테스트를 깨지 않게 하는 선행 조건.

- [ ] **Step 1: 수정**

`tests/run_installer_smoke.py` — 기존:

```python
        assert (project/".triple-crown"/"VERSION").read_text().strip()=="0.6.4"
```

교체 (이 파일의 저장소 루트 변수를 그대로 사용 — `ROOT`가 이미 정의돼 있으면 그것, 없으면 `Path(__file__).resolve().parents[1]`):

```python
        expected_version=(ROOT/"VERSION").read_text().strip()
        assert (project/".triple-crown"/"VERSION").read_text().strip()==expected_version
```

`tests/run_npx_tarball_smoke.py` — 기존 6행·46행:

```python
TGZ=ROOT/"triple-crown-workflow-installer-0.6.4.tgz"
        assert (project/".triple-crown"/"VERSION").read_text().strip()=="0.6.4"
```

교체:

```python
EXPECTED_VERSION=(ROOT/"VERSION").read_text().strip()
TGZ=ROOT/f"triple-crown-workflow-installer-{EXPECTED_VERSION}.tgz"
        assert (project/".triple-crown"/"VERSION").read_text().strip()==EXPECTED_VERSION
```

- [ ] **Step 2: 확인**

Run: `npm test && npm run test:l1`
Expected: 둘 다 PASS (VERSION은 아직 0.6.4이므로 동작 동일 — 리팩터링만).

- [ ] **Step 3: 커밋**

```bash
git add tests/run_installer_smoke.py tests/run_npx_tarball_smoke.py
git commit -m "test: read expected version from VERSION file in smoke tests"
```

---

### Task 8: v0.6.5 릴리스 커밋 + 태그 — 부트스트랩 자기일관성

이 태스크의 산출물 전체가 **한 커밋**이어야 한다 (설계 §4.5 계층 1). 테스트가 먼저 RED가 되고, 상수·문서 갱신으로 GREEN이 된 뒤, **그 커밋에** 태그를 찍는다.

**Files:**
- Create: `e2e/contract/install-entrypoints.test.cjs`
- Modify: `install.sh:11,34` · `install.ps1:22`
- Modify: `README.md:29,35,41,48,67,73,85,112,127,128` · `docs/INSTALLER.md:24,30,38,93,99,106,113,380`
- Modify: `VERSION` (0.6.4 → 0.6.5) · `package.json` (`"version": "0.6.5"`)

**Interfaces:**
- Produces: 불변식 — **`VERSION`이 프리릴리스가 아니면 install.sh/ps1 기본 ref == `v<VERSION>` 이고, 문서의 모든 `github:ungkey/triple-crown` 예시와 raw curl 경로가 그 태그로 고정.** 태그 `v0.6.5`는 이 불변식을 만족하는 커밋 자신을 가리킨다. M0 첫 커밋이 VERSION을 `0.7.0-dev`로 올리면 이후 `main`의 어떤 진입점 설치도 Task 1의 fence가 거부한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`e2e/contract/install-entrypoints.test.cjs`:

```js
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function shDefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.sh'), 'utf8')
    .match(/^REF="\$\{TRIPLE_CROWN_REF:-([^}]+)\}"/m);
  assert.ok(m, 'install.sh default ref constant not found');
  return m[1];
}

function ps1DefaultRef() {
  const m = fs.readFileSync(path.join(ROOT, 'install.ps1'), 'utf8')
    .match(/\$ref = if \(\$env:TRIPLE_CROWN_REF\) \{ \$env:TRIPLE_CROWN_REF \} else \{ "([^"]+)" \}/);
  assert.ok(m, 'install.ps1 default ref constant not found');
  return m[1];
}

test('default bootstrap ref is not a branch name', () => {
  for (const ref of [shDefaultRef(), ps1DefaultRef()]) {
    assert.ok(!['main', 'master'].includes(ref), `default ref is a branch: ${ref}`);
  }
});

test('release tree: default ref equals the tag this tree ships as', () => {
  const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
  if (version.includes('-')) return; // prerelease tree: ref stays on the last stable tag
  assert.strictEqual(shDefaultRef(), `v${version}`);
  assert.strictEqual(ps1DefaultRef(), `v${version}`);
});

test('every documented github install example pins the bootstrap tag', () => {
  const ref = shDefaultRef();
  const scanned = ['README.md', 'docs/INSTALLER.md', 'docs/WORKFLOW-GUIDE.md', 'install.sh', 'install.ps1']
    .map((p) => path.join(ROOT, p)).filter((p) => fs.existsSync(p));
  const bad = [];
  for (const p of scanned) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/github:ungkey\/triple-crown(#[\w.\-]+)?/g)) {
        if (m[1] !== `#${ref}`) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ${m[0]}`);
      }
      for (const m of line.matchAll(/raw\.githubusercontent\.com\/ungkey\/triple-crown\/([^/]+)\//g)) {
        if (m[1] !== ref) bad.push(`${path.relative(ROOT, p)}:${i + 1}: ref=${m[1]}`);
      }
    });
  }
  assert.deepStrictEqual(bad, [], 'unpinned or mismatched install examples');
});
```

- [ ] **Step 2: 실패 확인 (RED)**

Run: `npm run test:l1`
Expected: FAIL — `default ref is a branch: main` 그리고 문서 예시 다수가 `bad` 목록에 나열.

- [ ] **Step 3: 상수·문서·버전 갱신 (GREEN 재료 — 아직 커밋하지 않음)**

한 벌로 수정:

1. `install.sh:34` → `REF="${TRIPLE_CROWN_REF:-v0.6.5}"`
2. `install.sh:11` 주석 curl 예시의 `/main/` → `/v0.6.5/`
3. `install.ps1:22` → `$ref = if ($env:TRIPLE_CROWN_REF) { $env:TRIPLE_CROWN_REF } else { "v0.6.5" }`
4. `README.md` — `github:ungkey/triple-crown` 전부(29,35,41,48,112,127,128행) `github:ungkey/triple-crown#v0.6.5`로, curl/irm의 `/main/`(67,73행) → `/v0.6.5/`, 85행 tgz 파일명 `0.6.4` → `0.6.5`
5. `docs/INSTALLER.md` — 93행 `#v0.6.5` 부여, 99·113행 `/main/` → `/v0.6.5/`, 106행 `/v0.6.4/` → `/v0.6.5/`, 24·30·38·380행 tgz 파일명 `0.6.4` → `0.6.5`
6. `VERSION` → `0.6.5`
7. `package.json` → `"version": "0.6.5"`

- [ ] **Step 4: 통과 확인 (GREEN)**

Run: `npm run test:l1 && npm test`
Expected: 둘 다 PASS. install-entrypoints 3개 테스트 모두 통과 (VERSION=0.6.5, ref=v0.6.5). 스모크는 Task 7 덕에 버전 범프에도 통과.

- [ ] **Step 5: 한 커밋으로 커밋**

```bash
git add e2e/contract/install-entrypoints.test.cjs install.sh install.ps1 README.md docs/INSTALLER.md VERSION package.json
git commit -m "chore: release v0.6.5 — pin bootstrap default ref and docs to the shipping tag"
```

- [ ] **Step 6: 그 커밋에 태그 + 자기일관 검증**

```bash
git tag -a v0.6.5 -m "v0.6.5: self-consistent bootstrap (ref pinned to own tag) + prerelease fence + legacy backup tool"
git show v0.6.5:install.sh | grep -F 'TRIPLE_CROWN_REF:-v0.6.5'
git show v0.6.5:README.md | grep -c 'triple-crown#v0.6.5'
```

Expected: 첫 grep이 상수 라인을 출력, README 카운트 ≥ 6. **태그 안 트리 자신이 자기 태그를 가리킨다** — §4.5 불변식 충족. push는 하지 않는다.

---

### Task 9: [수동 · 파괴적] 백업 실행 → 레거시 제거 → 리허설

**이 태스크는 자동 실행 금지. 각 단계 앞에서 사용자 확인을 받는다.** 머신 전역 상태(`~/CLAUDE.md`, `~/.claude/settings.json`, 전역 라우팅·ship 가드)를 바꾼다. 제거 시점부터 M1a 완료까지 ship 가드 공백이 생긴다 (설계 §2.3).

**Files:** 저장소 변경 없음. `$HOME` 하위만.

- [ ] **Step 1: 사전 점검 — 다른 프로젝트 영향 (§2.1.1)**

```bash
find ~ -name STATE.md -path '*/.planning/*' -not -path '*/node_modules/*' 2>/dev/null
```

결과가 비어 있지 않으면 각 `.planning/STATE.md`를 열어 진행 중 phase 확인. **하나라도 진행 중이면 제거 보류** — 해당 프로젝트를 phase 경계까지 정리 후 재개.

- [ ] **Step 2: 백업 + 검증**

```bash
node scripts/legacy-backup.cjs backup
node scripts/legacy-backup.cjs verify --from ~/.crew-legacy-backup/$(date +%F)
```

Expected: `backup complete`, `verify OK`. 실패 시 여기서 중단 — 백업 없이는 제거 금지.

- [ ] **Step 3: 제거 (§2.2 — 6곳)**

```bash
# 1. capability 3개 등록 해제
node ~/.claude/gsd-core/bin/gsd-tools.cjs capability remove triple-gstack
node ~/.claude/gsd-core/bin/gsd-tools.cjs capability remove triple-superpowers
node ~/.claude/gsd-core/bin/gsd-tools.cjs capability remove triple-crown-guide

# 2. ~/CLAUDE.md 마커 블록만 제거 (사용자 작성분 보존)
node -e '
const fs=require("fs"),os=require("os"),p=os.homedir()+"/CLAUDE.md";
const S="<!-- triple-crown:managed-routing:start -->",E="<!-- triple-crown:managed-routing:end -->";
const lines=fs.readFileSync(p,"utf8").split("\n");
const s=lines.findIndex(l=>l.trim()===S),e=lines.findIndex(l=>l.trim()===E);
if(s===-1||e===-1||e<s){console.error("marker block not found");process.exit(1);}
fs.writeFileSync(p,[...lines.slice(0,s),...lines.slice(e+1)].join("\n").replace(/^\n+/,""));
console.log("removed lines",s+1,"-",e+1);'

# 3. 훅 파일
rm ~/.claude/hooks/triple-crown-ship-guard.cjs

# 4. settings.json 훅 그룹 — 술어 기반 제거 (bin/triple-crown.cjs removeShipGuard와 동일 의미론)
node -e '
const fs=require("fs"),os=require("os"),p=os.homedir()+"/.claude/settings.json";
const s=JSON.parse(fs.readFileSync(p,"utf8"));
if(s.hooks&&Array.isArray(s.hooks.PreToolUse)){
  s.hooks.PreToolUse=s.hooks.PreToolUse.filter(g=>{
    const hooks=Array.isArray(g&&g.hooks)?g.hooks:[];
    return !hooks.some(h=>String(h&&h.command||"").includes("triple-crown-ship-guard.cjs"));
  });
  fs.writeFileSync(p,JSON.stringify(s,null,2)+"\n");
}
console.log("ship-guard group removed");'

# 5. 벤더 디렉터리
rm -rf ~/.triple-crown

# 6. 스킬 마커 디렉터리 — 현재 0개, 확인만
ls ~/.claude/skills/ 2>/dev/null | head
```

capability remove가 스코프 오류를 내면 `gsd-tools capability list` 출력으로 실제 스코프를 먼저 확인한 뒤 `--scope` 플래그로 재시도한다.

- [ ] **Step 4: 완료 판정 (§2.4)**

```bash
ls ~/.gsd/capabilities/                                        # 비어 있음
grep -c 'triple-crown-ship-guard' ~/.claude/settings.json      # 0 (grep exit 1)
grep -c 'triple-crown:managed-routing' ~/CLAUDE.md             # 0 (grep exit 1)
ls -d ~/.triple-crown 2>/dev/null                              # 없음
ls ~/.claude/hooks/triple-crown-ship-guard.cjs 2>/dev/null     # 없음
```

`~/CLAUDE.md`의 마커 밖 사용자 작성분과 `settings.json`의 다른 훅·설정이 보존됐는지 눈으로 확인.

- [ ] **Step 5: 복구 리허설 (§2.4 — 제거 직후 1회)**

```bash
node scripts/legacy-backup.cjs verify --from ~/.crew-legacy-backup/$(date +%F)
node scripts/legacy-backup.cjs restore --from ~/.crew-legacy-backup/$(date +%F) --dry-run
```

Expected: verify OK + dry-run이 복구 대상 목록을 출력하고 실제 쓰기 없음. 이것으로 M-1 완료 — M0 착수 가능.

`git push`가 차단되지 않는 것은 성공 지표가 아니라 보호 공백의 증상이다 (§2.4). 판정에 쓰지 않는다.

---

## 자기 검토 기록

- 설계 §2.0 6항 대응: 1번 → Task 3~6, 2번 → Task 8, 3번 → Task 1, 4번 → Task 2, 5번 → Task 1·2·8 테스트, 6번 → v1.2에서 선반영 완료 (작업 없음). §2.1~2.4 → Task 3~6 + Task 9. §4.5 L1 4단언 → install-entrypoints 3테스트(단언 1~3) + prerelease-fence(단언 4).
- §2.5.1 2a의 "배열이 아님"을 "존재하는데 타입 불일치"로 해석하고 부재 시 생성으로 결정 — Task 6 Interfaces에 근거 명시.
- 타입 일관성: `verifyArchive(from) → {manifest, problems}`를 Task 4에서 정의하고 restore가 동일 시그니처로 소비. `restoreClaudeMd(home, from, manifest, actions, dryRun)`/`restoreSettings(home, tmp, from, manifest, actions, dryRun)` 시그니처가 Task 4 스텁과 Task 5·6 구현에서 동일.
- M0 선행 호환성: Task 1의 repo-tree 테스트는 VERSION 프리릴리스 여부로 기대를 뒤집는다 — M0가 `0.7.0-dev`로 올려도 L1이 깨지지 않고, 오히려 fence 동작을 계속 검증한다. Task 8의 release-tree 테스트도 프리릴리스면 자동 skip.
