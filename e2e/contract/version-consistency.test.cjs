'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function version() {
  return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
}

test('VERSION, package.json and every capability manifest agree', () => {
  const v = version();
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, v, 'package.json version must equal VERSION');

  // bin/crew.cjs validateBundledManifests() 가 설치 시점에 같은 등식을 강제한다
  // (cap.version !== VERSION 이면 프리플라이트 실패). 여기서 먼저 깨뜨려 두면 설치를
  // 돌리지 않고도 커밋 전에 잡힌다.
  const ids = fs.readdirSync(path.join(ROOT, 'capabilities'));
  assert.ok(ids.length > 0, 'no capabilities found');
  for (const id of ids) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'capabilities', id, 'capability.json'), 'utf8'));
    assert.strictEqual(m.version, v, `${id}: manifest version must equal VERSION`);
  }
});
