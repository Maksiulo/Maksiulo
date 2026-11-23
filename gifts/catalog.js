/* Общий каталог Glint: используется и в браузере (window.GLINT), и на сервере (require). */
(function (root) {
  const C = {
    TIERS: [
      { key: 'common', name: 'Обычный', c: 'var(--c-common)', value: 90 },
      { key: 'rare', name: 'Редкий', c: 'var(--c-rare)', value: 260 },
      { key: 'epic', name: 'Эпик', c: 'var(--c-epic)', value: 720 },
      { key: 'legend', name: 'Легенда', c: 'var(--c-legend)', value: 2100 },
      { key: 'myth', name: 'Миф', c: 'var(--c-myth)', value: 6400 },
    ],
    MODELS: [
      { id: 'orb', name: 'Nova Orb' }, { id: 'prism', name: 'Prism' }, { id: 'heart', name: 'Lovebit' },
      { id: 'crown', name: 'Regalia' }, { id: 'moon', name: 'Lunetta' }, { id: 'box', name: 'Surprise' },
      { id: 'flame', name: 'Ember' }, { id: 'comet', name: 'Comet' },
    ],
    SKINS: [
      { n: 'Лаванда', c: ['#c9b6ff', '#6a4cff'], w: 22 }, { n: 'Мята', c: ['#a6fff0', '#00a88f'], w: 20 },
      { n: 'Коралл', c: ['#ffc1a8', '#ff4d6d'], w: 18 }, { n: 'Лёд', c: ['#e8f6ff', '#4aa3ff'], w: 16 },
      { n: 'Мёд', c: ['#fff0a8', '#ff9f1c'], w: 12 }, { n: 'Неон', c: ['#f3ff8a', '#18e07a'], w: 7 },
      { n: 'Оникс', c: ['#8a8aa3', '#16161f'], w: 3.5 }, { n: 'Хром', c: ['#ffffff', '#8c97b0'], w: 1.5 },
    ],
    BACKDROPS: [
      { n: 'Полночь', c: ['#2a2350', '#0b0a18'], w: 24 }, { n: 'Лагуна', c: ['#0f4d57', '#061a20'], w: 20 },
      { n: 'Закат', c: ['#6b2347', '#1a0a14'], w: 18 }, { n: 'Изумруд', c: ['#165a3d', '#07170f'], w: 16 },
      { n: 'Янтарь', c: ['#6a4511', '#1a1006'], w: 12 }, { n: 'Кобальт', c: ['#1f3f99', '#070f2a'], w: 7 },
      { n: 'Аврора', c: ['#5b2a9e', '#0c3a3a'], w: 3 },
    ],
    SYMBOLS: [
      { n: 'Искра', id: 'spark', w: 26 }, { n: 'Звезда', id: 'star', w: 22 }, { n: 'Точки', id: 'dot', w: 20 },
      { n: 'Ромб', id: 'gem', w: 16 }, { n: 'Сердце', id: 'heart', w: 10 }, { n: 'Корона', id: 'crown', w: 4 },
      { n: 'Глаз', id: 'eye', w: 2 },
    ],
    // Сбор Кузни за сплав трёх подарков уровня tier
    FORGE_FEE: [40, 90, 220, 600],
    MARKET_FEE: 0.05,
    REF_SHARE: 0.10,
    PASS_PRICE: 499,
    XP_PER_LEVEL: 120,
    // Пакеты пополнения: stars — сколько платит пользователь в Telegram Stars, bonus — сверху
    PACKS: [
      { id: 'p250', stars: 250, bonus: 0 },
      { id: 'p750', stars: 750, bonus: 0 },
      { id: 'p2000', stars: 2000, bonus: 150, tag: 'ХИТ' },
      { id: 'p6000', stars: 6000, bonus: 900, tag: '+15%' },
    ],
    // Награда за вход: день серии 1..7, на 7-й день — гарантированный Эпик
    checkinReward: day => (day >= 7 ? { gift: 2 } : { stars: 20 + day * 5 }),
    QUESTS: [
      { k: 'forge', ic: '🔥', t: 'Сплавь подарок в Кузне', n: 1, r: 60 },
      { k: 'send', ic: '💌', t: 'Подари подарок другу', n: 1, r: 40 },
      { k: 'buy', ic: '🛍️', t: 'Купи лот на маркете', n: 1, r: 40 },
      { k: 'mint', ic: '✨', t: 'Забери подарок из дропа', n: 1, r: 30 },
    ],
    // Награды пропуска: prem — только для премиум-трека
    PASS_REWARDS: Array.from({ length: 12 }, (_, i) => {
      const prem = i % 3 === 2;
      return i % 2 === 0 && !prem
        ? { lvl: i + 1, prem, stars: 40 + i * 20 }
        : { lvl: i + 1, prem, gift: { model: i % 8, tier: Math.min(4, Math.floor(i / 3) + (prem ? 1 : 0)) } };
    }),
    // Аркада: игры на бесплатных монетах. Монеты нельзя купить, вывести или обменять на звёзды и подарки.
    ARCADE: {
      START: 500, DAILY: 300, MIN_BET: 10, MAX_BET: 5000, XP_PER_GAME: 2, XP_DAY_CAP: 60,
      PLINKO_ROWS: 10,
      // Ожидаемый возврат ~99% (биномиальное распределение на 10 рядах)
      PLINKO: {
        low: [8.9, 3, 1.4, 1.1, 1, 0.5, 1, 1.1, 1.4, 3, 8.9],
        mid: [22, 5, 2, 1.4, 0.6, 0.4, 0.6, 1.4, 2, 5, 22],
        high: [76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76],
      },
      CHICKEN: { lanes: 10, edge: 0.97, risk: { easy: 0.88, mid: 0.76, hard: 0.6 } },
      // Колесо дня — бесплатно раз в сутки
      WHEEL: [
        { coins: 25, w: 22, c: '#3fa9ff' }, { coins: 50, w: 26, c: '#8b6cff' }, { coins: 100, w: 22, c: '#26e3c8' },
        { coins: 200, w: 14, c: '#ffb23f' }, { coins: 500, w: 6, c: '#ff4d8d' }, { coins: 1000, w: 2, c: '#ffffff' },
      ],
    },
    chickenMult: (k, p) => (k === 0 ? 1 : Math.floor((0.97 / Math.pow(p, k)) * 100) / 100),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C; else root.GLINT = C;
})(typeof window !== 'undefined' ? window : globalThis);
