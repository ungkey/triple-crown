#!/usr/bin/env node
'use strict';

// 공유 lib 단일 소스 파이프라인 (설계서 §4.2).
//
// canonical 은 lib/ 하나뿐이다. capability 는 런타임에 남의 디렉터리를 참조할 수
// 없으므로(${GSD_CAP_DIR} 는 자기 자신만 가리킨다) 패키징 시점에 사본을 심는다.
// 사본이 canonical 과 다를 때 "canonical 을 정상 수정했다"와 "사본을 손으로 고쳤다"는
// 둘 다 같은 모양이라 2-way 비교로는 갈라낼 수 없다. 직전 생성 해시(LIB-HASH.json)를
// 제3의 기준점으로 써서 셋을 비교한다:
//
//   copy == new                   최신 — 아무것도 안 한다
//   copy == prev  (그리고 != new) canonical 정상 수정 — 덮어쓰고 new 기록
//   copy != prev  && copy != new  사본 수동 편집 — 거부
//   사본 없음                      복사 + 기록
//   기록 없고 사본 == canonical     최초 도입(부트스트랩) — 기록만 새로 쓴다
//   기록 없고 사본 != canonical     출처 증명 불가 — 거부
//   표에 없는 사본                  거부. 삭제는 --prune 을 명시했을 때만
//
// **쓰기는 전수 판정이 끝난 뒤에만 한다(2-패스).** 한 파일이 정상 수정이고 다른 파일이
// 손편집이면 1-패스 구조는 앞 파일을 이미 덮어쓴 뒤 뒤 파일에서 멈춘다 — 사용자는
// "빌드 실패"를 보지만 트리는 반쯤 바뀐 상태고, 손편집을 거부해 증거를 지키겠다는
// 목적이 반쪽만 성립한다. planCapability() 는 파일시스템을 읽기만 하고,
// applyCapability() 는 **모든** capability 의 에러가 0 일 때만 불린다.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO_ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(REPO_ROOT, 'lib');
const HASH_FILE = 'LIB-HASH.json';

// 어느 capability 가 어느 공유 lib 을 쓰는가.
//
// 이 표를 처음 건드리는 것은 M1b 가 아니라 **M1a** 다 — 설계 §5 표대로 M1a 가
// 개명 전 capability id(매핑은 docs/RENAME-MAP.md 참조)를 crew-quality 로 1:1
// 개명한다. 그 기계적 치환은 이 키,
// capabilities/<id>/checks/lib/ 경로, 그리고 lib-hash.test.cjs 의 git restore 정규식을
// **한 커밋에서 같이** 옮겨야 한다. M1b 는 그 뒤에 crew-quality 를 9개로 쪼개며 표를
// 늘린다. 표에서 빠진 참조는 e2e/contract/lib-hash.test.cjs 의 LIB_MAP 완전성
// 테스트가 잡는다.
const LIB_MAP = {
  'crew-quality': ['repo-state-lib.cjs', 'evidence-store.cjs', 'resolve-phase-dir.cjs'],
};

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function writeJson(p, v) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
}
// 키 순서에 의존하지 않는 비교. LIB_MAP 순서가 바뀌었다고 "낡았다"가 되면 안 된다.
function sameRecord(a, b) {
  if (!a || !b || a.schema !== b.schema || a.generatedFrom !== b.generatedFrom) return false;
  const ka = Object.keys(a.files || {}).sort();
  const kb = Object.keys(b.files || {}).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a.files[k] === b.files[k]);
}
// 사본 디렉터리를 파일과 하위 디렉터리로 갈라 읽는다. **확장자로 거르지 않는다** —
// `.cjs` 만 세면 checks/lib/helper.js 같은 밀항자가 빌드 · --check · 설치
// 프리플라이트 세 검사를 전부 통과하고 tarball 에 실린다(package.json files 가
// capabilities 를 싣는다). CommonJS 는 .js 도 require 로 해석하므로 한 줄이면 실행된다.
//
// 디렉터리를 따로 분류하는 이유: 예전에는 readdirSync 가 준 이름을 전부 "파일"로 다뤄
// 하위 디렉터리가 언매핑 항목으로 잡혔고, --prune 이 그걸 remove op 로 계획한 뒤
// 비재귀 fs.rmSync 가 **적용 단계 한가운데서** ERR_FS_EISDIR 로 터졌다. 앞선 copy op 는
// 이미 적용된 뒤라 사본은 새 canonical, 기록은 옛 해시 — 2-패스 설계가 존재 이유로
// 삼는 바로 그 불일치가 남았다(실측). 그래서 디렉터리는 계획 단계에서 거부한다.
// 디렉터리가 아닌 것은 심볼릭 링크든 소켓이든 전부 파일 쪽에 넣는다 — 여기서 빠지면
// 표에 없는 항목을 거부하는 검사 자체를 우회하게 된다.
function readDest(destDir) {
  if (!fs.existsSync(destDir)) return { files: [], dirs: [] };
  const entries = fs.readdirSync(destDir, { withFileTypes: true });
  return {
    files: entries.filter((e) => !e.isDirectory() && e.name !== HASH_FILE).map((e) => e.name).sort(),
    dirs: entries.filter((e) => e.isDirectory()).map((e) => e.name).sort(),
  };
}
// 기대 기록은 **사본**을 다시 읽어 만든다. 기록의 의미를 "도구가 마지막에 심어 놓은
// 사본의 해시"로 못 박아야 다음 회차의 copy == prev 판정이 성립한다. canonical 해시로
// 채우면 기록과 사본의 대응이 끊겨 2회 연속 수정에서 빌드가 영구히 막힌다.
function recordFromCopies(destDir, files) {
  const next = { schema: 1, generatedFrom: 'lib/', files: {} };
  for (const f of files) {
    const p = path.join(destDir, f);
    if (!fs.existsSync(p)) return null;
    next.files[f] = sha256(fs.readFileSync(p));
  }
  return next;
}

