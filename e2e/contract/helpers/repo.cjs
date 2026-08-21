'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// helpers/ 는 e2e/contract/ 아래이므로 저장소 루트는 세 단계 위다.
const ROOT = path.join(__dirname, '..', '..', '..');

// 저장소를 통째로 임시 디렉터리에 복사한다. drift·hand-edit 시나리오는 트리를
// 더럽히므로 원본에서 재현할 수 없다. .git 과 node_modules 는 제외 — 복사 비용의
// 대부분이 거기고, 어느 테스트도 이력이나 의존성을 보지 않는다.
function copyRepo(prefix = 'crew-repo-') {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.cpSync(ROOT, dest, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('.git') && !parts.includes('node_modules');
    },
  });
  return dest;
}

function walkFiles(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

module.exports = { ROOT, copyRepo, walkFiles };
