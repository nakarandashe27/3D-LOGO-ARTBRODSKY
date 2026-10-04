// Геометрия эмблемы: SVG логотипа → роли цветов → булевы операции (Clipper) → слои 3D-объекта.
// Всё, что зависит от конкретного бренда, описано в brand.config.js.
//
// Координаты: логотип нормализуется так, что sqrt(ширина × высота) ≈ 100 единиц, центр — в нуле,
// ось Y смотрит вверх. Все размеры ниже (DIM, высоты слоёв, фаски) заданы в этих единицах.

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import ClipperLib from 'clipper-lib';
import { BRAND } from './brand.config.js';

const C = ClipperLib;
const SCALE = 1000; // Clipper работает в целых числах
const NZ = C.PolyFillType.pftNonZero;
const EO = C.PolyFillType.pftEvenOdd;
const NORMALIZED_SIZE = 100;

export const DIM = {
  margin: 3.2, // отступ силуэта от знака
  fillet: 1.8, // скругление внутренних углов силуэта
  plateMargin: 5.5,
  medalMargin: 4,
  rim: 1.35, // ширина металлического контура
  base: 3.0, // толщина подложки
  rimHeight: 1.7,
  resinHeight: 1.5,
  gap: 28, // шаг между слоями в разобранном виде
  worldScale: 1 / 40,
};

export const STYLES = {
  // Знак — эмаль в металлических перегородках (клуазоне)
  enamel: { fieldFull: false, fieldH: 0.95, fieldBevel: 0.06, inkZ: 0, inkH: 0.8, inkBevel: 0.04 },
  // Знак — полированный металлический рельеф на эмалевом поле
  relief: { fieldFull: true, fieldH: 0.38, fieldBevel: 0, inkZ: 0.38, inkH: 0.92, inkBevel: 0.16 },
};

export const LOGO_KEYS = Object.keys(BRAND.logos);

// ---------------------------------------------------------------- Clipper helpers

function run(type, subject, clip, toTree = false, fill = NZ) {
  const c = new C.Clipper();
  // без касаний в одной точке — иначе триангуляция (earcut) может «залить» отверстия
  c.StrictlySimple = true;
  c.AddPaths(subject, C.PolyType.ptSubject, true);
  if (clip) c.AddPaths(clip, C.PolyType.ptClip, true);
  const out = toTree ? new C.PolyTree() : new C.Paths();
  c.Execute(type, out, fill, NZ);
  return out;
}

const union = (paths, fill = NZ) => run(C.ClipType.ctUnion, paths, null, false, fill);
const difference = (a, b) => run(C.ClipType.ctDifference, a, b);
const intersect = (a, b) => run(C.ClipType.ctIntersection, a, b);
const outers = (paths) => paths.filter((p) => C.Clipper.Orientation(p));

function offset(paths, delta, join = C.JoinType.jtRound, end = C.EndType.etClosedPolygon) {
  const co = new C.ClipperOffset(2, 0.02 * SCALE);
  co.AddPaths(paths, join, end);
  const out = new C.Paths();
  co.Execute(out, delta * SCALE);
  return out;
}

function convexHull(paths) {
  const pts = paths.flat().map((p) => [p.X, p.Y]);
  if (pts.length < 3) return [];
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  const upper = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [lower.concat(upper).map(([X, Y]) => ({ X, Y }))];
}

function enclosingCircle(paths, segments = 160) {
  const b = C.Clipper.GetBounds(paths);
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  let r = 0;
  for (const poly of paths) for (const p of poly) r = Math.max(r, Math.hypot(p.X - cx, p.Y - cy));
  const circle = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    circle.push({ X: Math.round(cx + Math.cos(a) * r), Y: Math.round(cy + Math.sin(a) * r) });
  }
  return [circle];
}

function rectPath(minX, minY, maxX, maxY) {
  const s = SCALE;
  return [
    { X: Math.round(minX * s), Y: Math.round(minY * s) },
    { X: Math.round(maxX * s), Y: Math.round(minY * s) },
    { X: Math.round(maxX * s), Y: Math.round(maxY * s) },
    { X: Math.round(minX * s), Y: Math.round(maxY * s) },
  ];
}

