'use strict';
// M1b 가 세운 분해 계약. 여기 있는 **열한 개**는 전부 실측으로 확인한 실패를 막는다.
// 번호가 아니라 무엇을 보는지로 세 무리로 나뉜다 — 번호는 펜스가 늘면 썩는다.
//
//   설치가 되는가 — GSD 가 거부하거나, 더 나쁘게는 오류 없이 조용히 건너뛰는 것들.
//     `CAPABILITIES` 와 디스크의 집합 일치 · 비어 있지 않은 `requires` ·
//     교차 capability `consumes` · 남의 디렉터리를 가리키는 `CREW_CAP` ·
//     중복 config 키 · 중복 skill stem.
//   설치된 뒤 맞게 도는가 — 설치는 되는데 런타임이 조용히 틀리는 것들.
//     `CAPABILITIES` 의 **순서**(설치·제거 순서를 소유한다) · point 별 렌더 순서 ·
//     소유권을 뺀 표면 전체의 골든 대조 · 릴리스 표면의 **소유자**.
//   문서가 사실인가 — 사람이 복붙하는 설치 시퀀스. 마크다운이라 아무도 실행하지 않는다.
//
// **이 파일만으로는 재병합을 못 잡던 시기가 있었다.** 소유권 펜스가 생기기 전까지,
// `crew-ship` 을 `crew-quality` 로 통째로 되돌려도 이 파일 전부와 L1 전체가 초록이었다
// (실측). 소유권을 뺀 표면 골든은 **설계상** 재병합에 침묵하기 때문이다. 그 구멍을 막는
// 것이 마지막 펜스이고, L0 쪽 짝은 `tests/validate_prototype.py` 의 `SHIP_SURFACE_CHECKED`
// 와 `e2e/assert-hooks.cjs` 의 `capId:'crew-ship'` 핀이다. 세 곳 다 CI 에서 돈다
// (`.github/workflows/l1.yml`).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CAPS = path.join(ROOT, 'capabilities');

