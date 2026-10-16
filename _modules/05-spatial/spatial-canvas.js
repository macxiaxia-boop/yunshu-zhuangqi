/* spatial-canvas.js — canvas rendering: image background, overlay, zoom/pan, grid
 * Zero deps. Uses requestAnimationFrame. Exposes window.SpatialCanvas.
 */
(function (global) {
  'use strict';

  const SC = global.SpatialCore;

  // -------- canvas setup --------
  function createCanvas(container) {
    if (!container) return null;
    const cv = document.createElement('canvas');
    cv.className = 'spatial-canvas';
    cv.style.display = 'block';
    cv.style.cursor = 'crosshair';
    cv.style.userSelect = 'none';
    cv.style.touchAction = 'none';
    cv.style.background = '#f8f8f5';
    container.appendChild(cv);
    return cv;
  }

  function fitCanvasToContainer(cv) {
    const parent = cv.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = global.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.floor(rect.width * dpr));
    cv.height = Math.max(1, Math.floor(rect.height * dpr));
    cv.style.width = rect.width + 'px';
    cv.style.height = rect.height + 'px';
  }

  // -------- viewport (zoom/pan) --------
  function createViewport() {
    return {
      zoom: 100,
      panX: 0,
      panY: 0,
      image: null,         // HTMLImageElement
      imageW: 0,
      imageH: 0,
      showGrid: false,
      gridStepMm: 100      // 10/50/100 mm
    };
  }

  function setImage(viewport, img) {
    if (!img) return;
    viewport.image = img;
    viewport.imageW = img.naturalWidth || img.width || 0;
    viewport.imageH = img.naturalHeight || img.height || 0;
    // fit-to-container on first load
    const cv = viewport._cv;
    if (cv) {
      const rect = cv.parentElement.getBoundingClientRect();
      const zX = (rect.width / viewport.imageW) * 100;
      const zY = (rect.height / viewport.imageH) * 100;
      viewport.zoom = SC.clampZoom(Math.min(zX, zY));
      viewport.panX = (rect.width - viewport.imageW * viewport.zoom / 100) / 2;
      viewport.panY = (rect.height - viewport.imageH * viewport.zoom / 100) / 2;
    }
  }

  /** Convert screen px -> image px. */
  function screenToImage(viewport, sx, sy) {
    const z = viewport.zoom / 100;
    return {
      x: (sx - viewport.panX) / z,
      y: (sy - viewport.panY) / z
    };
  }

  /** Convert image px -> screen px. */
  function imageToScreen(viewport, ix, iy) {
    const z = viewport.zoom / 100;
    return {
      x: ix * z + viewport.panX,
      y: iy * z + viewport.panY
    };
  }

  // -------- grid --------
  function drawGrid(ctx, viewport) {
    if (!viewport.showGrid || !viewport.image || !(viewport._scale > 0)) return;
    const z = viewport.zoom / 100;
    const stepPx = SC.mmToPx(viewport.gridStepMm, viewport._scale);
    if (!(stepPx > 0)) return;
    const cv = viewport._cv;
    const W = cv.width;
    const H = cv.height;
    const startX = viewport.panX % (stepPx * z);
    const startY = viewport.panY % (stepPx * z);
    ctx.save();
    ctx.strokeStyle = 'rgba(150,150,150,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = startX; x < W; x += stepPx * z) {
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
    }
    for (let y = startY; y < H; y += stepPx * z) {
      ctx.moveTo(0, y); ctx.lineTo(W, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // -------- draw image --------
  function drawImage(ctx, viewport) {
    if (!viewport.image) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, viewport._cv.width, viewport._cv.height);
      ctx.fillStyle = '#888';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('请上传户型图开始测量',
        viewport._cv.width / 2, viewport._cv.height / 2);
      return;
    }
    const z = viewport.zoom / 100;
    const drawW = viewport.imageW * z;
    const drawH = viewport.imageH * z;
    ctx.imageSmoothingQuality = 'high';
    try { ctx.drawImage(viewport.image, viewport.panX, viewport.panY, drawW, drawH); }
    catch (e) { /* ignore */ }
  }

  // -------- overlay renderers (measurements) --------
  function drawMeasurements(ctx, viewport, state) {
    if (!state || !Array.isArray(state.measurements)) return;
    for (const m of state.measurements) {
      if (!m) continue;
      if (m.shape === 'rectangle') drawRectangle(ctx, viewport, m);
      else if (m.shape === 'polygon') drawPolygon(ctx, viewport, m);
      else if (m.shape === 'line') drawWallLine(ctx, viewport, m);
    }
    // in-progress rubber band / polygon
    if (state.draft) drawDraft(ctx, viewport, state.draft);
  }

  function drawRectangle(ctx, viewport, m) {
    const p1 = imageToScreen(viewport, m.coords[0][0], m.coords[0][1]);
    const p2 = imageToScreen(viewport, m.coords[1][0], m.coords[1][1]);
    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);
    ctx.save();
    ctx.fillStyle = 'rgba(220,80,80,0.15)';
    ctx.strokeStyle = 'rgba(220,80,80,0.95)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    // label
    drawLabel(ctx, x + w / 2, y + h / 2,
      (m.name || '房间') + ' · ' + (m.area || 0).toFixed(2) + '㎡');
    ctx.restore();
  }

  function drawPolygon(ctx, viewport, m) {
    if (!m.coords || m.coords.length < 2) return;
    ctx.save();
    ctx.fillStyle = 'rgba(80,140,220,0.18)';
    ctx.strokeStyle = 'rgba(80,140,220,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < m.coords.length; i++) {
      const [ix, iy] = m.coords[i];
      const sp = imageToScreen(viewport, ix, iy);
      if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // center label
    let cx = 0, cy = 0;
    for (const [ix, iy] of m.coords) {
      const sp = imageToScreen(viewport, ix, iy);
      cx += sp.x; cy += sp.y;
    }
    cx /= m.coords.length; cy /= m.coords.length;
    drawLabel(ctx, cx, cy,
      (m.name || '房间') + ' · ' + (m.area || 0).toFixed(2) + '㎡');
    ctx.restore();
  }

  function drawWallLine(ctx, viewport, m) {
    if (!m.coords || m.coords.length < 2) return;
    const p1 = imageToScreen(viewport, m.coords[0][0], m.coords[0][1]);
    const p2 = imageToScreen(viewport, m.coords[1][0], m.coords[1][1]);
    ctx.save();
    ctx.strokeStyle = 'rgba(255,140,0,0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    drawLabel(ctx, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2,
      (m.lengthM || 0).toFixed(2) + 'm');
    ctx.restore();
  }

  function drawDraft(ctx, viewport, draft) {
    ctx.save();
    ctx.strokeStyle = 'rgba(80,200,120,0.95)';
    ctx.fillStyle = 'rgba(80,200,120,0.18)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    if (draft.type === 'box' && draft.p1 && draft.cur) {
      const x = Math.min(draft.p1.x, draft.cur.x);
      const y = Math.min(draft.p1.y, draft.cur.y);
      const w = Math.abs(draft.cur.x - draft.p1.x);
      const h = Math.abs(draft.cur.y - draft.p1.y);
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    } else if (draft.type === 'polygon' && Array.isArray(draft.points)) {
      if (draft.points.length > 0) {
        ctx.beginPath();
        for (let i = 0; i < draft.points.length; i++) {
          const sp = imageToScreen(viewport, draft.points[i].x, draft.points[i].y);
          if (i === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
        }
        if (draft.cur) {
          const sp = imageToScreen(viewport, draft.cur.x, draft.cur.y);
          ctx.lineTo(sp.x, sp.y);
        }
        ctx.stroke();
        // vertex dots
        for (const p of draft.points) {
          const sp = imageToScreen(viewport, p.x, p.y);
          ctx.beginPath();
          ctx.arc(sp.x, sp.y, 4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (draft.type === 'line' && draft.p1 && draft.cur) {
      ctx.beginPath();
      ctx.moveTo(draft.p1.x, draft.p1.y);
      ctx.lineTo(draft.cur.x, draft.cur.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabel(ctx, x, y, text) {
    if (!text) return;
    ctx.save();
    ctx.font = '12px sans-serif';
    const metrics = ctx.measureText(text);
    const padX = 6, padY = 3;
    const w = metrics.width + padX * 2;
    const h = 18;
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // -------- main draw --------
  function render(viewport, state) {
    const cv = viewport._cv;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(global.devicePixelRatio || 1, 0, 0, global.devicePixelRatio || 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    drawImage(ctx, viewport);
    drawGrid(ctx, viewport);
    drawMeasurements(ctx, viewport, state);
    // scale ruler (top-left)
    if (viewport._scale > 0) drawScaleRuler(ctx, viewport);
  }

  // -------- scale ruler --------
  function drawScaleRuler(ctx, viewport) {
    const cv = viewport._cv;
    const dpr = global.devicePixelRatio || 1;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(8 * dpr, 8 * dpr, 130 * dpr, 28 * dpr);
    ctx.strokeStyle = '#444';
    ctx.strokeRect(8 * dpr, 8 * dpr, 130 * dpr, 28 * dpr);
    ctx.fillStyle = '#222';
    ctx.font = (11 * dpr) + 'px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const rpp = viewport._scale;
    ctx.fillText('1px = ' + (rpp * 1000).toFixed(1) + 'mm', 14 * dpr, 22 * dpr);
    ctx.restore();
  }

  // -------- rAF loop --------
  function createRenderLoop(viewport, getState) {
    let raf = null;
    let dirty = true;

    function tick() {
      if (dirty) {
        dirty = false;
        render(viewport, getState());
      }
      raf = requestAnimationFrame(tick);
    }

    function startLoop() {
      if (raf != null) return;
      raf = requestAnimationFrame(tick);
    }
    function stopLoop() {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;
    }
    function invalidate() { dirty = true; }

    return { start: startLoop, stop: stopLoop, invalidate: invalidate };
  }

  // -------- input: wheel zoom + drag pan --------
  function attachInteractions(viewport, loop, callbacks) {
    const cv = viewport._cv;
    if (!cv) return function () {};
    let isPanning = false;
    let lastX = 0, lastY = 0;
    let spaceDown = false;

    function onMouseDown(e) {
      if (e.button === 1 || spaceDown) {
        isPanning = true;
        lastX = e.clientX; lastY = e.clientY;
        cv.style.cursor = 'grabbing';
        e.preventDefault();
      }
    }
    function onMouseMove(e) {
      if (!isPanning) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      viewport.panX += dx;
      viewport.panY += dy;
      if (callbacks && callbacks.onPan) callbacks.onPan(viewport);
      loop.invalidate();
    }
    function onMouseUp() {
      if (isPanning) {
        isPanning = false;
        cv.style.cursor = spaceDown ? 'grab' : 'crosshair';
      }
    }
    function onWheel(e) {
      e.preventDefault();
      const rect = cv.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      // zoom about mouse position
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      const newZoom = SC.clampZoom(viewport.zoom * factor);
      const actualFactor = newZoom / viewport.zoom;
      viewport.panX = sx - (sx - viewport.panX) * actualFactor;
      viewport.panY = sy - (sy - viewport.panY) * actualFactor;
      viewport.zoom = newZoom;
      if (callbacks && callbacks.onZoom) callbacks.onZoom(viewport);
      loop.invalidate();
    }
    function onKeyDown(e) { if (e.code === 'Space') { spaceDown = true; cv.style.cursor = 'grab'; } }
    function onKeyUp(e) { if (e.code === 'Space') { spaceDown = false; cv.style.cursor = 'crosshair'; } }

    cv.addEventListener('mousedown', onMouseDown);
    global.addEventListener('mousemove', onMouseMove);
    global.addEventListener('mouseup', onMouseUp);
    cv.addEventListener('wheel', onWheel, { passive: false });
    global.addEventListener('keydown', onKeyDown);
    global.addEventListener('keyup', onKeyUp);

    return function detach() {
      cv.removeEventListener('mousedown', onMouseDown);
      global.removeEventListener('mousemove', onMouseMove);
      global.removeEventListener('mouseup', onMouseUp);
      cv.removeEventListener('wheel', onWheel);
      global.removeEventListener('keydown', onKeyDown);
      global.removeEventListener('keyup', onKeyUp);
    };
  }

  // -------- export --------
  global.SpatialCanvas = Object.freeze({
    createCanvas: createCanvas,
    fitCanvasToContainer: fitCanvasToContainer,
    createViewport: createViewport,
    setImage: setImage,
    screenToImage: screenToImage,
    imageToScreen: imageToScreen,
    createRenderLoop: createRenderLoop,
    attachInteractions: attachInteractions,
    render: render
  });
})(typeof window !== 'undefined' ? window : globalThis);