export function toShapes(paths) {
  const tree = run(C.ClipType.ctUnion, paths, null, true);
  const v = (p) => new THREE.Vector2(p.X / SCALE, p.Y / SCALE);
  const shapes = [];
  (function walk(node) {
    for (const outer of node.Childs()) {
      const shape = new THREE.Shape(outer.Contour().map(v));
      for (const hole of outer.Childs()) {
        shape.holes.push(new THREE.Path(hole.Contour().map(v)));
        walk(hole); // острова внутри отверстий
      }
      shapes.push(shape);
    }
  })(tree);
  return shapes;
}

function boundsOf(paths) {
  const b = C.Clipper.GetBounds(paths);
  return {
    minX: b.left / SCALE,
    maxX: b.right / SCALE,
    minY: b.top / SCALE,
    maxY: b.bottom / SCALE,
  };
}

/** Clipper-контуры → массивы точек в единицах эмблемы (для рисования на canvas). */
export function pathsToPoints(paths) {
  return paths.map((p) => p.map((q) => [q.X / SCALE, q.Y / SCALE]));
}

// ---------------------------------------------------------------- SVG → роли цветов

const ROLES = ['ink', 'accent'];

function colorKey(value) {
  if (!value || value === 'none' || value === 'transparent') return null;
  if (value.startsWith('url(')) return 'url';
  try {
    return '#' + new THREE.Color().setStyle(value, THREE.SRGBColorSpace).getHexString(THREE.SRGBColorSpace);
  } catch {
    return null;
  }
}

/** Роль цвета по таблице colors из конфига (с допуском на округление). */
function roleOf(color, table, unknown) {
  if (!color) return 'ignore';
  const entries = Object.entries(table);
  const exact = entries.find(([k]) => k.toLowerCase() === color);
  if (exact) return exact[1];
  if (color !== 'url') {
    const c = new THREE.Color(color);
    for (const [k, role] of entries) {
      if (!k.startsWith('#')) continue;
      const d = new THREE.Color(k);
      if (Math.abs(c.r - d.r) + Math.abs(c.g - d.g) + Math.abs(c.b - d.b) < 0.03) return role;
    }
  }
  unknown.add(color);
  return table.default || 'ink';
}

const toClipper = (pts) => pts.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(-p.y * SCALE) }));

/** Заливка одного элемента SVG → полигоны (правило заливки — как в исходнике). */
function fillPolys(path) {
  const polys = [];
  for (const sub of path.subPaths) {
    const pts = sub.getPoints(16);
    if (pts.length >= 3) polys.push(toClipper(pts));
  }
  const rule = path.userData?.style?.fillRule === 'evenodd' ? EO : NZ;
  return union(polys, rule);
}

/** Обводка элемента SVG → полигоны (через смещение линии на половину толщины). */
function strokePolys(path) {
  const st = path.userData.style;
  const join = { round: C.JoinType.jtRound, bevel: C.JoinType.jtSquare }[st.strokeLineJoin] ?? C.JoinType.jtMiter;
  const cap = { round: C.EndType.etOpenRound, square: C.EndType.etOpenSquare }[st.strokeLineCap] ?? C.EndType.etOpenButt;
  let out = [];
  for (const sub of path.subPaths) {
    const pts = sub.getPoints(16);
    if (pts.length < 2) continue;
    const closed = sub.autoClose || pts[0].distanceTo(pts.at(-1)) < 1e-6;
    out = out.concat(offset([toClipper(pts)], st.strokeWidth / 2, join, closed ? C.EndType.etClosedLine : cap));
  }
  return union(out);
}

const parsed = new Map();

/**
 * Разбирает логотип: «художник» идёт по элементам в порядке отрисовки, каждый следующий
 * элемент перекрывает предыдущие. Роли: ink — основной цвет, accent — второй цвет,
 * paper — фон/«бумага» поверх (прорезает остальное), ignore — пропустить.
 */
