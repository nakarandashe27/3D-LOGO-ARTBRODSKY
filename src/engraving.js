// Гравировка на обороте подложки. Рисуется на canvas в координатах эмблемы
// и превращается в три карты: цвет (затемнение), шероховатость и рельеф (bump).
// Содержимое (строки названия, год, сайт) — в brand.config.js → back.

import * as THREE from 'three';
import { pathsToPoints } from './emblem.js';
import { BRAND } from './brand.config.js';

const MAX_TEXTURE = 4096;
const FONT = `"${BRAND.fonts?.engraving ?? 'Inter Variable'}", Inter, system-ui, sans-serif`;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function tinted(mask, color) {
  const c = makeCanvas(mask.width, mask.height);
  const ctx = c.getContext('2d');
  ctx.drawImage(mask, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

const gray = (v) => {
  const n = Math.round(Math.min(Math.max(v, 0), 1) * 255);
  return `rgb(${n},${n},${n})`;
};

/** Доступная ширина гравировки на высоте y вокруг оси axis (по внутренней рамке силуэта). */
function spanAt(polys, y, axis) {
  let left = -Infinity;
  let right = Infinity;
  let inside = false;
  for (const poly of polys) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [x1, y1] = poly[j];
      const [x2, y2] = poly[i];
      if ((y1 > y) === (y2 > y)) continue;
      const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
      if (x <= axis) left = Math.max(left, x);
      else right = Math.min(right, x);
      if (x > axis) inside = !inside;
    }
  }
  if (!inside || !isFinite(left) || !isFinite(right)) return 0;
  return 2 * Math.min(axis - left, right - axis);
}

