// Логотипы в интерфейсе: иконка школы (шапка, вкладка браузера) и миниатюры версий
// для нижней панели выбора. Миниатюры собираются из тех же SVG, что и 3D-эмблема:
// роль ink окрашивается фирменным градиентом, accent — цветом текста, paper — белым.

import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { BRAND } from './brand.config.js';

// Опорные точки фирменного градиента (сняты с картинки из брендбука по диагонали)
const STOPS = [
  [0, '#f74c2e'],
  [0.38, '#f24c32'],
  [0.62, '#b45376'],
  [0.82, '#615fdc'],
  [1, '#4d61f4'],
];

const roleOf = (color, colors) => colors[color.toLowerCase()] ?? colors.default ?? 'ink';

/** Габарит фигур с ролью ink в координатах SVG (трансформации учтены SVGLoader). */
function inkBox(svgText, colors) {
  const data = new SVGLoader().parse(svgText);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const path of data.paths) {
    const fill = path.userData?.style?.fill;
    if (!fill || !fill.startsWith('#') || roleOf(fill, colors) !== 'ink') continue;
    for (const sub of path.subPaths) {
      for (const p of sub.getPoints(4)) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
    }
  }
  return isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

const boxes = new Map();
let uid = 0;

/**
 * SVG версии логотипа для интерфейса.
 * paint: 'image' — настоящая картинка градиента из брендбука; 'linear' — линейное приближение
 * (для иконки вкладки: SVG в data:-ссылке не может подгружать внешние картинки).
 */
export function renderLogo(key, { paint = 'image' } = {}) {
  const cfg = BRAND.logos[key];
  if (!boxes.has(key)) boxes.set(key, inkBox(cfg.svg, cfg.colors));
  const box = boxes.get(key);
  const id = `abg${++uid}`;
  const f = (v) => +v.toFixed(3);

  let defs = '';
  if (box) {
    if (paint === 'image' && BRAND.gradient?.url) {
      defs = `<pattern id="${id}" patternUnits="userSpaceOnUse" x="${f(box.x)}" y="${f(box.y)}" width="${f(box.w)}" height="${f(box.h)}">`
        + `<image href="${BRAND.gradient.url}" width="${f(box.w)}" height="${f(box.h)}" preserveAspectRatio="none"/></pattern>`;
    } else {
      defs = `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(box.x)}" y1="${f(box.y)}" x2="${f(box.x + box.w)}" y2="${f(box.y + box.h)}">`
        + STOPS.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>';
    }
  }

  return cfg.svg
    .replace(/<svg([^>]*)>/, (_, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} aria-hidden="true" focusable="false"><defs>${defs}</defs>`)
    .replace(/fill="(#[0-9a-fA-F]{3,8})"/g, (_, color) => {
      const role = roleOf(color, cfg.colors);
      if (role === 'ink') return `fill="url(#${id})"`;
      if (role === 'accent') return 'fill="currentColor"';
      if (role === 'paper') return 'fill="#ffffff"';
      return 'fill="none"';
    });
}

/** Иконка вкладки браузера: круглая версия знака на градиенте, как на artbrodsky.ru. */
export function faviconHref() {
  const key = BRAND.icon ?? Object.keys(BRAND.logos)[0];
  return `data:image/svg+xml,${encodeURIComponent(renderLogo(key, { paint: 'linear' }))}`;
}

/** Нижняя панель выбора версии логотипа. */
export function createDock(root, onSelect) {
  root.innerHTML = '<span class="dock-title">Версии<br>логотипа</span>';
  const buttons = new Map();
  Object.entries(BRAND.logos).forEach(([key, cfg], i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dock-opt';
    b.title = `${cfg.label}${cfg.hint ? ` — ${cfg.hint}` : ''} (${i + 1})`;
    b.innerHTML = `<span class="dock-thumb">${renderLogo(key)}</span>`
      + `<span class="dock-text"><b>${cfg.label}</b>${cfg.hint ? `<small>${cfg.hint}</small>` : ''}</span>`;
    b.addEventListener('click', () => onSelect(key));
    root.appendChild(b);
    buttons.set(key, b);
  });
  return {
    update(current) {
      for (const [key, b] of buttons) {
        const on = key === current;
        b.classList.toggle('active', on);
        b.setAttribute('aria-pressed', String(on));
        if (on && root.scrollWidth > root.clientWidth) root.scrollTo({ left: b.offsetLeft - (root.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
      }
    },
  };
}