// 1-패스. 파일시스템은 읽기만 한다. { errors, ops } 를 돌려준다.
function planCapability(id, files, opts = {}) {
  const errors = [];
  const ops = [];                       // { kind:'copy'|'remove', src?, dst }
  const capDir = path.join(REPO_ROOT, 'capabilities', id);
  if (!fs.existsSync(capDir)) return { id, errors: [`${id}: capability directory missing`], ops };

  const destDir = path.join(capDir, 'checks', 'lib');
  const hashPath = path.join(destDir, HASH_FILE);
  const record = readJson(hashPath);
  const { files: present, dirs: presentDirs } = readDest(destDir);

  // checks/lib/ 은 평평한 파일 목록이다. 하위 디렉터리는 기록할 수도, 대조할 수도 없다.
  // **재귀 삭제로 처리하지 않는다** — 조용한 서브트리 삭제는 손편집 사본을 덮어쓰지
  // 않겠다는 이 도구의 기본 태도와 정반대다. 사람이 지우게 하고 여기서는 멈춘다.
  for (const d of presentDirs) {
    errors.push(`${id}: ${rel(path.join(destDir, d))}/ is a directory — checks/lib holds flat files only; ` +
                `remove it yourself (the tool never deletes a subtree)`);
  }

  // 기록이 없을 때. 매핑된 사본이 전부 canonical 과 바이트 동일하면 잃을 내용이 없으므로
  // 기록만 새로 쓴다 — Task 2 가 사본을 심고 이 도구가 처음 도는 부트스트랩이 정확히 이
  // 상태다. 여기서 무조건 거부하면 최초 빌드가 영영 불가능하다. 하나라도 canonical 과
  // 다르거나 표에 없는 파일이 끼어 있으면 그 출처를 증명할 수 없으니 덮어쓰지 않고 멈춘다.
  if (present.length && !record) {
    const unprovable = present.filter((f) => {
      if (!files.includes(f)) return true;
      const src = path.join(LIB_DIR, f);
      if (!fs.existsSync(src)) return true;
      return sha256(fs.readFileSync(path.join(destDir, f))) !== sha256(fs.readFileSync(src));
    });
    if (unprovable.length) {
      // 위에서 모은 디렉터리 에러를 버리지 않는다. 조기 반환이 errors 를 새로 만들면
      // 같은 트리에 두 문제가 있을 때 한쪽이 사라져 한 번 더 돌아야 드러난다.
      errors.push(`${id}: ${rel(destDir)}/ has copies but no ${HASH_FILE} — provenance unknown ` +
                  `for ${unprovable.join(', ')}; restore the record, or delete those copies and rebuild`);
      return { id, errors, ops };
    }
  }

  for (const f of files) {
    const src = path.join(LIB_DIR, f);
    if (!fs.existsSync(src)) { errors.push(`${id}: canonical lib/${f} is missing`); continue; }
    const newHash = sha256(fs.readFileSync(src));
    const dst = path.join(destDir, f);
    const prev = record && record.files ? record.files[f] : undefined;

    if (!fs.existsSync(dst)) {
      if (opts.check) { errors.push(`${id}: ${rel(dst)} is missing — run \`npm run build:caps\``); continue; }
      ops.push({ kind: 'copy', src, dst });
    } else {
      const copyHash = sha256(fs.readFileSync(dst));
      if (copyHash === newHash) {
        // 최신.
      } else if (prev !== undefined && copyHash === prev) {
        if (opts.check) { errors.push(`${id}: lib/${f} changed since the last build — run \`npm run build:caps\``); continue; }
        ops.push({ kind: 'copy', src, dst });
      } else {
        errors.push(
          `${id}: ${rel(dst)} was hand-edited\n` +
          `      copy=${copyHash.slice(0, 12)} canonical=${newHash.slice(0, 12)} ` +
          `last-generated=${prev === undefined ? '<unrecorded>' : prev.slice(0, 12)}\n` +
          `      공유 lib 의 원본은 lib/${f} 하나다. 사본을 되돌린 뒤 다시 빌드한다:\n` +
          `        git restore ${rel(dst)} && npm run build:caps`);
      }
    }
  }

  // 표에 없는 사본. **기본은 거부다.** 바로 위에서 손편집 사본은 덮어쓰기를 거부하면서
  // 여기서 언매핑 사본을 조용히 지우면, 같은 부류(사람이 넣은 파일)에 정반대 처우가 된다.
  // 삭제는 의도를 명시한 --prune 에서만 일어난다 — M1b 가 lib 배분을 바꿀 때 쓴다.
  for (const f of present) {
    if (files.includes(f)) continue;
    const stale = path.join(destDir, f);
    if (opts.prune && !opts.check) { ops.push({ kind: 'remove', dst: stale }); continue; }
    errors.push(`${id}: ${rel(stale)} is not mapped in LIB_MAP['${id}'] — ` +
                `delete it yourself, or run \`npm run build:caps -- --prune\` to let the tool remove it`);
  }

  // --check 는 기록의 최신성까지 본다. 사본이 이미 최신인 상태에서만 여기에 닿으므로
  // 기대 기록은 지금 사본에서 그대로 유도된다. 쓰지 않는다.
  if (opts.check && !errors.length) {
    const next = recordFromCopies(destDir, files);
    if (next && !sameRecord(record, next)) {
      errors.push(`${id}: ${rel(hashPath)} is stale — run \`npm run build:caps\``);
    }
  }

  return { id, errors, ops, destDir, hashPath, files };
}