function parseLogo(key) {
  if (parsed.has(key)) return parsed.get(key);
  const cfg = BRAND.logos[key];
  const data = new SVGLoader().parse(cfg.svg);
  const layers = { ink: [], accent: [] };
  const unknown = new Set();
  const clipBox = cfg.clip
    ? [rectPath(cfg.clip.x, -(cfg.clip.y + cfg.clip.height), cfg.clip.x + cfg.clip.width, -cfg.clip.y)]
    : null;

  const paint = (polys, role) => {
    if (!polys.length || role === 'ignore') return;
    if (clipBox) polys = intersect(polys, clipBox);
    for (const r of ROLES) if (r !== role && layers[r].length) layers[r] = difference(layers[r], polys);
    if (ROLES.includes(role)) layers[role] = union(layers[role].concat(polys));
  };

  for (const path of data.paths) {
    const st = path.userData?.style ?? {};
    if (st.visibility === 'hidden' || st.display === 'none') continue;
    const fill = colorKey(st.fill ?? path.color?.getStyle?.());
    if (fill) paint(fillPolys(path), roleOf(fill, cfg.colors, unknown));
    const stroke = colorKey(st.stroke);
    if (stroke && st.strokeWidth > 0) paint(strokePolys(path), roleOf(stroke, cfg.colors, unknown));
  }
  if (unknown.size) {
    console.warn(`[logo:${key}] цвета без роли в brand.config.js → "${cfg.colors.default || 'ink'}":`, [...unknown]);
  }

  // нормализация: центр в нуле, характерный размер ≈ 100
  const marks = layers.accent.length ? layers.ink.concat(layers.accent) : layers.ink;
  if (!marks.length) throw new Error(`[logo:${key}] в SVG не найдено ни одной фигуры с ролью ink/accent`);
  const b = C.Clipper.GetBounds(marks);
  const w = (b.right - b.left) / SCALE;
  const h = (b.bottom - b.top) / SCALE;
  const k = NORMALIZED_SIZE / Math.sqrt(w * h);
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const transform = (paths) => {
    const out = paths.map((poly) => poly.map((p) => ({ X: Math.round((p.X - cx) * k), Y: Math.round((p.Y - cy) * k) })));
    return C.Clipper.CleanPolygons(out, (cfg.clean ?? 0.01) * SCALE).filter((p) => p.length > 2);
  };
  const result = {
    ink: transform(layers.ink),
    accent: transform(layers.accent),
    // перевод координат исходного SVG (y вниз) в локальные (y вверх)
    toLocal: (x, y) => new THREE.Vector2(((x * SCALE - cx) * k) / SCALE, ((-y * SCALE - cy) * k) / SCALE),
    scale: k,
  };
  parsed.set(key, result);
  return result;
}

// ---------------------------------------------------------------- Силуэт и контуры

/** Части силуэта из конфига: [{ from, svgX, svgY, shape: 'hull'|'rect'|'circle', toBottom, toTop }]. */
function silhouetteParts(spec, src, toLocal) {
  const all = src.accent.length ? union(src.ink.concat(src.accent)) : src.ink;
  const allB = boundsOf(all);
  const parts = [];
  for (const part of spec) {
    let paths = part.from === 'accent' ? src.accent : part.from === 'ink' ? src.ink : all;
    if (part.svgY || part.svgX) {
      // границы заданы в координатах исходного SVG (y вниз)
      const [y0, y1] = part.svgY ?? [null, null];
      const [x0, x1] = part.svgX ?? [null, null];
      const top = y0 == null ? 1e4 : toLocal(0, y0).y;
      const bottom = y1 == null ? -1e4 : toLocal(0, y1).y;
      const left = x0 == null ? -1e4 : toLocal(x0, 0).x;
      const right = x1 == null ? 1e4 : toLocal(x1, 0).x;
      paths = intersect(paths, [rectPath(left, bottom, right, top)]);
    }
    if (!paths.length) continue;
    if (part.shape === 'rect') {
      const r = boundsOf(paths);
      parts.push(rectPath(r.minX, part.toBottom ? allB.minY : r.minY, r.maxX, part.toTop ? allB.maxY : r.maxY));
    } else if (part.shape === 'circle') {
      parts.push(...enclosingCircle(paths));
    } else {
      parts.push(...convexHull(paths));
    }
  }
  return parts;
}

/** Верхняя/нижняя точка контура для выносок: на краю, как можно ближе к оси x = 0. */
function extremePoint(paths, top) {
  let edge = top ? -Infinity : Infinity;
  for (const poly of paths) for (const p of poly) edge = top ? Math.max(edge, p.Y) : Math.min(edge, p.Y);
  let lo = Infinity;
  let hi = -Infinity;
  for (const poly of paths) {
    for (const p of poly) {
      if (Math.abs(p.Y - edge) > 0.3 * SCALE) continue;
      lo = Math.min(lo, p.X);
      hi = Math.max(hi, p.X);
    }
  }
  const x = Math.min(Math.max(0, lo), hi);
  return { x: x / SCALE, y: edge / SCALE + (top ? -0.4 : 0.4) };
}

