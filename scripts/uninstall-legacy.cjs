#!/usr/bin/env node
'use strict';

// 개명 전 설치본의 제거. 어휘와 탐지 술어는 전부
// scripts/legacy-backup.cjs 가 소유한다 — 여기서는 하나도 다시 쓰지 않는다.
// 그 파일의 주석이 반복해 못박는 규칙("backup 과 restore 는 같은 술어를 써야 한다")에
// 제거를 합류시키는 것이 이 모듈의 전부다.

const fs = require('fs');
const path = require('path');
const legacy = require('./legacy-backup.cjs');

// 복구의 역순. legacy-backup 의 restoreOrder 가 벤더 트리를 먼저 되돌리므로
// 제거는 벤더 트리를 마지막에 지운다 — 중간에 죽어도 소스가 마지막까지 남는다.
const REMOVAL_ORDER = ['capabilities', 'skills', 'hookFile', 'settingsGroup', 'routingBlock', 'vendorDir'];

function exists(p) { try { fs.lstatSync(p); return true; } catch { return false; } }

function planRemoval(root) {
  const undetermined = [];
  const targets = legacy.collectTargets(root, undetermined, { markers: legacy.LEGACY_SKILL_MARKERS });
  const frag = legacy.extractFragment(root, { tolerant: true });
  const hook = legacy.extractHookGroup(root, { tolerant: true });

  const rels = new Set(targets.map((t) => t.rel));
  const capabilities = legacy.LEGACY_CAPABILITIES.filter((id) => rels.has(`.gsd/capabilities/${id}`));
  const skills = targets.map((t) => t.rel).filter((rel) => rel.startsWith('.claude/skills/'));
  const hookFile = rels.has(`.claude/hooks/${legacy.SHIP_GUARD}`)
    ? `.claude/hooks/${legacy.SHIP_GUARD}` : null;
  const vendorDir = rels.has(legacy.VENDOR_DIR) ? legacy.VENDOR_DIR : null;
  const settingsGroup = !!(hook.present && hook.group);
  const routingBlock = frag.present ? { startLine: frag.startLine, endLine: frag.endLine } : null;

  // 판정 불가는 "없다"가 아니라 "모른다"다. 삼키면 조용한 누락이 된다.
  if (frag.readError) undetermined.push(`CLAUDE.md (${frag.readError})`);
  if (hook.readError) undetermined.push(`.claude/settings.json (${hook.readError})`);
  if (hook.parseError) undetermined.push('.claude/settings.json (not valid JSON)');

  const count = capabilities.length + skills.length +
    (hookFile ? 1 : 0) + (settingsGroup ? 1 : 0) + (routingBlock ? 1 : 0) + (vendorDir ? 1 : 0);

  return { root, capabilities, skills, hookFile, settingsGroup, routingBlock, vendorDir, undetermined, count };
}

// 백업 게이트. "백업이 있다"로는 부족하다 — 그 백업이 (1) 무결하고 (2) 이 루트에서 떴고
// (3) 지금 지우려는 것을 전부 담고 있어야 한다. 셋 중 하나라도 아니면 되돌릴 수 없는
// 삭제가 된다.
function checkBackup(plan, from) {
  if (!from) return { ok: false, problems: ['--from <backup dir> is required'] };
  if (!exists(path.join(from, 'MANIFEST.json'))) {
    return { ok: false, problems: [`not a backup directory (no MANIFEST.json): ${from}`] };
  }

  const problems = [];
  let manifest;
  try {
    const v = legacy.verifyArchive(from);
    manifest = v.manifest;
    for (const p of v.problems) problems.push(p);
  } catch (err) {
    return { ok: false, problems: [`backup is unreadable: ${err.message}`] };
  }

  if (path.resolve(manifest.home) !== path.resolve(plan.root)) {
    problems.push(`backup was taken from a different root: ${manifest.home} (removing from ${plan.root})`);
  }

  const covered = new Set((manifest.targets || []).map((t) => t.rel));
  const wanted = [
    ...plan.capabilities.map((id) => `.gsd/capabilities/${id}`),
    ...plan.skills,
    ...(plan.hookFile ? [plan.hookFile] : []),
    ...(plan.vendorDir ? [plan.vendorDir] : []),
  ];
  for (const rel of wanted) {
    if (!covered.has(rel)) problems.push(`backup does not contain a removal target: ${rel}`);
  }
  if (plan.routingBlock && !(manifest.claudeMd && manifest.claudeMd.present)) {
    problems.push('backup contains no CLAUDE.md fragment but a routing block is about to be removed');
  }
  if (plan.settingsGroup && !(manifest.settings && manifest.settings.hasHookGroup)) {
    problems.push('backup contains no settings.json hook group but one is about to be removed');
  }

  return { ok: problems.length === 0, problems };
}

