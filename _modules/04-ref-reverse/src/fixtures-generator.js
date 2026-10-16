// fixtures-generator.js — 自动生成测试 fixtures (真实 REF 格式样本)

'use strict';

const JSZip = require('jszip');

const REF_FILE_TYPE_QUOTE = 'YUNSHANG_QUOTATION_PROJECT';

function genId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function refBjprojSample() {
  return {
    fileType: REF_FILE_TYPE_QUOTE,
    version: 1,
    data: {
      projectInfo: {
        uiTitleCn: '云上室内建筑报价系统',
        uiTitleEn: 'INTERIOR DESIGN QUOTATION SYSTEM',
        name: '测试工程 · R-2026-001',
        code: 'R-2026-001',
        ownerName: '张三',
        projectAddress: '北京市朝阳区望京 SOHO T2 座 30 层',
        date: '2026-10-16',
        author: '李设计',
        checker: '王工',
        email: 'l@example.com',
        companyName: '云上室内建筑',
        englishName: 'YUNSHANG INTERIOR ARCHITECTURE',
        managementFeeRate: 5,
        taxRate: 3,
        materialServiceFeeRate: 5,
        designRate: 80,
        discountRate: 100,
        designArea: 230,
        logoData: '',
      },
      categories: [
        // 9 基装 + 1 附录
        {
          id: 'c01', num: '01', en: 'MEASURES', cn: '措施项目',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '成品保护', unit: '㎡', price: 8.5, qty: '',
              desc: '地面/墙面/家具保护膜满铺',
              status: 'enabled', sourceSheet: '措施项目', sourceRow: 1,
              laborCost: 4, materialCost: 2.5, auxiliaryCost: 2,
            },
          ],
        },
        {
          id: 'c02', num: '02', en: 'DEMOLITION', cn: '拆除工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '拆除墙砖', unit: '㎡', price: 50, qty: '',
              desc: '①剔除墙面砖...',
              status: 'enabled', sourceSheet: '拆除工程', sourceRow: 2,
              laborCost: 30, materialCost: 5, auxiliaryCost: 15,
            },
            {
              id: genId('item'),
              name: '拆除地砖', unit: '㎡', price: 40, qty: '',
              desc: '①剔除地面砖',
              status: 'enabled',
              laborCost: 25, materialCost: 5, auxiliaryCost: 10,
            },
          ],
        },
        {
          id: 'c03', num: '03', en: 'MASONRY', cn: '砌筑工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '12墙砌筑', unit: '㎡', price: 120,
              qty: '', desc: '轻质砖砌筑 12 墙', status: 'enabled',
              laborCost: 50, materialCost: 50, auxiliaryCost: 20,
            },
          ],
        },
        {
          id: 'c04', num: '04', en: 'MEP', cn: '水电暖工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '强电开槽', unit: 'm', price: 18,
              qty: '', desc: '混凝土墙开槽', status: 'enabled',
              laborCost: 8, materialCost: 5, auxiliaryCost: 5,
            },
          ],
        },
        {
          id: 'c10', num: '附', en: 'MEP UNIT PRICE', cn: '水电暖施工单价表',
          group: 'construction', isAppendix: true, items: [],
        },
        {
          id: 'c05', num: '05', en: 'WATERPROOFING', cn: '防水工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: 'JS 防水', unit: '㎡', price: 35,
              qty: '', desc: 'JS 防水涂料', status: 'enabled',
              laborCost: 12, materialCost: 18, auxiliaryCost: 5,
            },
          ],
        },
        {
          id: 'c06', num: '06', en: 'INSULATION', cn: '保温隔热静音工程',
          group: 'construction', items: [],
        },
        {
          id: 'c07', num: '07', en: 'TILING', cn: '泥瓦工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '地砖铺贴', unit: '㎡', price: 65,
              qty: '', desc: '300x600 玻化砖铺贴', status: 'enabled',
              laborCost: 35, materialCost: 20, auxiliaryCost: 10,
            },
          ],
        },
        {
          id: 'c08', num: '08', en: 'CARPENTRY', cn: '木作工程',
          group: 'construction', items: [],
        },
        {
          id: 'c09', num: '09', en: 'PAINTING', cn: '涂饰工程',
          group: 'construction', items: [
            {
              id: genId('item'),
              name: '乳胶漆', unit: '㎡', price: 28,
              qty: '', desc: '三遍腻子+一遍底漆+两遍面漆', status: 'enabled',
              laborCost: 12, materialCost: 10, auxiliaryCost: 6,
            },
          ],
        },
        // 15 主材 (完整覆盖)
        { id: 'm01', num: '01', en: 'MATERIAL', cn: '瓷砖',     group: 'material', items: [
          { id: genId('item'), name: '诺贝尔瓷抛砖', unit: '㎡', price: 380, qty: '', desc: '800x800 瓷抛砖', brand: '诺贝尔', model: 'N-CP8011', spec: '800x800', status: 'enabled', sourceSheet: '瓷砖', sourceRow: 1, kind: 'material' },
        ]},
        { id: 'm02', num: '02', en: 'MATERIAL', cn: '石材',     group: 'material', items: [] },
        { id: 'm03', num: '03', en: 'MATERIAL', cn: '地板',     group: 'material', items: [] },
        { id: 'm04', num: '04', en: 'MATERIAL', cn: '门窗',     group: 'material', items: [] },
        { id: 'm05', num: '05', en: 'MATERIAL', cn: '套装门',   group: 'material', items: [] },
        { id: 'm06', num: '06', en: 'MATERIAL', cn: '全屋定制', group: 'material', items: [] },
        { id: 'm07', num: '07', en: 'MATERIAL', cn: '五金',     group: 'material', items: [] },
        { id: 'm08', num: '08', en: 'MATERIAL', cn: '卫浴',     group: 'material', items: [] },
        { id: 'm09', num: '09', en: 'MATERIAL', cn: '开关插座', group: 'material', items: [] },
        { id: 'm10', num: '10', en: 'MATERIAL', cn: '灯具',     group: 'material', items: [] },
        { id: 'm11', num: '11', en: 'MATERIAL', cn: '智能家居', group: 'material', items: [] },
        { id: 'm12', num: '12', en: 'MATERIAL', cn: '设备',     group: 'material', items: [] },
        { id: 'm13', num: '13', en: 'MATERIAL', cn: '电器',     group: 'material', items: [] },
        { id: 'm14', num: '14', en: 'MATERIAL', cn: '家具',     group: 'material', items: [] },
        { id: 'm15', num: '15', en: 'MATERIAL', cn: '软装配饰', group: 'material', items: [] },
      ],
      libCategories: [
        {
          id: 'c01', group: 'construction',
          library: [
            { id: genId('lib'), name: '满堂脚手架', unit: '㎡', price: 12 },
          ],
        },
      ],
    },
  };
}

