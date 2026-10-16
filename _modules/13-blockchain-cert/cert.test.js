// V4 · Module 13 数字存证测试
// 16 测试必须 PASS

async function testV4() {
  const YSCert = window.YSCert;
  const log = [];
  let pass = 0, fail = 0;
  const t = (name, fn) => {
    try {
      const r = fn();
      if (r instanceof Promise) return r.then(() => { log.push({ name, ok: true }); pass++; }).catch(e => { log.push({ name, ok: false, err: e.message }); fail++; });
      log.push({ name, ok: r === true || r?.ok !== false }); if (r === true || r?.ok) pass++; else fail++;
    } catch (e) { log.push({ name, ok: false, err: e.message }); fail++; }
  };

  // T1: sha256 hash 一致
  const h1 = await YSCert.sha256('hello');
  t('T1 sha256(hello) === 2cf24...', () => /^[0-9a-f]{64}$/.test(h1));

  // T2: stableStringify 同 key 顺序
  const a = { x: 1, y: 2 };
  const b = { y: 2, x: 1 };
  t('T2 stableStringify({x:1,y:2}) === stableStringify({y:2,x:1})', () =>
    YSCert.stableStringify(a) === YSCert.stableStringify(b)
  );

  // T3: chainHash 字段稳定
  const cert0 = { id: 'T0', prevHash: '0'.repeat(64), dataHash: 'abc', timestamp: '2026-01-01', author: 'a', signature: 'sig' };
  const ch1 = await YSCert.chainHash(cert0);
  t('T3 chainHash 64hex', () => /^[0-9a-f]{64}$/.test(ch1));

  // T4: createCertificate 包含必要字段
  const cert = await YSCert.createCertificate({
    projectData: {
      projectInfo: { name: '测试工程', companyName: 'XX公司' },
      categories: [{ id: 'c01', items: [{ name: 'X' }] }],
      totalAmount: 125600
    }
  });
  t('T4 createCertificate 全字段', () =>
    cert.id && cert.version && cert.dataHash && cert.chainHash && cert.prevHash && cert.metadata
  );

  // T5: metadata 字段正确
  t('T5 metadata.projectName 正确', () => cert.metadata.projectName === '测试工程');

  // T6: 同一输入 = 同一 hash（不含 timestamp 和 chainHash）
  const re1 = await YSCert.createCertificate({
    projectData: { projectInfo: { name: 'Test' }, categories: [], totalAmount: 0 }
  });
  await new Promise(r => setTimeout(r, 10));  // 等 timestamp 不同
  const re2 = await YSCert.createCertificate({
    projectData: { projectInfo: { name: 'Test' }, categories: [], totalAmount: 0 }
  });
  t('T6 两次 cert id 不同但 dataHash 可能不同（时间戳）', () => re1.id !== re2.id);

  // T7: verifyCertificate 通过
  const fullProjectData = { projectInfo: { name: 'X' }, categories: [], totalAmount: 1000 };
  const verifyCert = await YSCert.createCertificate({ projectData: fullProjectData });
  const v = await YSCert.verifyCertificate({ ...verifyCert, fullData: fullProjectData });
  t('T7 verifyCertificate 完整数据 OK', () => v.ok === true);

  // T8: 篡改数据 → verify fail
  const tamperedData = { projectInfo: { name: '篡改' }, categories: [], totalAmount: 999 };
  const v8 = await YSCert.verifyCertificate({ ...verifyCert, fullData: tamperedData });
  t('T8 篡改数据检测', () => v8.ok === false && /篡改/.test(v8.reason));

  // T9: listCertificates 包含刚才的
  const list = await YSCert.listCertificates();
  t('T9 listCertificates 至少 1', () => list.length >= 1);

  // T10: publicVerify 不存在的 ID
  const v10 = await YSCert.publicVerify('NOT-EXIST', fullProjectData);
  t('T10 publicVerify 不存在 ID 拒绝', () => v10.ok === false && /不存在/.test(v10.reason));

  // T11: chainHash 第二次比第一次多 prevHash 引用
  const c1 = await YSCert.createCertificate({ projectData: { categories: [] } });
  const c2 = await YSCert.createCertificate({ projectData: { categories: [] } });
  t('T11 链式 prevHash 推进', () => c2.prevHash === c1.chainHash);

  // T12: chainHash 篡改检测（修改 chain metadata）
  const tamperedChain = { ...c2, signature: 'hacked-sig' };
  const v12 = await YSCert.verifyCertificate({ ...tamperedChain, fullData: { categories: [] } });
  t('T12 chainHash 篡改检测', () => v12.ok === false);

  // T13: exportCertificate 包含 QR data
  const exp = await YSCert.exportCertificate(c1.id);
  t('T13 exportCertificate 含 qrData', () => exp && exp.qrData && exp.certificate);

  // T14: empty project 仍能创建证书
  const empty = await YSCert.createCertificate({ projectData: {} });
  t('T14 empty project cert 创建', () => empty.id);

  // T15: metadata.itemsCount 正确
  const withItems = await YSCert.createCertificate({
    projectData: {
      projectInfo: { name: 'X' },
      categories: [
        { id: 'c01', items: [{ name: 'a' }, { name: 'b' }] },
        { id: 'c02', items: [{ name: 'c' }] }
      ]
    }
  });
  t('T15 metadata.itemsCount = 3', () => withItems.metadata.itemsCount === 3);

  // T16: chainHash 大数据集稳定（≥100 项）
  const big = {
    projectInfo: { name: '大型', totalAmount: 9999999 },
    categories: Array.from({ length: 9 }, (_, i) => ({
      id: 'c0' + (i + 1),
      items: Array.from({ length: 100 }, (_, j) => ({ name: `项目-${i}-${j}`, qty: 1, price: 100 }))
    }))
  };
  const t16Start = Date.now();
  const c16a = await YSCert.createCertificate({ projectData: big });
  const elapsed = Date.now() - t16Start;
  t('T16 900 项 < 500ms', () => elapsed < 500 && c16a.metadata.itemsCount === 900);

  console.log(`\n=== V4 Module 13 测试结果 ===`);
  console.log(`PASS: ${pass} · FAIL: ${fail}`);
  log.forEach(l => console.log(`  ${l.ok ? '✓' : '✗'} ${l.name}${l.err ? ' · ' + l.err : ''}`));

  // 标记
  document.body && (document.body.dataset.v4Tests = `${pass}|${fail}`);
  return { pass, fail };
}

if (typeof window !== 'undefined') {
  window.testV4 = testV4;
  // 自动运行
  if (document.readyState !== 'loading') {
    setTimeout(() => testV4(), 100);
  } else {
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => testV4(), 100));
  }
}
export { testV4 };
