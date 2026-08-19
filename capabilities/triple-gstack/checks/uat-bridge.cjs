#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { sha256 } = require('./repo-state-lib.cjs');

const TEST_START = '<!-- triple-crown:qa-tests:start -->';
const TEST_END = '<!-- triple-crown:qa-tests:end -->';
const GAP_START = '<!-- triple-crown:qa-gaps:start -->';
const GAP_END = '<!-- triple-crown:qa-gaps:end -->';

function iso() { return new Date().toISOString(); }
function phasePrefix(phaseDir) {
  const m = path.basename(phaseDir).match(/^(\d+(?:\.\d+)?)/);
  if (!m) throw new Error(`cannot infer phase number from ${path.basename(phaseDir)}`);
  return m[1];
}
function yamlQuote(v) { return JSON.stringify(String(v == null ? '' : v)); }
function fingerprint(obj) {
  if (obj.fingerprint) return String(obj.fingerprint);
  const key = [obj.name || obj.title || '', obj.expected || '', obj.repro || '', obj.actual || ''].join('\n');
  return sha256(Buffer.from(key)).slice(7, 23);
}
function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function removeManaged(text, start, end) {
  return text.replace(new RegExp(`${esc(start)}[\\s\\S]*?${esc(end)}\\n?`, 'g'), '');
}
function maxTestNumber(text) {
  let max = 0;
  for (const m of text.matchAll(/^###\s+(\d+)\./gm)) max = Math.max(max, Number(m[1]));
  return max;
}
function insertBeforeNextH2(text, section, block) {
  const marker = `## ${section}`;
  const idx = text.indexOf(marker);
  if (idx === -1) return text.trimEnd() + `\n\n${marker}\n\n${block.trim()}\n`;
  const after = idx + marker.length;
  const next = text.indexOf('\n## ', after);
  if (next === -1) return text.trimEnd() + `\n\n${block.trim()}\n`;
  return text.slice(0, next).trimEnd() + `\n\n${block.trim()}\n` + text.slice(next);
}
function updateSummary(text) {
  const total = [...text.matchAll(/^result:\s*(?:\[pending\]|pass|issue|skipped|blocked)\s*$/gm)].length;
  const passed = [...text.matchAll(/^result:\s*pass\s*$/gm)].length;
  const issues = [...text.matchAll(/^result:\s*issue\s*$/gm)].length;
  const pending = [...text.matchAll(/^result:\s*\[pending\]\s*$/gm)].length;
  const skipped = [...text.matchAll(/^result:\s*skipped\s*$/gm)].length;
  const blocked = [...text.matchAll(/^result:\s*blocked\s*$/gm)].length;
  const body = ['## Summary','',`total: ${total}`,`passed: ${passed}`,`issues: ${issues}`,`pending: ${pending}`,`skipped: ${skipped}`,`blocked: ${blocked}`].join('\n');
  if (/^## Summary\s*$/m.test(text)) return text.replace(/^## Summary\s*$[\s\S]*?(?=^## |\Z)/m, body + '\n\n');
  return text.trimEnd() + '\n\n' + body + '\n';
}
function setFrontmatterField(text, key, value) {
  if (!text.startsWith('---\n')) return text;
  const end = text.indexOf('\n---\n', 4);
  if (end === -1) return text;
  let fm = text.slice(4, end);
  const re = new RegExp(`^${key}:.*$`, 'm');
  fm = re.test(fm) ? fm.replace(re, `${key}: ${value}`) : fm + `\n${key}: ${value}`;
  return '---\n' + fm + text.slice(end);
}
function findUat(phaseDir, prefix) {
  const names = fs.readdirSync(phaseDir).filter((n) => /-UAT\.md$/i.test(n)).sort();
  if (names.length > 1) throw new Error(`multiple UAT files: ${names.join(', ')}`);
  return names.length ? path.join(phaseDir, names[0]) : path.join(phaseDir, `${prefix}-UAT.md`);
}
function createBaseUat(phaseDir, sourceFiles) {
  const now = iso();
  return [
    '---','status: testing',`phase: ${path.basename(phaseDir)}`,
    `source: [${sourceFiles.map((x) => JSON.stringify(x)).join(', ')}]`,
    `started: ${now}`,`updated: ${now}`,'---','',
    '## Current Test','','[testing complete]','',
    '## Tests','','## Summary','','total: 0','passed: 0','issues: 0','pending: 0','skipped: 0','blocked: 0','',
    '## Gaps',''
  ].join('\n');
}

function main() {
  const phaseDir = path.resolve(process.argv[2] || '');
  if (!process.argv[2]) throw new Error('phase directory required');
  const qaFile = path.resolve(process.argv[3] || path.join(phaseDir, 'GSTACK-QA.json'));
  const qa = JSON.parse(fs.readFileSync(qaFile, 'utf8'));
  if (qa.schema !== 1) throw new Error('unsupported QA schema');
  if (!['pass','findings'].includes(qa.status)) throw new Error(`QA status not bridgeable: ${qa.status}`);
  if (qa.unexpectedMutation) throw new Error('QA violated report-only mutation invariant');

  const prefix = phasePrefix(phaseDir);
  const uat = findUat(phaseDir, prefix);
  const existed = fs.existsSync(uat);
  const summaries = fs.readdirSync(phaseDir).filter((n) => n === 'SUMMARY.md' || /-SUMMARY\.md$/i.test(n)).sort();
  let text = existed ? fs.readFileSync(uat, 'utf8') : createBaseUat(phaseDir, [...summaries, 'GSTACK-QA.json']);
  text = removeManaged(removeManaged(text, TEST_START, TEST_END), GAP_START, GAP_END);

  let next = maxTestNumber(text) + 1;
  const tests = [], gaps = [], imported = [];

  for (const t of (Array.isArray(qa.tests) ? qa.tests : [])) {
    const num = next++, fp = fingerprint(t), result = t.result || 'pass';
    const name = t.name || `QA scenario ${num}`, expected = t.expected || name;
    const lines = [`### ${num}. ${name}`,`expected: ${expected}`,`result: ${result === 'pending' ? '[pending]' : result}`];
    if (result === 'issue') {
      const severity = t.severity || 'major';
      const reported = t.reported || t.actual || t.repro || 'gstack qa-only reported a behavioral issue';
      lines.push(`reported: ${yamlQuote(reported)}`,`severity: ${severity}`);
      gaps.push({ gap_id:`G-${prefix}-${num}`, fingerprint:fp, truth:expected, reason:`gstack qa-only: ${reported}`, severity, test:num });
      imported.push(fp);
    } else if (result === 'blocked') {
      lines.push(`blocked_by: ${t.blockedBy || 'other'}`,`reason: ${yamlQuote(t.reason || 'gstack qa-only could not execute this scenario')}`);
    } else if (result === 'skipped') {
      lines.push(`reason: ${yamlQuote(t.reason || 'gstack qa-only skipped this scenario')}`);
    }
    tests.push(lines.join('\n'));
  }

  if (!existed) {
    for (const t of (Array.isArray(qa.manualTests) ? qa.manualTests : [])) {
      const num = next++;
      tests.push([`### ${num}. ${t.name || `Manual verification ${num}`}`,`expected: ${t.expected || t.name || 'Expected behavior matches approved phase intent'}`,'result: [pending]'].join('\n'));
    }
  }

  text = insertBeforeNextH2(text, 'Tests', [TEST_START,...tests.flatMap((t)=>[t,'']),TEST_END].join('\n').trimEnd());

  const gapLines = [GAP_START];
  for (const g of gaps) {
    gapLines.push(`- gap_id: ${g.gap_id}`,`  qa_fingerprint: ${yamlQuote(g.fingerprint)}`,`  truth: ${yamlQuote(g.truth)}`,
      '  status: failed',`  reason: ${yamlQuote(g.reason)}`,`  severity: ${g.severity}`,`  test: ${g.test}`,'  artifacts: []','  missing: []');
  }
  gapLines.push(GAP_END);
  text = insertBeforeNextH2(text, 'Gaps', gapLines.join('\n'));
  text = updateSummary(text);

  if (!existed) {
    const pending = [...text.matchAll(/^###\s+(\d+)\.\s+(.+)\nexpected:\s*(.+)\nresult:\s*\[pending\]\s*$/gm)];
    if (pending.length) {
      const [, num, name, expected] = pending[0];
      text = text.replace(/^## Current Test\s*$[\s\S]*?(?=^## Tests\s*$)/m,
        ['## Current Test','',`number: ${num}`,`name: ${name}`,'expected: |',`  ${expected}`,'awaiting: user response',''].join('\n'));
      text = setFrontmatterField(text,'status','testing');
    } else {
      text = text.replace(/^## Current Test\s*$[\s\S]*?(?=^## Tests\s*$)/m,'## Current Test\n\n[testing complete]\n\n');
      text = setFrontmatterField(text,'status','complete');
    }
  }
  text = setFrontmatterField(text,'updated',iso());
  fs.writeFileSync(uat,text.trimEnd()+'\n');

  const bridge = {
    schema:1, bridgedAt:iso(), qaArtifact:path.basename(qaFile), qaArtifactDigest:sha256(fs.readFileSync(qaFile)),
    uatPath:path.relative(phaseDir,uat), uatDigest:sha256(fs.readFileSync(uat)), createdUat:!existed,
    importedFindingFingerprints:imported, importedFindingCount:imported.length,
    manualTestsSeeded:!existed ? (qa.manualTests || []).length : 0
  };
  fs.writeFileSync(path.join(phaseDir,'GSTACK-QA-UAT-BRIDGE.json'),JSON.stringify(bridge,null,2)+'\n');
  console.log(JSON.stringify(bridge,null,2));
}
try { main(); } catch (err) { console.error(`uat-bridge: ${err.message}`); process.exit(1); }
