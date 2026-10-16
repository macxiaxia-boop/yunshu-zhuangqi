/* rooms-export.js — build window.RoomsData and push to yunshu-zhuangqi quote
 * Maps area -> wall paint + floor tile; perimeter -> ceiling woodwork.
 * Uses postMessage + window.opener.ydata.addRooms fallback.
 */
(function (global) {
  'use strict';

  const SC = global.SpatialCore;

  // -------- default unit prices (¥) — user editable --------
  const DEFAULT_PRICES = Object.freeze({
    wallPaintPerM2: 28,      // 墙面粉刷 ¥/㎡
    floorTilePerM2: 120,     // 地砖铺贴 ¥/㎡
    ceilingPerM: 180         // 吊顶 ¥/米
  });

  // -------- category id map (matches app.html c05/c07/c08) --------
  // c05 防水工程, c06 保温, c07 泥瓦(地面+墙面归此处), c08 木作(吊顶)
  // Per task spec: area->墙面 + area->地面 + perimeter->木作吊顶
  // We use c07 (泥瓦) for both wall + floor, c08 (木作) for ceiling
  const CATEGORY_TARGETS = Object.freeze({
    wallPaint: { categoryId: 'c07', categoryCn: '泥瓦工程', unit: '㎡', priceKey: 'wallPaintPerM2', label: '墙面粉刷' },
    floorTile: { categoryId: 'c07', categoryCn: '泥瓦工程', unit: '㎡', priceKey: 'floorTilePerM2', label: '地砖铺贴' },
    ceiling:   { categoryId: 'c08', categoryCn: '木作工程', unit: '米', priceKey: 'ceilingPerM',    label: '吊顶' }
  });

  // -------- new item id --------
  function newItemId() {
    return 'item-spatial-' + Date.now().toString(36) + '-' +
      Math.floor(Math.random() * 1e6).toString(36);
  }

  // -------- build RoomsData from rooms array --------
  /** rooms: array of room objects (from spatial-core builders)
   *  options: { imageDataUrl?: string, prices?: {...} }
   *  Returns window.RoomsData-compatible object.
   */
  function build(rooms, options) {
    options = options || {};
    const clean = Array.isArray(rooms) ? rooms.filter(SC.isValidRoom) : [];
    const uniq = SC.uniquifyRoomIds(clean);
    const totalArea = SC.sumArea(uniq);
    const totalWallLength = SC.sumWallLength(uniq);
    const obj = {
      rooms: uniq.map(function (r) {
        const o = {
          id: r.id,
          name: r.name,
          shape: r.shape,
          length: Number(r.length) || 0,
          width: Number(r.width) || 0,
          area: Number(r.area) || 0,
          perimeter: Number(r.perimeter) || 0,
          scale: Number(r.scale) || 0,
          source: r.source || null
        };
        if (r.imageDataUrl) o.imageDataUrl = r.imageDataUrl;
        return o;
      }),
      totalArea: totalArea,
      totalWallLength: totalWallLength,
      createdAt: new Date().toISOString(),
      version: 1
    };
    if (options.imageDataUrl) obj.imageDataUrl = options.imageDataUrl;
    return obj;
  }

  /** Expose to global as window.RoomsData. */
  function publish(rooms, options) {
    const obj = build(rooms, options);
    global.RoomsData = obj;
    return obj;
  }

  // -------- auto-mapping to quote categories --------
  /** Map room measurements to quote items.
   *  Returns array of { categoryId, categoryCn, item: { name, unit, qty, price, ... } }.
   *  If autoMap is false, returns empty array.
   */
  function mapToQuoteItems(roomsData, opts) {
    opts = opts || {};
    if (opts.autoMap === false) return [];
    const prices = Object.assign({}, DEFAULT_PRICES, opts.prices || {});
    const items = [];
    const totalArea = (roomsData && roomsData.totalArea) || SC.sumArea(roomsData.rooms || []);
    const totalPerimM = ((roomsData && roomsData.totalWallLength) || SC.sumWallLength(roomsData.rooms || [])) / SC.MM_PER_M;

    if (totalArea > 0) {
      const wall = CATEGORY_TARGETS.wallPaint;
      items.push({
        categoryId: wall.categoryId,
        categoryCn: wall.categoryCn,
        item: makeItem(wall.label + '（空间算量）', wall.unit,
          round(totalArea, 2), prices[wall.priceKey], 'spatial-auto', wall.categoryId)
      });
      const floor = CATEGORY_TARGETS.floorTile;
      items.push({
        categoryId: floor.categoryId,
        categoryCn: floor.categoryCn,
        item: makeItem(floor.label + '（空间算量）', floor.unit,
          round(totalArea, 2), prices[floor.priceKey], 'spatial-auto', floor.categoryId)
      });
    }
    if (totalPerimM > 0) {
      const ceil = CATEGORY_TARGETS.ceiling;
      items.push({
        categoryId: ceil.categoryId,
        categoryCn: ceil.categoryCn,
        item: makeItem(ceil.label + '（空间算量）', ceil.unit,
          round(totalPerimM, 2), prices[ceil.priceKey], 'spatial-auto', ceil.categoryId)
      });
    }
    return items;
  }

  function makeItem(name, unit, qty, price, sourceSheet, categoryId) {
    return {
      id: newItemId(),
      name: name,
      unit: unit,
      qty: String(qty),
      price: String(price),
      desc: '由空间算量自动生成（' + new Date().toLocaleDateString() + '）',
      status: 'enabled',
      sourceSheet: sourceSheet,
      sourceRow: -1,
      categoryId: categoryId,
      spatialAuto: true
    };
  }

  function round(n, d) {
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  }

  // -------- push to opener --------
  /** Send to parent window via postMessage + direct addRooms fallback. */
  function pushToQuote(roomsData, opts) {
    opts = opts || {};
    const payload = {
      type: 'rooms-added',
      version: 1,
      rooms: roomsData.rooms || [],
      totalArea: roomsData.totalArea || 0,
      totalWallLength: roomsData.totalWallLength || 0,
      autoMapped: opts.autoMap !== false ? mapToQuoteItems(roomsData, opts) : [],
      createdAt: roomsData.createdAt || new Date().toISOString()
    };

    // postMessage to opener (cross-origin safe)
    if (global.opener && !global.opener.closed) {
      try { global.opener.postMessage(payload, '*'); } catch (e) {}
    }

    // direct call if same-origin opener exposes ydata
    let directOk = false;
    try {
      if (global.opener && global.opener.ydata &&
          typeof global.opener.ydata.addRooms === 'function') {
        global.opener.ydata.addRooms(payload.rooms);
        directOk = true;
      }
    } catch (e) { /* cross-origin */ }

    payload._sentVia = directOk ? 'direct' : 'postMessage';
    return payload;
  }

  /** Convenience: publish + push in one call. */
  function exportAndPush(rooms, options) {
    const obj = publish(rooms || [], options);
    const sent = pushToQuote(obj, options);
    return { data: obj, sent: sent };
  }

  // -------- category lookup (helper) --------
  function getCategoryTargets() { return CATEGORY_TARGETS; }
  function getDefaultPrices() { return DEFAULT_PRICES; }

  // -------- export --------
  global.RoomsExport = Object.freeze({
    DEFAULT_PRICES: DEFAULT_PRICES,
    CATEGORY_TARGETS: CATEGORY_TARGETS,
    build: build,
    publish: publish,
    mapToQuoteItems: mapToQuoteItems,
    pushToQuote: pushToQuote,
    exportAndPush: exportAndPush,
    getCategoryTargets: getCategoryTargets,
    getDefaultPrices: getDefaultPrices
  });
})(typeof window !== 'undefined' ? window : globalThis);