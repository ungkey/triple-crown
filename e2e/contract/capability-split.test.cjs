'use strict';
// M1b 가 세운 분해 계약. 여기 있는 다섯 개는 전부 **실측으로 확인한 실패**를 막는다 —
// 넷은 설치 시점에야 터졌고, 하나는 어디서도 안 터지고 런타임에 조용히 틀렸다.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const CAPS = path.join(ROOT, 'capabilities');

const capIds = () => fs.readdirSync(CAPS, { withFileTypes: true })
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();
const manifest = (id) => JSON.parse(fs.readFileSync(path.join(CAPS, id, 'capability.json'), 'utf8'));

// GSD 가 스스로 만들어 주는 아티팩트. capability 가 produce 하지 않아도 consume 할 수 있다.
// 실측으로 좁혔다: 이 둘만 우리 매니페스트에서 producer 없이 consume 된다.
const HOST_ARTIFACTS = new Set(['SUMMARY.md', 'UAT.md']);

test('bin/crew.cjs CAPABILITIES matches the capabilities on disk exactly', () => {
  // 부분집합이 아니라 완전 일치다. 디스크에만 있는 id 는 배포되고도 설치되지 않고,
  // 배열에만 있는 id 는 설치자가 없는 디렉터리를 스테이징하려다 죽는다.
  const { CAPABILITIES } = require(path.join(ROOT, 'bin', 'crew.cjs'));
  assert.deepStrictEqual([...CAPABILITIES].sort(), capIds());
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
      if (!src.includes(id)) bad.push(`${id}/${stem}: never names its own capability id`);
      for (const other of ids) {
        if (other === id) continue;
        if (src.includes(other)) bad.push(`${id}/${stem}: names a foreign capability ${other}`);
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

// ── 아래 셋은 검토가 추가한 것이다. 앞의 다섯은 "설치가 되는가"를 보고, 이 셋은
//    "설치된 뒤에 맞게 도는가"를 본다. 앞의 다섯만으로는 순서가 뒤집혀도, 표면이
//    조용히 사라져도, 문서가 거짓말을 해도 전부 초록이다.

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
});

test('the config/step/gate surface is byte-identical to the pre-split golden', () => {
  // 펜스 5번은 "중복 없음"만 본다. 키를 하나 조용히 떨구거나 기본값을 바꾸거나 step 의
  // produces 를 잃어도 통과한다. M1b 의 원칙은 "값은 안 바뀌고 어디 적혀 있는가만 바뀐다"
  // 이므로, 소유권을 **뺀** 표면 전체를 골든과 대조한다.
  const surface = { config: {}, steps: [], gates: [] };
  for (const id of capIds()) {
    const cap = manifest(id);
    for (const [k, v] of Object.entries(cap.config || {})) surface.config[k] = v;
    for (const s of cap.steps || []) surface.steps.push({ point: s.point, skill: s.ref.skill,
      produces: [...(s.produces || [])].sort(), consumes: [...(s.consumes || [])].sort() });
    for (const g of cap.gates || []) {
      const m = /\/checks\/([a-z0-9-]+\.cjs)/.exec(g.check.predicate.command);
      surface.gates.push({ point: g.point, check: m ? m[1] : g.check.predicate.command });
    }
  }
  const key = (o) => JSON.stringify(o);
  surface.config = Object.fromEntries(Object.entries(surface.config).sort(([a],[b]) => a < b ? -1 : 1));
  surface.steps.sort((a, b) => key(a) < key(b) ? -1 : 1);
  surface.gates.sort((a, b) => key(a) < key(b) ? -1 : 1);

  const goldenPath = path.join(__dirname, 'golden', 'capability-surface.json');
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  assert.deepStrictEqual(surface, golden,
    'M1b moves ownership, not values — update the golden only when a milestone intentionally ' +
    'changes the surface, and say so in that milestone\'s plan');
});