// 제거를 실제로 수행한다. 순서는 REMOVAL_ORDER — 복구의 역순이다.
// SEMANTIC 대상(CLAUDE.md · settings.json)은 통째로 지우지 않는다. 마커 쌍 사이,
// 훅 하나만 걷어낸다 (설계 §2.2 2번·4번, §2.5.1 과 같은 원리 — 위치가 아니라 정체).
function applyRemoval(plan, opts = {}) {
  const actions = [];
  const failures = [];
  const dry = !!opts.dryRun;
  const say = (m) => actions.push((dry ? '[dry-run] ' : '') + m);
  const abs = (rel) => path.join(plan.root, rel);

  // 1. capability 원장. 디스크를 손으로 지우지 않는다 — 원장과 디스크가 어긋나면
  //    다음 설치가 "등록돼 있다는데 파일이 없다"는 상태를 만난다.
  //    dry-run 은 아무것도 쓰지 않는 미리보기다 — runner 가 없어도 무엇을 하려 했는지만
  //    말하고, 아무것도 하지 않은 실행을 실패로 보고하지 않는다.
  for (const id of plan.capabilities) {
    if (dry) { say(`capability remove ${id} (--scope ${opts.scope})`); continue; }
    if (!opts.runner) {
      failures.push(`${id}: GSD CLI unavailable — capability left registered`);
      continue;
    }
    say(`capability remove ${id} (--scope ${opts.scope})`);
    const r = opts.run(opts.runner, ['capability', 'remove', id, '--scope', opts.scope], plan.root);
    if (r.code !== 0) failures.push(`${id}: ${(r.stderr || r.stdout || '').trim()}`);
  }

  // 2. 스킬 디렉터리
  for (const rel of plan.skills) {
    say(`remove ${rel}`);
    if (!dry) fs.rmSync(abs(rel), { recursive: true, force: true });
  }

  // 3. 훅 파일
  if (plan.hookFile) {
    say(`remove ${plan.hookFile}`);
    if (!dry) fs.rmSync(abs(plan.hookFile), { force: true });
  }

  // 4. settings.json 의 훅 — 정체로 찾는다. 인덱스를 참조하지 않는다.
  //    그룹째 버리면 같은 그룹을 공유하는 사용자 훅이 함께 사라진다. 훅만 뺀다.
  //    실제로 뭔가 걷어냈을 때만 쓴다 — plan 과 apply 사이에 사용자가 손으로 지웠다면
  //    파일을 건드리지 않고 실패로 알린다(§2.5.1 의 CLAUDE.md 사후 조건과 대칭).
  if (plan.settingsGroup) {
    say('remove the legacy ship-guard hook from .claude/settings.json');
    if (!dry) {
      const p = abs('.claude/settings.json');
      const settings = JSON.parse(fs.readFileSync(p, 'utf8'));
      const pre = settings.hooks && settings.hooks.PreToolUse;
      let removedHooks = 0;
      if (Array.isArray(pre)) {
        for (const g of pre) {
          if (!g || !Array.isArray(g.hooks)) continue;
          const before = g.hooks.length;
          g.hooks = g.hooks.filter(
            (h) => !String((h && h.command) || '').includes(legacy.SHIP_GUARD));
          removedHooks += before - g.hooks.length;
        }
      }
      if (removedHooks === 0) {
        failures.push('.claude/settings.json: ship-guard hook vanished between plan and apply');
      } else {
        settings.hooks.PreToolUse = pre.filter((g) => Array.isArray(g && g.hooks) && g.hooks.length);
        if (settings.hooks.PreToolUse.length === 0) delete settings.hooks.PreToolUse;
        if (Object.keys(settings.hooks).length === 0) delete settings.hooks;
        fs.writeFileSync(p, JSON.stringify(settings, null, 2) + '\n');
      }
    }
  }

  // 5. CLAUDE.md 의 마커 블록 — 마커 쌍 사이만. 밖은 사용자 것이다.
  //    findMarkerRange 는 첫 쌍만 보고, 없으면 {start:-1,end:-1} 을 준다(null 아님).
  //    정규화는 스플라이스 접합부에서만 한다 — 파일 전체에 정규식을 돌리면 마커 밖의
  //    빈 줄 뭉치(펜스 코드 블록 안쪽 포함)까지 사용자 모르게 뭉개진다(설계 §2.2/§2.5.1).
  //    손대지 않은 구간은 split('\n')/join('\n') 이 바이트 그대로 되돌려준다.
  if (plan.routingBlock) {
    say('remove every managed-routing block from CLAUDE.md');
    if (!dry) {
      const p = abs('CLAUDE.md');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      let removed = 0;
      for (;;) {
        const { start, end } = legacy.findMarkerRange(lines);
        if (start === -1 || end === -1 || end < start) break;
        lines.splice(start, end - start + 1);
        // 접합부의 빈 줄만 최대 한 줄로 눌러 붙인다 — 나머지는 건드리지 않는다.
        let seamEnd = start;
        while (seamEnd < lines.length && lines[seamEnd] === '') seamEnd++;
        let seamStart = start;
        while (seamStart > 0 && lines[seamStart - 1] === '') seamStart--;
        if (seamEnd - seamStart > 1) lines.splice(seamStart, seamEnd - seamStart - 1);
        removed += 1;
      }
      // 사후 조건: 이 명령이 "제거 완료"라고 말하면 마커는 0개다. plan 과 apply 사이에
      // 사용자가 손으로 지웠다면(removed===0) 쓸 것이 없다 — 파일을 건드리지 않는다.
      if (removed > 0) {
        if (lines.some((l) => l !== '')) fs.writeFileSync(p, lines.join('\n'));
        else fs.rmSync(p, { force: true });
      } else {
        failures.push('CLAUDE.md: routing block vanished between plan and apply');
      }
      if (fs.existsSync(p) &&
          legacy.findMarkerRange(fs.readFileSync(p, 'utf8').split('\n')).start !== -1) {
        failures.push('CLAUDE.md: a managed-routing marker survived removal');
      }
    }
  }

  // 6. 벤더 디렉터리 — 마지막. 여기까지 오면 나머지는 이미 사라졌다.
  if (plan.vendorDir) {
    say(`remove ${plan.vendorDir}`);
    if (!dry) fs.rmSync(abs(plan.vendorDir), { recursive: true, force: true });
  }

  return { actions, failures };
}

module.exports = { planRemoval, checkBackup, applyRemoval, REMOVAL_ORDER };
