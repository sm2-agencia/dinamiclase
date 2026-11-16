/* =====================================================================
   Pizarra infinita · Dinamiclase
   - Lienzo infinito con zoom y desplazamiento (rueda, mano, espacio, pellizco)
   - Elementos editables: rectángulo, rombo, elipse, flecha, línea, lápiz,
     texto, imagen. Selección, mover, redimensionar, duplicar, capas.
   - Estilo "a mano" propio (trazo irregular con semilla) y rellenos
     sólido / rayado / cuadriculado
   - Etiquetas dentro de las figuras (doble clic)
   - Borrador por elementos y puntero láser
   - Deshacer / rehacer, autoguardado en el navegador
   - Exportar PNG / SVG, copiar imagen, guardar y abrir archivo .dinamiclase
   ===================================================================== */
(() => {
  'use strict';

  const DC = window.Dinamiclase;
  const { sfx, clamp } = DC.utils;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------
     Constantes
     ------------------------------------------------------------------ */
  const STORE_KEY = 'dinamiclase:pizarra:v2';
  const FONTS = {
    hand: "'Caveat', 'Comic Sans MS', cursive",
    normal: "'Nunito', system-ui, sans-serif",
    code: "ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace",
  };
  const LINE_H = 1.25;
  const SHAPES = ['rectangle', 'diamond', 'ellipse'];
  const LINEAR = ['line', 'arrow'];
  const DRAW_TOOLS = ['rectangle', 'diamond', 'ellipse', 'line', 'arrow', 'freedraw', 'text'];
  const STROKES = ['#231942', '#FFFFFF', '#E11D48', '#22C55E', '#2F6BFF', '#FB5306', '#7C3AED'];
  const FILLS = ['transparent', '#FFE0E6', '#DCF7E5', '#DBEAFE', '#FFF2CC', '#EDE9FE', '#FFE4D2'];
  const BG = {
    blanco: { fill: '#FFFFFF' },
    cuadricula: { fill: '#FFFFFF', grid: 40, line: '#DCE6F5' },
    puntos: { fill: '#FFFFFF', dots: 28, line: '#B9C3D6' },
    rayado: { fill: '#FFFEF7', rows: 40, line: '#C7DAF4', margin: '#F4A6A6' },
    pizarra: { fill: '#1F4D3A' },
  };

  /* ------------------------------------------------------------------
     DOM
     ------------------------------------------------------------------ */
  const board = $('#board');
  const canvas = $('#pizarraCanvas');
  const ctx = canvas.getContext('2d');
  const editor = $('#textEditor');
  const propsEl = $('#props');
  const welcome = $('#welcome');
  const menuBtn = $('#menuBtn');
  const menu = $('#mainMenu');
  const undoBtn = $('#undoBtn');
  const redoBtn = $('#redoBtn');
  const zoomLabel = $('#zoomReset');
  const helpDialog = $('#helpDialog');
  const imageInput = $('#imageInput');
  const fileInput = $('#fileInput');

  /* ------------------------------------------------------------------
     Estado
     ------------------------------------------------------------------ */
  let elements = [];
  let files = {};               // fileId -> dataURL (imágenes)
  const imgCache = new Map();   // fileId -> HTMLImageElement
  let selected = new Set();
  let tool = 'selection';
  let toolLocked = false;
  let bg = 'blanco';
  const view = { x: 0, y: 0, zoom: 1 }; // pantalla = (mundo + view) * zoom
  let dpr = 1;
  let W = 0, H = 0;

  const style = {
    strokeColor: '#231942',
    bgColor: 'transparent',
    fillStyle: 'hachure',
    strokeWidth: 2,
    strokeStyle: 'solid',
    roughness: 1,
    roundness: 'round',
    opacity: 100,
    fontSize: 28,
    fontFamily: 'hand',
    textAlign: 'left',
    startArrow: 'none',
    endArrow: 'arrow',
  };

  let action = null;      // interacción en curso
  let editing = null;     // { el, field: 'text'|'label', isNew }
  let spaceDown = false;
  let erasing = new Set();
  let laser = [];         // [{x,y,t}]
  let hoverPoint = null;
  let clipboard = null;
  const pointers = new Map();
  let pinch = null;

  /* ------------------------------------------------------------------
     Utilidades
     ------------------------------------------------------------------ */
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const newSeed = () => Math.floor(Math.random() * 2 ** 31);
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const toWorld = (sx, sy) => ({ x: sx / view.zoom - view.x, y: sy / view.zoom - view.y });
  const toScreen = (wx, wy) => ({ x: (wx + view.x) * view.zoom, y: (wy + view.y) * view.zoom });
  const eventPoint = (e) => {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  const byId = (id) => elements.find((el) => el.id === id);
  const selectedEls = () => elements.filter((el) => selected.has(el.id));
  const fontOf = (el) => `${el.fontSize}px ${FONTS[el.fontFamily] || FONTS.hand}`;

  /** Rectángulo que ocupa un elemento en coordenadas del mundo */
  function bounds(el) {
    if (el.points) {
      let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
      el.points.forEach(([px, py]) => {
        x1 = Math.min(x1, el.x + px); y1 = Math.min(y1, el.y + py);
        x2 = Math.max(x2, el.x + px); y2 = Math.max(y2, el.y + py);
      });
      return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
    }
    return { x: Math.min(el.x, el.x + el.w), y: Math.min(el.y, el.y + el.h), w: Math.abs(el.w), h: Math.abs(el.h) };
  }
  function unionBounds(list) {
    if (!list.length) return null;
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    list.forEach((el) => {
      const b = bounds(el);
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
    });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function normalize(el) {
    if (el.points) return;
    if (el.w < 0) { el.x += el.w; el.w = -el.w; }
    if (el.h < 0) { el.y += el.h; el.h = -el.h; }
  }

  /* Medición de texto */
  const measurer = document.createElement('canvas').getContext('2d');
  function measureText(el) {
    measurer.font = fontOf(el);
    const lines = String(el.text || '').split('\n');
    const w = Math.max(...lines.map((l) => measurer.measureText(l || ' ').width), el.fontSize * 0.5);
    el.w = Math.ceil(w) + 2;
    el.h = Math.ceil(lines.length * el.fontSize * LINE_H);
  }
  function wrapLines(c, text, maxW) {
    const out = [];
    String(text).split('\n').forEach((para) => {
      const words = para.split(' ');
      let line = '';
      words.forEach((word) => {
        const test = line ? `${line} ${word}` : word;
        if (c.measureText(test).width > maxW && line) { out.push(line); line = word; }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }

  /* ------------------------------------------------------------------
     Contorno de las figuras
     ------------------------------------------------------------------ */
  function cornerRadius(el) {
    return el.roundness === 'round' ? Math.min(Math.abs(el.w), Math.abs(el.h)) * 0.2 : 0;
  }
  /** Puntos del contorno cerrado (para dibujo irregular y detección de clic) */
  function outline(el) {
    const { x, y } = el, w = el.w, h = el.h;
    if (el.type === 'ellipse') {
      const pts = [];
      const n = 40;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([x + w / 2 + Math.cos(a) * w / 2, y + h / 2 + Math.sin(a) * h / 2]);
      }
      return pts;
    }
    if (el.type === 'diamond') {
      const top = [x + w / 2, y], right = [x + w, y + h / 2], bottom = [x + w / 2, y + h], left = [x, y + h / 2];
      if (el.roundness !== 'round') return [top, right, bottom, left];
      const pts = [];
      const corners = [top, right, bottom, left];
      const k = 0.18;
      corners.forEach((c, i) => {
        const prev = corners[(i + 3) % 4], next = corners[(i + 1) % 4];
        const a = [c[0] + (prev[0] - c[0]) * k, c[1] + (prev[1] - c[1]) * k];
        const b = [c[0] + (next[0] - c[0]) * k, c[1] + (next[1] - c[1]) * k];
        for (let t = 0; t <= 1; t += 0.25) {
          const u = 1 - t;
          pts.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
        }
      });
      return pts;
    }
    // rectángulo
    const r = cornerRadius(el);
    if (!r) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
    const pts = [];
    const arc = (cx, cy, a0) => { for (let i = 0; i <= 4; i++) { const a = a0 + (i / 4) * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(x + w - r, y + r, -Math.PI / 2);
    arc(x + w - r, y + h - r, 0);
    arc(x + r, y + h - r, Math.PI / 2);
    arc(x + r, y + r, Math.PI);
    return pts;
  }
  /** Trazado exacto (para relleno, recorte y estilo arquitecto) */
  function exactPath(c, el) {
    c.beginPath();
    if (el.type === 'ellipse') {
      c.ellipse(el.x + el.w / 2, el.y + el.h / 2, Math.max(0.5, el.w / 2), Math.max(0.5, el.h / 2), 0, 0, Math.PI * 2);
      return;
    }
    if (el.type === 'rectangle' && cornerRadius(el)) {
      const r = cornerRadius(el), { x, y, w, h } = el;
      c.moveTo(x + r, y);
      c.arcTo(x + w, y, x + w, y + h, r);
      c.arcTo(x + w, y + h, x, y + h, r);
      c.arcTo(x, y + h, x, y, r);
      c.arcTo(x, y, x + w, y, r);
      c.closePath();
      return;
    }
    const pts = outline(el);
    c.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((p) => c.lineTo(p[0], p[1]));
    c.closePath();
  }

  /* ------------------------------------------------------------------
     Dibujo con estilo "a mano"
     ------------------------------------------------------------------ */
  function smoothPath(c, pts, closed) {
    if (pts.length < 2) return;
    c.moveTo(pts[0][0], pts[0][1]);
    if (pts.length === 2) { c.lineTo(pts[1][0], pts[1][1]); return; }
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
      c.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    const last = pts[pts.length - 1];
    if (closed) c.quadraticCurveTo(last[0], last[1], (last[0] + pts[0][0]) / 2, (last[1] + pts[0][1]) / 2);
    else c.lineTo(last[0], last[1]);
  }
  /** Subdivide segmentos y desplaza los puntos al azar (con semilla) */
  function jitter(pts, closed, amp, rand, pass) {
    const out = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const steps = Math.max(1, Math.min(6, Math.round(len / 60)));
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        const k = Math.min(amp, len / 10);
        out.push([a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 2 * k, a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * 2 * k]);
      }
    }
    if (!closed) {
      const last = pts[pts.length - 1];
      out.push([last[0] + (rand() - 0.5) * amp, last[1] + (rand() - 0.5) * amp]);
    } else if (pass === 1) {
      // segunda pasada: arranca un poco desplazada para que se note el "doble trazo"
      out.push(out.shift());
    }
    return out;
  }
  function roughStroke(c, pts, closed, el, rand) {
    if (!el.roughness || el.strokeStyle !== 'solid') {
      c.beginPath();
      if (closed) { c.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach((p) => c.lineTo(p[0], p[1])); c.closePath(); }
      else smoothOrStraight(c, pts);
      c.stroke();
      return;
    }
    const amp = el.roughness * (1.4 + el.strokeWidth * 0.35);
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      smoothPath(c, jitter(pts, closed, amp, rand, pass), closed);
      c.stroke();
    }
  }
  function smoothOrStraight(c, pts) {
    c.moveTo(pts[0][0], pts[0][1]);
    pts.slice(1).forEach((p) => c.lineTo(p[0], p[1]));
  }

  function applyDash(c, el) {
    const w = el.strokeWidth;
    if (el.strokeStyle === 'dashed') c.setLineDash([w * 4 + 6, w * 3 + 6]);
    else if (el.strokeStyle === 'dotted') c.setLineDash([1, w * 2.5 + 4]);
    else c.setLineDash([]);
  }

  function drawFill(c, el, rand) {
    if (!el.bgColor || el.bgColor === 'transparent') return;
    c.save();
    if (el.fillStyle === 'solid') {
      exactPath(c, el);
      c.fillStyle = el.bgColor;
      c.fill();
      c.restore();
      return;
    }
    exactPath(c, el);
    c.clip();
    c.strokeStyle = el.bgColor;
    c.lineWidth = Math.max(1, el.strokeWidth * 0.6);
    c.setLineDash([]);
    const gap = 6 + el.strokeWidth * 2.2;
    const b = bounds(el);
    const angles = el.fillStyle === 'cross' ? [-Math.PI / 4, Math.PI / 4] : [-Math.PI / 4];
    const diag = Math.hypot(b.w, b.h);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    angles.forEach((ang) => {
      const dx = Math.cos(ang), dy = Math.sin(ang);
      for (let o = -diag / 2; o <= diag / 2; o += gap) {
        const px = cx - dy * o, py = cy + dx * o;
        const a = [px - dx * diag / 2, py - dy * diag / 2];
        const z = [px + dx * diag / 2, py + dy * diag / 2];
        c.beginPath();
        if (el.roughness) {
          const k = el.roughness * 1.2;
          c.moveTo(a[0] + (rand() - 0.5) * k, a[1] + (rand() - 0.5) * k);
          c.quadraticCurveTo((a[0] + z[0]) / 2 + (rand() - 0.5) * k * 2, (a[1] + z[1]) / 2 + (rand() - 0.5) * k * 2, z[0], z[1]);
        } else { c.moveTo(a[0], a[1]); c.lineTo(z[0], z[1]); }
        c.stroke();
      }
    });
    c.restore();
  }

  function drawArrowhead(c, el, tip, from, kind, rand) {
    if (!kind || kind === 'none') return;
    const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0]);
    const segLen = Math.hypot(tip[0] - from[0], tip[1] - from[1]);
    const size = Math.min(Math.max(14, el.strokeWidth * 5 + 8), segLen * 0.6 + 6);
    const spread = Math.PI / 7;
    const p1 = [tip[0] - Math.cos(ang - spread) * size, tip[1] - Math.sin(ang - spread) * size];
    const p2 = [tip[0] - Math.cos(ang + spread) * size, tip[1] - Math.sin(ang + spread) * size];
    c.save();
    c.setLineDash([]);
    if (kind === 'arrow') {
      roughStroke(c, [p1, tip], false, el, rand);
      roughStroke(c, [p2, tip], false, el, rand);
    } else if (kind === 'triangle') {
      c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.closePath();
      c.fillStyle = el.strokeColor; c.fill(); c.stroke();
    } else if (kind === 'dot') {
      c.beginPath(); c.arc(tip[0], tip[1], Math.max(4, el.strokeWidth * 2.2), 0, Math.PI * 2);
      c.fillStyle = el.strokeColor; c.fill();
    } else if (kind === 'bar') {
      const bx = Math.cos(ang + Math.PI / 2) * size * 0.55, by = Math.sin(ang + Math.PI / 2) * size * 0.55;
      roughStroke(c, [[tip[0] - bx, tip[1] - by], [tip[0] + bx, tip[1] + by]], false, el, rand);
    }
    c.restore();
  }

  function drawTextLines(c, el, lines, x, y, align, maxW) {
    c.font = fontOf(el);
    c.fillStyle = el.strokeColor;
    c.textBaseline = 'top';
    c.textAlign = align;
    const ax = align === 'center' ? x + maxW / 2 : align === 'right' ? x + maxW : x;
    lines.forEach((line, i) => c.fillText(line, ax, y + i * el.fontSize * LINE_H + el.fontSize * 0.08));
  }

  function drawImage(c, el) {
    const img = imgCache.get(el.fileId);
    if (img && img.complete && img.naturalWidth) {
      c.drawImage(img, el.x, el.y, el.w, el.h);
    } else {
      c.fillStyle = '#F1EEF8';
      c.fillRect(el.x, el.y, el.w, el.h);
    }
  }

  function drawElement(c, el) {
    const rand = mulberry(el.seed || 1);
    c.save();
    c.globalAlpha = (el.opacity ?? 100) / 100 * (erasing.has(el.id) ? 0.25 : 1);
    c.strokeStyle = el.strokeColor;
    c.lineWidth = el.strokeWidth;
    c.lineCap = 'round';
    c.lineJoin = 'round';

    if (SHAPES.includes(el.type)) {
      drawFill(c, el, rand);
      applyDash(c, el);
      if (!el.roughness || el.strokeStyle !== 'solid') { exactPath(c, el); c.stroke(); }
      else roughStroke(c, outline(el), true, el, rand);
      if (el.label) {
        c.setLineDash([]);
        c.font = fontOf(el);
        const pad = 10;
        const maxW = Math.max(10, el.w - pad * 2 - (el.type === 'rectangle' ? 0 : el.w * 0.15));
        const lines = wrapLines(c, el.label, maxW);
        const th = lines.length * el.fontSize * LINE_H;
        if (!(editing && editing.el === el)) drawTextLines(c, el, lines, el.x + (el.w - maxW) / 2, el.y + (el.h - th) / 2, 'center', maxW);
      }
    } else if (LINEAR.includes(el.type)) {
      applyDash(c, el);
      const pts = el.points.map(([px, py]) => [el.x + px, el.y + py]);
      roughStroke(c, pts, false, el, rand);
      if (pts.length > 1) {
        drawArrowhead(c, el, pts[pts.length - 1], pts[pts.length - 2], el.endArrow, rand);
        drawArrowhead(c, el, pts[0], pts[1], el.startArrow, rand);
      }
    } else if (el.type === 'freedraw') {
      const pts = el.points.map(([px, py]) => [el.x + px, el.y + py]);
      c.setLineDash([]);
      c.lineWidth = el.strokeWidth * 1.4;
      c.beginPath();
      if (pts.length === 1) { c.arc(pts[0][0], pts[0][1], c.lineWidth / 2, 0, Math.PI * 2); c.fillStyle = el.strokeColor; c.fill(); }
      else { smoothPath(c, pts, false); c.stroke(); }
    } else if (el.type === 'text') {
      if (!(editing && editing.el === el)) drawTextLines(c, el, String(el.text).split('\n'), el.x, el.y, el.textAlign, el.w);
    } else if (el.type === 'image') {
      drawImage(c, el);
    }
    c.restore();
  }

  function drawBackground(c, x, y, w, h, zoom) {
    const b = BG[bg] || BG.blanco;
    c.fillStyle = b.fill;
    c.fillRect(x, y, w, h);
    c.save();
    c.lineWidth = 1 / zoom;
    if (b.grid) {
      c.strokeStyle = b.line;
      c.beginPath();
      for (let gx = Math.floor(x / b.grid) * b.grid; gx < x + w; gx += b.grid) { c.moveTo(gx, y); c.lineTo(gx, y + h); }
      for (let gy = Math.floor(y / b.grid) * b.grid; gy < y + h; gy += b.grid) { c.moveTo(x, gy); c.lineTo(x + w, gy); }
      c.stroke();
    }
    if (b.dots && zoom > 0.3) {
      c.fillStyle = b.line;
      const r = 1.4 / Math.max(zoom, 0.6);
      for (let gx = Math.floor(x / b.dots) * b.dots; gx < x + w; gx += b.dots) {
        for (let gy = Math.floor(y / b.dots) * b.dots; gy < y + h; gy += b.dots) c.fillRect(gx - r, gy - r, r * 2, r * 2);
      }
    }
    if (b.rows) {
      c.strokeStyle = b.line;
      c.beginPath();
      for (let gy = Math.floor(y / b.rows) * b.rows; gy < y + h; gy += b.rows) { c.moveTo(x, gy); c.lineTo(x + w, gy); }
      c.stroke();
      if (x < 80 && x + w > 80) { c.strokeStyle = b.margin; c.beginPath(); c.moveTo(80, y); c.lineTo(80, y + h); c.stroke(); }
    }
    c.restore();
  }

  /* ------------------------------------------------------------------
     Render principal
     ------------------------------------------------------------------ */
  let raf = 0;
  const requestRender = () => { if (!raf) raf = requestAnimationFrame(render); };

  function render() {
    raf = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.zoom * view.x, dpr * view.zoom * view.y);
    const vw = toWorld(0, 0), vEnd = toWorld(W, H);
    drawBackground(ctx, vw.x, vw.y, vEnd.x - vw.x, vEnd.y - vw.y, view.zoom);

    elements.forEach((el) => {
      const b = bounds(el);
      const m = 60;
      if (b.x > vEnd.x + m || b.y > vEnd.y + m || b.x + b.w < vw.x - m || b.y + b.h < vw.y - m) return;
      drawElement(ctx, el);
    });

    drawSelectionUI();
    drawLaser();
    welcome.hidden = elements.length > 0 || Boolean(action);
  }

  function drawSelectionUI() {
    const z = view.zoom;
    ctx.save();
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = '#2F6BFF';
    ctx.setLineDash([]);

    const sel = selectedEls();
    if (sel.length && !(action && action.type === 'create')) {
      // marco de cada elemento si hay varios
      if (sel.length > 1) {
        ctx.setLineDash([4 / z, 4 / z]);
        sel.forEach((el) => { const b = bounds(el); ctx.strokeRect(b.x - 4 / z, b.y - 4 / z, b.w + 8 / z, b.h + 8 / z); });
        ctx.setLineDash([]);
      }
      const ub = unionBounds(sel);
      const pad = 6 / z;
      if (sel.length === 1 && LINEAR.includes(sel[0].type)) {
        ctx.setLineDash([4 / z, 4 / z]);
        ctx.strokeRect(ub.x - pad, ub.y - pad, ub.w + pad * 2, ub.h + pad * 2);
        ctx.setLineDash([]);
        linearHandles(sel[0]).forEach((h) => handleDot(h.x, h.y, true));
      } else {
        ctx.strokeRect(ub.x - pad, ub.y - pad, ub.w + pad * 2, ub.h + pad * 2);
        if (!editing) resizeHandles(ub).forEach((h) => handleDot(h.x, h.y));
      }
    }

    if (action && action.type === 'box') {
      const { x1, y1, x2, y2 } = action;
      ctx.fillStyle = 'rgba(47,107,255,.08)';
      ctx.fillRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
      ctx.strokeRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
    }

    if (tool === 'eraser' && hoverPoint) {
      ctx.beginPath();
      ctx.arc(hoverPoint.x, hoverPoint.y, 9 / z, 0, Math.PI * 2);
      ctx.strokeStyle = bg === 'pizarra' ? '#fff' : '#231942';
      ctx.stroke();
    }
    if (tool === 'laser' && hoverPoint) {
      ctx.beginPath();
      ctx.arc(hoverPoint.x, hoverPoint.y, 5 / z, 0, Math.PI * 2);
      ctx.fillStyle = '#EF4444';
      ctx.shadowColor = '#EF4444';
      ctx.shadowBlur = 12;
      ctx.fill();
    }
    ctx.restore();
  }
  function handleDot(x, y, round) {
    const z = view.zoom, s = 9 / z;
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2F6BFF';
    ctx.lineWidth = 1.5 / z;
    ctx.beginPath();
    if (round) ctx.arc(x, y, s / 1.6, 0, Math.PI * 2);
    else ctx.rect(x - s / 2, y - s / 2, s, s);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  function resizeHandles(b) {
    const pad = 6 / view.zoom;
    const x1 = b.x - pad, y1 = b.y - pad, x2 = b.x + b.w + pad, y2 = b.y + b.h + pad;
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const hs = [
      { id: 'nw', x: x1, y: y1 }, { id: 'ne', x: x2, y: y1 }, { id: 'sw', x: x1, y: y2 }, { id: 'se', x: x2, y: y2 },
    ];
    if (b.w * view.zoom > 40) hs.push({ id: 'n', x: mx, y: y1 }, { id: 's', x: mx, y: y2 });
    if (b.h * view.zoom > 40) hs.push({ id: 'w', x: x1, y: my }, { id: 'e', x: x2, y: my });
    return hs;
  }
  function linearHandles(el) {
    return el.points.map(([px, py], i) => ({ id: `p${i}`, index: i, x: el.x + px, y: el.y + py }));
  }

  function drawLaser() {
    if (!laser.length) return;
    const now = performance.now();
    laser = laser.filter((p) => now - p.t < 700);
    if (laser.length > 1) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 1; i < laser.length; i++) {
        const age = (now - laser[i].t) / 700;
        ctx.strokeStyle = `rgba(239, 68, 68, ${1 - age})`;
        ctx.lineWidth = (6 * (1 - age) + 1) / view.zoom;
        ctx.beginPath();
        ctx.moveTo(laser[i - 1].x, laser[i - 1].y);
        ctx.lineTo(laser[i].x, laser[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (laser.length) requestRender();
  }

  /* ------------------------------------------------------------------
     Detección de clic
     ------------------------------------------------------------------ */
  function distToSeg(px, py, a, b) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - a[0]) * dx + (py - a[1]) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
  }
  function distToPolyline(px, py, pts, closed) {
    let d = Infinity;
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) d = Math.min(d, distToSeg(px, py, pts[i], pts[(i + 1) % pts.length]));
    if (pts.length === 1) d = Math.hypot(px - pts[0][0], py - pts[0][1]);
    return d;
  }
  function pointInPoly(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function hitElement(el, x, y, tol) {
    const t = tol + el.strokeWidth / 2;
    if (el.type === 'text' || el.type === 'image') {
      const b = bounds(el);
      return x >= b.x - t && x <= b.x + b.w + t && y >= b.y - t && y <= b.y + b.h + t;
    }
    if (SHAPES.includes(el.type)) {
      const pts = outline(el);
      if ((el.bgColor && el.bgColor !== 'transparent') || el.label) {
        if (pointInPoly(x, y, pts)) return true;
      }
      return distToPolyline(x, y, pts, true) <= t;
    }
    const pts = el.points.map(([px, py]) => [el.x + px, el.y + py]);
    return distToPolyline(x, y, pts, false) <= t + (el.type === 'freedraw' ? 2 : 0);
  }
  function hitTest(x, y) {
    const tol = 7 / view.zoom;
    for (let i = elements.length - 1; i >= 0; i--) if (hitElement(elements[i], x, y, tol)) return elements[i];
    return null;
  }
  function hitHandle(x, y) {
    const sel = selectedEls();
    if (!sel.length) return null;
    const tol = 9 / view.zoom;
    if (sel.length === 1 && LINEAR.includes(sel[0].type)) {
      return linearHandles(sel[0]).find((h) => Math.hypot(h.x - x, h.y - y) <= tol) || null;
    }
    return resizeHandles(unionBounds(sel)).find((h) => Math.abs(h.x - x) <= tol && Math.abs(h.y - y) <= tol) || null;
  }

  /* ------------------------------------------------------------------
     Historial y guardado
     ------------------------------------------------------------------ */
  let history = [];
  let hIndex = -1;
  const snapshot = () => JSON.stringify(elements);
  function commit() {
    const snap = snapshot();
    if (history[hIndex] === snap) return;
    history = history.slice(0, hIndex + 1);
    history.push(snap);
    if (history.length > 120) history.shift();
    hIndex = history.length - 1;
    syncHistory();
    save();
  }
  function restore(snap) {
    elements = JSON.parse(snap);
    selected = new Set([...selected].filter((id) => byId(id)));
    syncHistory();
    syncProps();
    save();
    requestRender();
  }
  function undo() { if (hIndex > 0) { hIndex--; restore(history[hIndex]); sfx('click'); } }
  function redo() { if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); sfx('click'); } }
  function syncHistory() {
    undoBtn.disabled = hIndex <= 0;
    redoBtn.disabled = hIndex >= history.length - 1;
  }

  let saveTimer = 0;
  let warnedQuota = false;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      // Solo se guardan las imágenes que aún se usan
      const used = new Set(elements.filter((e) => e.fileId).map((e) => e.fileId));
      Object.keys(files).forEach((k) => { if (!used.has(k)) delete files[k]; });
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ elements, files, bg, view, style }));
      } catch {
        if (!warnedQuota) {
          warnedQuota = true;
          DC.toast({ title: 'No queda espacio en el navegador', text: 'Usa «Guardar archivo» para no perder tu pizarra (las imágenes ocupan mucho).', icon: 'bi-exclamation-triangle-fill', theme: 'red', timeout: 7000 });
        }
      }
    }, 300);
  }
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!data) return;
      elements = Array.isArray(data.elements) ? data.elements : [];
      files = data.files || {};
      if (data.bg && BG[data.bg]) bg = data.bg;
      if (data.view) Object.assign(view, data.view);
      if (data.style) Object.assign(style, data.style);
    } catch { /* datos corruptos: se empieza de cero */ }
  }
  function loadImages() {
    Object.entries(files).forEach(([id, src]) => {
      if (imgCache.has(id)) return;
      const img = new Image();
      img.onload = requestRender;
      img.src = src;
      imgCache.set(id, img);
    });
  }

  /* ------------------------------------------------------------------
     Creación de elementos
     ------------------------------------------------------------------ */
  function baseElement(type, x, y) {
    return {
      id: uid(), type, x, y, w: 0, h: 0, seed: newSeed(),
      strokeColor: style.strokeColor, bgColor: style.bgColor, fillStyle: style.fillStyle,
      strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, roughness: style.roughness,
      roundness: style.roundness, opacity: style.opacity,
      fontSize: style.fontSize, fontFamily: style.fontFamily, textAlign: style.textAlign,
    };
  }
  function createElement(type, x, y) {
    const el = baseElement(type, x, y);
    if (LINEAR.includes(type) || type === 'freedraw') {
      el.points = [[0, 0]];
      delete el.w; delete el.h;
      if (LINEAR.includes(type)) {
        el.startArrow = type === 'arrow' ? style.startArrow : 'none';
        el.endArrow = type === 'arrow' ? style.endArrow : 'none';
        el.points.push([0, 0]);
      }
    }
    if (type === 'text') { el.text = ''; el.bgColor = 'transparent'; }
    if (SHAPES.includes(type)) el.label = '';
    return el;
  }

  /* ------------------------------------------------------------------
     Texto: editor flotante
     ------------------------------------------------------------------ */
  function startEditing(el, field, isNew = false) {
    if (editing) stopEditing();
    editing = { el, field, isNew };
    selected = new Set([el.id]);
    editor.hidden = false;
    editor.value = field === 'label' ? el.label || '' : el.text || '';
    positionEditor();
    syncProps();
    requestRender();
    setTimeout(() => { editor.focus(); editor.select(); }, 0);
  }
  function positionEditor() {
    if (!editing) return;
    const { el, field } = editing;
    const z = view.zoom;
    editor.style.font = fontOf(el);
    editor.style.color = el.strokeColor;
    editor.style.opacity = String((el.opacity ?? 100) / 100);
    editor.style.transform = `scale(${z})`;
    const lines = editor.value.split('\n');
    measurer.font = fontOf(el);
    const textW = Math.max(...lines.map((l) => measurer.measureText(l || ' ').width)) + el.fontSize;
    const textH = lines.length * el.fontSize * LINE_H;
    if (field === 'label') {
      const p = toScreen(el.x, el.y + el.h / 2 - textH / 2);
      editor.style.left = `${p.x}px`;
      editor.style.top = `${p.y}px`;
      editor.style.width = `${Math.max(el.w, 20)}px`;
      editor.style.height = `${textH}px`;
      editor.style.textAlign = 'center';
      editor.style.whiteSpace = 'pre-wrap';
    } else {
      const p = toScreen(el.x, el.y);
      editor.style.left = `${p.x}px`;
      editor.style.top = `${p.y}px`;
      editor.style.width = `${textW}px`;
      editor.style.height = `${textH}px`;
      editor.style.textAlign = el.textAlign;
      editor.style.whiteSpace = 'pre';
    }
  }
  function stopEditing() {
    if (!editing) return;
    const { el, field } = editing;
    const val = editor.value.replace(/\s+$/, '');
    editing = null;
    editor.hidden = true;
    if (field === 'label') {
      el.label = val;
    } else if (!val.trim()) {
      elements = elements.filter((e) => e !== el);
      selected.delete(el.id);
    } else {
      el.text = val;
      measureText(el);
    }
    commit();
    syncProps();
    requestRender();
  }
  editor.addEventListener('input', () => {
    if (!editing) return;
    if (editing.field === 'text') { editing.el.text = editor.value; measureText(editing.el); }
    positionEditor();
  });
  editor.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); stopEditing(); canvas.focus(); }
  });
  editor.addEventListener('blur', () => stopEditing());

  /* ------------------------------------------------------------------
     Puntero
     ------------------------------------------------------------------ */
  function setTool(t) {
    if (t === 'image') { imageInput.click(); return; }
    if (editing) stopEditing();
    tool = t;
    board.dataset.tool = t;
    $$('[data-tool]', board).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === t)));
    if (t !== 'selection') selected.clear();
    if (t !== 'eraser' && t !== 'laser') hoverPoint = null;
    syncProps();
    requestRender();
  }
  function afterCreate(el) {
    if (toolLocked || tool === 'freedraw') return;
    setTool('selection');
    selected = new Set([el.id]);
    syncProps();
  }

  function startPan(sx, sy) {
    action = { type: 'pan', sx, sy, vx: view.x, vy: view.y };
    board.classList.add('is-grabbing');
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus({ preventScroll: true });
    closeMenu();
    if (editing) { stopEditing(); if (tool !== 'text') return; }
    canvas.setPointerCapture(e.pointerId);
    const { sx, sy } = eventPoint(e);
    pointers.set(e.pointerId, { sx, sy });

    // Pellizco con dos dedos: zoom + desplazamiento
    if (pointers.size === 2) {
      if (action && action.type === 'create') {
        elements = elements.filter((el) => el !== action.el);
      }
      const [a, b] = [...pointers.values()];
      const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
      pinch = { d: Math.hypot(a.sx - b.sx, a.sy - b.sy), zoom: view.zoom, world: toWorld(cx, cy) };
      action = null;
      requestRender();
      return;
    }
    if (pointers.size > 2) return;

    const p = toWorld(sx, sy);
    if (e.button === 1 || (e.button === 0 && (spaceDown || tool === 'hand'))) { startPan(sx, sy); return; }
    if (e.button !== 0) return;

    if (tool === 'laser') { laser.push({ x: p.x, y: p.y, t: performance.now() }); action = { type: 'laser' }; requestRender(); return; }

    if (tool === 'eraser') {
      action = { type: 'erase', last: p };
      const hit = hitTest(p.x, p.y);
      if (hit) erasing.add(hit.id);
      requestRender();
      return;
    }

    if (tool === 'text') {
      const hit = hitTest(p.x, p.y);
      if (hit && hit.type === 'text') { startEditing(hit, 'text'); return; }
      if (hit && SHAPES.includes(hit.type)) { startEditing(hit, 'label'); return; }
      const el = createElement('text', p.x, p.y - style.fontSize * LINE_H / 2);
      measureText(el);
      elements.push(el);
      startEditing(el, 'text', true);
      if (!toolLocked) { tool = 'selection'; board.dataset.tool = 'selection'; $$('[data-tool]', board).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === 'selection'))); }
      return;
    }

    if (tool === 'selection') {
      const handle = hitHandle(p.x, p.y);
      if (handle) {
        const sel = selectedEls();
        action = {
          type: handle.index !== undefined ? 'point' : 'resize',
          handle, start: p,
          orig: JSON.parse(JSON.stringify(sel)),
          box: unionBounds(sel),
        };
        return;
      }
      const hit = hitTest(p.x, p.y);
      if (hit) {
        if (e.shiftKey) {
          if (selected.has(hit.id)) selected.delete(hit.id); else selected.add(hit.id);
        } else if (!selected.has(hit.id)) {
          selected = new Set([hit.id]);
        }
        if (e.altKey) duplicateSelection(0);
        action = { type: 'move', start: p, orig: selectedEls().map((el) => ({ id: el.id, x: el.x, y: el.y })), moved: false };
        syncProps();
        requestRender();
        return;
      }
      if (!e.shiftKey) selected.clear();
      action = { type: 'box', x1: p.x, y1: p.y, x2: p.x, y2: p.y, base: new Set(selected) };
      syncProps();
      requestRender();
      return;
    }

    if (DRAW_TOOLS.includes(tool)) {
      const el = createElement(tool, p.x, p.y);
      elements.push(el);
      action = { type: 'create', el, start: p };
      requestRender();
    }
  });

  function handleMove(e) {
    const { sx, sy } = eventPoint(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { sx, sy });

    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      const cx = (a.sx + b.sx) / 2, cy = (a.sy + b.sy) / 2;
      view.zoom = clamp(pinch.zoom * (d / pinch.d), 0.1, 10);
      view.x = cx / view.zoom - pinch.world.x;
      view.y = cy / view.zoom - pinch.world.y;
      syncZoom();
      requestRender();
      return;
    }

    const p = toWorld(sx, sy);
    if (tool === 'eraser' || tool === 'laser') { hoverPoint = p; requestRender(); }
    if (action?.type === 'laser') laser.push({ x: p.x, y: p.y, t: performance.now() });
    if (!action) {
      if (tool === 'selection') {
        const h = hitHandle(p.x, p.y);
        const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
        canvas.style.cursor = h ? (cursors[h.id] || 'pointer') : hitTest(p.x, p.y) ? 'move' : '';
      } else canvas.style.cursor = '';
      return;
    }

    switch (action.type) {
      case 'pan':
        view.x = action.vx + (sx - action.sx) / view.zoom;
        view.y = action.vy + (sy - action.sy) / view.zoom;
        positionEditor();
        break;
      case 'erase': {
        // se recorre el tramo desde el punto anterior para no saltarse trazos finos
        const tol = 9 / view.zoom;
        const from = action.last || p;
        const steps = Math.max(1, Math.ceil(Math.hypot(p.x - from.x, p.y - from.y) / (4 / view.zoom)));
        for (let i = 1; i <= steps; i++) {
          const qx = from.x + ((p.x - from.x) * i) / steps, qy = from.y + ((p.y - from.y) * i) / steps;
          elements.forEach((el) => { if (!erasing.has(el.id) && hitElement(el, qx, qy, tol)) erasing.add(el.id); });
        }
        action.last = p;
        break;
      }
      case 'create': updateCreate(action, p, e.shiftKey); break;
      case 'move': {
        let dx = p.x - action.start.x, dy = p.y - action.start.y;
        if (e.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
        if (Math.hypot(dx, dy) * view.zoom > 2) action.moved = true;
        action.orig.forEach((o) => { const el = byId(o.id); if (el) { el.x = o.x + dx; el.y = o.y + dy; } });
        break;
      }
      case 'resize': doResize(action, p, e.shiftKey); break;
      case 'point': {
        const el = byId(action.orig[0].id);
        const o = action.orig[0];
        let px = p.x, py = p.y;
        if (e.shiftKey && o.points.length === 2) {
          const other = o.points[1 - action.handle.index];
          const snap = snapAngle(o.x + other[0], o.y + other[1], px, py);
          px = snap.x; py = snap.y;
        }
        const pts = o.points.map(([qx, qy]) => [o.x + qx, o.y + qy]);
        pts[action.handle.index] = [px, py];
        setAbsPoints(el, pts);
        break;
      }
      case 'box': {
        action.x2 = p.x; action.y2 = p.y;
        const bx = Math.min(action.x1, action.x2), by = Math.min(action.y1, action.y2);
        const bw = Math.abs(action.x2 - action.x1), bh = Math.abs(action.y2 - action.y1);
        selected = new Set(action.base);
        elements.forEach((el) => {
          const b = bounds(el);
          if (b.x >= bx && b.y >= by && b.x + b.w <= bx + bw && b.y + b.h <= by + bh) selected.add(el.id);
        });
        break;
      }
      default:
    }
    requestRender();
  }
  canvas.addEventListener('pointermove', handleMove);

  function endPointer(e) {
    // aplica la última posición (algunos dispositivos no envían "move" antes de soltar)
    if (e.type === 'pointerup' && action && !pinch) handleMove(e);
    pointers.delete(e.pointerId);
    if (pinch) { if (pointers.size < 2) { pinch = null; save(); } return; }
    if (!action) return;
    const a = action;
    action = null;
    board.classList.remove('is-grabbing');
    switch (a.type) {
      case 'pan': save(); break;
      case 'erase':
        if (erasing.size) {
          elements = elements.filter((el) => !erasing.has(el.id));
          erasing.forEach((id) => selected.delete(id));
          erasing.clear();
          commit();
          sfx('click');
        }
        break;
      case 'create': {
        const el = a.el;
        const tiny = el.points ? (el.type !== 'freedraw' && Math.hypot(...el.points[el.points.length - 1]) < 3) : (Math.abs(el.w) < 3 && Math.abs(el.h) < 3);
        if (tiny) {
          if (el.type === 'freedraw') { commit(); break; }
          // clic sin arrastrar: figura de tamaño estándar
          if (SHAPES.includes(el.type)) { el.w = 140; el.h = el.type === 'ellipse' ? 100 : 90; el.x -= 70; el.y -= 45; }
          else { el.points[1] = [140, 0]; }
        }
        normalize(el);
        if (el.type === 'freedraw') simplifyFreedraw(el);
        commit();
        afterCreate(el);
        break;
      }
      case 'move':
      case 'resize':
      case 'point':
        selectedEls().forEach(normalize);
        commit();
        break;
      default:
    }
    syncProps();
    requestRender();
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', () => { if (!action) { hoverPoint = null; requestRender(); } });

  canvas.addEventListener('dblclick', (e) => {
    const { sx, sy } = eventPoint(e);
    const p = toWorld(sx, sy);
    const hit = hitTest(p.x, p.y);
    if (hit && hit.type === 'text') { startEditing(hit, 'text'); return; }
    if (hit && SHAPES.includes(hit.type)) { startEditing(hit, 'label'); return; }
    if (!hit && (tool === 'selection')) {
      const el = createElement('text', p.x, p.y - style.fontSize * LINE_H / 2);
      el.bgColor = 'transparent';
      measureText(el);
      elements.push(el);
      startEditing(el, 'text', true);
    }
  });

  function snapAngle(x0, y0, x, y) {
    const ang = Math.atan2(y - y0, x - x0);
    const step = Math.PI / 12;
    const a = Math.round(ang / step) * step;
    const d = Math.hypot(x - x0, y - y0);
    return { x: x0 + Math.cos(a) * d, y: y0 + Math.sin(a) * d };
  }
  function setAbsPoints(el, pts) {
    el.x = pts[0][0];
    el.y = pts[0][1];
    el.points = pts.map(([x, y]) => [x - el.x, y - el.y]);
  }

  function updateCreate(a, p, shift) {
    const el = a.el;
    if (el.type === 'freedraw') {
      const last = el.points[el.points.length - 1];
      const nx = p.x - el.x, ny = p.y - el.y;
      if (Math.hypot(nx - last[0], ny - last[1]) * view.zoom < 1.5) return;
      el.points.push([nx, ny]);
      return;
    }
    if (LINEAR.includes(el.type)) {
      let { x, y } = p;
      if (shift) ({ x, y } = snapAngle(el.x, el.y, x, y));
      el.points[1] = [x - el.x, y - el.y];
      return;
    }
    let w = p.x - a.start.x, h = p.y - a.start.y;
    if (shift) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
    el.x = a.start.x; el.y = a.start.y; el.w = w; el.h = h;
  }

  function simplifyFreedraw(el) {
    // Reduce puntos casi alineados para que el archivo pese menos
    if (el.points.length < 4) return;
    const out = [el.points[0]];
    for (let i = 1; i < el.points.length - 1; i++) {
      const prev = out[out.length - 1];
      if (Math.hypot(el.points[i][0] - prev[0], el.points[i][1] - prev[1]) > 2.5) out.push(el.points[i]);
    }
    out.push(el.points[el.points.length - 1]);
    el.points = out.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
  }

  function doResize(a, p, shift) {
    const ob = a.box;
    const id = a.handle.id;
    let x1 = ob.x, y1 = ob.y, x2 = ob.x + ob.w, y2 = ob.y + ob.h;
    if (id.includes('w')) x1 = p.x;
    if (id.includes('e')) x2 = p.x;
    if (id.includes('n')) y1 = p.y;
    if (id.includes('s')) y2 = p.y;
    const onlyText = a.orig.every((o) => o.type === 'text' || o.type === 'image');
    if ((shift || onlyText) && id.length === 2) {
      const sx = (x2 - x1) / (ob.w || 1), sy = (y2 - y1) / (ob.h || 1);
      const s = Math.max(Math.abs(sx), Math.abs(sy));
      const nw = ob.w * s * Math.sign(sx || 1), nh = ob.h * s * Math.sign(sy || 1);
      if (id.includes('w')) x1 = x2 - nw; else x2 = x1 + nw;
      if (id.includes('n')) y1 = y2 - nh; else y2 = y1 + nh;
    }
    if (Math.abs(x2 - x1) < 4) x2 = x1 + 4 * Math.sign(x2 - x1 || 1);
    if (Math.abs(y2 - y1) < 4) y2 = y1 + 4 * Math.sign(y2 - y1 || 1);
    const sx = (x2 - x1) / (ob.w || 1), sy = (y2 - y1) / (ob.h || 1);
    const mapX = (x) => x1 + (x - ob.x) * sx;
    const mapY = (y) => y1 + (y - ob.y) * sy;
    a.orig.forEach((o) => {
      const el = byId(o.id);
      if (!el) return;
      if (o.points) {
        setAbsPoints(el, o.points.map(([px, py]) => [mapX(o.x + px), mapY(o.y + py)]));
        return;
      }
      if (o.type === 'text') {
        const s = Math.abs(sy) || 1;
        el.fontSize = Math.max(6, o.fontSize * s);
        measureText(el);
        el.x = Math.min(mapX(o.x), mapX(o.x + o.w));
        el.y = Math.min(mapY(o.y), mapY(o.y + o.h));
        return;
      }
      el.x = mapX(o.x); el.y = mapY(o.y);
      el.w = o.w * sx; el.h = o.h * sy;
    });
  }

  /* Rueda: desplazar o hacer zoom */
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { sx, sy } = eventPoint(e);
    if (e.ctrlKey || e.metaKey) {
      zoomAt(view.zoom * Math.exp(-e.deltaY * 0.0045), sx, sy);
    } else {
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      view.x -= dx / view.zoom;
      view.y -= dy / view.zoom;
      positionEditor();
      requestRender();
      save();
    }
  }, { passive: false });

  function zoomAt(z, sx = W / 2, sy = H / 2) {
    const before = toWorld(sx, sy);
    view.zoom = clamp(z, 0.1, 10);
    view.x = sx / view.zoom - before.x;
    view.y = sy / view.zoom - before.y;
    syncZoom();
    positionEditor();
    requestRender();
    save();
  }
  function syncZoom() { zoomLabel.textContent = `${Math.round(view.zoom * 100)}%`; }
  function zoomToFit() {
    const b = unionBounds(selected.size ? selectedEls() : elements);
    if (!b) { view.x = 0; view.y = 0; view.zoom = 1; syncZoom(); requestRender(); return; }
    const pad = 80;
    const z = clamp(Math.min(W / (b.w + pad * 2), H / (b.h + pad * 2)), 0.1, 2);
    view.zoom = z;
    view.x = W / 2 / z - (b.x + b.w / 2);
    view.y = H / 2 / z - (b.y + b.h / 2);
    syncZoom();
    requestRender();
    save();
  }

  /* ------------------------------------------------------------------
     Operaciones sobre la selección
     ------------------------------------------------------------------ */
  function deleteSelection() {
    if (!selected.size) return;
    elements = elements.filter((el) => !selected.has(el.id));
    selected.clear();
    commit();
    syncProps();
    requestRender();
  }
  function duplicateSelection(offset = 20) {
    const copies = selectedEls().map((el) => ({ ...JSON.parse(JSON.stringify(el)), id: uid(), seed: newSeed(), x: el.x + offset, y: el.y + offset }));
    if (!copies.length) return;
    elements.push(...copies);
    selected = new Set(copies.map((c) => c.id));
    if (offset) commit();
    syncProps();
    requestRender();
  }
  function reorder(dir) {
    if (!selected.size) return;
    if (dir === 'front' || dir === 'back') {
      const sel = elements.filter((el) => selected.has(el.id));
      const rest = elements.filter((el) => !selected.has(el.id));
      elements = dir === 'front' ? [...rest, ...sel] : [...sel, ...rest];
    } else {
      const step = dir === 'forward' ? 1 : -1;
      const idxs = elements.map((el, i) => (selected.has(el.id) ? i : -1)).filter((i) => i >= 0);
      if (step > 0) idxs.reverse();
      idxs.forEach((i) => {
        const j = i + step;
        if (j < 0 || j >= elements.length || selected.has(elements[j].id)) return;
        [elements[i], elements[j]] = [elements[j], elements[i]];
      });
    }
    commit();
    requestRender();
  }
  function nudge(dx, dy) {
    selectedEls().forEach((el) => { el.x += dx; el.y += dy; });
    commit();
    requestRender();
  }
  function align(how) {
    const sel = selectedEls();
    if (sel.length < 2) return;
    const ub = unionBounds(sel);
    sel.forEach((el) => {
      const b = bounds(el);
      let dx = 0, dy = 0;
      if (how === 'left') dx = ub.x - b.x;
      if (how === 'hcenter') dx = ub.x + ub.w / 2 - (b.x + b.w / 2);
      if (how === 'right') dx = ub.x + ub.w - (b.x + b.w);
      if (how === 'top') dy = ub.y - b.y;
      if (how === 'vcenter') dy = ub.y + ub.h / 2 - (b.y + b.h / 2);
      if (how === 'bottom') dy = ub.y + ub.h - (b.y + b.h);
      el.x += dx; el.y += dy;
    });
    commit();
    requestRender();
  }

  /* ------------------------------------------------------------------
     Panel de propiedades
     ------------------------------------------------------------------ */
  const svgIcon = (inner) => `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">${inner}</svg>`;
  const ICONS = {
    hachure: svgIcon('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 11l8-8M3 17l14-14M9 17l8-8"/>'),
    cross: svgIcon('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 11l8-8M3 17l14-14M9 17l8-8M9 3l8 8M3 3l14 14M3 9l8 8"/>'),
    solid: svgIcon('<rect x="3" y="3" width="14" height="14" rx="2" fill="currentColor"/>'),
    w1: svgIcon('<path d="M3 10h14" stroke-width="1.5"/>'),
    w2: svgIcon('<path d="M3 10h14" stroke-width="3"/>'),
    w4: svgIcon('<path d="M3 10h14" stroke-width="5"/>'),
    sSolid: svgIcon('<path d="M3 10h14" stroke-width="2.2"/>'),
    sDashed: svgIcon('<path d="M3 10h14" stroke-width="2.2" stroke-dasharray="4 3"/>'),
    sDotted: svgIcon('<path d="M3 10h14" stroke-width="2.4" stroke-dasharray="0.5 3.5"/>'),
    r0: svgIcon('<path d="M3 15c4-1 6-9 14-10"/>'),
    r1: svgIcon('<path d="M3 15c3-1 5-7 8-8s4 0 6-2M4 14c3 0 5-6 8-7"/>'),
    r2: svgIcon('<path d="M3 15c2-3 3 0 5-4s3-2 4-4 3-1 5-2M4 13c2-1 3-4 6-4s3-4 6-4"/>'),
    sharp: svgIcon('<path d="M4 16V4h12"/>'),
    round: svgIcon('<path d="M4 16V9a5 5 0 0 1 5-5h7"/>'),
    aNone: svgIcon('<path d="M3 10h14"/>'),
    aArrow: svgIcon('<path d="M3 10h14M12 5l5 5-5 5"/>'),
    aTriangle: svgIcon('<path d="M3 10h10"/><path d="M12 5l5 5-5 5z" fill="currentColor"/>'),
    aDot: svgIcon('<path d="M3 10h10"/><circle cx="15" cy="10" r="3" fill="currentColor"/>'),
    aBar: svgIcon('<path d="M3 10h14M17 5v10"/>'),
    left: svgIcon('<path d="M3 5h14M3 10h9M3 15h12"/>'),
    center: svgIcon('<path d="M3 5h14M5.5 10h9M4 15h12"/>'),
    right: svgIcon('<path d="M3 5h14M8 10h9M5 15h12"/>'),
  };
  const opt = (prop, value, content, title) =>
    `<button class="pz-opt" type="button" data-prop="${prop}" data-value="${value}" title="${title}" aria-label="${title}">${content}</button>`;
  const swatch = (prop, hex, title) =>
    `<button class="pz-sw${hex === 'transparent' ? ' pz-sw--none' : ''}" type="button" data-prop="${prop}" data-value="${hex}" style="--sw:${hex}" title="${title}" aria-label="${title}"></button>`;
  const flip = (icon) => icon.replace('<svg ', '<svg style="transform:scaleX(-1)" ');

  propsEl.innerHTML = `
    <div class="pz-prop" data-show="stroke">
      <span class="pz-prop__label">Trazo</span>
      <div class="pz-opts">${STROKES.map((c) => swatch('strokeColor', c, `Color ${c}`)).join('')}
        <label class="pz-sw pz-sw--custom" title="Otro color"><input type="color" data-prop-input="strokeColor" aria-label="Otro color de trazo"></label></div>
    </div>
    <div class="pz-prop" data-show="fill">
      <span class="pz-prop__label">Fondo</span>
      <div class="pz-opts">${FILLS.map((c) => swatch('bgColor', c, c === 'transparent' ? 'Sin relleno' : `Relleno ${c}`)).join('')}
        <label class="pz-sw pz-sw--custom" title="Otro color"><input type="color" data-prop-input="bgColor" aria-label="Otro color de relleno"></label></div>
    </div>
    <div class="pz-prop" data-show="fillStyle">
      <span class="pz-prop__label">Relleno</span>
      <div class="pz-opts">${opt('fillStyle', 'hachure', ICONS.hachure, 'Rayado')}${opt('fillStyle', 'cross', ICONS.cross, 'Cuadriculado')}${opt('fillStyle', 'solid', ICONS.solid, 'Sólido')}</div>
    </div>
    <div class="pz-prop" data-show="width">
      <span class="pz-prop__label">Grosor del trazo</span>
      <div class="pz-opts">${opt('strokeWidth', 1, ICONS.w1, 'Fino')}${opt('strokeWidth', 2, ICONS.w2, 'Grueso')}${opt('strokeWidth', 4, ICONS.w4, 'Extragrueso')}</div>
    </div>
    <div class="pz-prop" data-show="strokeStyle">
      <span class="pz-prop__label">Estilo del trazo</span>
      <div class="pz-opts">${opt('strokeStyle', 'solid', ICONS.sSolid, 'Continuo')}${opt('strokeStyle', 'dashed', ICONS.sDashed, 'Discontinuo')}${opt('strokeStyle', 'dotted', ICONS.sDotted, 'Punteado')}</div>
    </div>
    <div class="pz-prop" data-show="rough">
      <span class="pz-prop__label">Estilo de dibujo</span>
      <div class="pz-opts">${opt('roughness', 0, ICONS.r0, 'Preciso')}${opt('roughness', 1, ICONS.r1, 'A mano')}${opt('roughness', 2, ICONS.r2, 'Garabato')}</div>
    </div>
    <div class="pz-prop" data-show="edges">
      <span class="pz-prop__label">Esquinas</span>
      <div class="pz-opts">${opt('roundness', 'sharp', ICONS.sharp, 'En punta')}${opt('roundness', 'round', ICONS.round, 'Redondeadas')}</div>
    </div>
    <div class="pz-prop" data-show="arrows">
      <span class="pz-prop__label">Punta inicial</span>
      <div class="pz-opts">${opt('startArrow', 'none', flip(ICONS.aNone), 'Sin punta')}${opt('startArrow', 'arrow', flip(ICONS.aArrow), 'Flecha')}${opt('startArrow', 'triangle', flip(ICONS.aTriangle), 'Triángulo')}${opt('startArrow', 'dot', flip(ICONS.aDot), 'Punto')}${opt('startArrow', 'bar', flip(ICONS.aBar), 'Barra')}</div>
      <span class="pz-prop__label" style="margin-top:.4rem">Punta final</span>
      <div class="pz-opts">${opt('endArrow', 'none', ICONS.aNone, 'Sin punta')}${opt('endArrow', 'arrow', ICONS.aArrow, 'Flecha')}${opt('endArrow', 'triangle', ICONS.aTriangle, 'Triángulo')}${opt('endArrow', 'dot', ICONS.aDot, 'Punto')}${opt('endArrow', 'bar', ICONS.aBar, 'Barra')}</div>
    </div>
    <div class="pz-prop" data-show="font">
      <span class="pz-prop__label">Tamaño de letra</span>
      <div class="pz-opts">${opt('fontSize', 18, 'S', 'Pequeña')}${opt('fontSize', 28, 'M', 'Mediana')}${opt('fontSize', 42, 'L', 'Grande')}${opt('fontSize', 64, 'XL', 'Muy grande')}</div>
      <span class="pz-prop__label" style="margin-top:.4rem">Tipo de letra</span>
      <div class="pz-opts">${opt('fontFamily', 'hand', '<span style="font:700 1rem Caveat,cursive">Aa</span>', 'A mano')}${opt('fontFamily', 'normal', '<span style="font:800 .8rem Nunito,sans-serif">Aa</span>', 'Normal')}${opt('fontFamily', 'code', '<span style="font:700 .75rem monospace">&lt;/&gt;</span>', 'Código')}</div>
    </div>
    <div class="pz-prop" data-show="align">
      <span class="pz-prop__label">Alineación</span>
      <div class="pz-opts">${opt('textAlign', 'left', ICONS.left, 'Izquierda')}${opt('textAlign', 'center', ICONS.center, 'Centro')}${opt('textAlign', 'right', ICONS.right, 'Derecha')}</div>
    </div>
    <div class="pz-prop" data-show="opacity">
      <span class="pz-prop__label">Opacidad <output id="opacityOut">100</output></span>
      <input class="dc-range" type="range" min="10" max="100" step="10" data-prop-input="opacity" aria-label="Opacidad">
    </div>
    <div class="pz-prop" data-show="layers">
      <span class="pz-prop__label">Capas</span>
      <div class="pz-opts">
        <button class="pz-opt" type="button" data-cmd="back" title="Enviar al fondo (Ctrl+Shift+[)" aria-label="Enviar al fondo"><i class="bi bi-chevron-double-down"></i></button>
        <button class="pz-opt" type="button" data-cmd="backward" title="Enviar atrás (Ctrl+[)" aria-label="Enviar atrás"><i class="bi bi-chevron-down"></i></button>
        <button class="pz-opt" type="button" data-cmd="forward" title="Traer adelante (Ctrl+])" aria-label="Traer adelante"><i class="bi bi-chevron-up"></i></button>
        <button class="pz-opt" type="button" data-cmd="front" title="Traer al frente (Ctrl+Shift+])" aria-label="Traer al frente"><i class="bi bi-chevron-double-up"></i></button>
      </div>
    </div>
    <div class="pz-prop" data-show="alignMany">
      <span class="pz-prop__label">Alinear</span>
      <div class="pz-opts">
        <button class="pz-opt" type="button" data-cmd="al-left" title="Alinear a la izquierda" aria-label="Alinear a la izquierda"><i class="bi bi-align-start"></i></button>
        <button class="pz-opt" type="button" data-cmd="al-hcenter" title="Centrar horizontalmente" aria-label="Centrar horizontalmente"><i class="bi bi-align-center"></i></button>
        <button class="pz-opt" type="button" data-cmd="al-right" title="Alinear a la derecha" aria-label="Alinear a la derecha"><i class="bi bi-align-end"></i></button>
        <button class="pz-opt" type="button" data-cmd="al-top" title="Alinear arriba" aria-label="Alinear arriba"><i class="bi bi-align-top"></i></button>
        <button class="pz-opt" type="button" data-cmd="al-vcenter" title="Centrar verticalmente" aria-label="Centrar verticalmente"><i class="bi bi-align-middle"></i></button>
        <button class="pz-opt" type="button" data-cmd="al-bottom" title="Alinear abajo" aria-label="Alinear abajo"><i class="bi bi-align-bottom"></i></button>
      </div>
    </div>
    <div class="pz-prop" data-show="actions">
      <span class="pz-prop__label">Acciones</span>
      <div class="pz-opts">
        <button class="pz-opt" type="button" data-cmd="duplicate" title="Duplicar (Ctrl+D)" aria-label="Duplicar"><i class="bi bi-copy"></i></button>
        <button class="pz-opt" type="button" data-cmd="delete" title="Eliminar (Supr)" aria-label="Eliminar"><i class="bi bi-trash3"></i></button>
      </div>
    </div>`;

  /** Qué propiedades mostrar según la herramienta o la selección */
  function propTargets() {
    if (selected.size) return selectedEls();
    if (DRAW_TOOLS.includes(tool)) return [{ type: tool, ...style }];
    return [];
  }
  function syncProps() {
    const targets = propTargets();
    propsEl.hidden = !targets.length;
    if (!targets.length) return;
    const types = new Set(targets.map((t) => t.type));
    const has = (...ts) => ts.some((t) => types.has(t));
    const show = {
      stroke: !(types.size === 1 && types.has('image')),
      fill: has(...SHAPES),
      fillStyle: has(...SHAPES) && targets.some((t) => SHAPES.includes(t.type) && t.bgColor !== 'transparent'),
      width: has(...SHAPES, ...LINEAR, 'freedraw'),
      strokeStyle: has(...SHAPES, ...LINEAR),
      rough: has(...SHAPES, ...LINEAR),
      edges: has('rectangle', 'diamond'),
      arrows: has(...LINEAR),
      font: has('text') || targets.some((t) => SHAPES.includes(t.type) && t.label) || (editing && editing.field === 'label'),
      align: has('text'),
      opacity: true,
      layers: selected.size > 0,
      alignMany: selected.size > 1,
      actions: selected.size > 0,
    };
    $$('[data-show]', propsEl).forEach((g) => { g.hidden = !show[g.dataset.show]; });
    const first = targets[0];
    $$('[data-prop]', propsEl).forEach((b) => {
      const prop = b.dataset.prop;
      const src = targets.find((t) => t[prop] !== undefined) || first;
      b.setAttribute('aria-pressed', String(String(src[prop]) === b.dataset.value));
    });
    const op = targets[0].opacity ?? 100;
    const range = $('[data-prop-input="opacity"]', propsEl);
    range.value = op;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    $('#opacityOut').textContent = `${op}%`;
  }

  function applyProp(prop, raw) {
    const num = ['strokeWidth', 'roughness', 'opacity', 'fontSize'].includes(prop);
    const value = num ? Number(raw) : raw;
    style[prop] = value;
    const sel = selectedEls();
    sel.forEach((el) => {
      if (prop === 'startArrow' || prop === 'endArrow') { if (!LINEAR.includes(el.type)) return; }
      if (['bgColor', 'fillStyle'].includes(prop) && !SHAPES.includes(el.type)) return;
      el[prop] = value;
      if (el.type === 'text' && ['fontSize', 'fontFamily'].includes(prop)) measureText(el);
    });
    if (editing) positionEditor();
    if (sel.length) commit(); else save();
    syncProps();
    requestRender();
  }

  propsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-prop]');
    if (b) { applyProp(b.dataset.prop, b.dataset.value); return; }
    const c = e.target.closest('[data-cmd]');
    if (!c) return;
    const cmd = c.dataset.cmd;
    if (cmd === 'delete') deleteSelection();
    else if (cmd === 'duplicate') duplicateSelection();
    else if (cmd.startsWith('al-')) align(cmd.slice(3));
    else reorder(cmd);
  });
  propsEl.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-prop-input]');
    if (!inp || !e.isTrusted) return;
    if (inp.dataset.propInput === 'opacity') $('#opacityOut').textContent = `${inp.value}%`;
    applyProp(inp.dataset.propInput, inp.value);
  });
  // Evita que hacer clic en el panel quite el foco del editor de texto
  propsEl.addEventListener('pointerdown', (e) => { if (editing && !e.target.closest('input')) e.preventDefault(); });

  /* ------------------------------------------------------------------
     Imágenes
     ------------------------------------------------------------------ */
  function readImage(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const img = new Image();
        img.onload = () => {
          // Se reduce para que quepa en el navegador
          const max = 1600;
          const s = Math.min(1, max / Math.max(img.width, img.height));
          let src = r.result;
          if (s < 1 || file.size > 600000) {
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * s);
            c.height = Math.round(img.height * s);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            src = c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
          }
          resolve({ src, w: img.width * s, h: img.height * s });
        };
        img.onerror = reject;
        img.src = r.result;
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  async function insertImage(file, at) {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const { src, w, h } = await readImage(file);
      const fileId = uid();
      files[fileId] = src;
      loadImages();
      const s = Math.min(1, 480 / Math.max(w, h));
      const c = at || toWorld(W / 2, H / 2);
      const el = { ...baseElement('image', c.x - (w * s) / 2, c.y - (h * s) / 2), w: w * s, h: h * s, fileId };
      el.bgColor = 'transparent';
      elements.push(el);
      setTool('selection');
      selected = new Set([el.id]);
      commit();
      syncProps();
      requestRender();
    } catch {
      DC.toast({ title: 'No se pudo abrir la imagen', icon: 'bi-exclamation-triangle-fill', theme: 'red' });
    }
  }
  imageInput.addEventListener('change', () => { insertImage(imageInput.files[0]); imageInput.value = ''; });
  board.addEventListener('dragover', (e) => { e.preventDefault(); });
  board.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) {
      const { sx, sy } = eventPoint(e);
      insertImage(file, toWorld(sx, sy));
    } else openFile(file);
  });

  /* ------------------------------------------------------------------
     Copiar / pegar
     ------------------------------------------------------------------ */
  function copySelection(cut) {
    const sel = selectedEls();
    if (!sel.length) return;
    const usedFiles = {};
    sel.forEach((el) => { if (el.fileId) usedFiles[el.fileId] = files[el.fileId]; });
    clipboard = { type: 'dinamiclase-pizarra', elements: JSON.parse(JSON.stringify(sel)), files: usedFiles };
    navigator.clipboard?.writeText(JSON.stringify(clipboard)).catch(() => { /* sin permiso: queda el portapapeles interno */ });
    if (cut) deleteSelection();
  }
  function pasteData(data, at) {
    if (!data || !Array.isArray(data.elements) || !data.elements.length) return false;
    Object.assign(files, data.files || {});
    loadImages();
    const b = unionBounds(data.elements);
    const target = at || toWorld(W / 2, H / 2);
    const dx = target.x - (b.x + b.w / 2), dy = target.y - (b.y + b.h / 2);
    const copies = data.elements.map((el) => ({ ...el, id: uid(), seed: newSeed(), x: el.x + dx, y: el.y + dy }));
    elements.push(...copies);
    setTool('selection');
    selected = new Set(copies.map((c) => c.id));
    commit();
    syncProps();
    requestRender();
    return true;
  }
  document.addEventListener('paste', (e) => {
    if (editing || /INPUT|TEXTAREA/.test(document.activeElement?.tagName)) return;
    if (!board.contains(document.activeElement) && document.activeElement !== document.body) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find((i) => i.type.startsWith('image/'));
    if (imgItem) { e.preventDefault(); insertImage(imgItem.getAsFile()); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (!text) { if (clipboard) pasteData(clipboard); return; }
    e.preventDefault();
    try {
      const data = JSON.parse(text);
      if (data.type === 'dinamiclase-pizarra' && pasteData(data)) return;
    } catch { /* no es JSON */ }
    const c = toWorld(W / 2, H / 2);
    const el = createElement('text', c.x, c.y);
    el.text = text.trim().slice(0, 5000);
    measureText(el);
    el.x -= el.w / 2; el.y -= el.h / 2;
    elements.push(el);
    selected = new Set([el.id]);
    commit();
    syncProps();
    requestRender();
  });

  /* ------------------------------------------------------------------
     Exportar, guardar y abrir
     ------------------------------------------------------------------ */
  const stamp = () => {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  };
  function exportBounds() {
    const list = elements;
    const b = unionBounds(list);
    if (!b) return null;
    const pad = 30;
    return { list, x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 };
  }
  function renderPNG(scale = 2) {
    const eb = exportBounds();
    if (!eb) return null;
    const s = Math.min(scale, 8000 / Math.max(eb.w, eb.h));
    const out = document.createElement('canvas');
    out.width = Math.ceil(eb.w * s);
    out.height = Math.ceil(eb.h * s);
    const c = out.getContext('2d');
    c.setTransform(s, 0, 0, s, -eb.x * s, -eb.y * s);
    drawBackground(c, eb.x, eb.y, eb.w, eb.h, s);
    eb.list.forEach((el) => drawElement(c, el));
    return out;
  }
  function nothingToExport() {
    DC.toast({ title: 'La pizarra está vacía', text: 'Dibuja algo antes de exportar.', icon: 'bi-info-circle-fill', theme: 'orange', timeout: 3000 });
  }
  function downloadBlob(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function exportPNG() {
    const out = renderPNG();
    if (!out) { nothingToExport(); return; }
    out.toBlob((blob) => downloadBlob(blob, `pizarra-dinamiclase-${stamp()}.png`));
    sfx('pop');
  }
  function copyPNG() {
    const out = renderPNG();
    if (!out) { nothingToExport(); return; }
    if (!window.ClipboardItem || !navigator.clipboard?.write) {
      DC.toast({ title: 'Tu navegador no permite copiar imágenes', text: 'Usa «Exportar imagen PNG».', icon: 'bi-exclamation-triangle-fill', theme: 'red' });
      return;
    }
    out.toBlob(async (blob) => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        DC.toast({ title: '¡Imagen copiada!', text: 'Pégala en tu presentación, documento o chat.', icon: 'bi-clipboard-check-fill', theme: 'green' });
      } catch {
        DC.toast({ title: 'No se pudo copiar', text: 'Prueba con «Exportar imagen PNG».', icon: 'bi-exclamation-triangle-fill', theme: 'red' });
      }
    });
  }

  /* Contexto mínimo que traduce las llamadas de canvas a SVG */
  function createSVGContext() {
    const parts = [];
    const defs = [];
    let path = '';
    let clipStack = [];
    let state = { strokeStyle: '#000', fillStyle: '#000', lineWidth: 1, globalAlpha: 1, dash: [], font: '16px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineCap: 'round', lineJoin: 'round', clip: null };
    const stack = [];
    let clipId = 0;
    const f = (n) => Math.round(n * 100) / 100;
    const attrs = (kind) => {
      const op = state.globalAlpha < 1 ? ` opacity="${f(state.globalAlpha)}"` : '';
      const cp = state.clip ? ` clip-path="url(#${state.clip})"` : '';
      if (kind === 'stroke') {
        const dash = state.dash.length ? ` stroke-dasharray="${state.dash.map(f).join(' ')}"` : '';
        return `fill="none" stroke="${state.strokeStyle}" stroke-width="${f(state.lineWidth)}" stroke-linecap="${state.lineCap}" stroke-linejoin="${state.lineJoin}"${dash}${op}${cp}`;
      }
      return `fill="${state.fillStyle}"${op}${cp}`;
    };
    const ctxSvg = {
      get strokeStyle() { return state.strokeStyle; }, set strokeStyle(v) { state.strokeStyle = v; },
      get fillStyle() { return state.fillStyle; }, set fillStyle(v) { state.fillStyle = v; },
      get lineWidth() { return state.lineWidth; }, set lineWidth(v) { state.lineWidth = v; },
      get globalAlpha() { return state.globalAlpha; }, set globalAlpha(v) { state.globalAlpha = v; },
      get font() { return state.font; }, set font(v) { state.font = v; },
      get textAlign() { return state.textAlign; }, set textAlign(v) { state.textAlign = v; },
      get textBaseline() { return state.textBaseline; }, set textBaseline(v) { state.textBaseline = v; },
      get lineCap() { return state.lineCap; }, set lineCap(v) { state.lineCap = v; },
      get lineJoin() { return state.lineJoin; }, set lineJoin(v) { state.lineJoin = v; },
      setLineDash(d) { state.dash = d; },
      save() { stack.push({ ...state }); clipStack.push(state.clip); },
      restore() { state = stack.pop() || state; clipStack.pop(); },
      beginPath() { path = ''; },
      moveTo(x, y) { path += `M${f(x)} ${f(y)}`; },
      lineTo(x, y) { path += `L${f(x)} ${f(y)}`; },
      quadraticCurveTo(cx, cy, x, y) { path += `Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`; },
      closePath() { path += 'Z'; },
      rect(x, y, w, h) { path += `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`; },
      arc(x, y, r, a0, a1) {
        if (Math.abs(a1 - a0) >= Math.PI * 2 - 0.001) {
          path += `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 1 0 ${f(x - r)} ${f(y)}A${f(r)} ${f(r)} 0 1 0 ${f(x + r)} ${f(y)}Z`;
        }
      },
      ellipse(x, y, rx, ry) {
        path += `M${f(x + rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 1 0 ${f(x - rx)} ${f(y)}A${f(rx)} ${f(ry)} 0 1 0 ${f(x + rx)} ${f(y)}Z`;
      },
      arcTo(x1, y1, x2, y2, r) {
        // Aproximación válida para esquinas de 90° de un rectángulo redondeado
        const m = path.match(/(-?[\d.]+) (-?[\d.]+)$/);
        const [px, py] = m ? [Number(m[1]), Number(m[2])] : [x1, y1];
        const d1 = Math.hypot(x1 - px, y1 - py) || 1, d2 = Math.hypot(x2 - x1, y2 - y1) || 1;
        const sx = x1 - ((x1 - px) / d1) * r, sy = y1 - ((y1 - py) / d1) * r;
        const ex = x1 + ((x2 - x1) / d2) * r, ey = y1 + ((y2 - y1) / d2) * r;
        path += `L${f(sx)} ${f(sy)}Q${f(x1)} ${f(y1)} ${f(ex)} ${f(ey)}`;
      },
      stroke() { if (path) parts.push(`<path d="${path}" ${attrs('stroke')}/>`); },
      fill() { if (path) parts.push(`<path d="${path}" ${attrs('fill')}/>`); },
      clip() { const id = `c${clipId++}`; defs.push(`<clipPath id="${id}"><path d="${path}"/></clipPath>`); state.clip = id; },
      fillRect(x, y, w, h) { parts.push(`<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" ${attrs('fill')}/>`); },
      strokeRect() {},
      fillText(text, x, y) {
        const anchor = state.textAlign === 'center' ? 'middle' : state.textAlign === 'right' ? 'end' : 'start';
        const m = state.font.match(/([\d.]+)px (.*)/);
        const size = m ? Number(m[1]) : 16;
        const fam = m ? m[2].replace(/"/g, "'") : 'sans-serif';
        const esc = String(text).replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
        parts.push(`<text x="${f(x)}" y="${f(y + size * 0.82)}" font-size="${f(size)}" font-family="${fam}" text-anchor="${anchor}" ${attrs('fill')} xml:space="preserve">${esc}</text>`);
      },
      drawImage(img, x, y, w, h) {
        const op = state.globalAlpha < 1 ? ` opacity="${f(state.globalAlpha)}"` : '';
        parts.push(`<image href="${img.src}" x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" preserveAspectRatio="none"${op}/>`);
      },
      measureText(t) { measurer.font = state.font; return measurer.measureText(t); },
      toString(x, y, w, h) {
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}" width="${Math.round(w)}" height="${Math.round(h)}">`
          + '<style>@import url("https://fonts.googleapis.com/css2?family=Caveat:wght@500&amp;family=Nunito:wght@400;700&amp;display=swap");</style>'
          + `<defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
      },
    };
    return ctxSvg;
  }
  function exportSVG() {
    const eb = exportBounds();
    if (!eb) { nothingToExport(); return; }
    const c = createSVGContext();
    drawBackground(c, eb.x, eb.y, eb.w, eb.h, 1);
    eb.list.forEach((el) => {
      // las imágenes deben llevar su propio dato
      if (el.type === 'image') { const img = { src: files[el.fileId] }; c.save(); c.globalAlpha = (el.opacity ?? 100) / 100; c.drawImage(img, el.x, el.y, el.w, el.h); c.restore(); return; }
      drawElement(c, el);
    });
    downloadBlob(new Blob([c.toString(eb.x, eb.y, eb.w, eb.h)], { type: 'image/svg+xml' }), `pizarra-dinamiclase-${stamp()}.svg`);
    sfx('pop');
  }

  function saveFile() {
    if (!elements.length) { nothingToExport(); return; }
    const data = { type: 'dinamiclase-pizarra', version: 2, bg, elements, files };
    downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `pizarra-${stamp()}.dinamiclase`);
    DC.toast({ title: 'Archivo guardado', text: 'Ábrelo después con «Abrir archivo» para seguir editando.', icon: 'bi-floppy-fill', theme: 'green', timeout: 3500 });
  }
  function openFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (data.type !== 'dinamiclase-pizarra' || !Array.isArray(data.elements)) throw new Error('formato');
        if (elements.length && !window.confirm('Se reemplazará lo que hay en la pizarra. ¿Continuar?')) return;
        elements = data.elements;
        files = data.files || {};
        if (data.bg && BG[data.bg]) setBg(data.bg);
        loadImages();
        selected.clear();
        commit();
        zoomToFit();
        DC.toast({ title: 'Pizarra abierta', icon: 'bi-folder2-open', theme: 'green', timeout: 2500 });
      } catch {
        DC.toast({ title: 'Archivo no válido', text: 'Elige un archivo .dinamiclase guardado desde esta pizarra.', icon: 'bi-exclamation-triangle-fill', theme: 'red' });
      }
    };
    r.readAsText(file);
  }
  fileInput.addEventListener('change', () => { openFile(fileInput.files[0]); fileInput.value = ''; });

  function clearCanvas() {
    if (!elements.length) return;
    elements = [];
    selected.clear();
    commit();
    syncProps();
    requestRender();
    sfx('pop');
    DC.toast({ title: 'Lienzo limpio', text: '¿Te arrepentiste? Pulsa «Deshacer» o Ctrl+Z.', icon: 'bi-trash3-fill', theme: 'orange', timeout: 3500 });
  }

  function setBg(value) {
    const prev = bg;
    bg = value;
    board.dataset.bg = value;
    $$('input[name="bg"]', board).forEach((r) => { r.checked = r.value === value; });
    // En la pizarra verde el tinta no se ve: cambia a tiza blanca
    if (value === 'pizarra' && style.strokeColor === '#231942') style.strokeColor = '#FFFFFF';
    if (prev === 'pizarra' && value !== 'pizarra' && style.strokeColor === '#FFFFFF') style.strokeColor = '#231942';
    syncProps();
    save();
    requestRender();
  }

  /* ------------------------------------------------------------------
     Menú
     ------------------------------------------------------------------ */
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) $('button', menu).focus();
  });
  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.pz-corner--tl')) closeMenu(); });
  const ACTIONS = {
    open: () => fileInput.click(),
    save: saveFile,
    export: exportPNG,
    'export-svg': exportSVG,
    'copy-png': copyPNG,
    image: () => imageInput.click(),
    help: () => helpDialog.showModal(),
    clear: clearCanvas,
  };
  board.addEventListener('click', (e) => {
    const b = e.target.closest('[data-action]');
    if (!b) return;
    closeMenu();
    ACTIONS[b.dataset.action]?.();
  });
  $$('input[name="bg"]', board).forEach((r) => r.addEventListener('change', () => setBg(r.value)));
  $$('[data-close]', helpDialog).forEach((b) => b.addEventListener('click', () => helpDialog.close()));
  helpDialog.addEventListener('click', (e) => { if (e.target === helpDialog) helpDialog.close(); });

  $$('[data-tool]', board).forEach((b) => b.addEventListener('click', () => setTool(b.dataset.tool)));
  const lockBtn = $('[data-lock]', board);
  function toggleLock() {
    toolLocked = !toolLocked;
    lockBtn.setAttribute('aria-pressed', String(toolLocked));
    $('i', lockBtn).className = `bi ${toolLocked ? 'bi-lock-fill' : 'bi-unlock'}`;
  }
  lockBtn.addEventListener('click', toggleLock);
  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);
  $('#zoomIn').addEventListener('click', () => zoomAt(view.zoom * 1.2));
  $('#zoomOut').addEventListener('click', () => zoomAt(view.zoom / 1.2));
  $('#zoomReset').addEventListener('click', () => zoomAt(1));
  $('#zoomFit').addEventListener('click', zoomToFit);

  /* ------------------------------------------------------------------
     Teclado
     ------------------------------------------------------------------ */
  const KEY_TOOLS = {
    v: 'selection', 1: 'selection', h: 'hand', r: 'rectangle', 2: 'rectangle', d: 'diamond', 3: 'diamond',
    o: 'ellipse', 4: 'ellipse', a: 'arrow', 5: 'arrow', l: 'line', 6: 'line', p: 'freedraw', 7: 'freedraw',
    t: 'text', 8: 'text', 9: 'image', e: 'eraser', 0: 'eraser', k: 'laser',
  };
  const boardActive = () => board.contains(document.activeElement) || document.activeElement === document.body || $('#stage').classList.contains('is-fullscreen');
  document.addEventListener('keydown', (e) => {
    if (editing || helpDialog.open) return;
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable) return;
    if (!boardActive()) return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;

    if (k === ' ' && !spaceDown) { spaceDown = true; board.classList.add('is-panning'); e.preventDefault(); return; }
    if (mod) {
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (k === 'a') { e.preventDefault(); setTool('selection'); selected = new Set(elements.map((el) => el.id)); syncProps(); requestRender(); }
      else if (k === 'd') { e.preventDefault(); duplicateSelection(); }
      else if (k === 'c') { copySelection(false); }
      else if (k === 'x') { copySelection(true); }
      else if (k === 's') { e.preventDefault(); saveFile(); }
      else if (k === 'o') { e.preventDefault(); fileInput.click(); }
      else if (k === 'e' && e.shiftKey) { e.preventDefault(); exportPNG(); }
      else if (k === '=' || k === '+') { e.preventDefault(); zoomAt(view.zoom * 1.2); }
      else if (k === '-') { e.preventDefault(); zoomAt(view.zoom / 1.2); }
      else if (k === '0') { e.preventDefault(); zoomAt(1); }
      else if (e.code === 'BracketRight') { e.preventDefault(); reorder(e.shiftKey ? 'front' : 'forward'); }
      else if (e.code === 'BracketLeft') { e.preventDefault(); reorder(e.shiftKey ? 'back' : 'backward'); }
      return;
    }
    if (e.altKey) return;
    if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSelection(); return; }
    if (k === 'escape') { selected.clear(); setTool('selection'); return; }
    if (k === 'enter' && selected.size === 1) {
      const el = selectedEls()[0];
      if (el.type === 'text') { e.preventDefault(); startEditing(el, 'text'); }
      else if (SHAPES.includes(el.type)) { e.preventDefault(); startEditing(el, 'label'); }
      return;
    }
    if (k.startsWith('arrow') && selected.size) {
      e.preventDefault();
      const s = e.shiftKey ? 20 : 2;
      nudge(k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0);
      return;
    }
    if (e.shiftKey && e.code === 'Digit1') { e.preventDefault(); zoomToFit(); return; }
    if (k === '?') { helpDialog.showModal(); return; }
    if (k === 'q') { toggleLock(); return; }
    if (e.shiftKey) return;
    if (KEY_TOOLS[k] !== undefined) { e.preventDefault(); setTool(KEY_TOOLS[k]); }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key === ' ') { spaceDown = false; board.classList.remove('is-panning'); }
  });

  /* ------------------------------------------------------------------
     Tamaño del lienzo
     ------------------------------------------------------------------ */
  function resize() {
    const r = board.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    W = r.width; H = r.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    positionEditor();
    requestRender();
  }
  new ResizeObserver(resize).observe(board);
  $('#stage').addEventListener('dc:stage', () => setTimeout(resize, 60));

  /* En pantalla completa, Esc se usa para la pizarra y no saca del modo:
     Chrome/Edge permiten "bloquear" Esc (para salir hay que mantenerla
     pulsada ~2 s o usar el botón). Otros navegadores salen con Esc igualmente. */
  let escHintShown = false;
  document.addEventListener('fullscreenchange', async () => {
    const kb = navigator.keyboard;
    if (!kb?.lock) return;
    if (document.fullscreenElement === $('#stage')) {
      try {
        await kb.lock(['Escape']);
        if (!escHintShown) {
          escHintShown = true;
          DC.toast({ title: 'Modo proyector', text: 'Mantén pulsada Esc para salir de la pantalla completa, o usa el botón de abajo a la derecha.', icon: 'bi-fullscreen', theme: 'orange', timeout: 4500 });
        }
      } catch { /* el navegador no lo permite (p. ej. fuera de https) */ }
    } else {
      kb.unlock();
    }
  });
  canvas.tabIndex = 0;

  /* ------------------------------------------------------------------
     Arranque
     ------------------------------------------------------------------ */
  load();
  loadImages();
  setBg(bg);
  history = [snapshot()];
  hIndex = 0;
  syncHistory();
  syncZoom();
  setTool('selection');
  // El lienzo no dispara la descarga de fuentes web: se piden explícitamente
  if (document.fonts?.load) {
    Promise.all(['500 28px Caveat', '400 28px Nunito'].map((f) => document.fonts.load(f).catch(() => null)))
      .then(() => { elements.filter((e) => e.type === 'text').forEach(measureText); positionEditor(); requestRender(); });
  }
  resize();
})();
