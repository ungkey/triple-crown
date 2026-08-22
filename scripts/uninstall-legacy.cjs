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

module.exports = { planRemoval, checkBackup, REMOVAL_ORDER };
