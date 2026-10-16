/* spatial-core.js — measurement core: scale, rectangle, polygon, walls, persistence
 * Zero dependencies. Module-scope only. Exposes window.SpatialCore.
 * All distances internally in mm; area in m²; perimeter in mm.
 */
(function (global) {
  'use strict';

  // -------- constants --------
  const MM_PER_M = 1000;
  const STORAGE_KEY = 'ys.spatialScale';
  const ZOOM_MIN = 25;        // 25%
  const ZOOM_MAX = 400;       // 400%
  const ROOM_NAME_MAX = 30;
  const PERSIST_VERSION = 1;

  // -------- utility: clamp --------
  function clamp(v, lo, hi) {
    if (!isFinite(v)) return lo;
    return Math.max(lo, Math.min(hi, v));
  }

  function round(n, digits) {
    const f = Math.pow(10, digits);
    return Math.round(n * f) / f;
  }

  // -------- unit conversion --------
  /** mm -> m */
  function mmToM(mm) { return mm / MM_PER_M; }
  /** m  -> mm */
  function mToMm(m) { return m * MM_PER_M; }
  /** px -> mm given realPerPixel (m/px). realPerPixel is meters per pixel. */
  function pxToMm(px, realPerPixel) {
    if (!realPerPixel || realPerPixel <= 0) return 0;
    return px * realPerPixel * MM_PER_M;
  }
  /** mm -> px given realPerPixel (m/px) */
  function mmToPx(mm, realPerPixel) {
    if (!realPerPixel || realPerPixel <= 0) return 0;
    return mm / (realPerPixel * MM_PER_M);
  }

  // -------- scale (calibration) --------
  /** Set scale from a known segment.
   *  pxDist: pixel length of reference line on screen
   *  realDistMm: real-world length in mm
   *  Returns realPerPixel in m/px (e.g. 0.01 means 1cm per pixel).
   *  Returns null and skips on invalid (0 / negative).
   */
  function setScale(pxDist, realDistMm) {
    if (!(pxDist > 0)) return null;            // reject zero/negative
    if (!(realDistMm > 0)) return null;        // reject zero/negative
    if (!isFinite(pxDist) || !isFinite(realDistMm)) return null;
    const realPerPixel = (realDistMm / MM_PER_M) / pxDist;
    return realPerPixel;
  }

  /** Build scale descriptor for storage. */
  function buildScaleRecord(realPerPixel, refPx, refMm) {
    return {
      version: PERSIST_VERSION,
      realPerPixel: realPerPixel,
      refPx: refPx,
      refMm: refMm,
      createdAt: new Date().toISOString()
    };
  }

  /** Resolve localStorage (works in browser & Node test env). */
  function getLS() {
    if (global && global.localStorage) return global.localStorage;
    if (typeof globalThis !== 'undefined' && globalThis.localStorage) return globalThis.localStorage;
    return null;
  }

  /** Persist scale to localStorage. Returns true on success. */
  function persistScale(record) {
    try {
      if (!record || typeof record !== 'object') return false;
      const json = JSON.stringify(record);
      const ls = getLS();
      if (ls) ls.setItem(STORAGE_KEY, json);
      return true;
    } catch (e) { return false; }
  }

  /** Load scale from localStorage. Returns null on miss. */
  function loadScale() {
    try {
      const ls = getLS();
      if (!ls) return null;
      const raw = ls.getItem(STORAGE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !(obj.realPerPixel > 0)) return null;
      return obj;
    } catch (e) { return null; }
  }

  function clearScale() {
    try { const ls = getLS(); if (ls) ls.removeItem(STORAGE_KEY); } catch (e) {}
  }

  // -------- rectangle from 2 points --------
  /** p1/p2 = {x, y} in pixel coordinates.
   *  Returns {lengthMm, widthMm, areaM2, perimeterMm, lengthM, widthM}.
   *  If realPerPixel invalid -> returns zeros + error.
   */
  function measureRectangle(p1, p2, realPerPixel) {
    if (!p1 || !p2 || !(realPerPixel > 0)) {
      return { lengthMm: 0, widthMm: 0, areaM2: 0, perimeterMm: 0, lengthM: 0, widthM: 0 };
    }
    const dx = Math.abs(p2.x - p1.x);
    const dy = Math.abs(p2.y - p1.y);
    const lengthMm = pxToMm(Math.max(dx, dy), realPerPixel);
    const widthMm = pxToMm(Math.min(dx, dy), realPerPixel);
    const lengthM = mmToM(lengthMm);
    const widthM = mmToM(widthMm);
    const areaM2 = lengthM * widthM;
    const perimeterMm = 2 * (lengthMm + widthMm);
    return {
      lengthMm: round(lengthMm, 2),
      widthMm: round(widthMm, 2),
      areaM2: round(areaM2, 4),
      perimeterMm: round(perimeterMm, 2),
      lengthM: round(lengthM, 3),
      widthM: round(widthM, 3)
    };
  }

  /** Box drag rectangle (mousedown -> mouseup). Same semantics as measureRectangle. */
  function measureBox(p1, p2, realPerPixel) {
    return measureRectangle(p1, p2, realPerPixel);
  }

  // -------- polygon (Shoelace) --------
  /** points = [{x,y}] in pixel coords, length >= 3.
   *  Returns {areaM2, perimeterMm, vertices}.
   *  Empty / invalid -> zeros.
   */
  function measurePolygon(points, realPerPixel) {
    if (!Array.isArray(points) || points.length < 3 || !(realPerPixel > 0)) {
      return { areaM2: 0, perimeterMm: 0, vertices: [] };
    }
    // Shoelace in pixel space, then scale to m²
    let sum = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      sum += (a.x * b.y) - (b.x * a.y);
    }
    const areaPx2 = Math.abs(sum) / 2;
    const mm2PerPx2 = (realPerPixel * MM_PER_M) * (realPerPixel * MM_PER_M);
    const areaMm2 = areaPx2 * mm2PerPx2;
    const areaM2 = mmToM(areaMm2) * mmToM(areaMm2); // mm² -> m² = divide by 1e6
    // actually: 1 m² = 1_000_000 mm². Correct:
    const areaM2Correct = areaMm2 / (MM_PER_M * MM_PER_M);
    // Perimeter
    let perimeterMm = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      perimeterMm += pxToMm(d, realPerPixel);
    }
    return {
      areaM2: round(areaM2Correct, 4),
      perimeterMm: round(perimeterMm, 2),
      vertices: points.slice()
    };
  }

  // -------- wall detection (PoC) --------
  /** Given a list of "pixel measurements" already measured (rectangles/polygons),
   *  infer wall length by counting horizontal/vertical long edges.
   *  Pure PoC: sums perimeter of all rectangle-shaped rooms as wall length.
   *  Returns { totalWallLengthMm, segments:[{lengthMm, orientation}] }.
   */
  function detectWalls(rooms, realPerPixel) {
    const segments = [];
    if (!Array.isArray(rooms)) {
      return { totalWallLengthMm: 0, segments: [] };
    }
    let totalMm = 0;
    for (const r of rooms) {
      if (!r) continue;
      if (r.shape === 'rectangle') {
        const l = Number(r.lengthMm) || 0;
        const w = Number(r.widthMm) || 0;
        segments.push({ lengthMm: l, orientation: 'horizontal' });
        segments.push({ lengthMm: l, orientation: 'horizontal' });
        segments.push({ lengthMm: w, orientation: 'vertical' });
        segments.push({ lengthMm: w, orientation: 'vertical' });
        totalMm += 2 * (l + w);
      } else if (r.shape === 'polygon') {
        const perim = Number(r.perimeterMm) || 0;
        segments.push({ lengthMm: perim, orientation: 'mixed' });
        totalMm += perim;
      }
    }
    return {
      totalWallLengthMm: round(totalMm, 2),
      segments: segments
    };
  }

  // -------- room factory --------
  function newRoomId() {
    return 'r' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function sanitizeRoomName(name) {
    const s = String(name == null ? '' : name).trim();
    if (!s) return '';
    return s.length > ROOM_NAME_MAX ? s.slice(0, ROOM_NAME_MAX) : s;
  }

  /** Build a room object from a rectangle measurement. */
  function buildRoomRect(name, p1, p2, realPerPixel, imageDataUrl) {
    const m = measureRectangle(p1, p2, realPerPixel);
    const room = {
      id: newRoomId(),
      name: sanitizeRoomName(name) || '未命名',
      shape: 'rectangle',
      length: m.lengthM,
      width: m.widthM,
      area: m.areaM2,
      perimeter: m.perimeterMm / MM_PER_M, // store as meters in totalPerimeter; export uses mm
      perimeterMm: m.perimeterMm,
      lengthMm: m.lengthMm,
      widthMm: m.widthMm,
      scale: realPerPixel,
      source: {
        type: 'point',
        coords: [[p1.x, p1.y], [p2.x, p2.y]]
      }
    };
    if (imageDataUrl) room.imageDataUrl = imageDataUrl;
    return room;
  }

  function buildRoomBox(name, p1, p2, realPerPixel, imageDataUrl) {
    const room = buildRoomRect(name, p1, p2, realPerPixel, imageDataUrl);
    room.source.type = 'box';
    return room;
  }

  function buildRoomPolygon(name, points, realPerPixel, imageDataUrl) {
    const m = measurePolygon(points, realPerPixel);
    // perimeterM for convenience, perimeterMm for export
    const perimM = mmToM(m.perimeterMm);
    const room = {
      id: newRoomId(),
      name: sanitizeRoomName(name) || '未命名',
      shape: 'polygon',
      length: 0,
      width: 0,
      area: m.areaM2,
      perimeter: perimM,
      perimeterMm: m.perimeterMm,
      scale: realPerPixel,
      source: {
        type: 'polygon',
        coords: points.map(p => [p.x, p.y])
      },
      vertices: m.vertices
    };
    if (imageDataUrl) room.imageDataUrl = imageDataUrl;
    return room;
  }

  /** Validate a room object has required fields. */
  function isValidRoom(r) {
    if (!r || typeof r !== 'object') return false;
    if (!r.id || typeof r.id !== 'string') return false;
    if (!r.name || typeof r.name !== 'string') return false;
    if (typeof r.area !== 'number' || r.area < 0) return false;
    return true;
  }

  /** Ensure all room IDs are unique; suffix duplicates with -2, -3, ... */
  function uniquifyRoomIds(rooms) {
    const seen = new Map();
    const out = [];
    for (const r of rooms) {
      if (!r || !r.id) continue;
      const k = r.id;
      if (seen.has(k)) {
        let n = 2;
        while (seen.has(k + '-' + n)) n++;
        const newId = k + '-' + n;
        seen.set(newId, true);
        const c = Object.assign({}, r, { id: newId });
        out.push(c);
      } else {
        seen.set(k, true);
        out.push(r);
      }
    }
    return out;
  }

  /** Sum area of rooms; returns m². */
  function sumArea(rooms) {
    let s = 0;
    for (const r of rooms) if (r && typeof r.area === 'number') s += r.area;
    return round(s, 4);
  }

  /** Sum wall length (mm) of rooms. */
  function sumWallLength(rooms) {
    let s = 0;
    for (const r of rooms) {
      if (!r) continue;
      if (typeof r.perimeterMm === 'number') s += r.perimeterMm;
      else if (typeof r.perimeter === 'number') s += r.perimeter * MM_PER_M;
    }
    return round(s, 2);
  }

  // -------- zoom clamp --------
  function clampZoom(z) {
    const n = Number(z);
    if (!isFinite(n)) return ZOOM_MIN;
    return clamp(n, ZOOM_MIN, ZOOM_MAX);
  }

  // -------- pan clamp --------
  /** Clamp pan offset given image dims + container dims + zoom.
   *  imageW/H in original px, containerW/H in css px, zoom in %.
   */
  function clampPan(panX, panY, imageW, imageH, containerW, containerH, zoom) {
    const z = clampZoom(zoom) / 100;
    const scaledW = imageW * z;
    const scaledH = imageH * z;
    const overflowX = scaledW - containerW;
    const overflowY = scaledH - containerH;
    // When image larger than container: valid pan range [-overflow, 0]
    // When image fits: pan forced to 0 (no panning needed)
    const minX = overflowX > 0 ? -overflowX : 0;
    const maxX = overflowX > 0 ? 0 : 0;
    const minY = overflowY > 0 ? -overflowY : 0;
    const maxY = overflowY > 0 ? 0 : 0;
    return {
      x: clamp(panX, minX, maxX),
      y: clamp(panY, minY, maxY)
    };
  }

  // -------- export --------
  global.SpatialCore = Object.freeze({
    STORAGE_KEY: STORAGE_KEY,
    ZOOM_MIN: ZOOM_MIN,
    ZOOM_MAX: ZOOM_MAX,
    ROOM_NAME_MAX: ROOM_NAME_MAX,
    MM_PER_M: MM_PER_M,
    PERSIST_VERSION: PERSIST_VERSION,
    clamp: clamp,
    round: round,
    mmToM: mmToM,
    mToMm: mToMm,
    pxToMm: pxToMm,
    mmToPx: mmToPx,
    setScale: setScale,
    buildScaleRecord: buildScaleRecord,
    persistScale: persistScale,
    loadScale: loadScale,
    clearScale: clearScale,
    measureRectangle: measureRectangle,
    measureBox: measureBox,
    measurePolygon: measurePolygon,
    detectWalls: detectWalls,
    buildRoomRect: buildRoomRect,
    buildRoomBox: buildRoomBox,
    buildRoomPolygon: buildRoomPolygon,
    isValidRoom: isValidRoom,
    uniquifyRoomIds: uniquifyRoomIds,
    sumArea: sumArea,
    sumWallLength: sumWallLength,
    clampZoom: clampZoom,
    clampPan: clampPan,
    sanitizeRoomName: sanitizeRoomName
  });
})(typeof window !== 'undefined' ? window : globalThis);