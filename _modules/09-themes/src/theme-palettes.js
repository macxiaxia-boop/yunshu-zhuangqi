// theme-palettes.js — 6 色 palette 完整定义（胭脂/藏青/松石绿/赭石/烟紫/藕荷）
// SSOT：与 REF 3.1.0 默认主题色 `themeColor: 'default'` (胭脂) 对齐
// 持久化：ys_cloud_light_skin_v1 存储 color key（red/navy/turquoise/ochre/purple/lilac）

'use strict';

(function (global, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = data;
  }
  if (global) {
    global.YS_THEMES = data.THEMES;
    global.YS_CHROME = data.CHROME;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  // 6 主色：取自中国传统色卡（胭脂红/藏青/松石绿/赭石/烟紫/藕荷）
  // 每个主题提供：name(中文)/primary(主色)/primaryLight(浅)/rgb(三元组)/accent(强调)/onAccent(强调上文)
  const THEMES = {
    red: {
      name: '胭脂',
      primary: '#A23C43',
      primaryLight: '#b56369',
      rgb: '162,60,67',
      accent: '#A23C43',
      onAccent: '#fff'
    },
    navy: {
      name: '藏青',
      primary: '#1f3a5f',
      primaryLight: '#456a8f',
      rgb: '31,58,95',
      accent: '#1f3a5f',
      onAccent: '#fff'
    },
    turquoise: {
      name: '松石绿',
      primary: '#0d7a73',
      primaryLight: '#3a9a93',
      rgb: '13,122,115',
      accent: '#0d7a73',
      onAccent: '#fff'
    },
    ochre: {
      name: '赭石',
      primary: '#9c5c2a',
      primaryLight: '#b07a4d',
      rgb: '156,92,42',
      accent: '#9c5c2a',
      onAccent: '#fff'
    },
    purple: {
      name: '烟紫',
      primary: '#5b3a6a',
      primaryLight: '#7a5d87',
      rgb: '91,58,106',
      accent: '#5b3a6a',
      onAccent: '#fff'
    },
    lilac: {
      name: '藕荷',
      primary: '#8a6b8e',
      primaryLight: '#a78eaa',
      rgb: '138,107,142',
      accent: '#8a6b8e',
      onAccent: '#fff'
    }
  };

  // 浅/深两套 chrome（背景/卡片/文字/次级文字/分隔线/滚动条）
  // 持久化：ys_studio_ui_v31_color_mode = light | dark
  const CHROME = {
    light: {
      bg: '#fafafa',
      chrome: '#ffffff',
      ink: '#1a1a1a',
      muted: '#666666',
      line: '#e8e6e1',
      scrollbar: 'rgba(0,0,0,0.15)'
    },
    dark: {
      bg: '#1a1f1c',
      chrome: '#262b28',
      ink: '#f0f0f0',
      muted: '#999999',
      line: '#3a3f3c',
      scrollbar: 'rgba(255,255,255,0.15)'
    }
  };

  // 3 档密度（compact / standard / loose）
  // 持久化：ys_studio_ui_v31_density
  const DENSITY = {
    compact:  { padding: '4px',  font: '12px', rowHeight: 24 },
    standard: { padding: '8px',  font: '13px', rowHeight: 32 },
    loose:    { padding: '12px', font: '14px', rowHeight: 40 }
  };

  // 玻璃效果单独维度（on/off）— 不计入 36 组合
  const GLASS = {
    enabled: { opacity: 0.75, blur: 12 },
    disabled: { opacity: 1.0,  blur: 0 }
  };

  return { THEMES, CHROME, DENSITY, GLASS };
});
