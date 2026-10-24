import React from 'react';

/**
 * Remediation Asset Map & Theme Tokens
 *
 * Provides isolated, accessible icons, companion avatars, and color palettes
 * for children ages 6–8 with ADHD / executive function challenges.
 * Pure JavaScript using React.createElement for zero-dependency portability.
 */

export const COMPANIONS = {
  barnaby: {
    key: 'barnaby',
    name: 'Barnaby the Crab',
    emoji: '🦀',
    color: '#FF6B6B',
    accent: '#FFA6A6',
    cheerPhrase: 'Snappy work!',
    svg: (className = 'w-16 h-16') =>
      React.createElement(
        'svg',
        {
          className,
          viewBox: '0 0 100 80',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-label': 'Barnaby the Crab'
        },
        React.createElement('ellipse', { cx: '50', cy: '45', rx: '35', ry: '25', fill: '#FF7675' }),
        React.createElement('ellipse', { cx: '50', cy: '50', rx: '26', ry: '18', fill: '#FFA6A6' }),
        React.createElement('circle', { cx: '38', cy: '30', r: '10', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '40', cy: '30', r: '5', fill: '#2D3436' }),
        React.createElement('circle', { cx: '62', cy: '30', r: '10', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '60', cy: '30', r: '5', fill: '#2D3436' }),
        React.createElement('path', {
          d: 'M 44 48 Q 50 54 56 48',
          stroke: '#2D3436',
          strokeWidth: '2.5',
          strokeLinecap: 'round'
        }),
        React.createElement('path', { d: 'M 20 40 Q 10 25 20 15 Q 30 25 22 38', fill: '#FF7675' }),
        React.createElement('path', { d: 'M 80 40 Q 90 25 80 15 Q 70 25 78 38', fill: '#FF7675' })
      )
  },
  luna: {
    key: 'luna',
    name: 'Luna the Owl',
    emoji: '🦉',
    color: '#9B51E0',
    accent: '#CCA9EF',
    cheerPhrase: 'Hoot hoot, great job!',
    svg: (className = 'w-16 h-16') =>
      React.createElement(
        'svg',
        {
          className,
          viewBox: '0 0 100 80',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-label': 'Luna the Owl'
        },
        React.createElement('ellipse', { cx: '50', cy: '45', rx: '30', ry: '30', fill: '#A29BFE' }),
        React.createElement('ellipse', { cx: '50', cy: '52', rx: '22', ry: '20', fill: '#DFE6E9' }),
        React.createElement('circle', { cx: '38', cy: '38', r: '11', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '39', cy: '38', r: '6', fill: '#2D3436' }),
        React.createElement('circle', { cx: '62', cy: '38', r: '11', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '61', cy: '38', r: '6', fill: '#2D3436' }),
        React.createElement('polygon', { points: '50,44 46,50 54,50', fill: '#F39C12' })
      )
  },
  rex: {
    key: 'rex',
    name: 'Rex the Dino',
    emoji: '🦖',
    color: '#27AE60',
    accent: '#A8BE8F',
    cheerPhrase: 'Dino-mite step!',
    svg: (className = 'w-16 h-16') =>
      React.createElement(
        'svg',
        {
          className,
          viewBox: '0 0 100 80',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-label': 'Rex the Dino'
        },
        React.createElement('ellipse', { cx: '50', cy: '48', rx: '32', ry: '26', fill: '#2ECC71' }),
        React.createElement('ellipse', { cx: '45', cy: '52', rx: '22', ry: '18', fill: '#A8E6CF' }),
        React.createElement('circle', { cx: '65', cy: '36', r: '9', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '67', cy: '36', r: '5', fill: '#2D3436' }),
        React.createElement('path', {
          d: 'M 60 52 Q 68 56 74 50',
          stroke: '#2D3436',
          strokeWidth: '2.5',
          strokeLinecap: 'round'
        }),
        React.createElement('polygon', { points: '35,22 40,28 30,28', fill: '#F1C40F' }),
        React.createElement('polygon', { points: '45,20 50,26 40,26', fill: '#F1C40F' })
      )
  },
  pip: {
    key: 'pip',
    name: 'Pip the Otter',
    emoji: '🦦',
    color: '#3498DB',
    accent: '#AED6F1',
    cheerPhrase: 'Splash-tastic!',
    svg: (className = 'w-16 h-16') =>
      React.createElement(
        'svg',
        {
          className,
          viewBox: '0 0 100 80',
          fill: 'none',
          xmlns: 'http://www.w3.org/2000/svg',
          'aria-label': 'Pip the Otter'
        },
        React.createElement('ellipse', { cx: '50', cy: '45', rx: '30', ry: '28', fill: '#D35400' }),
        React.createElement('ellipse', { cx: '50', cy: '50', rx: '20', ry: '18', fill: '#FAD7A0' }),
        React.createElement('circle', { cx: '40', cy: '38', r: '8', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '40', cy: '38', r: '4', fill: '#2D3436' }),
        React.createElement('circle', { cx: '60', cy: '38', r: '8', fill: '#FFFFFF' }),
        React.createElement('circle', { cx: '60', cy: '38', r: '4', fill: '#2D3436' }),
        React.createElement('circle', { cx: '50', cy: '45', r: '4', fill: '#2D3436' })
      )
  }
};

