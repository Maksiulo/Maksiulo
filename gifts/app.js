/* Glint — коллекционные подарки. Прототип Telegram Mini App.
   Демо-режим: баланс, коллекция и маркет хранятся локально.
   В проде: оплата — Telegram Stars (sendInvoice / openInvoice), минт и вывод NFT — блокчейн TON. */
(() => {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const wpick = arr => { let t = arr.reduce((s, x) => s + x.w, 0), r = Math.random() * t; for (const x of arr) { if ((r -= x.w) <= 0) return x; } return arr[0]; };
  const haptic = (t = 'light') => { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(t); } catch (e) {} };
  const notify = t => { try { tg && tg.HapticFeedback && tg.HapticFeedback.notificationOccurred(t); } catch (e) {} };

  /* ---------------- каталог ---------------- */
  const TIERS = [
    { key: 'common', name: 'Обычный', c: 'var(--c-common)' },
    { key: 'rare', name: 'Редкий', c: 'var(--c-rare)' },
    { key: 'epic', name: 'Эпик', c: 'var(--c-epic)' },
    { key: 'legend', name: 'Легенда', c: 'var(--c-legend)' },
    { key: 'myth', name: 'Миф', c: 'var(--c-myth)' },
  ];
  const MODELS = [
    { id: 'orb', name: 'Nova Orb' }, { id: 'prism', name: 'Prism' }, { id: 'heart', name: 'Lovebit' },
    { id: 'crown', name: 'Regalia' }, { id: 'moon', name: 'Lunetta' }, { id: 'box', name: 'Surprise' },
    { id: 'flame', name: 'Ember' }, { id: 'comet', name: 'Comet' },
  ];
  const SKINS = [ // цвет модели: [светлый, тёмный], вес = редкость признака
    { n: 'Лаванда', c: ['#c9b6ff', '#6a4cff'], w: 22 }, { n: 'Мята', c: ['#a6fff0', '#00a88f'], w: 20 },
    { n: 'Коралл', c: ['#ffc1a8', '#ff4d6d'], w: 18 }, { n: 'Лёд', c: ['#e8f6ff', '#4aa3ff'], w: 16 },
    { n: 'Мёд', c: ['#fff0a8', '#ff9f1c'], w: 12 }, { n: 'Неон', c: ['#f3ff8a', '#18e07a'], w: 7 },
    { n: 'Оникс', c: ['#8a8aa3', '#16161f'], w: 3.5 }, { n: 'Хром', c: ['#ffffff', '#8c97b0'], w: 1.5 },
  ];
  const BACKDROPS = [
    { n: 'Полночь', c: ['#2a2350', '#0b0a18'], w: 24 }, { n: 'Лагуна', c: ['#0f4d57', '#061a20'], w: 20 },
    { n: 'Закат', c: ['#6b2347', '#1a0a14'], w: 18 }, { n: 'Изумруд', c: ['#165a3d', '#07170f'], w: 16 },
    { n: 'Янтарь', c: ['#6a4511', '#1a1006'], w: 12 }, { n: 'Кобальт', c: ['#1f3f99', '#070f2a'], w: 7 },
    { n: 'Аврора', c: ['#5b2a9e', '#0c3a3a'], w: 3 },
  ];
  const SYMBOLS = [
    { n: 'Искра', id: 'spark', w: 26 }, { n: 'Звезда', id: 'star', w: 22 }, { n: 'Точки', id: 'dot', w: 20 },
    { n: 'Ромб', id: 'gem', w: 16 }, { n: 'Сердце', id: 'heart', w: 10 }, { n: 'Корона', id: 'crown', w: 4 },
    { n: 'Глаз', id: 'eye', w: 2 },
  ];
  const pct = (arr, x) => (x.w / arr.reduce((s, y) => s + y.w, 0) * 100).toFixed(1).replace('.0', '') + '%';

  /* ---------------- SVG-арт ---------------- */
  let uid = 0;
  const SYM_PATH = {
    spark: 'M0-8C1-2 2-1 8 0 2 1 1 2 0 8-1 2-2 1-8 0-2-1-1-2 0-8z',
    star: 'M0-7 2 -2 7-2 3 1 4.5 6.5 0 3.5-4.5 6.5-3 1-7-2-2-2z',
    dot: 'M0-4a4 4 0 1 1 0 8a4 4 0 1 1 0-8zM0-8a8 8 0 1 0 0 16a8 8 0 1 0 0-16zm0 2a6 6 0 1 1 0 12a6 6 0 1 1 0-12z',
    gem: 'M0-8 6 0 0 8-6 0z',
    heart: 'M0 6C-8 0-6-6-3-6-1.5-6 0-4.5 0-3.5 0-4.5 1.5-6 3-6 6-6 8 0 0 6z',
    crown: 'M-7 5-8-5-3-1 0-7 3-1 8-5 7 5z',
    eye: 'M-8 0C-4-6 4-6 8 0 4 6-4 6-8 0zM0-3a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  };
  function backdropSVG(g) {
    const bd = BACKDROPS[g.bd], sym = SYMBOLS[g.sym], id = 'b' + (++uid);
    const pts = [[30, 34], [170, 30], [100, 18], [22, 110], [178, 112], [40, 176], [160, 172], [100, 186], [62, 66], [140, 70], [60, 140], [142, 142]];
    const glyphs = pts.map(([x, y], i) => `<path d="${SYM_PATH[sym.id]}" transform="translate(${x} ${y}) scale(${i > 7 ? .7 : 1}) rotate(${(i * 37) % 360})"/>`).join('');
    return `<svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%">
      <defs><radialGradient id="${id}" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="${bd.c[0]}"/><stop offset="1" stop-color="${bd.c[1]}"/></radialGradient></defs>
      <rect width="200" height="200" fill="url(#${id})"/>
      <g fill="${SKINS[g.skin].c[0]}" opacity="${.1 + g.tier * .04}">${glyphs}</g></svg>`;
  }
  function giftSVG(g) {
    const [a, b] = SKINS[g.skin].c, id = 'g' + (++uid);
    const defs = `<defs>
      <linearGradient id="${id}l" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
      <radialGradient id="${id}r" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".25" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></radialGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>`;
    const L = `url(#${id}l)`, R = `url(#${id}r)`, S = `url(#${id}s)`;
    const shapes = {
      orb: `<circle cx="100" cy="104" r="66" fill="${R}"/><ellipse cx="100" cy="104" rx="88" ry="20" fill="none" stroke="${a}" stroke-width="5" opacity=".8" transform="rotate(-18 100 104)"/><ellipse cx="80" cy="74" rx="26" ry="16" fill="${S}" transform="rotate(-30 80 74)"/><circle cx="132" cy="128" r="6" fill="#fff" opacity=".5"/>`,
      prism: `<path d="M100 30 152 72 100 172 48 72z" fill="${L}"/><path d="M100 30 124 72 100 172 76 72z" fill="#fff" opacity=".18"/><path d="M48 72h104" stroke="#fff" stroke-opacity=".5" stroke-width="2"/><path d="M100 30 76 72 48 72z" fill="#fff" opacity=".45"/><path d="M152 72 100 172 124 72z" fill="#000" opacity=".2"/>`,
      heart: `<path d="M100 170C34 124 30 84 48 62c18-22 44-16 52 4 8-20 34-26 52-4 18 22 14 62-52 108z" fill="${R}"/><ellipse cx="70" cy="78" rx="16" ry="10" fill="${S}" transform="rotate(-40 70 78)"/>`,
      crown: `<path d="M40 140 32 68l40 30 28-46 28 46 40-30-8 72z" fill="${L}"/><rect x="40" y="140" width="120" height="20" rx="6" fill="${b}"/><circle cx="32" cy="66" r="9" fill="${R}"/><circle cx="100" cy="50" r="10" fill="${R}"/><circle cx="168" cy="66" r="9" fill="${R}"/><path d="M60 128h80" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/><path d="M92 118l8-12 8 12-8 12z" fill="#fff" opacity=".85"/>`,
      moon: `<path d="M132 40a70 70 0 1 0 28 110A58 58 0 1 1 132 40z" fill="${R}"/><circle cx="148" cy="62" r="5" fill="#fff" opacity=".8"/><circle cx="160" cy="92" r="3" fill="#fff" opacity=".6"/><path d="M72 66c-10 14-12 30-6 46" stroke="#fff" stroke-opacity=".55" stroke-width="6" stroke-linecap="round" fill="none"/>`,
      box: `<rect x="44" y="82" width="112" height="84" rx="12" fill="${L}"/><rect x="36" y="64" width="128" height="28" rx="10" fill="${R}"/><rect x="92" y="64" width="16" height="102" fill="#fff" opacity=".85"/><path d="M100 64C82 34 56 40 64 56c4 8 22 10 36 8zM100 64c18-30 44-24 36-8-4 8-22 10-36 8z" fill="#fff" opacity=".9"/><rect x="44" y="92" width="112" height="8" fill="#000" opacity=".18"/>`,
      flame: `<path d="M100 26c12 30 50 46 50 92a50 50 0 0 1-100 0c0-26 16-40 26-52 2 18 10 28 22 32-6-24-6-48 2-72z" fill="${R}"/><path d="M100 104c8 12 24 20 24 40a24 24 0 0 1-48 0c0-12 8-20 14-26 2 8 6 12 10 14z" fill="#fff" opacity=".7"/>`,
      comet: `<path d="M30 40 128 96 118 120z" fill="${a}" opacity=".35"/><path d="M48 32 132 92 124 104z" fill="${a}" opacity=".55"/><circle cx="132" cy="118" r="42" fill="${R}"/><ellipse cx="118" cy="102" rx="14" ry="9" fill="${S}" transform="rotate(-35 118 102)"/>`,
    };
    const glow = g.tier >= 3 ? `<circle cx="100" cy="104" r="80" fill="${a}" opacity=".22" filter="blur(14px)"/>` : '';
    return `<svg class="gift" viewBox="0 0 200 200" aria-hidden="true">${defs}${glow}${shapes[MODELS[g.model].id]}</svg>`;
  }
  const art = g => backdropSVG(g) + giftSVG(g);

  /* ---------------- состояние ---------------- */
  const KEY = 'glint.v1';
  let serial = 1000;
  function mint(model, tier) {
    return {
      id: Math.random().toString(36).slice(2, 9), model, tier,
      skin: SKINS.indexOf(wpick(SKINS)), bd: BACKDROPS.indexOf(wpick(BACKDROPS)), sym: SYMBOLS.indexOf(wpick(SYMBOLS)),
      num: ++serial + Math.floor(rnd(0, 4000)),
    };
  }
  const fresh = () => ({
    balance: 1500, xp: 340, pass: false, streak: 4, checked: false, forged: 0, sent: 0, bought: 0, claimed: {},
    items: [mint(0, 0), mint(2, 0), mint(4, 0), mint(1, 0), mint(5, 1), mint(6, 2)],
    dropLeft: 3752,
  });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };

  const market = Array.from({ length: 14 }, () => {
    const g = mint(Math.floor(rnd(0, MODELS.length)), wpick([{ v: 0, w: 40 }, { v: 1, w: 30 }, { v: 2, w: 18 }, { v: 3, w: 9 }, { v: 4, w: 3 }]).v);
    g.price = Math.round([90, 260, 720, 2100, 6400][g.tier] * rnd(.75, 1.4) * (SKINS[g.skin].w < 5 ? 2.2 : 1));
    g.chg = rnd(-14, 26);
    return g;
  });

  /* ---------------- ui helpers ---------------- */
  const view = $('#view');
  function setBalance(delta) {
    if (delta) { S.balance += delta; const w = $('#wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }
    $('#balance').textContent = fmt(S.balance);
    $('#meLvl').textContent = level();
    save();
  }
  const level = () => Math.min(30, 1 + Math.floor(S.xp / 120));
  const addXP = n => { S.xp += n; save(); };
  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200); }
  function spend(n) { if (S.balance < n) { toast('Не хватает звёзд — пополни баланс'); notify('error'); openTopUp(); return false; } setBalance(-n); return true; }

  function card(g, extra = '') {
    const t = TIERS[g.tier];
    return `<button class="card ${extra}" data-id="${g.id}" data-r="${t.key}" style="--rc:${t.c}">
      <div class="card__art">${art(g)}<div class="card__holo"></div></div>
      <div class="card__info"><div class="card__name">${MODELS[g.model].name}</div>
      <div class="card__row"><span class="rar">${t.name}</span><span class="card__num">#${g.num}</span></div></div></button>`;
  }
  function tilt(root) {
    root.querySelectorAll('.card').forEach(el => {
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(600px) rotateY(${(x - .5) * 14}deg) rotateX(${(.5 - y) * 14}deg)`;
        el.style.setProperty('--hx', x * 100 + '%'); el.style.setProperty('--hy', y * 100 + '%');
      });
      el.addEventListener('pointerleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------------- экраны ---------------- */
  let dropEnd = Date.now() + (5 * 3600 + 42 * 60 + 18) * 1000;
  const DROP = { model: 0, tier: 1, price: 250, supply: 5000 };

  function quests() {
    return [
      { k: 'check', ic: '☀️', t: 'Ежедневный вход', p: S.checked ? 1 : 0, n: 1, r: 50 },
      { k: 'forge', ic: '🔥', t: 'Сплавь подарок в Кузне', p: Math.min(S.forged, 1), n: 1, r: 120 },
      { k: 'send', ic: '💌', t: 'Подари подарок другу', p: Math.min(S.sent, 1), n: 1, r: 80 },
      { k: 'buy', ic: '🛍️', t: 'Купи 2 лота на маркете', p: Math.min(S.bought, 2), n: 2, r: 150 },
    ];
  }

  const screens = {
    home() {
      const left = S.dropLeft, drop = { ...mint(DROP.model, DROP.tier), skin: 0, bd: 6, sym: 1 };
      const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
      return `
      <section class="hero glass">
        <span class="hero__live">LIVE ДРОП</span>
        <h1 class="h1" style="margin-top:12px">Nova Orb<br/>Genesis</h1>
        <p class="sub">Первая коллекция сезона. После sold out — только на маркете.</p>
        <div class="hero__stage"><div class="hero__ring"></div>${giftSVG(drop)}</div>
        <div class="hero__meta">
          <div class="stat"><small>Цена</small><b><span class="star">★</span> ${DROP.price}</b></div>
          <div class="stat"><small>Осталось</small><b id="left">${fmt(left)}</b></div>
          <div class="stat"><small>Финиш</small><b id="cd">--:--:--</b></div>
        </div>
        <div class="supply"><i style="width:${(1 - left / DROP.supply) * 100}%"></i></div>
        <button class="btn btn--primary btn--block" id="mintBtn">Забрать за ★ ${DROP.price}</button>
      </section>

      <section class="section bento">
        <div class="tile tile--wide glass">
          <h3>Серия входов · ${S.streak + (S.checked ? 1 : 0)} дн.</h3>
          <p>7 дней подряд — гарантированный Эпик-подарок</p>
          <div class="streak">${days.map((d, i) => {
            const done = i < S.streak || (i === S.streak && S.checked), today = i === S.streak && !S.checked;
            return `<div class="streak__d ${done ? 'done' : ''} ${today ? 'today' : ''}">${d}<b>${i === 6 ? '🎁' : done ? '✓' : '+' + (25 + i * 5)}</b></div>`;
          }).join('')}</div>
        </div>
        <div class="tile glass"><h3>Коллекция</h3><p>подарков в сейфе</p><div class="tile__big">${S.items.length}</div></div>
        <div class="tile glass"><h3>Оценка</h3><p>по ценам маркета</p><div class="tile__big"><span class="star">★</span>${fmt(S.items.reduce((s, g) => s + [90, 260, 720, 2100, 6400][g.tier], 0))}</div></div>
      </section>

      <section class="section">
        <div class="section__head"><h2>Задания дня</h2><span>обнов. в 00:00</span></div>
        ${quests().map(q => {
          const done = q.p >= q.n, got = S.claimed[q.k];
          return `<div class="quest glass"><div class="quest__ic">${q.ic}</div>
          <div class="quest__t"><b>${q.t}</b><div class="quest__bar"><i style="width:${q.p / q.n * 100}%"></i></div></div>
          <button class="quest__r ${got ? 'got' : done ? 'claim' : ''}" data-q="${q.k}" data-r="${q.r}">${got ? 'Получено' : '★ ' + q.r}</button></div>`;
        }).join('')}
      </section>`;
    },

    vault() {
      const f = screens._vf || 'all';
      const list = S.items.filter(g => f === 'all' || TIERS[g.tier].key === f).sort((a, b) => b.tier - a.tier);
      return `
      <p class="eyebrow">Сейф</p><h1 class="h1">Моя коллекция</h1>
      <p class="sub" style="margin-bottom:16px">${S.items.length} подарков · можно подарить, продать или вывести в TON-кошелёк</p>
      <div class="chips">${[['all', 'Все'], ...TIERS.map(t => [t.key, t.name])].map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-vf="${k}">${n}</button>`).join('')}</div>
      ${list.length ? `<div class="grid">${list.map(g => card(g)).join('')}</div>` : '<div class="empty">Здесь пока пусто — загляни в Дроп или на Маркет</div>'}`;
    },

    forge() {
      const sel = screens._fsel || [];
      const items = sel.map(id => S.items.find(g => g.id === id)).filter(Boolean);
      const tier = items[0] ? items[0].tier : null;
      const next = tier !== null ? TIERS[Math.min(tier + 1, 4)] : null;
      const pool = S.items.filter(g => g.tier < 4).sort((a, b) => a.tier - b.tier);
      const fee = tier !== null ? [40, 90, 220, 600][tier] : 0;
      return `
      <section class="forge glass" id="forgeBox">
        <p class="eyebrow">Кузня</p><h1 class="h1">3 → 1</h1>
        <p class="sub">Сплавь три подарка одной редкости — получишь подарок <b>гарантированно</b> на уровень выше. Признаки — случайные.</p>
        <div class="forge__core">${next ? `<div class="forge__q" style="color:${next.c};-webkit-text-fill-color:currentColor">?</div>` : '<div class="forge__q">?</div>'}</div>
        <div class="slots">${[0, 1, 2].map(i => items[i] ? `<div class="slot full" style="background:none">${art(items[i]).replace('position:absolute', 'position:absolute;border-radius:18px')}</div>` : '<div class="slot">+</div>').join('')}</div>
        <div class="odds"><span>Результат: <b style="color:${next ? next.c : 'inherit'}">${next ? next.name : '—'}</b></span><span>Сбор: <b>★ ${fee || '—'}</b></span></div>
        <button class="btn btn--primary btn--block" id="forgeBtn" ${items.length === 3 ? '' : 'disabled'}>${items.length === 3 ? 'Сплавить' : `Выбери ещё ${3 - items.length}`}</button>
      </section>
      <section class="section">
        <div class="section__head"><h2>Выбери подарки</h2><span>${sel.length}/3</span></div>
        ${pool.length ? `<div class="grid">${pool.map(g => card(g, sel.includes(g.id) ? 'sel' : (tier !== null && g.tier !== tier) || (sel.length === 3) ? 'dim' : '')).join('')}</div>` : '<div class="empty">Нет подарков для сплава</div>'}
      </section>`;
    },

    market() {
      const f = screens._mf || 'hot';
      const list = [...market].sort((a, b) => f === 'cheap' ? a.price - b.price : f === 'rare' ? b.tier - a.tier || b.price - a.price : b.chg - a.chg);
      const tick = [...market, ...market].map(g => `<div class="tk glass">${giftSVG(g)}${MODELS[g.model].name}<span class="${g.chg > 0 ? 'up' : 'down'}">${g.chg > 0 ? '+' : ''}${g.chg.toFixed(1)}%</span></div>`).join('');
      return `
      <p class="eyebrow">Маркет · комиссия 5%</p><h1 class="h1">Торговая площадь</h1>
      <p class="sub" style="margin-bottom:16px">Объём за 24ч: <b style="color:var(--ink)">★ 1 284 300</b></p>
      <div class="ticker"><div class="ticker__in">${tick}</div></div>
      <div class="chips">${[['hot', '🔥 В тренде'], ['cheap', 'Дешевле'], ['rare', 'Редкие']].map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-mf="${k}">${n}</button>`).join('')}</div>
      ${list.map(g => { const t = TIERS[g.tier]; return `
        <div class="lot glass" data-lot="${g.id}">
          <div class="lot__art" style="position:relative">${art(g)}</div>
          <div class="lot__t"><b>${MODELS[g.model].name} #${g.num}</b><small><span class="rar" style="--rc:${t.c};color:${t.c}">${t.name}</span> · ${SKINS[g.skin].n}</small></div>
          <div class="lot__buy"><button class="btn btn--ghost" data-buy="${g.id}">★ ${fmt(g.price)}</button><span class="lot__chg ${g.chg > 0 ? 'up' : 'down'}">${g.chg > 0 ? '▲' : '▼'} ${Math.abs(g.chg).toFixed(1)}%</span></div>
        </div>`; }).join('') || '<div class="empty">Всё раскупили</div>'}`;
    },

    pass() {
      const lv = level(), into = S.xp % 120;
      const rewards = Array.from({ length: 12 }, (_, i) => {
        const prem = i % 3 === 2, g = { model: i % MODELS.length, tier: Math.min(4, Math.floor(i / 3) + (prem ? 1 : 0)), skin: i % SKINS.length, bd: i % BACKDROPS.length, sym: i % SYMBOLS.length };
        return { i: i + 1, prem, g, star: i % 2 === 0 ? 50 + i * 25 : 0 };
      });
      return `
      <section class="pass glass">
        <p class="eyebrow">Сезон 1 · «Genesis» · ещё 23 дня</p>
        <h1 class="h1">Glint Pass</h1>
        <p class="sub">Выполняй задания, копи опыт и забирай награды. Премиум-трек — эксклюзивные подарки, которых не будет в продаже.</p>
        <div class="xp"><i style="width:${into / 120 * 100}%"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--mute)"><span>Уровень ${lv}</span><span>${into}/120 XP</span></div>
        <button class="btn ${S.pass ? 'btn--ghost' : 'btn--primary'} btn--block" id="passBtn" style="margin-top:16px">${S.pass ? '✓ Премиум активен' : 'Открыть премиум · ★ 499'}</button>
      </section>
      <section class="section">
        <div class="section__head"><h2>Награды</h2><span>листай →</span></div>
        <div class="track">${rewards.map(r => {
          const t = TIERS[r.g.tier], open = r.i <= lv && (!r.prem || S.pass);
          return `<div class="lvl glass ${open ? 'got' : 'lock'} ${r.prem ? 'premium' : ''}"><div class="lvl__n">${r.prem ? 'PREMIUM · ' : ''}${r.i}</div>
            <div class="lvl__art">${r.star ? `<div class="tile__big" style="margin:0;font-size:22px"><span class="star">★</span>${r.star}</div>` : giftSVG(r.g)}</div>
            <div class="lvl__r" style="${r.star ? '' : 'color:' + t.c}">${open ? 'Получено' : r.star ? 'Звёзды' : t.name}</div></div>`;
        }).join('')}</div>
      </section>
      <section class="section">
        <div class="section__head"><h2>Пригласи друзей</h2></div>
        <div class="tile glass" style="display:flex;align-items:center;gap:14px">
          <div style="font-size:34px">🤝</div>
          <div style="flex:1"><h3>+10% от их покупок</h3><p>Навсегда, в звёздах. Друг получает Обычный подарок в подарок.</p></div>
        </div>
        <button class="btn btn--ghost btn--block" id="refBtn" style="margin-top:10px">Скопировать ссылку</button>
      </section>`;
    },
  };

  /* ---------------- навигация ---------------- */
  let tab = 'home', cdTimer;
  function render(t = tab, keepScroll) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    view.innerHTML = screens[t]();
    if (!keepScroll) { view.style.animation = 'none'; void view.offsetWidth; view.style.animation = ''; window.scrollTo({ top: 0 }); }
    tilt(view);
    clearInterval(cdTimer);
    if (t === 'home') { const tickCd = () => { const s = Math.max(0, (dropEnd - Date.now()) / 1000 | 0), el = $('#cd'); if (el) el.textContent = [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); }; tickCd(); cdTimer = setInterval(tickCd, 1000); }
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { haptic(); render(b.dataset.tab); } });

  /* ---------------- действия ---------------- */
  view.addEventListener('click', e => {
    const el = e.target;
    if (el.closest('#mintBtn')) return doMint();
    const q = el.closest('[data-q]'); if (q) return claimQuest(q.dataset.q, +q.dataset.r);
    const vf = el.closest('[data-vf]'); if (vf) { screens._vf = vf.dataset.vf; haptic(); return render('vault', true); }
    const mf = el.closest('[data-mf]'); if (mf) { screens._mf = mf.dataset.mf; haptic(); return render('market', true); }
    const buy = el.closest('[data-buy]'); if (buy) return doBuy(buy.dataset.buy);
    if (el.closest('#forgeBtn')) return doForge();
    if (el.closest('#passBtn')) { if (!S.pass && spend(499)) { S.pass = true; notify('success'); toast('Glint Pass активирован ✨'); save(); render('pass', true); } return; }
    if (el.closest('#refBtn')) { const link = 'https://t.me/GlintGiftsBot?start=ref_' + (tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? tg.initDataUnsafe.user.id : 'demo'); try { navigator.clipboard.writeText(link); } catch (err) {} return toast('Ссылка скопирована'); }
    const c = el.closest('.card');
    if (c) {
      if (tab === 'forge') return toggleForge(c.dataset.id);
      const g = S.items.find(x => x.id === c.dataset.id); if (g) openDetail(g);
    }
  });

  function doMint() {
    if (S.dropLeft <= 0) return toast('Sold out — ищи на маркете');
    if (!spend(DROP.price)) return;
    const g = mint(DROP.model, DROP.tier); S.items.push(g); S.dropLeft--; addXP(40); save();
    reveal(g, 'Твой новый подарок');
  }
  function claimQuest(k, r) {
    if (S.claimed[k]) return;
    const q = quests().find(x => x.k === k);
    if (k === 'check' && !S.checked) { S.checked = true; save(); }
    else if (q.p < q.n) { const go = { forge: 'forge', send: 'vault', buy: 'market' }[k]; toast('Сначала выполни задание'); return go && setTimeout(() => render(go), 500); }
    S.claimed[k] = true; addXP(60); notify('success'); setBalance(r); toast(`+${r} ★ и +60 XP`); render('home', true);
  }
  function doBuy(id) {
    const i = market.findIndex(g => g.id === id); if (i < 0) return;
    const g = market[i]; if (!spend(g.price)) return;
    market.splice(i, 1); delete g.price; delete g.chg; S.items.push(g); S.bought++; addXP(30); save();
    reveal(g, 'Покупка в сейфе'); render('market', true);
  }
  function toggleForge(id) {
    const sel = screens._fsel = screens._fsel || [];
    const at = sel.indexOf(id); at >= 0 ? sel.splice(at, 1) : sel.length < 3 && sel.push(id);
    haptic(); render('forge', true);
  }
  function doForge() {
    const sel = screens._fsel || []; if (sel.length !== 3) return;
    const items = sel.map(id => S.items.find(g => g.id === id)), tier = items[0].tier, fee = [40, 90, 220, 600][tier];
    if (!spend(fee)) return;
    const box = $('#forgeBox'); box.classList.add('burn'); haptic('heavy');
    let n = 0; const hb = setInterval(() => { haptic(n++ % 2 ? 'light' : 'medium'); }, 140);
    setTimeout(() => {
      clearInterval(hb);
      S.items = S.items.filter(g => !sel.includes(g.id));
      const g = mint(Math.floor(rnd(0, MODELS.length)), tier + 1); S.items.push(g);
      S.forged++; addXP(80); screens._fsel = []; save();
      reveal(g, 'Сплав завершён'); render('forge', true);
    }, 1400);
  }

  /* ---------------- detail sheet ---------------- */
  const sheet = $('#sheet');
  function openSheet(html) { $('#sheetBody').innerHTML = html; sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); haptic(); }
  function closeSheet() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); }
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });

  function openDetail(g) {
    const t = TIERS[g.tier], sk = SKINS[g.skin], bd = BACKDROPS[g.bd], sy = SYMBOLS[g.sym];
    const value = Math.round([90, 260, 720, 2100, 6400][g.tier] * (sk.w < 5 ? 2.2 : 1));
    openSheet(`
      <div class="detail__art" id="dArt">${art(g)}<div class="card__holo" style="opacity:.3"></div></div>
      <div class="detail__head"><span class="rar" style="--rc:${t.c};color:${t.c};justify-content:center">${t.name}</span>
        <h2>${MODELS[g.model].name} <span style="color:var(--mute)">#${g.num}</span></h2></div>
      <div class="traits">
        <div class="trait"><small>Модель</small><b>${sk.n}</b><em>${pct(SKINS, sk)}</em></div>
        <div class="trait"><small>Фон</small><b>${bd.n}</b><em>${pct(BACKDROPS, bd)}</em></div>
        <div class="trait"><small>Узор</small><b>${sy.n}</b><em>${pct(SYMBOLS, sy)}</em></div>
      </div>
      <div class="row2">
        <button class="btn btn--primary" id="dSend">💌 Подарить</button>
        <button class="btn btn--ghost" id="dSell">Продать · ★ ${fmt(value)}</button>
      </div>
      <button class="btn btn--ghost btn--block" id="dWithdraw" style="margin-top:10px">Вывести как NFT в TON-кошелёк</button>`);
    const da = $('#dArt'), gi = da.querySelector('.gift'), holo = da.querySelector('.card__holo');
    da.addEventListener('pointermove', e => { const r = da.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; gi.style.transform = `rotateY(${(x - .5) * 30}deg) rotateX(${(.5 - y) * 30}deg) scale(1.04)`; holo.style.setProperty('--hx', x * 100 + '%'); holo.style.setProperty('--hy', y * 100 + '%'); });
    da.addEventListener('pointerleave', () => { gi.style.transform = ''; });
    $('#dSend').onclick = () => {
      S.items = S.items.filter(x => x.id !== g.id); S.sent++; addXP(50); save(); closeSheet(); notify('success');
      try { tg && tg.switchInlineQuery ? tg.switchInlineQuery('gift ' + g.id, ['users']) : null; } catch (e) {}
      toast('Подарок отправлен 💌'); render(tab, true);
    };
    $('#dSell').onclick = () => {
      const net = Math.round(value * .95);
      S.items = S.items.filter(x => x.id !== g.id); save(); closeSheet(); setBalance(net); notify('success');
      toast(`Продано: +${fmt(net)} ★ (комиссия 5%)`); render(tab, true);
    };
    $('#dWithdraw').onclick = () => toast('Подключи TON-кошелёк — вывод через TON Connect');
  }

  /* ---------------- top up ---------------- */
  function openTopUp() {
    const packs = [[250, '199 ₽', ''], [750, '549 ₽', ''], [2000, '1 390 ₽', 'ХИТ'], [6000, '3 990 ₽', '+15%']];
    openSheet(`<h2 style="text-align:center;font-size:20px">Пополнить звёзды</h2>
      <p class="sub" style="text-align:center;margin:6px 0 16px">Оплата через Telegram Stars — без карт и регистраций</p>
      ${packs.map(([s, p, tag]) => `<button class="pack" data-pack="${s}"><span class="star" style="font-size:26px">★</span><span class="pack__s">${fmt(s)}${tag ? `<span class="pack__tag">${tag}</span>` : ''}<small>звёзд</small></span><span class="pack__p">${p}</span></button>`).join('')}
      <p class="sub" style="text-align:center;font-size:12px;margin-top:10px">Демо: звёзды начисляются без оплаты</p>`);
    $('#sheetBody').querySelectorAll('[data-pack]').forEach(b => b.onclick = () => { closeSheet(); setBalance(+b.dataset.pack); notify('success'); toast(`+${fmt(+b.dataset.pack)} ★`); });
  }
  $('#topUp').onclick = openTopUp;
  $('#meBtn').onclick = () => render('pass');

  /* ---------------- reveal + confetti ---------------- */
  const rv = $('#reveal');
  function reveal(g, title) {
    const t = TIERS[g.tier];
    $('#revealBody').innerHTML = `<p class="eyebrow">${title}</p>
      <div class="reveal__card">${card(g)}</div>
      <h2>${MODELS[g.model].name} #${g.num}</h2>
      <span class="rar" style="--rc:${t.c};color:${t.c}">${t.name} · ${SKINS[g.skin].n} · ${BACKDROPS[g.bd].n}</span>
      <button class="btn btn--primary btn--block" id="rvOk">В коллекцию</button>`;
    rv.classList.add('open'); rv.setAttribute('aria-hidden', 'false'); notify('success');
    tilt(rv); confetti(g.tier);
    $('#rvOk').onclick = () => { rv.classList.remove('open'); rv.setAttribute('aria-hidden', 'true'); setBalance(0); };
  }
  function confetti(tier) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.scale(dpr, dpr);
    const cols = ['#8b6cff', '#26e3c8', '#ffcc4d', '#ff4d8d', '#3fa9ff', '#fff'];
    const P = Array.from({ length: 60 + tier * 40 }, () => ({ x: innerWidth / 2, y: innerHeight * .42, vx: rnd(-9, 9), vy: rnd(-15, -4), r: rnd(3, 7), c: pick(cols), a: rnd(0, 6), s: rnd(-.3, .3), life: 1 }));
    let f = 0;
    (function loop() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.s; p.life -= .006;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (++f < 200 && rv.classList.contains('open')) requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  /* ---------------- старт ---------------- */
  function boot() {
    const app = window.Telegram && window.Telegram.WebApp;
    if (app) {
      try {
        app.ready(); app.expand();
        app.setHeaderColor && app.setHeaderColor('#06060b'); app.setBackgroundColor && app.setBackgroundColor('#06060b');
        const u = app.initDataUnsafe && app.initDataUnsafe.user;
        if (u && u.first_name) { $('#meName').textContent = u.first_name; $('.me__ava').textContent = u.first_name[0]; }
      } catch (e) {}
    }
    setBalance(0); render('home');
  }
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();
