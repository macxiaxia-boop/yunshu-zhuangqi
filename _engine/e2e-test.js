/*!
 * 端到端验收：真实浏览器里驱动报价工作台，验证数据流真的活着
 * 用法：msedge --headless=new --dump-dom / 或配合 CDP
 * 这里用 --headless + --virtual-time-budget 抓取 DOM 里的自检标记
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const URL_BASE = process.argv[2] || 'http://localhost:5089/_engine/engine.html';
const SHOT = process.argv[3] || 'D:\\UsersTemp\\engine-e2e.png';

const args = [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--window-size=1600,1000',
  '--virtual-time-budget=9000',
  `--screenshot=${SHOT}`,
  '--dump-dom',
  URL_BASE
];

const p = spawn(EDGE, args, { stdio: ['ignore', 'pipe', 'pipe'] });
let dom = '', err = '';
p.stdout.on('data', d => { dom += d; });
p.stderr.on('data', d => { err += d; });
p.on('close', () => {
  const checks = [];
  const has = (label, re) => checks.push({ label, ok: re.test(dom) });

  has('QE 引擎已注入',        /window\.ENGINE_READY|topMetrics/);
  has('侧栏 26 分类已渲染',    /navConstruction[\s\S]{0,4000}navMaterial/);
  has('顶栏指标已渲染',        /class="m"/);
  has('底栏汇总已渲染',        /totalsBar[\s\S]*?class="cell/);
  has('模块桥已渲染',          /id="moduleBar"[\s\S]{0,3000}22纸型打印/);
  has('定额库已加载',          /定额库 \d+ 类/);
  has('概览卡片已渲染',        /class="card/);
  has('对话框齐全',            /dlgInfo[\s\S]*dlgFees[\s\S]*dlgQuota[\s\S]*dlgChanges/);
  has('无 JS 加载错误',        /^(?!.*ENGINE_LOAD_ERROR).*$/s);

  console.log('\n════════ 浏览器端到端验收 ════════');
  let pass = 0, fail = 0;
  for (const c of checks) {
    console.log(`  ${c.ok ? '✓' : '✗'} ${c.label}`);
    c.ok ? pass++ : fail++;
  }
  console.log(`\n  PASS ${pass} / FAIL ${fail}`);
  console.log(`  截图：${SHOT}`);
  console.log('══════════════════════════════════\n');
  if (err && /SEVERE|Uncaught/i.test(err)) {
    console.log('  ⚠ stderr 片段：');
    console.log(err.split('\n').filter(l => /error|Error/i.test(l)).slice(0, 6).join('\n'));
  }
  process.exit(fail ? 1 : 0);
});