const outlineCache = new Map();

export function getOutlines(form, key) {
  const cacheKey = `${key}:${form}`;
  if (outlineCache.has(cacheKey)) return outlineCache.get(cacheKey);
  const cfg = BRAND.logos[key];
  const src = parseLogo(key);
  const { ink, accent } = src;
  const marks = accent.length ? union(ink.concat(accent)) : ink;
  const mb = boundsOf(marks);
  let silhouette;
  if (form === 'plate') {
    // скруглённая табличка
    silhouette = offset([rectPath(mb.minX, mb.minY, mb.maxX, mb.maxY)], DIM.plateMargin);
  } else if (form === 'medal') {
    // круглый медальон вокруг всего знака
    silhouette = offset(enclosingCircle(marks), DIM.medalMargin);
  } else {
    const spec = cfg.silhouette ?? [{ from: 'all', shape: 'hull' }];
    silhouette = offset(union(silhouetteParts(spec, src, src.toLocal)), DIM.margin);
    silhouette = offset(offset(silhouette, DIM.fillet), -DIM.fillet); // скругляем внутренние углы
  }
  silhouette = C.Clipper.CleanPolygons(union(outers(silhouette)), 0.05 * SCALE).filter((p) => p.length > 2);
  const rimInner = C.Clipper.CleanPolygons(offset(silhouette, -DIM.rim), 0.05 * SCALE).filter((p) => p.length > 2);
  const outlines = {
    ink,
    accent,
    silhouette,
    rimInner,
    rim: difference(silhouette, rimInner),
    field: difference(rimInner, marks),
    engraveBorder: [offset(silhouette, -2.4), offset(silhouette, -3.1)],
    bounds: boundsOf(silhouette),
    anchors: {
      outline: { top: extremePoint(silhouette, true), bottom: extremePoint(silhouette, false) },
      ink: ink.length ? { top: extremePoint(ink, true), bottom: extremePoint(ink, false) } : null,
      accent: accent.length ? { top: extremePoint(accent, true), bottom: extremePoint(accent, false) } : null,
    },
  };
  outlineCache.set(cacheKey, outlines);
  return outlines;
}

// ---------------------------------------------------------------- Раскладка оборота

/**
 * Раскладка гравировки оборота в локальных координатах.
 * Если у логотипа в конфиге есть back (координаты исходного SVG) — она ручная,
 * иначе считается автоматически по силуэту (вертикальная стопка или «кристалл слева» для широких знаков).
 */
export function getBackLayout(key, outlines) {
  const cfg = BRAND.logos[key];
  const src = parseLogo(key);
  const texts = BRAND.back ?? {};
  const gemOn = cfg.gem !== false;
  if (cfg.back) return manualLayout(cfg, src, texts, gemOn);
  return autoLayout(outlines.bounds, texts, gemOn, cfg.gem);
}

function manualLayout(cfg, src, texts, gemOn) {
  const b = cfg.back;
  const L = src.toLocal;
  const k = src.scale;
  const y = (svgY) => (svgY == null ? null : L(0, svgY).y);
  const lines = texts.lines ?? [];
  return {
    axis: L(b.axis, 0).x,
    gem: gemOn && cfg.gem ? L(cfg.gem.x, cfg.gem.y) : null,
    gemScale: (b.gemScale ?? 1) * Math.min(1.4, Math.max(0.7, k)),
    rule: b.cornice ? { y: b.cornice.y.map(y), half: b.cornice.half * k } : null,
    lines: lines.map((text, i) => ({ text, y: y(b.lines.y + i * b.lines.step) })),
    lineWidth: (b.lines.width ?? 58) * k,
    lineSize: 4.6 * Math.min(1.2, k),
    divider: y(b.divider),
    founded: texts.founded ? y(b.founded) : null,
    year: texts.year ? y(b.year) : null,
    site: texts.site ? y(b.site) : null,
    dots: y(b.dots),
    hatch: (b.hatch ?? []).map(([x0, y0, x1, y1]) => {
      const a = L(x0, y0);
      const c = L(x1, y1);
      return { minX: Math.min(a.x, c.x), maxX: Math.max(a.x, c.x), minY: Math.min(a.y, c.y), maxY: Math.max(a.y, c.y) };
    }),
  };
}