function refBjchangeSample() {
  return {
    fileType: 'QUOTE_CHANGE_ORDERS',
    formatVersion: 1,
    savedAt: '2026-10-16T10:00:00.000Z',
    project: { name: '测试工程 · R-2026-001', code: 'R-2026-001' },
    rows: [
      { id: 'change-existing-1', kind: 'add', name: '增加吊顶', unit: '㎡', qty: 20, price: 145, note: '客户新增' },
      { id: 'change-existing-1', kind: 'add', name: '重复ID测试', unit: '项', qty: 1, price: 100, note: 'ID 应被重生成' },
      { id: 'change-existing-2', kind: 'remove', name: '减墙', unit: '㎡', qty: 5, price: 80, note: '客户减少' },
    ],
  };
}

function refWlbookSample() {
  return {
    fileType: 'YUNSHANG_MATERIAL_BOOK',
    formatVersion: 1,
    savedAt: '2026-10-16T10:00:00.000Z',
    materials: [
      { id: genId('mat'), category: '材料', name: '诺贝尔瓷抛砖', brand: '诺贝尔', model: 'N-CP8011', spec: '800x800', supplier: '北京诺贝尔专卖店', image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', remark: '客厅主砖' },
      { id: genId('mat'), category: '洁具', name: 'TOTO 马桶', brand: 'TOTO', model: 'CW188RE', spec: '305mm', supplier: 'TOTO 官方', image: '', remark: '主卫' },
      { id: genId('mat'), category: '灯具', name: '雷士客厅灯', brand: '雷士', model: 'LED-808', spec: '24W', supplier: '雷士照明', image: '', remark: '客厅' },
      { id: genId('mat'), category: '五金', name: '不锈钢合页', brand: '固特', model: 'GT-001', spec: '4寸', supplier: '固特五金', image: '', remark: '通用' },
      { id: genId('mat'), category: '开关面板', name: '西门子开关', brand: '西门子', model: 'SI-5', spec: '五孔', supplier: '西门子电气', image: '', remark: '全屋' },
      { id: genId('mat'), category: 'unknown-no-category', name: '默认归到 material', image: '' },
    ],
  };
}

async function refCloneZipSample() {
  const zip = new JSZip();
  const configuration = {
    company: '云上',
    version: 1,
    projectInfo: refBjprojSample().data.projectInfo,
    categories: refBjprojSample().data.categories,
    quotas: [{ id: 'q1', name: '满堂脚手架', unit: '㎡', price: 12 }],
    template: { name: 'default-template', items: [] },
    notes: '测试配置',
  };
  const configText = JSON.stringify(configuration, null, 2);
  const configBytes = new TextEncoder().encode(configText);
  // SHA256 via webcrypto
  const sha256Buf = await crypto.subtle.digest('SHA-256', configBytes);
  const sha256 = Array.from(new Uint8Array(sha256Buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await zip.file('configuration.json', configBytes);
  await zip.file('manifest.json', JSON.stringify({
    format: 'QUOTATION_STUDIO_CLONE',
    schema: 1,
    appVersion: '3.1.0',
    minAppVersion: '3.0.1',
    createdAt: new Date().toISOString(),
    company: '云上',
    sha256,
    contents: { categories: true, quotas: true, template: true },
  }, null, 2));
  await zip.file('使用说明.txt', 'REF 3.1.0 配置包示例');
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

async function refCloneZipBrokenShaSample() {
  const zip = new JSZip();
  const configuration = { company: 'x', version: 1, notes: 'broken sha test' };
  const configBytes = new TextEncoder().encode(JSON.stringify(configuration));
  await zip.file('configuration.json', configBytes);
  await zip.file('manifest.json', JSON.stringify({
    format: 'QUOTATION_STUDIO_CLONE',
    schema: 1,
    appVersion: '3.1.0',
    minAppVersion: '3.0.1',
    createdAt: new Date().toISOString(),
    company: 'x',
    sha256: 'a'.repeat(64), // 故意错误 SHA
    contents: {},
  }, null, 2));
  return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

function oursBjprojSample() {
  // 模拟 ours 当前正在编辑的报价
  return {
    fileType: 'YUNSHU_ZHUANGQI_QUOTE',
    formatVersion: 1,
    savedAt: '2026-10-16T10:00:00.000Z',
    data: {
      projectInfo: refBjprojSample().data.projectInfo,
      categories: refBjprojSample().data.categories,
      libCategories: refBjprojSample().data.libCategories,
      changeOrders: [],
    },
  };
}

function oursBjchangeSample() {
  return {
    fileType: 'YUNSHU_ZHUANGQI_CHANGE_ORDERS',
    formatVersion: 1,
    savedAt: '2026-10-16T10:00:00.000Z',
    project: { name: '测试工程 · R-2026-001', code: 'R-2026-001' },
    rows: [
      { id: genId('change'), kind: 'add', name: '测试增项', unit: '项', qty: 1, price: 100, note: '本地生成' },
    ],
  };
}

module.exports = {
  refBjprojSample,
  refBjchangeSample,
  refWlbookSample,
  refCloneZipSample,
  refCloneZipBrokenShaSample,
  oursBjprojSample,
  oursBjchangeSample,
  genId,
};
