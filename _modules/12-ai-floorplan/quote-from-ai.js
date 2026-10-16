/* quote-from-ai.js — AI result → ours quote items
 * R31202 · Module 12 · 🅱️ yunshu-zhuangqi
 * Generate 9 base construction + 15 main material categories from room/wall/door/window data.
 * Compatible with the "ours" 报价 schema used in V1 (categories.items[]).
 */
(function (root) {
  'use strict';

  // ---- Default rate config (元) ----
  var DEFAULT_RATES = {
    default_room_rate: 800,    // 元/㎡ 综合装修(全包基装)
    bathroom_rate: 12000,      // 元/间 卫生间
    kitchen_rate: 15000,       // 元/间 厨房
    wall_paint_rate: 28,       // 元/㎡ 墙面粉刷(乳胶漆)
    floor_tile_rate: 180,      // 元/㎡ 地砖铺贴+人工
    ceiling_rate: 120,         // 元/㎡ 吊顶(石膏板)
    door_install_rate: 800,    // 元/樘 门安装
    window_install_rate: 600,  // 元/樘 窗安装
    electrical_point_rate: 200, // 元/㎡ 强弱电点位
    plumbing_rate: 150,        // 元/㎡ 水路改造
    labor_base: 350            // 元/㎡ 基础人工(水电木瓦油)
  };

  var FLOOR_HEIGHT_DEFAULT = 2.8; // m

  // ---- 9 基装 + 15 主材 categories (compatible with ours 报价 schema) ----
  var CATEGORY_SCHEMA = [
    { id: 'cat_base_room',  name: '基装·房间综合',  source: 'rooms',  multiplier: 'area' },
    { id: 'cat_base_wall',  name: '基装·墙面工程',  source: 'walls',  multiplier: 'area' },
    { id: 'cat_base_floor', name: '基装·地面工程',  source: 'rooms',  multiplier: 'area' },
    { id: 'cat_base_ceil',  name: '基装·吊顶工程',  source: 'rooms',  multiplier: 'area' },
    { id: 'cat_base_elec',  name: '基装·强弱电',    source: 'rooms',  multiplier: 'area' },
    { id: 'cat_base_water', name: '基装·给排水',    source: 'rooms',  multiplier: 'area' },
    { id: 'cat_base_door',  name: '基装·门安装',    source: 'doors',  multiplier: 'count' },
    { id: 'cat_base_window',name: '基装·窗安装',    source: 'windows',multiplier: 'count' },
    { id: 'cat_base_labor', name: '基装·人工费',    source: 'rooms',  multiplier: 'area' },

    { id: 'cat_main_tile_floor',   name: '主材·地砖',       source: 'rooms',  multiplier: 'area' },
    { id: 'cat_main_tile_wall',    name: '主材·墙砖',       source: 'rooms',  multiplier: 'area_subtract' },
    { id: 'cat_main_paint',        name: '主材·乳胶漆',     source: 'walls',  multiplier: 'area' },
    { id: 'cat_main_ceiling',      name: '主材·吊顶材料',   source: 'rooms',  multiplier: 'area_subtract' },
    { id: 'cat_main_door',         name: '主材·套装门',     source: 'doors',  multiplier: 'count' },
    { id: 'cat_main_window',       name: '主材·断桥铝窗',   source: 'windows',multiplier: 'count' },
    { id: 'cat_main_sanitary',     name: '主材·洁具',       source: 'bathrooms', multiplier: 'count' },
    { id: 'cat_main_cabinet',      name: '主材·橱柜',       source: 'kitchens',  multiplier: 'count' },
    { id: 'cat_main_switch',       name: '主材·开关面板',   source: 'rooms',  multiplier: 'area' },
    { id: 'cat_main_light',        name: '主材·灯具',       source: 'rooms',  multiplier: 'area' },
    { id: 'cat_main_hardware',     name: '主材·五金件',     source: 'rooms',  multiplier: 'area' },
    { id: 'cat_main_kitchen_app',  name: '主材·厨房电器',   source: 'kitchens', multiplier: 'count' },
    { id: 'cat_main_bath_app',     name: '主材·卫浴电器',   source: 'bathrooms',multiplier: 'count' },
    { id: 'cat_main_water_heater', name: '主材·热水器',     source: 'bathrooms',multiplier: 'count' },
    { id: 'cat_main_floor_mat',    name: '主材·地板',       source: 'rooms',  multiplier: 'area' }
  ];

  // ---- Helpers ----
  function _roomsTotalArea(rooms) {
    var sum = 0;
    (rooms || []).forEach(function (r) { sum += Number(r.area_m2) || 0; });
    return sum;
  }
  function _wallsTotalLength(walls) {
    var sum = 0;
    (walls || []).forEach(function (w) { sum += Number(w.length_m) || 0; });
    return sum;
  }
  function _doorsTotalCount(doors) {
    var sum = 0;
    (doors || []).forEach(function (d) { sum += Number(d.count) || 0; });
    return sum;
  }
  function _windowsTotalCount(windows) {
    var sum = 0;
    (windows || []).forEach(function (w) { sum += Number(w.count) || 0; });
    return sum;
  }
  function _roomsByName(rooms, namePattern) {
    var re = new RegExp(namePattern, 'i');
    return (rooms || []).filter(function (r) { return re.test(r.name); });
  }
  function _round2(v) { return +Number(v || 0).toFixed(2); }

  // ---- Generate quote items ----
  function fromAI(input) {
    if (!input || typeof input !== 'object') throw new Error('INPUT_INVALID');
    var aiResult = input.aiResult || {};
    var rates = Object.assign({}, DEFAULT_RATES, input.roomRates || {});
    var floorHeight = Number(input.floorHeight) || FLOOR_HEIGHT_DEFAULT;
    var notes = Array.isArray(aiResult.notes) ? aiResult.notes : [];

    var rooms = aiResult.rooms || [];
    var walls = aiResult.walls || [];
    var doors = aiResult.doors || [];
    var windows = aiResult.windows || [];

    var totalArea = _roomsTotalArea(rooms);
    var totalWallLength = _wallsTotalLength(walls);
    var totalDoors = _doorsTotalCount(doors);
    var totalWindows = _windowsTotalCount(windows);
    var bathrooms = _roomsByName(rooms, '卫|卫|bathroom|toilet');
    var kitchens = _roomsByName(rooms, '厨|kitchen');

    // Perimeter proxy (total wall length) used for wall paint
    var wallArea = totalWallLength * floorHeight;

    // Floor tile = total area (minus bathroom/kitchen which use wall tiles)
    var bathKitchenArea = bathrooms.concat(kitchens).reduce(function (s, r) {
      return s + (Number(r.area_m2) || 0);
    }, 0);
    var floorTileArea = Math.max(0, totalArea - bathKitchenArea);
    var wallTileArea = (bathrooms.reduce(function (s, r) { return s + (Number(r.area_m2) || 0) * 3; }, 0)) +
                       (kitchens.reduce(function (s, r) { return s + (Number(r.area_m2) || 0) * 2.5; }, 0));

    var items = [];

    // === 9 基装 ===
    items.push(_item('cat_base_room', '综合装修', totalArea, 'm²', rates.default_room_rate, '基装·按房间总面积综合'));
    items.push(_item('cat_base_wall', '墙面粉刷', _round2(wallArea), 'm²', rates.wall_paint_rate, '墙面乳胶漆'));
    items.push(_item('cat_base_floor', '地面铺贴', _round2(floorTileArea), 'm²', rates.floor_tile_rate, '地砖铺贴+人工'));
    items.push(_item('cat_base_ceil', '吊顶工程', _round2(floorTileArea * 0.6), 'm²', rates.ceiling_rate, '客厅/卧室吊顶'));
    items.push(_item('cat_base_elec', '强弱电', totalArea, 'm²', rates.electrical_point_rate, '点位改造'));
    items.push(_item('cat_base_water', '给排水', _round2(bathKitchenArea), 'm²', rates.plumbing_rate, '厨卫水路'));
    items.push(_item('cat_base_door', '门安装', totalDoors, '樘', rates.door_install_rate, '按门数量'));
    items.push(_item('cat_base_window', '窗安装', totalWindows, '樘', rates.window_install_rate, '按窗数量'));
    items.push(_item('cat_base_labor', '基础人工', totalArea, 'm²', rates.labor_base, '水电木瓦油'));

    // === 15 主材 ===
    items.push(_item('cat_main_tile_floor', '地砖', _round2(floorTileArea), 'm²', 220, '瓷砖 800x800'));
    items.push(_item('cat_main_tile_wall', '墙砖', _round2(wallTileArea), 'm²', 180, '厨卫墙砖 300x600'));
    items.push(_item('cat_main_paint', '乳胶漆', _round2(wallArea), 'm²', 35, '环保乳胶漆'));
    items.push(_item('cat_main_ceiling', '吊顶材料', _round2(floorTileArea * 0.6), 'm²', 150, '石膏板吊顶'));
    items.push(_item('cat_main_door', '套装门', totalDoors, '樘', 1800, '实木复合门'));
    items.push(_item('cat_main_window', '断桥铝窗', totalWindows, '樘', 1200, '65 系列断桥铝'));
    items.push(_item('cat_main_sanitary', '洁具', bathrooms.length, '套', 3500, '马桶+花洒+面盆'));
    items.push(_item('cat_main_cabinet', '橱柜', kitchens.length, '延米', 2800, '地柜+台面'));
    items.push(_item('cat_main_switch', '开关面板', Math.ceil(totalArea / 8), '个', 35, '公牛/Gunsan'));
    items.push(_item('cat_main_light', '灯具', Math.ceil(totalArea / 12), '套', 280, 'LED 吸顶灯'));
    items.push(_item('cat_main_hardware', '五金件', Math.ceil(totalArea / 10), '件', 80, '合页/拉手/挂件'));
    items.push(_item('cat_main_kitchen_app', '厨房电器', kitchens.length, '套', 4500, '油烟机+灶具+消毒柜'));
    items.push(_item('cat_main_bath_app', '卫浴电器', bathrooms.length, '套', 800, '浴霸+排风'));
    items.push(_item('cat_main_water_heater', '热水器', bathrooms.length, '台', 2200, '燃气/电热水器'));
    items.push(_item('cat_main_floor_mat', '木地板', _round2(totalArea - floorTileArea), 'm²', 280, '实木复合地板'));

    // Sub-total
    var subTotal = items.reduce(function (s, it) { return s + (Number(it.total) || 0); }, 0);

    return {
      ok: true,
      generatedAt: new Date().toISOString(),
      source: {
        roomsCount: rooms.length,
        wallsCount: walls.length,
        doorsCount: totalDoors,
        windowsCount: totalWindows,
        bathrooms: bathrooms.length,
        kitchens: kitchens.length,
        totalArea: _round2(totalArea),
        totalWallLength: _round2(totalWallLength),
        floorHeight: floorHeight
      },
      rates: rates,
      items: items,
      totals: {
        itemCount: items.length,
        subTotal: _round2(subTotal),
        grandTotal: _round2(subTotal * 1.05) // 5% 管理费默认
      },
      notes: notes
    };
  }

  function _item(categoryId, name, qty, unit, unitPrice, description) {
    var q = Number(qty) || 0;
    var p = Number(unitPrice) || 0;
    return {
      categoryId: categoryId,
      name: name,
      quantity: _round2(q),
      unit: unit || '项',
      unitPrice: _round2(p),
      total: _round2(q * p),
      description: description || '',
      source: 'AI-floorplan'
    };
  }

  // ---- Push to ours 报价 (compatible format) ----
  function toOursQuote(generated) {
    if (!generated || !generated.items) return null;
    var categoriesMap = {};
    generated.items.forEach(function (it) {
      var cid = it.categoryId;
      if (!categoriesMap[cid]) {
        categoriesMap[cid] = { id: cid, name: CATEGORY_SCHEMA.find(function (c) { return c.id === cid; })?.name || cid, items: [] };
      }
      categoriesMap[cid].items.push({
        name: it.name,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        total: it.total,
        description: it.description,
        source: it.source
      });
    });
    var categories = Object.keys(categoriesMap).map(function (k) { return categoriesMap[k]; });
    return {
      ok: true,
      projectInfo: {
        projectName: 'AI 识别自动报价',
        createDate: new Date().toISOString().slice(0, 10),
        source: 'ai-floorplan-v3'
      },
      categories: categories,
      totals: generated.totals,
      meta: {
        aiSource: true,
        generatedAt: generated.generatedAt,
        source: generated.source,
        notes: generated.notes
      }
    };
  }

  // ---- Adjust rates (user override) ----
  function adjustRates(generated, newRates) {
    var generated2 = JSON.parse(JSON.stringify(generated));
    var rates = Object.assign({}, generated.rates, newRates || {});
    generated2.rates = rates;
    // Recompute items with new rates (keep qty)
    generated2.items.forEach(function (it) {
      var cat = CATEGORY_SCHEMA.find(function (c) { return c.id === it.categoryId; });
      if (!cat) return;
      var rateKey = _rateKeyForCategory(cat);
      if (rateKey && rates[rateKey] !== undefined) {
        // Only base categories use dynamic rates
        if (cat.id.startsWith('cat_base_')) {
          it.unitPrice = _round2(rates[rateKey]);
          it.total = _round2(it.quantity * it.unitPrice);
        }
      }
    });
    generated2.totals.subTotal = _round2(generated2.items.reduce(function (s, x) { return s + (Number(x.total) || 0); }, 0));
    generated2.totals.grandTotal = _round2(generated2.totals.subTotal * 1.05);
    return generated2;
  }

  function _rateKeyForCategory(cat) {
    var map = {
      'cat_base_room': 'default_room_rate',
      'cat_base_wall': 'wall_paint_rate',
      'cat_base_floor': 'floor_tile_rate',
      'cat_base_ceil': 'ceiling_rate',
      'cat_base_door': 'door_install_rate',
      'cat_base_window': 'window_install_rate',
      'cat_base_elec': 'electrical_point_rate',
      'cat_base_water': 'plumbing_rate',
      'cat_base_labor': 'labor_base'
    };
    return map[cat.id] || null;
  }

  root.YSQuote = {
    fromAI: fromAI,
    toOursQuote: toOursQuote,
    adjustRates: adjustRates,
    DEFAULT_RATES: DEFAULT_RATES,
    FLOOR_HEIGHT_DEFAULT: FLOOR_HEIGHT_DEFAULT,
    CATEGORY_SCHEMA: CATEGORY_SCHEMA
  };

})(typeof window !== 'undefined' ? window : this);