function autoLayout(bounds, texts, gemOn, gemCfg) {
  const W = bounds.maxX - bounds.minX;
  const H = bounds.maxY - bounds.minY;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const lines = texts.lines ?? [];
  const wide = W / H > 1.35;
  const pad = 7;

  // вертикальная стопка элементов: [ключ, высота]
  const t = 4.4;
  const stack = [];
  if (gemOn && !wide) stack.push(['gem', 21], ['rule', 4]);
  lines.forEach((_, i) => stack.push([`line${i}`, t * 1.62]));
  if (texts.year || texts.founded) stack.push(['divider', 7]);
  if (texts.founded) stack.push(['founded', 5]);
  if (texts.year) stack.push(['year', 15]);
  if (texts.site) stack.push(['site', 7]);
  stack.push(['dots', 4]);

  const gemZone = wide && gemOn ? Math.min(H - 2 * pad, 28) + pad : 0;
  const availH = H - 2 * pad;
  const total = stack.reduce((s, [, h]) => s + h, 0);
  const f = Math.min(1.25, availH / total);
  const axis = wide ? cx + gemZone / 2 : cx;
  const pos = {};
  let yCur = cy + (total * f) / 2;
  for (const [k, h] of stack) {
    pos[k] = yCur - (h * f) / 2;
    yCur -= h * f;
  }
  let gem = null;
  if (gemOn) {
    gem = wide
      ? new THREE.Vector2(bounds.minX + pad + gemZone / 2 - pad / 2, cy)
      : new THREE.Vector2(cx, pos.gem);
    if (gemCfg && typeof gemCfg === 'object' && gemCfg.offset) {
      gem.x += gemCfg.offset[0];
      gem.y += gemCfg.offset[1];
    }
  }
  return {
    axis,
    gem,
    gemScale: wide ? Math.min(1, (gemZone - pad) / 21) : f,
    rule: pos.rule != null ? { y: [pos.rule + 0.5 * f, pos.rule - 0.5 * f], half: 0.42 * W } : null,
    lines: lines.map((text, i) => ({ text, y: pos[`line${i}`] })),
    lineWidth: (wide ? W - gemZone : W) - 2 * pad,
    lineSize: t * f,
    divider: pos.divider ?? null,
    founded: pos.founded ?? null,
    year: pos.year ?? null,
    site: pos.site ?? null,
    dots: pos.dots,
    textScale: f,
    hatch: [],
  };
}

// ---------------------------------------------------------------- Геометрия

function extrudeShape(shape, height, b, bevelSegments) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(height - 2 * Math.max(b, 0), 0.0005),
    steps: 1,
    curveSegments: 1,
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelOffset: -b,
    bevelSegments,
  });
  geo.translate(0, 0, Math.max(b, 0));
  return geo;
}

function polygonArea(points) {
  let a = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    a += points[j].x * points[i].y - points[i].x * points[j].y;
  }
  return Math.abs(a / 2);
}

/** Площадь лицевой крышки ExtrudeGeometry (вторая половина группы 0). */
function lidArea(geo) {
  const pos = geo.attributes.position;
  let area = 0;
  for (const g of geo.groups) {
    if (g.materialIndex !== 0) continue;
    for (let k = g.start + g.count / 2; k < g.start + g.count; k += 3) {
      const ax = pos.getX(k);
      const ay = pos.getY(k);
      area += Math.abs((pos.getX(k + 1) - ax) * (pos.getY(k + 2) - ay) - (pos.getX(k + 2) - ax) * (pos.getY(k + 1) - ay)) / 2;
    }
  }
  return area;
}

/**
 * Выдавливание с фаской. Фаска three.js сдвигает вершины по биссектрисам и на острых
 * пиках выворачивает контур — тогда крышка «заливает» отверстия. Поэтому каждую фигуру
 * проверяем по площади и при сбое строим её без фаски.
 */
