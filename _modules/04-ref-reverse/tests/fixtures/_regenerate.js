// 生成 fixtures 文件 — 在 tests/fixtures/ 目录生成真实样本
'use strict';

const fs = require('fs');
const path = require('path');
const fg = require('../../src/fixtures-generator');

(async () => {
  const dir = __dirname;
  fs.writeFileSync(
    path.join(dir, 'ref-bjproj-sample.json'),
    JSON.stringify(fg.refBjprojSample(), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'ref-bjchange-sample.json'),
    JSON.stringify(fg.refBjchangeSample(), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'ref-wlbook-sample.json'),
    JSON.stringify(fg.refWlbookSample(), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'ours-bjproj-sample.json'),
    JSON.stringify(fg.oursBjprojSample(), null, 2),
    'utf8'
  );
  fs.writeFileSync(
    path.join(dir, 'ours-bjchange-sample.json'),
    JSON.stringify(fg.oursBjchangeSample(), null, 2),
    'utf8'
  );
  // ZIP 文件用 binary
  const cloneBuf = await fg.refCloneZipSample();
  fs.writeFileSync(
    path.join(dir, 'ref-clone-sample.zip'),
    Buffer.from(cloneBuf)
  );
  const brokenBuf = await fg.refCloneZipBrokenShaSample();
  fs.writeFileSync(
    path.join(dir, 'ref-clone-broken-sha.zip'),
    Buffer.from(brokenBuf)
  );
  console.log('✅ 7 fixtures 已生成到:', dir);
})().catch((e) => {
  console.error('❌ Fixture 生成失败:', e);
  process.exit(1);
});