// 2-패스. **모든** capability 의 판정이 에러 0 일 때만 불린다.
function applyCapability(plan) {
  const actions = [];
  for (const op of plan.ops) {
    if (op.kind === 'copy') {
      fs.mkdirSync(path.dirname(op.dst), { recursive: true });
      const created = !fs.existsSync(op.dst);
      fs.copyFileSync(op.src, op.dst);
      actions.push(`${created ? 'created' : 'updated'} ${rel(op.dst)}`);
    } else {
      fs.rmSync(op.dst);
      actions.push(`removed ${rel(op.dst)}`);
    }
  }
  const next = recordFromCopies(plan.destDir, plan.files);
  if (next && !sameRecord(readJson(plan.hashPath), next)) {
    writeJson(plan.hashPath, next);
    actions.push(`recorded ${rel(plan.hashPath)}`);
  }
  return actions;
}

const KNOWN_FLAGS = ['--check', '--prune'];

// 사람이 읽는 출력은 전부 stderr 로 간다. 이 도구는 prepack 으로도 도는데, 그때
// stdout 은 `npm pack --json` 의 것이다 — 한 줄이라도 섞으면 JSON 파싱이 깨진다.
// (실측: stdout 에 쓰면 pack 계약 테스트가 `Unexpected token 'b', "build-capa"...` 로 죽는다.)
function main(argv) {
  // 알 수 없는 인자는 **닫아서 실패한다.** 이 도구의 기본 모드는 쓰기이고 --check 만
  // 읽기이므로, opts 를 argv.includes 로만 만들면 오타 하나가 모드를 뒤집는다 —
  // 실측: drift 된 트리에서 `--chek` 이 사본과 기록을 둘 다 쓰고 exit 0 로 끝났다.
  // "--check 는 아무것도 쓰지 않는다"가 이 도구의 대표 계약인데, 그 계약을 가장 싸게
  // 무력화하는 경로가 오타다.
  const unknown = argv.filter((a) => !KNOWN_FLAGS.includes(a));
  if (unknown.length) {
    process.stderr.write(`build-capabilities: unknown argument${unknown.length > 1 ? 's' : ''}: ${unknown.join(' ')}\n`);
    process.stderr.write(`  known flags: ${KNOWN_FLAGS.join(', ')}\n`);
    process.stderr.write('  write-mode is the default — refusing to run rather than let a typo build\n');
    process.exit(2);
  }

  const opts = { check: argv.includes('--check'), prune: argv.includes('--prune') };
  const plans = [];
  const errors = [];
  for (const [id, files] of Object.entries(LIB_MAP)) {
    const plan = planCapability(id, files, opts);
    plans.push(plan);
    errors.push(...plan.errors);
  }

  // 표 밖의 사본 디렉터리. LIB_MAP 만 순회하면 표에 없는 id 의 checks/lib/ 은 이 도구에게
  // **보이지 않는다** — 실측으로 그 트리는 --check 가 `in sync`, npm pack 이 그 파일을
  // 싣고, 그런데 설치 프리플라이트는 거부했다. 배포는 되는데 설치는 안 되는 tarball 이다.
  // bin/crew.cjs 의 프리플라이트는 이미 "capabilities/ 에 실제로 있는 것"을
  // 검사 대상의 정의로 삼는다(설계 결정 A3). 도구도 같은 정의를 쓴다 — 두 목록이
  // 갈라지는 순간이 M1b 가 capability 를 아홉으로 쪼개는 중간 상태 그 자체다.
  //
  // 에러 수집 단계에 둔다. 여기서 곧장 exit 하면 표 안의 정상 수정분이 이미 적용된 뒤
  // 멈추는 부분 적용이 되살아난다 — 2-패스 규율이 막는 바로 그것이다.
  const capsRoot = path.join(REPO_ROOT, 'capabilities');
  const capIds = fs.existsSync(capsRoot)
    ? fs.readdirSync(capsRoot, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];
  for (const id of capIds) {
    if (Object.prototype.hasOwnProperty.call(LIB_MAP, id)) continue;
    if (!fs.existsSync(path.join(capsRoot, id, 'checks', 'lib'))) continue;
    errors.push(`${id}: capabilities/${id}/checks/lib/ exists but '${id}' is not a key of LIB_MAP — ` +
                `add it to LIB_MAP and rebuild, or delete that directory; ` +
                `otherwise the copy ships unchecked and the install preflight refuses it`);
  }

  const actions = [];
  if (!errors.length && !opts.check) {
    for (const plan of plans) if (plan.destDir) actions.push(...applyCapability(plan));
  }
  for (const a of actions) process.stderr.write(`build-capabilities: ${a}\n`);
  if (errors.length) {
    process.stderr.write(`build-capabilities: ${opts.check ? 'shared lib copies are out of sync' : 'build failed'}\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
  process.stderr.write(`build-capabilities: ${opts.check ? 'in sync' : 'ok'}\n`);
}

module.exports = { LIB_MAP, planCapability, applyCapability };
if (require.main === module) main(process.argv.slice(2));