function extrude(paths, height, bevel = 0, bevelSegments = 3) {
  const b = Math.min(bevel, height / 2 - 0.0005);
  const geos = toShapes(paths).map((shape) => {
    let geo = extrudeShape(shape, height, b, bevelSegments);
    if (b > 0) {
      const expected = polygonArea(shape.getPoints()) - shape.holes.reduce((sum, h) => sum + polygonArea(h.getPoints()), 0);
      if (lidArea(geo) > expected * 1.01 + 0.01) {
        geo.dispose();
        geo = extrudeShape(shape, height, 0, 1);
      }
    }
    return geo;
  });
  if (geos.length === 1) return geos[0];
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}

/**
 * Купол из смолы: вертикальные стенки, скруглённый край и плоская вершина.
 * Нижнее скругление уходит внутрь подложки и не видно. Большая фаска чувствительна к
 * сверхкоротким сегментам (круги после смещений), поэтому контур чистится, а результат
 * проверяется по площади — при сбое купол строится с более грубым контуром или плоским.
 */
function dome(paths, height, edge = 1.0, rise = 0.75) {
  const make = (tolerance) => {
    const clean = C.Clipper.CleanPolygons(paths, tolerance * SCALE).filter((p) => p.length > 2);
    return toShapes(clean).map((shape) => {
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: height - rise,
        steps: 1,
        curveSegments: 1,
        bevelEnabled: true,
        bevelThickness: rise,
        bevelSize: edge,
        bevelOffset: -edge,
        bevelSegments: 7,
      });
      const expected = polygonArea(shape.getPoints()) - shape.holes.reduce((s, h) => s + polygonArea(h.getPoints()), 0);
      return { geo, ok: lidArea(geo) <= expected * 1.01 + 0.01 };
    });
  };
  for (const tolerance of [0.15, 0.5]) {
    const parts = make(tolerance);
    if (parts.every((p) => p.ok)) {
      return parts.length === 1 ? parts[0].geo : mergeGeometries(parts.map((p) => p.geo), false);
    }
    parts.forEach((p) => p.geo.dispose());
  }
  return extrude(paths, height, 0); // запасной вариант — плоская смола
}

/** Делит группу «крышек» ExtrudeGeometry на лицевую (0) и оборотную (2). */
function splitLids(geo, bounds) {
  const groups = geo.groups.slice();
  geo.clearGroups();
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  for (const g of groups) {
    if (g.materialIndex !== 0) {
      geo.addGroup(g.start, g.count, g.materialIndex);
      continue;
    }
    const half = g.count / 2;
    geo.addGroup(g.start, half, 2); // нижняя крышка = оборот
    geo.addGroup(g.start + half, half, 0);
    for (let i = g.start; i < g.start + half; i++) {
      // UV для оборота: изображение читается, когда смотрим сзади
      uv.setXY(i, (bounds.maxX - pos.getX(i)) / w, (pos.getY(i) - bounds.minY) / h);
    }
  }
  uv.needsUpdate = true;
}

/**
 * Плоская проекция UV на габарит box: фирменный градиент ложится на знак целиком
 * (как в брендбуке), а боковые стенки получают цвет своей точки знака.
 */
function planarUV(geo, box) {
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  const w = box.maxX - box.minX || 1;
  const h = box.maxY - box.minY || 1;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - box.minX) / w, (pos.getY(i) - box.minY) / h);
  uv.needsUpdate = true;
}