export const THEMES = {
  dinosaurs: {
    key: 'dinosaurs',
    name: 'Dino Valley',
    accent: '#22c55e',
    accentLight: '#dcfce7',
    border: '#86efac',
    textColor: '#14532d',
    bgTint: '#f0fdf4',
    badgeBg: '#bbf7d0',
    primaryObject: 'dino_egg',
    secondaryObject: 'baby_dino'
  },
  space: {
    key: 'space',
    name: 'Cosmic Quest',
    accent: '#6366f1',
    accentLight: '#e0e7ff',
    border: '#a5b4fc',
    textColor: '#312e81',
    bgTint: '#eef2ff',
    badgeBg: '#c7d2fe',
    primaryObject: 'rocket',
    secondaryObject: 'star'
  },
  cars: {
    key: 'cars',
    name: 'Speedway Sprint',
    accent: '#f59e0b',
    accentLight: '#fef3c7',
    border: '#fcd34d',
    textColor: '#78350f',
    bgTint: '#fffbeb',
    badgeBg: '#fde68a',
    primaryObject: 'car',
    secondaryObject: 'wheel'
  },
  animals: {
    key: 'animals',
    name: 'Safari Friends',
    accent: '#0ea5e9',
    accentLight: '#e0f2fe',
    border: '#7dd3fc',
    textColor: '#0c4a6e',
    bgTint: '#f0f9ff',
    badgeBg: '#bae6fd',
    primaryObject: 'animal_paw',
    secondaryObject: 'zebra'
  },
  football: {
    key: 'football',
    name: 'Champion Pitch',
    accent: '#10b981',
    accentLight: '#d1fae5',
    border: '#6ee7b7',
    textColor: '#064e3b',
    bgTint: '#ecfdf5',
    badgeBg: '#a7f3d0',
    primaryObject: 'football',
    secondaryObject: 'trophy'
  },
  drawing: {
    key: 'drawing',
    name: 'Creative Studio',
    accent: '#ec4899',
    accentLight: '#fce7f3',
    border: '#f472b6',
    textColor: '#831843',
    bgTint: '#fdf2f8',
    badgeBg: '#fbcfe8',
    primaryObject: 'pencil',
    secondaryObject: 'palette'
  }
};

export const THEMED_OBJECTS = {
  dino_egg: {
    key: 'dino_egg',
    emoji: '🥚',
    label: 'Dino Egg',
    plural: 'Dino Eggs',
    color: '#86efac',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'dino egg' }, '🥚')
  },
  baby_dino: {
    key: 'baby_dino',
    emoji: '🦕',
    label: 'Baby Dino',
    plural: 'Baby Dinos',
    color: '#4ade80',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'baby dino' }, '🦕')
  },
  rocket: {
    key: 'rocket',
    emoji: '🚀',
    label: 'Rocket',
    plural: 'Rockets',
    color: '#818cf8',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'rocket' }, '🚀')
  },
  star: {
    key: 'star',
    emoji: '⭐',
    label: 'Star',
    plural: 'Stars',
    color: '#fbbf24',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'star' }, '⭐')
  },
  car: {
    key: 'car',
    emoji: '🚗',
    label: 'Race Car',
    plural: 'Race Cars',
    color: '#f59e0b',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'car' }, '🚗')
  },
  wheel: {
    key: 'wheel',
    emoji: '🛞',
    label: 'Wheel',
    plural: 'Wheels',
    color: '#9ca3af',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'wheel' }, '🛞')
  },
  animal_paw: {
    key: 'animal_paw',
    emoji: '🐾',
    label: 'Paw Print',
    plural: 'Paw Prints',
    color: '#0ea5e9',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'paw print' }, '🐾')
  },
  zebra: {
    key: 'zebra',
    emoji: '🦓',
    label: 'Zebra',
    plural: 'Zebras',
    color: '#38bdf8',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'zebra' }, '🦓')
  },
  football: {
    key: 'football',
    emoji: '⚽',
    label: 'Football',
    plural: 'Footballs',
    color: '#10b981',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'football' }, '⚽')
  },
  trophy: {
    key: 'trophy',
    emoji: '🏆',
    label: 'Golden Trophy',
    plural: 'Trophies',
    color: '#f59e0b',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'trophy' }, '🏆')
  },
  pencil: {
    key: 'pencil',
    emoji: '✏️',
    label: 'Crayon Pencil',
    plural: 'Pencils',
    color: '#ec4899',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'pencil' }, '✏️')
  },
  palette: {
    key: 'palette',
    emoji: '🎨',
    label: 'Color Palette',
    plural: 'Palettes',
    color: '#a855f7',
    render: (count = 1, size = '36px') =>
      React.createElement('span', { style: { fontSize: size }, role: 'img', 'aria-label': 'palette' }, '🎨')
  }
};

export function getCompanion(companionKeyOrObj) {
  if (!companionKeyOrObj) return COMPANIONS.barnaby;
  const key = typeof companionKeyOrObj === 'string' ? companionKeyOrObj : companionKeyOrObj.key;
  return COMPANIONS[key] || {
    key: key || 'companion',
    name: companionKeyOrObj.name || 'Friendly Helper',
    emoji: '⭐',
    color: '#6A9C78',
    accent: '#CCA9EF',
    cheerPhrase: 'Wonderful!',
    svg: COMPANIONS.barnaby.svg
  };
}

export function getTheme(themeKey) {
  return THEMES[themeKey] || THEMES.dinosaurs;
}

export function getThemedObject(objectKey) {
  return THEMED_OBJECTS[objectKey] || THEMED_OBJECTS.dino_egg;
}
