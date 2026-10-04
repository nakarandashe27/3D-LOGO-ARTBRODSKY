// =====================================================================================
//  Конфиг бренда. Под новый логотип меняется только этот файл и SVG в src/assets/.
//  Онлайн-школа ÁРТ.БРÓДСКИЙ: шесть версий логотипа из брендбука «студенты» и с сайта
//  artbrodsky.ru. Фирменные цвета и шрифты — из брендбука (стр. 9–12).
// =====================================================================================

// Шрифты из брендбука: Unbounded — акцидентный (заголовки, гравировка), Inter Tight — текстовый
import '@fontsource-variable/unbounded';
import '@fontsource-variable/inter-tight';

// SVG логотипов (векторы из брендбука, см. README → «Логотип»)
import logoMark from './assets/logo-mark.svg?raw';
import logoRound from './assets/logo-round.svg?raw';
import logoTile from './assets/logo-tile.svg?raw';
import logoStacked from './assets/logo-stacked.svg?raw';
import logoWide from './assets/logo-wide.svg?raw';
import logoCenter from './assets/logo-center.svg?raw';

// Фирменный градиент из брендбука (#F74C2E → #4D61F4, растровая «сетка» с тёмными углами)
import gradientUrl from './assets/brand-gradient-1k.jpg';

export const BRAND = {
  // Короткое имя и подпись в шапке
  name: 'ÁРТ.БРÓДСКИЙ',
  tagline: 'онлайн·школа',
  // Заголовок панели и вкладки браузера
  title: '3D-эмблема',
  subtitle: 'Металл, градиентная эмаль и смола',
  description: 'Интерактивная 3D-эмблема онлайн-школы ÁРТ.БРÓДСКИЙ: знак «а» из металла, горячей эмали и эпоксидной смолы',
  // Префикс имён файлов при экспорте (PNG, GLB, видео)
  fileName: 'artbrodsky-emblem',
  site: 'https://artbrodsky.ru/',
  // версия логотипа для иконки вкладки и шапки (как иконка сайта — знак на градиентном круге)
  icon: 'round',

  fonts: { ui: 'Inter Tight Variable', display: 'Unbounded Variable', engraving: 'Unbounded Variable' },
  // Акцент интерфейса и фирменный градиент
  uiAccent: '#f74c2e',
  gradient: { url: gradientUrl, from: '#f74c2e', to: '#4d61f4' },

  // Палитра эмали. Первым — фирменный градиент; key попадает в ссылку (#enamel=...).
  //   map: true — эмаль окрашивается фирменным градиентом (картинка растягивается на знак)
  enamels: {
    gradient: {
      label: 'Градиент',
      short: 'фирменный градиент',
      color: '#ffffff',
      map: true,
      swatch: 'linear-gradient(135deg, #f74c2e 0%, #f24c32 38%, #b45376 62%, #615fdc 82%, #4d61f4 100%)',
    },
    red: { label: 'Красный', short: 'красная', color: '#f74c2e' },
    blue: { label: 'Синий', short: 'синяя', color: '#4d61f4' },
    black: { label: 'Чёрный', short: 'чёрная', color: '#161010' },
    white: { label: 'Белый', short: 'белая', color: '#f4f2ee' },
    coral: { label: 'Коралл', short: 'коралловая', color: '#ff8562' },
  },

  // Гравировка оборота (тексты с artbrodsky.ru)
  back: {
    lines: ['ОНЛАЙН·ШКОЛА', 'ÁРТ.БРÓДСКИЙ'],
    founded: 'ОБУЧАЕМ С',
    year: '2023',
    site: 'ARTBRODSKY.RU',
  },

  // Значения по умолчанию (что увидят при первом открытии)
  defaults: {
    form: 'silhouette',
    style: 'enamel',
    metal: 'silver',
    finish: 'polish',
    enamel: 'gradient',
    pattern: 'none',
    gem: 'sapphire',
    light: 'studio',
    theme: 'night',
  },

  // Версии логотипа. Цвета в SVG: #f74c2e — знак, #161010 — дескриптор, #ffffff — «бумага».
  //  colors     — роль цвета: ink — эмаль (в «Рельефе» — металл), accent — чернение,
  //               paper — прорезь до металла, ignore — пропустить.
  //  silhouette — из чего собрать форму «Силуэт» (по умолчанию — выпуклая оболочка).
  //  hint       — подпись под кнопкой версии в нижней панели.
  logos: {
    mark: {
      label: 'Знак',
      hint: 'без дескриптора',
      svg: logoMark,
      colors: { '#f74c2e': 'ink' },
    },
    round: {
      label: 'Круг',
      hint: 'иконка сайта',
      svg: logoRound,
      colors: { '#f74c2e': 'ink', '#ffffff': 'paper' },
      silhouette: [{ from: 'all', shape: 'circle' }],
    },
    tile: {
      label: 'Плитка',
      hint: 'аватар · соцсети',
      svg: logoTile,
      colors: { '#f74c2e': 'ink', '#ffffff': 'paper' },
    },
    stacked: {
      label: 'Подпись снизу',
      hint: 'с дескриптором',
      svg: logoStacked,
      colors: { '#f74c2e': 'ink', '#161010': 'accent' },
      accentLabel: 'Дескриптор',
      clean: 0.02,
      silhouette: [
        { from: 'ink', shape: 'hull' }, // знак
        { from: 'accent', shape: 'rect' }, // надпись
      ],
    },
    wide: {
      label: 'Подпись сбоку',
      hint: 'горизонтальный',
      svg: logoWide,
      colors: { '#f74c2e': 'ink', '#161010': 'accent' },
      accentLabel: 'Дескриптор',
      clean: 0.02,
      silhouette: [{ from: 'all', shape: 'rect' }],
    },
    center: {
      label: 'По центру',
      hint: 'надпись на знаке',
      svg: logoCenter,
      colors: { '#f74c2e': 'ink', '#ffffff': 'accent' },
      accentLabel: 'Дескриптор',
      clean: 0.02,
      silhouette: [{ from: 'all', shape: 'rect' }],
    },
  },
};