function drawMask({ bounds, engraveBorder, layout: L }) {
  const K = Math.min(14, MAX_TEXTURE / Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY));
  const W = Math.ceil((bounds.maxX - bounds.minX) * K);
  const H = Math.ceil((bounds.maxY - bounds.minY) * K);
  const mask = makeCanvas(W, H);
  const ctx = mask.getContext('2d');
  // Изображение «как видно сзади»: ось X зеркальна относительно локальной
  const X = (x) => (bounds.maxX - x) * K;
  const Y = (y) => (bounds.maxY - y) * K;
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const inner = pathsToPoints(engraveBorder[1]);
  const room = (y, pad = 2.5) => Math.max(0, spanAt(inner, y, L.axis) - 2 * pad);

  // Двойная рамка по контуру
  engraveBorder.forEach((paths, i) => {
    ctx.lineWidth = (i === 0 ? 0.34 : 0.16) * K;
    for (const poly of pathsToPoints(paths)) {
      ctx.beginPath();
      poly.forEach(([x, y], j) => (j ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
      ctx.closePath();
      ctx.stroke();
    }
  });

  // Заштрихованная сетка (если задана): клетки со штриховкой под 45°
  const s = L.textScale ?? 1;
  const CELL = 7.4;
  const GAP = 1.5;
  ctx.lineWidth = 0.3 * K;
  for (const r of L.hatch ?? []) {
    const nx = Math.max(1, Math.floor((r.maxX - r.minX + GAP) / (CELL + GAP)));
    const ny = Math.max(1, Math.floor((r.maxY - r.minY + GAP) / (CELL + GAP)));
    const ox = r.minX + (r.maxX - r.minX - (nx * CELL + (nx - 1) * GAP)) / 2;
    const oy = r.minY + (r.maxY - r.minY - (ny * CELL + (ny - 1) * GAP)) / 2;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x0 = ox + i * (CELL + GAP);
        const y0 = oy + j * (CELL + GAP);
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(x0 + CELL), Y(y0 + CELL), CELL * K, CELL * K);
        ctx.clip();
        for (let t = -CELL; t < CELL * 2; t += 1.25) {
          ctx.beginPath();
          ctx.moveTo(X(x0 + t), Y(y0));
          ctx.lineTo(X(x0 + t + CELL), Y(y0 + CELL));
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // Лучи вокруг кристалла
  if (L.gem) {
    const gx = X(L.gem.x);
    const gy = Y(L.gem.y);
    const g = L.gemScale ?? 1;
    const rays = 40;
    ctx.lineWidth = 0.26 * K * Math.min(1, g);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const r1 = 5.3 * g;
      const r2 = (i % 2 ? 8.1 : 9.6) * g;
      ctx.beginPath();
      ctx.moveTo(gx + Math.cos(a) * r1 * K, gy + Math.sin(a) * r1 * K);
      ctx.lineTo(gx + Math.cos(a) * r2 * K, gy + Math.sin(a) * r2 * K);
      ctx.stroke();
    }
    ctx.lineWidth = 0.18 * K;
    ctx.beginPath();
    ctx.arc(gx, gy, 4.85 * g * K, 0, Math.PI * 2);
    ctx.stroke();
  }

  const cx = X(L.axis);

  // Горизонтальная двойная линия («карниз»)
  if (L.rule) {
    ctx.lineWidth = 0.22 * K;
    for (const y of L.rule.y) {
      const half = Math.min(L.rule.half, room(y, 1.5) / 2);
      ctx.beginPath();
      ctx.moveTo(cx - half * K, Y(y));
      ctx.lineTo(cx + half * K, Y(y));
      ctx.stroke();
    }
  }

  // Текст: размер уменьшается, если строка не помещается в силуэт на своей высоте
  const setFont = (size, weight, spacing) => {
    ctx.font = `${weight} ${size * K}px ${FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing * size * K}px`;
  };
  const fitSize = (str, y, size, weight, spacing, maxWidth = Infinity) => {
    setFont(size, weight, spacing);
    const w = ctx.measureText(str).width / K;
    const limit = Math.min(maxWidth, room(y));
    return w > limit ? (size * limit) / w : size;
  };
  const text = (str, y, size, weight = 600, spacing = 0.08) => {
    if (!str || y == null) return;
    const fitted = fitSize(str, y, size, weight, spacing);
    if (fitted < 0.8) return; // негде разместить
    setFont(fitted, weight, spacing);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(str, cx + (spacing * fitted * K) / 2, Y(y));
  };

  // Строки названия — единым кеглем
  const lines = (L.lines ?? []).filter((l) => l.text && l.y != null);
  if (lines.length) {
    const size = Math.min(...lines.map((l) => fitSize(l.text, l.y, L.lineSize ?? 4.6, 600, 0.08, L.lineWidth)));
    for (const l of lines) text(l.text, l.y, size, 600, 0.08);
  }

  // Разделитель
  if (L.divider != null) {
    const d = L.divider;
    const half = Math.min(22, room(d) / 2);
    ctx.lineWidth = 0.22 * K;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx + sgn * 3.6 * K, Y(d));
      ctx.lineTo(cx + sgn * half * K, Y(d));
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, Y(d + 1.5));
    ctx.lineTo(cx + 1.5 * K, Y(d));
    ctx.lineTo(cx, Y(d - 1.5));
    ctx.lineTo(cx - 1.5 * K, Y(d));
    ctx.closePath();
    ctx.fill();
  }

  const back = BRAND.back ?? {};
  text(back.founded, L.founded, 2.7 * s, 560, 0.42);
  text(back.year, L.year, 12.5 * s, 680, 0.03);
  text(back.site, L.site, 2.5 * s, 560, 0.42);

  if (L.dots != null && room(L.dots) > 10) {
    for (const dx of [-3.2, 0, 3.2]) {
      const x = cx + dx * K;
      const y = Y(L.dots);
      const r = 0.75 * K;
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
  }
  return mask;
}

export function createBackTextures({ outlines, layout }) {
  const mask = drawMask({ bounds: outlines.bounds, engraveBorder: outlines.engraveBorder, layout });
  const { width: W, height: H } = mask;

  const albedoCanvas = makeCanvas(W, H);
  {
    const ctx = albedoCanvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(tinted(mask, '#5c5c5c'), 0, 0);
  }

  const bumpCanvas = makeCanvas(W, H);
  {
    const ctx = bumpCanvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.filter = 'blur(1.2px)';
    ctx.drawImage(mask, 0, 0);
  }

  const roughCanvas = makeCanvas(W, H);
  const engravedMask = tinted(mask, gray(0.72));

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;
  const bump = new THREE.CanvasTexture(bumpCanvas);
  bump.colorSpace = THREE.NoColorSpace;
  const rough = new THREE.CanvasTexture(roughCanvas);
  rough.colorSpace = THREE.NoColorSpace;
  for (const t of [albedo, bump, rough]) t.anisotropy = 8;

  function setFinishRoughness(r) {
    const ctx = roughCanvas.getContext('2d');
    ctx.fillStyle = gray(r);
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(engravedMask, 0, 0);
    rough.needsUpdate = true;
  }
  setFinishRoughness(0.08);

  return {
    albedo,
    bump,
    rough,
    setFinishRoughness,
    dispose() {
      albedo.dispose();
      bump.dispose();
      rough.dispose();
    },
  };
}