const capIds = () => fs.readdirSync(CAPS, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();
const manifest = (id) => JSON.parse(fs.readFileSync(path.join(CAPS, id, 'capability.json'), 'utf8'));

// capability id 는 `-` 를 품는다. `\b` 는 `-` 를 단어 경계로 치므로 `\bcrew-ship\b` 가
// `crew-ship-guard.cjs` 안에서 걸린다 — 그래서 `-` 도 단어 문자로 취급하는 경계를 쓴다.
const tokenRe = (id) => new RegExp(`(?<![\\w-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`);

// GSD 가 스스로 만들어 주는 아티팩트. capability 가 produce 하지 않아도 consume 할 수 있다.
// 실측으로 좁혔다: 이 둘만 우리 매니페스트에서 producer 없이 consume 된다.
const HOST_ARTIFACTS = new Set(['SUMMARY.md', 'UAT.md']);

test('bin/crew.cjs CAPABILITIES matches the capabilities on disk exactly', () => {
  // 부분집합이 아니라 완전 일치다. 디스크에만 있는 id 는 배포되고도 설치되지 않고,
  // 배열에만 있는 id 는 설치자가 없는 디렉터리를 스테이징하려다 죽는다.
  const { CAPABILITIES } = require(path.join(ROOT, 'bin', 'crew.cjs'));
  assert.deepStrictEqual([...CAPABILITIES].sort(), capIds());
});

test('bin/crew.cjs CAPABILITIES pins the exact install order, not just the set', () => {
  // 위 펜스는 양쪽을 정렬해서 비교하므로 조용한 재배치를 통과시킨다. 그런데 이 배열은
  // 계획서·자기 인라인 주석·docs/RENAME-MAP.md 가 **설치/의존 순서의 유일한 소유자**로
  // 지목한 것이고, bin/crew.cjs 의 uninstall 은 이걸 뒤집어 쓴다. 순서가 성질이면
  // 순서를 못박아야 한다. 정렬된 집합만으로는 성질이 안 지켜진다.
  const { CAPABILITIES } = require(path.join(ROOT, 'bin', 'crew.cjs'));
  assert.deepStrictEqual([...CAPABILITIES],
    ['crew-discipline', 'crew-quality', 'crew-ship', 'crew-guide'],
    'install order is a contract: crew-guide reads the others, so it stages last, and uninstall ' +
    'walks this reversed. If a milestone intentionally reorders or adds a capability, update this ' +
    'literal in the same commit and say why in that milestone\'s plan');
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
  //
  // 부분 문자열이 아니라 토큰으로 본다. `crew-ship-guard.cjs` 는 이 저장소의 실제 파일명이라
  // 부분 문자열 비교로는 crew-quality 의 SKILL.md 가 그 훅을 한 번 언급하는 날
  // "names a foreign capability crew-ship" 으로 죽는다. 반대 방향도 같다 —
  // crew-ship 의 SKILL.md 가 `crew-ship-guard` 만 적어도 "자기 이름을 댔다"고 통과해 버린다.
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
      if (!tokenRe(id).test(src)) bad.push(`${id}/${stem}: never names its own capability id`);
      for (const other of ids) {
        if (other === id) continue;
        if (tokenRe(other).test(src)) bad.push(`${id}/${stem}: names a foreign capability ${other}`);
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

test('no skill stem is declared by two capabilities', () => {
  // config 키 충돌과 **똑같이** 조용하다: GSD 로더는 skill stem 이 겹치면 오류 없이 그
  // capability 를 통째로 건너뛴다(~/.claude/gsd-core/bin/lib/capability-loader.cjs:564-568,
  // config 키 쪽은 :574-577 — 같은 skip() 이다). 설치는 "성공"하고 스킬만 사라진다.
  // M1b 가 일곱 번 한 조작이 정확히 이걸 만든다: `git mv` 를 복사로 해 버리면
  // 원본 매니페스트가 stem 을 계속 들고 있는 채 새 매니페스트도 같은 stem 을 선언한다.
  const owner = new Map();
  const dupes = [];
  for (const id of capIds()) {
    for (const stem of manifest(id).skills || []) {
      if (owner.has(stem)) dupes.push(`${stem}: ${owner.get(stem)} and ${id}`);
      else owner.set(stem, id);
    }
  }
  assert.deepStrictEqual(dupes, [], 'a duplicated skill stem makes GSD skip the whole capability, silently');
});

// ── 아래는 "설치된 뒤에 맞게 도는가"를 본다. 위의 펜스만으로는 순서가 뒤집혀도,
//    표면이 조용히 사라져도, 소유권이 통째로 되돌아가도, 문서가 거짓말을 해도 전부 초록이다.

// GSD 의 배치 규칙을 우리 매니페스트 위에서 재계산한다. capability-validator.cjs 의
// topoSortHookEntries 와 같다: produces/consumes 로 Kahn, 준비된 노드는 capId 로 정렬,
// **새로 준비된 노드는 큐 뒤에 붙는다.**
const topoAtPoint = (point) => {
  const nodes = [];
  for (const id of capIds()) {
    for (const s of manifest(id).steps || []) {
      if (s.point === point) nodes.push({ capId: id, name: s.ref.skill,
        produces: new Set(s.produces || []), consumes: new Set(s.consumes || []) });
    }
  }
  const indeg = nodes.map((n) => nodes.filter((m) =>
    m !== n && [...n.consumes].some((a) => m.produces.has(a))).length);
  const queue = nodes.map((n, i) => i).filter((i) => !indeg[i])
    .sort((a, b) => nodes[a].capId.localeCompare(nodes[b].capId) || a - b);
  const out = [];
  const done = new Set();
  while (queue.length) {
    const i = queue.shift();
    if (done.has(i)) continue;
    done.add(i); out.push(nodes[i]);
    const ready = nodes.map((n, j) => j).filter((j) => !done.has(j) && !queue.includes(j)
      && [...nodes[j].consumes].every((a) => !nodes.some((m, k) =>
        !done.has(k) && m.produces.has(a))))
      .sort((a, b) => nodes[a].capId.localeCompare(nodes[b].capId) || a - b);
    queue.push(...ready);                                    // 큐 뒤에 붙는다 — 이게 핵심
  }
  return out.map((n) => n.name);
};

const gatesAtPoint = (point) => {
  const rows = [];
  for (const id of capIds()) {
    for (const g of manifest(id).gates || []) {
      if (g.point !== point) continue;
      const m = /\/checks\/([a-z0-9-]+\.cjs)/.exec(g.check.predicate.command);
      rows.push({ capId: id, name: m ? m[1] : g.check.predicate.command });
    }
  }
  // GSD 는 gate 를 capId 로만 정렬한다 (produces/consumes 가 없다). 같은 capId 안에서는
  // 매니페스트 순서를 지킨다.
  return rows.map((r, i) => ({ ...r, i }))
    .sort((a, b) => a.capId.localeCompare(b.capId) || a.i - b.i).map((r) => r.name);
};

test('the rendered hook order at every point is exactly what M1b measured', () => {
  // **소유 capability 로 키를 잡지 않는다.** 지켜야 할 성질은 "review 다음 qa 다음 sec" 이지
  // "그 셋이 crew-quality 것" 이 아니다. 이름으로 잡아야 분해 전후 양쪽에서 같은 단언이
  // 성립하고, M2 가 crew-flow 를 끼워 넣어 순서를 바꾸면 그때 죽는다.
  //
  // 왜 이 펜스가 필요한가: e2e/mock-gsd.cjs 는 capability **안에서만** 위상 정렬하고
  // 그 결과를 capability 알파벳 순으로 이어 붙인다. 실제 GSD 는 point 전체에서 한 번에
  // 정렬한다. 모델이 구조적으로 다르므로 L0 초록은 순서 증거가 아니다.
  assert.deepStrictEqual(topoAtPoint('execute:post'),
    ['crew-gsd-review', 'crew-gsd-qa', 'crew-gsd-sec'],
    'the review -> qa -> security artifact chain drives this order; changing it reorders the runtime');
  assert.deepStrictEqual(topoAtPoint('ship:post'), ['crew-gsd-postship']);
  assert.deepStrictEqual(gatesAtPoint('verify:pre'), ['verify-ready.cjs', 'qa-ready.cjs']);
  assert.deepStrictEqual(gatesAtPoint('ship:pre'),
    ['security-ready.cjs', 'ship-guard-control.cjs'],
    'the ship guard must arm after the security gate — today that holds only because ' +
    'crew-quality sorts before crew-ship, so it needs an explicit assertion');
  assert.deepStrictEqual(gatesAtPoint('plan:post'), ['plan-review-current.cjs']);
});

test('every doc that enumerates capabilities enumerates all of them', () => {
  // README 와 INSTALLER 는 tarball 에 실리고, INSTALL.md 는 사람이 복붙하는 설치 시퀀스다.
  // 셋 다 capability 를 3개로 적어 놨다 — 분해 후 그대로 따르면 4개 중 3개만 깔리고
  // ship guard 게이트가 안 무장한다. 마크다운이라 어떤 테스트도 실행하지 않는다.
  const NOT_CAPS = /^crew-(gsd|harness|skill|workflow|ship-guard)/;   // 실측으로 좁힌 목록
  const expected = capIds();
  const bad = [];
  for (const rel of ['README.md', 'docs/INSTALL.md', 'docs/INSTALLER.md']) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const found = [...new Set(src.match(/\bcrew-[a-z][a-z0-9-]*/g) || [])]
      .filter((t) => !NOT_CAPS.test(t)).sort();
    if (JSON.stringify(found) !== JSON.stringify(expected)) bad.push(`${rel}: ${JSON.stringify(found)}`);
  }
  assert.deepStrictEqual(bad, [], `each doc must name exactly ${JSON.stringify(expected)}`);

  // 토큰이 있는 것과 **명령이 있는 것**은 다르다. 실측: INSTALL.md 에서
  // `gsd capability install ./capabilities/crew-ship ...` 한 줄만 지우고 산문 언급을
  // 남기면 위의 토큰 검사는 그대로 초록이다 — 그런데 그 문서를 따라 한 사람의 ship guard 는
  // 안 무장한다. 그게 이 펜스가 막는다고 적어 둔 바로 그 실패다. 그러니 복붙 시퀀스가 있는
  // INSTALL.md 는 **명령 줄 자체**를 센다. 순서까지 보는 이유는 CAPABILITIES 배열이 설치
  // 순서의 소유자이고 이 시퀀스가 그 순서를 손으로 재현하는 것이기 때문이다.
  const { CAPABILITIES } = require(path.join(ROOT, 'bin', 'crew.cjs'));
  const installSrc = fs.readFileSync(path.join(ROOT, 'docs', 'INSTALL.md'), 'utf8');
  const commanded = [...installSrc.matchAll(
    /^gsd capability install \.\/capabilities\/(crew-[a-z0-9-]+) --scope project --yes$/gm)]
    .map((m) => m[1]);
  assert.deepStrictEqual(commanded, [...CAPABILITIES],
    'docs/INSTALL.md is a copy-paste install sequence: it needs exactly one install command per ' +
    'capability, in CAPABILITIES order. A prose mention is not an install command');
});

test('the config/step/gate/contribution surface is byte-identical to the pre-split golden', () => {
  // 펜스 "no config key is declared by two capabilities" 는 중복만 본다. 키를 하나 조용히
  // 떨구거나 기본값을 바꾸거나 step 의 produces 를 잃어도 통과한다. M1b 의 원칙은
  // "값은 안 바뀌고 어디 적혀 있는가만 바뀐다" 이므로, 소유권을 **뺀** 표면 전체를 골든과 대조한다.
  //
  // 표면은 값 하나까지 다 담는다. 예전에는 gate 를 `{point, 체크 파일명}` 으로 줄였는데,
  // 그러면 명령의 **인자**와 `blocking`·`onError`·`when`·`timeout` 이 전부 사라졌다.
  // 실측: `blocking: true` → `false` 도, ship 인증 게이트의 `arm-gsd` → `arm-docs
  // --allow-version` 도 이 파일과 L0 전부를 초록으로 통과했다. 둘 다 실재하는 하위 명령이고
  // (capabilities/crew-ship/checks/ship-guard-control.cjs) 서로 **다른 push 권한**을 발급한다.
  // 게이트가 무엇을 인가하는지를 정하는 토큰이 골든에 없으면 "byte-identical" 은 거짓말이다.
  //
  // 소유 capability 는 여전히 기록하지 않는다 — 그게 이 골든의 설계다. 소유권은 옮겨도 되는
  // 것이고 값은 아니다. 소유권은 바로 아래 펜스가 따로 못박는다.
  const nn = (v) => (v === undefined ? null : v);
  const surface = { config: {}, steps: [], gates: [], contributions: [] };
  for (const id of capIds()) {
    const cap = manifest(id);
    for (const [k, v] of Object.entries(cap.config || {})) surface.config[k] = v;
    for (const s of cap.steps || []) surface.steps.push({
      point: s.point, skill: nn(s.ref && s.ref.skill),
      produces: [...(s.produces || [])].sort(), consumes: [...(s.consumes || [])].sort(),
      when: nn(s.when), onError: nn(s.onError),
    });
    for (const g of cap.gates || []) {
      const p = (g.check && g.check.predicate) || {};
      surface.gates.push({
        point: g.point, kind: nn(p.kind), command: nn(p.command), timeout: nn(p.timeout),
        when: nn(g.when), blocking: nn(g.blocking), onError: nn(g.onError),
      });
    }
    for (const c of cap.contributions || []) surface.contributions.push({
      point: c.point, into: nn(c.into), fragment: nn(c.fragment && c.fragment.path),
      produces: [...(c.produces || [])].sort(), consumes: [...(c.consumes || [])].sort(),
      when: nn(c.when), onError: nn(c.onError),
    });
  }
  const key = (o) => JSON.stringify(o);
  const byKey = (a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0);
  surface.config = Object.fromEntries(
    Object.entries(surface.config).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  surface.steps.sort(byKey);
  surface.gates.sort(byKey);
  surface.contributions.sort(byKey);

  const goldenPath = path.join(__dirname, 'golden', 'capability-surface.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  assert.deepStrictEqual(surface, golden,
    'M1b moves ownership, not values — update the golden only when a milestone intentionally ' +
    'changes the surface, and say so in that milestone\'s plan');
});

// M1b 가 옮긴 릴리스 표면. 이 목록이 곧 "무엇이 crew-ship 인가" 의 정의다.
const SHIP_CAP = 'crew-ship';
const SHIP_CHECKS = ['canary-session.cjs', 'docs-release-session.cjs', 'release-ledger.cjs',
  'retro-record.cjs', 'ship-guard-control.cjs'];
const SHIP_SKILLS = ['crew-gsd-postship', 'crew-gsd-release'];
const SHIP_CONFIG = ['crew.ship.owner', 'crew.ship.guard_enabled', 'crew.gstack.canary_mode',
  'crew.gstack.document_release_mode', 'crew.gstack.retro_mode'];

test('the release surface belongs to crew-ship and to no other capability', () => {
  // **위의 어떤 펜스도 crew-ship 이 존재하는지 묻지 않는다.** 실측: crew-ship 을
  // crew-quality 로 통째로 되돌리고(매니페스트 병합 · 체크 5개와 스킬 2개 원위치 ·
  // CAPABILITIES 와 LIB_MAP 되돌림 · 문서에서 제거 · SKILL.md 재타깃) 돌렸더니 이 파일의
  // 나머지 전부와 L1 전체가 초록이었다. 소유권을 뺀 골든은 정의상 재병합을 못 보고, 나머지는
  // "값이 어딘가에 한 번 있다"만 보기 때문이다. 재병합을 실제로 잡던 것은 L0 뿐이었고
  // (tests/validate_prototype.py 의 SHIP_SURFACE_CHECKED · e2e/assert-hooks.cjs 의 capId 핀)
  // 계획서의 태스크별 초록 게이트는 `npm run test:l1` 이라 그걸 못 봤다. 이 펜스가 그 층을 메운다.
  const ids = capIds();
  const bad = [];
  if (!ids.includes(SHIP_CAP)) {
    bad.push(`there is no ${SHIP_CAP} capability — the release surface was folded back`);
  } else {
    const ship = manifest(SHIP_CAP);
    const others = ids.filter((id) => id !== SHIP_CAP);

    // 1. 체크 파일. crew-ship 이 들고 있고, 다른 누구도 안 들고 있어야 한다.
    for (const f of SHIP_CHECKS) {
      if (!fs.existsSync(path.join(CAPS, SHIP_CAP, 'checks', f))) bad.push(`${SHIP_CAP} lost checks/${f}`);
      for (const id of others) {
        if (fs.existsSync(path.join(CAPS, id, 'checks', f))) bad.push(`${id} also holds checks/${f}`);
      }
    }

    // 2. 스킬. 매니페스트 선언과 디스크 양쪽.
    for (const stem of SHIP_SKILLS) {
      if (!(ship.skills || []).includes(stem)) bad.push(`${SHIP_CAP} no longer declares skill ${stem}`);
      if (!fs.existsSync(path.join(CAPS, SHIP_CAP, 'skills', stem, 'SKILL.md'))) {
        bad.push(`${SHIP_CAP} lost skills/${stem}/SKILL.md`);
      }
      for (const id of others) {
        if ((manifest(id).skills || []).includes(stem)) bad.push(`${id} also declares skill ${stem}`);
      }
    }

    // 3. config 소유권. 중복 금지 펜스는 "둘이 선언하면 안 된다"만 보지 누가 선언하는지는 안 본다.
    for (const k of SHIP_CONFIG) {
      if (!Object.hasOwn(ship.config || {}, k)) bad.push(`${SHIP_CAP} no longer declares config ${k}`);
    }

    // 4. ship 인증 게이트. crew-ship 의 ship:pre 에 정확히 하나, 다른 데에는 없다.
    const armGates = (cap) => (cap.gates || []).filter((g) => g.point === 'ship:pre'
      && String(((g.check || {}).predicate || {}).command || '').includes('ship-guard-control.cjs'));
    if (armGates(ship).length !== 1) {
      bad.push(`${SHIP_CAP} must declare exactly one ship:pre ship-guard-control gate, found ${armGates(ship).length}`);
    }
    for (const id of others) {
      if (armGates(manifest(id)).length) bad.push(`${id} also declares the ship authorization gate`);
    }

    // 5. post-ship step. 같은 방식.
    const postSteps = (cap) => (cap.steps || []).filter((s) => s.point === 'ship:post');
    const shipPost = postSteps(ship);
    if (shipPost.length !== 1 || (shipPost[0].ref || {}).skill !== 'crew-gsd-postship') {
      bad.push(`${SHIP_CAP} must declare exactly one ship:post step running crew-gsd-postship`);
    }
    for (const id of others) {
      if (postSteps(manifest(id)).length) bad.push(`${id} also declares a ship:post step`);
    }
  }
  assert.deepStrictEqual(bad, [],
    'M1b split the release surface out of crew-quality; this pins where it landed. When M2 ' +
    'legitimately re-decomposes it (crew-core / crew-flow), edit SHIP_CAP / SHIP_CHECKS / ' +
    'SHIP_SKILLS / SHIP_CONFIG in this file deliberately and record the move in that ' +
    'milestone\'s plan — do not delete this fence to make it green');
});
