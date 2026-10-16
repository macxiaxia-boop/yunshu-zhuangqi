// R31202 V3 · AI 户型识别 OFFLINE MOCK MODE
// 让 V3 在 ANTHROPIC_API_KEY 缺失时仍能演示完整流程
// 用预存 3 个测试户型响应，每个户型都是真实的 Claude Vision 输出结构

window.AIFloorplanMock = {
  fixtures: {
    // 1. 一室一厅小户型 ~47 ㎡
    '1br1lr-47sqm': {
      rooms: [
        { name: '客厅', length_m: 5.2, width_m: 3.8, area_m2: 19.76, shape: 'rectangle' },
        { name: '主卧', length_m: 4.0, width_m: 3.4, area_m2: 13.6, shape: 'rectangle' },
        { name: '厨房', length_m: 3.0, width_m: 2.4, area_m2: 7.2, shape: 'rectangle' },
        { name: '卫生间', length_m: 2.4, width_m: 1.8, area_m2: 4.32, shape: 'rectangle' },
        { name: '阳台', length_m: 3.6, width_m: 1.5, area_m2: 5.4, shape: 'rectangle' }
      ],
      walls: [
        { length_m: 18.4, type: 'outer' },
        { length_m: 12.2, type: 'inner' }
      ],
      doors: [
        { width_m: 0.9, count: 3 },
        { width_m: 1.5, count: 1 }
      ],
      windows: [
        { width_m: 1.8, count: 4 }
      ],
      notes: ['南向阳台', '客餐厅一体', '主卧带凸窗']
    },

    // 2. 三室两厅 ~98 ㎡
    '3br2lr-98sqm': {
      rooms: [
        { name: '客厅', length_m: 6.0, width_m: 4.5, area_m2: 27.0, shape: 'rectangle' },
        { name: '主卧', length_m: 4.5, width_m: 3.8, area_m2: 17.1, shape: 'rectangle' },
        { name: '次卧 1', length_m: 3.6, width_m: 3.0, area_m2: 10.8, shape: 'rectangle' },
        { name: '次卧 2', length_m: 3.6, width_m: 3.2, area_m2: 11.52, shape: 'rectangle' },
        { name: '餐厅', length_m: 4.2, width_m: 3.0, area_m2: 12.6, shape: 'rectangle' },
        { name: '厨房', length_m: 3.4, width_m: 2.6, area_m2: 8.84, shape: 'rectangle' },
        { name: '主卫', length_m: 2.6, width_m: 1.8, area_m2: 4.68, shape: 'rectangle' },
        { name: '客卫', length_m: 2.4, width_m: 1.6, area_m2: 3.84, shape: 'rectangle' },
        { name: '阳台', length_m: 4.5, width_m: 1.5, area_m2: 6.75, shape: 'rectangle' }
      ],
      walls: [
        { length_m: 32.4, type: 'outer' },
        { length_m: 28.6, type: 'inner' }
      ],
      doors: [
        { width_m: 0.9, count: 6 },
        { width_m: 1.5, count: 2 }
      ],
      windows: [
        { width_m: 1.8, count: 7 },
        { width_m: 2.4, count: 2 }
      ],
      notes: ['南北通透', '主卧带独卫', 'L 型厨房']
    },

    // 3. 顶层复式 ~158 ㎡
    'duplex-158sqm': {
      rooms: [
        { name: '挑空客厅', length_m: 8.0, width_m: 5.0, area_m2: 40.0, shape: 'rectangle', floorHeight: 6.0 },
        { name: '主卧', length_m: 5.0, width_m: 4.2, area_m2: 21.0, shape: 'rectangle' },
        { name: '主卧衣帽间', length_m: 3.0, width_m: 2.4, area_m2: 7.2, shape: 'rectangle' },
        { name: '主卫', length_m: 3.4, width_m: 2.6, area_m2: 8.84, shape: 'rectangle', hasbathtub: true },
        { name: '书房', length_m: 4.0, width_m: 3.0, area_m2: 12.0, shape: 'rectangle' },
        { name: '厨房', length_m: 4.5, width_m: 3.0, area_m2: 13.5, shape: 'rectangle', isopen: true },
        { name: '客卧', length_m: 4.0, width_m: 3.6, area_m2: 14.4, shape: 'rectangle' },
        { name: '工人房', length_m: 3.0, width_m: 2.4, area_m2: 7.2, shape: 'rectangle' },
        { name: '工人卫', length_m: 2.0, width_m: 1.4, area_m2: 2.8, shape: 'rectangle' },
        { name: '露台', length_m: 8.0, width_m: 3.0, area_m2: 24.0, shape: 'L' }
      ],
      walls: [
        { length_m: 42.0, type: 'outer' },
        { length_m: 38.0, type: 'inner' }
      ],
      doors: [
        { width_m: 0.9, count: 8 },
        { width_m: 1.5, count: 3 },
        { width_m: 2.4, count: 1 }
      ],
      windows: [
        { width_m: 2.4, count: 8 },
        { width_m: 3.0, count: 4 }
      ],
      notes: ['挑空 6 米客厅', '顶层复式', '南北双露台', '主卧带衣帽间 + 独卫']
    }
  },

  /**
   * Detect which fixture to return by image filename hint or random fallback
   * @param {string} imageDataUrl - base64 image (or filename hint)
   * @returns {Object} AI response fixture
   */
  detect(imageDataUrl) {
    const filename = imageDataUrl.filename || imageDataUrl.name || '';
    if (/1.?br|small|小/i.test(filename)) return this.fixtures['1br1lr-47sqm'];
    if (/3.?br|medium|中/i.test(filename)) return this.fixtures['3br2lr-98sqm'];
    if (/duplex|顶层|loft|复式/i.test(filename)) return this.fixtures['duplex-158sqm'];
    // Random pick as default
    const keys = Object.keys(this.fixtures);
    return this.fixtures[keys[Math.floor(Math.random() * keys.length)]];
  },

  /**
   * Mock Claude Vision API response (with same shape as real API)
   */
  async call(imageDataUrl) {
    // Simulate API delay
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));

    const result = this.detect(imageDataUrl);
    return {
      ok: true,
      source: 'mock',
      model: 'claude-3-5-sonnet-20241022 (mock)',
      response: result,
      cached: false,
      mock_latency_ms: 800 + Math.random() * 1200
    };
  }
};

// 自动检测：是否有真 key → 用真 API；无 → 用 mock
if (!window.YSAI) window.YSAI = {};
const _originalAnalyze = window.YSAI.analyzeFloorplan;

window.YSAI.analyzeFloorplan = async function(imageDataUrl, opts = {}) {
  const hasKey = this.hasKey ? this.hasKey() : (this.getApiKey && !!this.getApiKey());
  if (hasKey && !opts.forceMock) {
    // Real API mode (if ai-vision.js set up _originalAnalyze)
    if (_originalAnalyze) return _originalAnalyze.call(this, imageDataUrl, opts);
  }
  // Mock mode
  console.warn('[V3 mock] No ANTHROPIC_API_KEY detected, using mock fixtures');
  const result = await window.AIFloorplanMock.call(imageDataUrl);
  return result;
};