function createGem(materials, scale) {
  const group = new THREE.Group();
  const profile = [
    [0.0, -0.86],
    [0.42, -0.5],
    [1.0, -0.06],
    [1.0, 0.04],
    [0.84, 0.2],
    [0.58, 0.36],
    [0.0, 0.36],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const gem = new THREE.Mesh(new THREE.LatheGeometry(profile, 16), materials.gem);
  gem.name = 'gem';
  gem.rotation.x = -Math.PI / 2; // площадка камня смотрит назад (-Z)
  gem.scale.setScalar(3.4 * scale);
  gem.position.z = -0.7 * scale;

  const bezelProfile = [
    [1.0, 0.25],
    [1.3, 0.25],
    [1.32, -0.05],
    [1.22, -0.42],
    [1.04, -0.42],
    [0.98, -0.1],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const bezel = new THREE.Mesh(new THREE.LatheGeometry(bezelProfile, 64), materials.metal);
  bezel.name = 'bezel';
  bezel.rotation.x = -Math.PI / 2;
  bezel.scale.setScalar(3.4 * scale);
  bezel.position.z = -0.35 * scale;
  group.add(bezel, gem);
  return group;
}

/**
 * Строит объект эмблемы.
 * @returns {{ group: THREE.Group, layers: Array, outlines: object, backLayout: object }}
 */
export function buildEmblem({ form, style, logo }, materials) {
  const o = getOutlines(form, logo);
  const backLayout = getBackLayout(logo, o);
  const st = STYLES[style];
  const group = new THREE.Group();
  group.name = 'emblem';
  group.scale.setScalar(DIM.worldScale);

  // Подложка (+ кристалл на обороте)
  const baseGeo = extrude(o.silhouette, DIM.base, 0.38, 4);
  splitLids(baseGeo, o.bounds);
  baseGeo.translate(0, 0, -DIM.base);
  const base = new THREE.Mesh(baseGeo, [materials.metal, materials.metal, materials.back]);
  base.name = 'base';
  if (backLayout.gem) {
    const gem = createGem(materials, backLayout.gemScale);
    gem.position.set(backLayout.gem.x, backLayout.gem.y, -DIM.base);
    gem.name = 'gem-setting';
    base.add(gem);
  }

  // Поле
  const fieldPaths = st.fieldFull ? o.rimInner : o.field;
  const fieldGeo = extrude(fieldPaths, st.fieldH, st.fieldBevel, 2);
  if (style !== 'enamel') planarUV(fieldGeo, boundsOf(o.rimInner));
  const field = new THREE.Mesh(fieldGeo, style === 'enamel' ? materials.metal : materials.enamel);
  field.name = 'field';

  // Узор (печать поверх поля)
  const patternGeo = new THREE.ShapeGeometry(toShapes(fieldPaths), 1);
  patternGeo.translate(0, 0, st.fieldH + 0.02);
  const pattern = new THREE.Mesh(patternGeo, materials.pattern);
  pattern.name = 'pattern';

  // Второй цвет логотипа: чернение или матовый рельеф
  let accent = null;
  if (o.accent.length) {
    const h = style === 'enamel' ? st.inkH : st.inkH * 0.6;
    const accentGeo = extrude(o.accent, h, st.inkBevel * 0.6, 2);
    accentGeo.translate(0, 0, st.inkZ);
    accent = new THREE.Mesh(accentGeo, style === 'enamel' ? materials.niello : materials.metalMatte);
    accent.name = 'accent';
  }

  // Знак
  let ink = null;
  if (o.ink.length) {
    const inkGeo = extrude(o.ink, st.inkH, st.inkBevel, 3);
    inkGeo.translate(0, 0, st.inkZ);
    planarUV(inkGeo, boundsOf(o.ink));
    ink = new THREE.Mesh(inkGeo, style === 'enamel' ? materials.enamel : materials.metal);
    ink.name = 'ink';
  }

  // Смола
  const resin = new THREE.Mesh(dome(o.rimInner, DIM.resinHeight, 1.1, 0.72), materials.resin);
  resin.name = 'resin';
  resin.renderOrder = 2;

  // Контур
  const rim = new THREE.Mesh(extrude(o.rim, DIM.rimHeight, 0.42, 4), materials.metal);
  rim.name = 'rim';

  const A = o.anchors;
  const layers = [
    { id: 'base', object: base, z: -DIM.base * 0.5, ...A.outline },
    { id: 'field', object: field, z: st.fieldH, ...A.outline },
    { id: 'pattern', object: pattern, z: st.fieldH, ...A.outline },
    accent && { id: 'accent', object: accent, z: st.inkZ + st.inkH, ...A.accent },
    ink && { id: 'ink', object: ink, z: st.inkZ + st.inkH, ...A.ink },
    { id: 'resin', object: resin, z: DIM.resinHeight, ...A.outline },
    { id: 'rim', object: rim, z: DIM.rimHeight, ...A.outline },
  ].filter(Boolean);
  for (const l of layers) {
    l.anchor = new THREE.Vector3(l.top.x, l.top.y, l.z);
    group.add(l.object);
  }
  return { group, layers, outlines: o, backLayout };
}

export function disposeEmblem(emblem) {
  emblem.group.traverse((obj) => {
    if (obj.isMesh) obj.geometry.dispose();
  });
  emblem.group.removeFromParent();
}
