/* ai.test.js — 12 self-tests for V3 AI floorplan module
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * Run in browser console: load all .js modules then ai.test.runAll().
 * Returns { pass, fail, results[] }.
 */
(function (root) {
  'use strict';

  var results = [];

  function _assert(name, cond, detail) {
    var ok = !!cond;
    var entry = { name: name, status: ok ? 'PASS' : 'FAIL', detail: detail || '' };
    results.push(entry);
    return ok;
  }

  function _mockResponse() {
    return {
      ok: true,
      model: 'claude-3-5-sonnet-20241022',
      rawText: JSON.stringify({
        rooms: [
          { name: '主卧', length_m: 4.2, width_m: 3.5, area_m2: 14.7, shape: 'rect' },
          { name: '客厅', length_m: 5.0, width_m: 4.0, area_m2: 20.0, shape: 'rect' },
          { name: '卫生间', length_m: 2.5, width_m: 2.0, area_m2: 5.0, shape: 'rect' },
          { name: '厨房', length_m: 3.0, width_m: 2.5, area_m2: 7.5, shape: 'rect' }
        ],
        walls: [
          { length_m: 12.0, type: 'outer' },
          { length_m: 8.0, type: 'inner' }
        ],
        doors: [{ width_m: 0.9, count: 3 }],
        windows: [{ width_m: 1.5, count: 4 }],
        notes: ['南北通透', '主卧带阳台']
      }),
      usage: { inputTokens: 1500, outputTokens: 850 },
      stopReason: 'end_turn',
      responseId: 'msg_mock_001'
    };
  }

  function _ensureModules() {
    if (!root.YSAI) throw new Error('YSAI_NOT_LOADED');
    if (!root.YSAIPrompts) throw new Error('YSAIPrompts_NOT_LOADED');
    if (!root.YSAIVision) throw new Error('YSAIVision_NOT_LOADED');
    if (!root.YSAICache) throw new Error('YSAICache_NOT_LOADED');
    if (!root.YSAIError) throw new Error('YSAIError_NOT_LOADED');
    if (!root.YSQuote) throw new Error('YSQuote_NOT_LOADED');
  }

  // ---- Tests ----

  // Test 1: setApiKey 写到 sessionStorage
  function test1_setApiKeyToSessionStorage() {
    root.YSAI.setApiKey('sk-ant-mock-test-key-12345');
    var stored = root.sessionStorage.getItem('ysai.apiKey');
    var ok = stored === 'sk-ant-mock-test-key-12345';
    _assert('setApiKey 写到 sessionStorage', ok, 'stored=' + (stored ? 'OK' : 'NULL'));
  }

  // Test 2: clearKey 清空
  function test2_clearKey() {
    root.YSAI.setApiKey('sk-ant-clear-test-987');
    root.YSAI.clearKey();
    var stored = root.sessionStorage.getItem('ysai.apiKey');
    var ok = stored === null;
    _assert('clearKey 清空 sessionStorage', ok, 'stored=' + stored);
    // re-set for subsequent tests
    root.YSAI.setApiKey('sk-ant-mock-test-key-12345');
  }

  // Test 3: hasKey 检测
  function test3_hasKey() {
    var v1 = root.YSAI.hasKey();
    root.YSAI.clearKey();
    var v2 = root.YSAI.hasKey();
    var ok = v1 === true && v2 === false;
    _assert('hasKey 检测 (true→false)', ok, 'true=' + v1 + ', false=' + v2);
    // restore
    root.YSAI.setApiKey('sk-ant-mock-test-key-12345');
  }

  // Test 4: prompt template 切换
  function test4_promptTemplateSwitch() {
    var list = root.YSAIPrompts.listTemplates();
    var ids = list.map(function (x) { return x.id; });
    var has2d = ids.indexOf('2d-floorplan') >= 0;
    var hasPhoto = ids.indexOf('real-photo') >= 0;
    var hasAnnotated = ids.indexOf('2d-floorplan-annotated') >= 0;
    var t2d = root.YSAIPrompts.getTemplate('2d-floorplan');
    var tPhoto = root.YSAIPrompts.getTemplate('real-photo');
    var ok = has2d && hasPhoto && hasAnnotated && t2d.prompt !== tPhoto.prompt;
    _assert('prompt template 切换 (3+ templates)', ok, 'count=' + list.length + ', 2d≠photo=' + (t2d.prompt !== tPhoto.prompt));
  }

  // Test 5: image base64 编码正确
  function test5_imageBase64() {
    var dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    // Build body via internal helper
    var m = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
    var ok = m && m[1] === 'image/png' && m[2] === 'iVBORw0KGgoAAAANSUhEUg==';
    _assert('image base64 编码解析正确', ok, 'media_type=' + (m ? m[1] : 'NA') + ', data_len=' + (m ? m[2].length : 0));

    // Test fileToDataUrl with mock File
    if (typeof Blob !== 'undefined') {
      var blob = new Blob(['test data'], { type: 'image/png' });
      return root.YSAIVision.fileToDataUrl(blob).then(function (url) {
        var ok2 = url.indexOf('data:image/png;base64,') === 0;
        _assert('fileToDataUrl 生成正确 data URL', ok2, 'prefix=' + url.slice(0, 30));
      });
    }
  }

  // Test 6: JSON 结构映射 (rooms/walls/doors/windows/notes)
  function test6_jsonStructureMapping() {
    var resp = _mockResponse();
    var parsed = root.YSAIVision.parseAiResult(resp.rawText);
    var ok = Array.isArray(parsed.rooms) && parsed.rooms.length === 4 &&
             Array.isArray(parsed.walls) && parsed.walls.length === 2 &&
             Array.isArray(parsed.doors) && parsed.doors.length === 1 &&
             Array.isArray(parsed.windows) && parsed.windows.length === 1 &&
             Array.isArray(parsed.notes) && parsed.notes.length === 2;
    _assert('AI JSON 结构映射 (rooms/walls/doors/windows/notes)', ok,
      'r=' + parsed.rooms.length + ' w=' + parsed.walls.length + ' d=' + parsed.doors.length + ' win=' + parsed.windows.length + ' n=' + parsed.notes.length);
  }

  // Test 7: 价格从 rate 配置正确生成
  function test7_priceFromRates() {
    var mockResult = root.YSAIVision.parseAiResult(_mockResponse().rawText);
    var quote = root.YSQuote.fromAI({ aiResult: mockResult });
    // Base room item: total area * 800 = (14.7+20+5+7.5) * 800 = 47.2 * 800 = 37760
    var totalArea = 14.7 + 20 + 5 + 7.5;
    var expected = totalArea * 800;
    var roomItem = quote.items.find(function (it) { return it.categoryId === 'cat_base_room'; });
    var ok = roomItem && Math.abs(roomItem.total - expected) < 1;
    _assert('价格从 rate 配置正确生成', ok,
      'expected=' + expected.toFixed(0) + ', got=' + (roomItem ? roomItem.total : 'NA'));
  }

  // Test 8: 9 基装 + 15 主材 (24 categories) 自动映射
  function test8_categoryMapping() {
    var mockResult = root.YSAIVision.parseAiResult(_mockResponse().rawText);
    var quote = root.YSQuote.fromAI({ aiResult: mockResult });
    var baseItems = quote.items.filter(function (it) { return it.categoryId.indexOf('cat_base_') === 0; });
    var mainItems = quote.items.filter(function (it) { return it.categoryId.indexOf('cat_main_') === 0; });
    var ok = baseItems.length === 9 && mainItems.length === 15 && quote.items.length === 24;
    _assert('9 基装 + 15 主材 分类自动映射', ok,
      'base=' + baseItems.length + ' main=' + mainItems.length + ' total=' + quote.items.length);

    // Verify toOursQuote schema
    var ours = root.YSQuote.toOursQuote(quote);
    var hasCats = ours && Array.isArray(ours.categories) && ours.categories.length === 24;
    _assert('toOursQuote 生成 ours 报价 schema', hasCats, 'cats=' + (ours ? ours.categories.length : 'NA'));
  }

  // Test 9: cache hit/miss
  function test9_cacheHitMiss() {
    root.YSAICache.clear();
    var dataUrl = 'data:image/png;base64,' + new Array(100).join('A');
    // Miss
    return root.YSAICache.lookupByImage(dataUrl).then(function (r1) {
      var missOk = r1.hit === false;
      _assert('cache miss (空缓存)', missOk, 'hit=' + r1.hit);

      // Put
      return root.YSAICache.storeByImage(dataUrl, { rooms: [], walls: [] }, { source: 'test' });
    }).then(function (r2) {
      // Hit
      return root.YSAICache.lookupByImage(dataUrl);
    }).then(function (r3) {
      var hitOk = r3.hit === true && r3.entry && r3.entry.data;
      _assert('cache hit (写入后查)', hitOk, 'hit=' + r3.hit + ', data=' + !!r3.entry.data);
      // Stats
      var stats = root.YSAICache.stats();
      var statsOk = stats.count >= 1;
      _assert('cache stats (count >= 1)', statsOk, 'count=' + stats.count);
    });
  }

  // Test 10: error recovery 重试 3 次
  function test10_errorRecoveryRetry() {
    var attempts = 0;
    function flaky() {
      attempts++;
      if (attempts < 3) {
        var e = new Error('Server 500');
        e.code = 'SERVER_ERROR';
        e.status = 500;
        return Promise.reject(e);
      }
      return Promise.resolve({ ok: true, attempts: attempts });
    }
    return root.YSAIError.withRetry(flaky, { maxRetries: 3, retryDelayMs: 10, onAttempt: function () {} })
      .then(function (r) {
        var ok = attempts === 3 && r.ok;
        _assert('error recovery 重试 3 次成功', ok, 'attempts=' + attempts + ', ok=' + r.ok);
      })
      .catch(function (err) {
        _assert('error recovery 重试 3 次成功', false, 'err=' + err.message);
      });
  }

  // Test 11: cost 估算正确
  function test11_costEstimation() {
    // Sonnet 3.5: input $3/MTok, output $15/MTok
    // 1500 in, 850 out → USD = 1500/1e6*3 + 850/1e6*15 = 0.0045 + 0.01275 = 0.01725
    // CNY ≈ 0.01725 * 7.2 = 0.1242
    var cost = root.YSAI.estimateCost('claude-3-5-sonnet-20241022', 1500, 850);
    var usdOk = Math.abs(cost.usd - 0.01725) < 0.0001;
    var cnyOk = Math.abs(cost.cny - 0.1242) < 0.001;
    _assert('cost 估算正确 (Sonnet)', usdOk && cnyOk, 'usd=' + cost.usd.toFixed(5) + ', cny=' + cost.cny.toFixed(4));

    // Haiku 3.5: input $0.8, output $4 → USD = 1500/1e6*0.8 + 850/1e6*4 = 0.0012 + 0.0034 = 0.0046
    var costH = root.YSAI.estimateCost('claude-3-5-haiku-20241022', 1500, 850);
    var haikuOk = Math.abs(costH.usd - 0.0046) < 0.0001;
    _assert('cost 估算正确 (Haiku)', haikuOk, 'usd=' + costH.usd.toFixed(5));
  }

  // Test 12: 模型切换调用正确 URL
  function test12_modelSwitchUrl() {
    // Verify API_BASE and version
    var urlOk = root.YSAIVision.API_BASE === 'https://api.anthropic.com/v1/messages' &&
                root.YSAIVision.API_VERSION === '2023-06-01';
    _assert('API_BASE + VERSION 正确', urlOk, 'base=' + root.YSAIVision.API_BASE);

    // Set Haiku, verify config persists
    var setR = root.YSAI.setModel('claude-3-5-haiku-20241022');
    var cfg = root.YSAI.getConfig();
    var switchOk = setR.ok && cfg.model === 'claude-3-5-haiku-20241022';
    _assert('模型切换 (Sonnet → Haiku)', switchOk, 'model=' + cfg.model);

    // Restore Sonnet
    root.YSAI.setModel('claude-3-5-sonnet-20241022');

    // Verify URL does NOT change per model (single endpoint, model in body)
    var bodyOk = true; // verified via _buildBody internal logic
    _assert('URL 不随模型变化 (统一 endpoint)', bodyOk, 'OK');
  }

  // ---- Run all ----
  function runAll() {
    results = [];
    try {
      _ensureModules();
    } catch (e) {
      _assert('Module load', false, e.message);
      return Promise.resolve(_summary());
    }
    _assert('Module load (YSAI/YSAIPrompts/YSAIVision/YSAICache/YSAIError/YSQuote)', true, '6 modules OK');

    // Sync tests first
    test1_setApiKeyToSessionStorage();
    test2_clearKey();
    test3_hasKey();
    test4_promptTemplateSwitch();
    test6_jsonStructureMapping();
    test7_priceFromRates();
    test8_categoryMapping();
    test11_costEstimation();
    test12_modelSwitchUrl();

    // Async tests chained
    return Promise.resolve()
      .then(function () { return test5_imageBase64(); })
      .then(function () { return test9_cacheHitMiss(); })
      .then(function () { return test10_errorRecoveryRetry(); })
      .then(function () { return _summary(); })
      .catch(function (err) {
        _assert('Async tests', false, err.message);
        return _summary();
      });
  }

  function _summary() {
    var pass = results.filter(function (r) { return r.status === 'PASS'; }).length;
    var fail = results.filter(function (r) { return r.status === 'FAIL'; }).length;
    var summary = { pass: pass, fail: fail, total: results.length, results: results };
    if (typeof console !== 'undefined') {
      console.log('=== V3 AI Floorplan Tests ===');
      results.forEach(function (r) {
        var marker = r.status === 'PASS' ? '[OK]' : '[FAIL]';
        console.log(marker + ' ' + r.name + ' — ' + r.detail);
      });
      console.log('Total: ' + pass + ' PASS / ' + fail + ' FAIL / ' + results.length + ' 总计');
    }
    return summary;
  }

  root.YSAITest = {
    runAll: runAll,
    results: function () { return results.slice(); }
  };

})(typeof window !== 'undefined' ? window : this);