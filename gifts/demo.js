/* Демо-режим Glint: та же игра без сервера, данные — в браузере.
   Включается, когда приложение открыто не из бота (например, по ссылке GitHub Pages). */
(function () {
  const C = window.GLINT, KEY = 'glint.demo.v2';
  const rint = n => Math.floor(Math.random() * n);
  const wroll = arr => { let r = Math.random() * arr.reduce((s, x) => s + x.w, 0); for (let i = 0; i < arr.length; i++) if ((r -= arr[i].w) < 0) return i; return 0; };
  const id = () => Math.random().toString(36).slice(2, 10);
  const today = () => new Date().toISOString().slice(0, 10);
  const level = xp => Math.min(C.PASS_REWARDS.length, 1 + Math.floor(xp / C.XP_PER_LEVEL));
  const err = (m, status = 400) => { const e = new Error(m); e.status = status; throw e; };
  let num = 100;
  const mint = (model, tier) => ({ id: id(), model, tier, skin: wroll(C.SKINS), bd: wroll(C.BACKDROPS), sym: wroll(C.SYMBOLS), num: ++num + rint(900), status: 'owned' });
  const SELLERS = ['Алина', 'Kirill', 'Даша', 'max_k', 'Тимур', 'Sofia', 'Егор', 'nika'];
  function fresh() {
    const market = Array.from({ length: 12 }, () => {
      const g = mint(rint(8), wroll([{ w: 40 }, { w: 30 }, { w: 18 }, { w: 9 }, { w: 3 }]));
      g.price = Math.round(C.TIERS[g.tier].value * (0.8 + Math.random() * 0.6)); g.seller = SELLERS[rint(SELLERS.length)]; g.status = 'listed';
      return g;
    });
    return { balance: 1000, xp: 0, pass: false, passClaimed: [], streak: 0, last: null, q: { d: today(), claimed: [] }, items: [mint(rint(8), 0), mint(rint(8), 0), mint(rint(8), 0)], market,
      drop: { id: 1, title: 'Nova Orb Genesis', model: 0, tier: 1, price: 250, supply: 5000, minted: 1248, endsAt: new Date(Date.now() + 5 * 864e5).toISOString() }, volume: 184300 };
  }
  let S; try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch (e) { S = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} };
  const q = () => (S.q.d === today() ? S.q : (S.q = { d: today(), claimed: [] }));
  const spend = n => { if (S.balance < n) err('Не хватает звёзд', 402); S.balance -= n; };
  const own = (gid, status = 'owned') => { const g = S.items.find(x => x.id === gid); if (!g) err('Это не твой подарок', 403); if (g.status !== status) err('Подарок сейчас недоступен'); return g; };
  const bump = k => { q()[k] = (q()[k] || 0) + 1; };

  const routes = {
    'GET /api/me': () => ({
      user: { id: 'demo', name: 'Демо', balance: S.balance, xp: S.xp, level: level(S.xp), pass: S.pass, passClaimed: S.passClaimed, streak: S.streak, checkedToday: S.last === today() },
      quests: C.QUESTS.map(x => ({ ...x, p: Math.min(q()[x.k] || 0, x.n), claimed: q().claimed.includes(x.k) })),
      items: [...S.items].sort((a, b) => b.tier - a.tier), drop: S.drop, volume24h: S.volume, season: 1, bot: '', payments: true, demo: true,
    }),
    'POST /api/checkin': () => {
      if (S.last === today()) err('Сегодня награда уже получена');
      const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
      const day = S.last === y ? (S.streak % 7) + 1 : 1; S.streak = day; S.last = today();
      const rw = C.checkinReward(day); let gift = null;
      if (rw.stars) S.balance += rw.stars; if (rw.gift !== undefined) S.items.push(gift = mint(rint(8), rw.gift));
      S.xp += 20; return { day, stars: rw.stars || 0, gift };
    },
    'POST /api/quest': b => {
      const d = C.QUESTS.find(x => x.k === b.k); if (q().claimed.includes(b.k)) err('Уже получено'); if ((q()[b.k] || 0) < d.n) err('Сначала выполни задание');
      q().claimed.push(b.k); S.balance += d.r; S.xp += 60; return { stars: d.r };
    },
    'POST /api/drop/mint': () => {
      if (S.drop.minted >= S.drop.supply) err('Дроп закончился'); spend(S.drop.price); S.drop.minted++;
      const g = mint(S.drop.model, S.drop.tier); S.items.push(g); S.xp += 40; bump('mint'); return { gift: g };
    },
    'POST /api/forge': b => {
      const gs = (b.ids || []).map(x => own(x)); if (gs.length !== 3 || new Set(b.ids).size !== 3) err('Нужно ровно 3 разных подарка');
      const t = gs[0].tier; if (gs.some(g => g.tier !== t) || t >= 4) err('Подарки должны быть одной редкости');
      spend(C.FORGE_FEE[t]); S.items = S.items.filter(g => !b.ids.includes(g.id));
      const g = mint(rint(8), t + 1); S.items.push(g); S.xp += 80; bump('forge'); return { gift: g };
    },
    'GET /api/market': (b, url) => {
      const sort = new URLSearchParams(url.split('?')[1] || '').get('sort');
      const mine = S.items.filter(g => g.status === 'listed').map(g => ({ ...g, seller: 'Ты', mine: true }));
      return [...mine, ...S.market].sort((a, b) => sort === 'cheap' ? a.price - b.price : sort === 'rare' ? b.tier - a.tier || b.price - a.price : 0);
    },
    'POST /api/market/list': b => {
      const g = own(b.id), p = Math.floor(b.price); if (!(p >= 10)) err('Цена от 10 ★'); g.status = 'listed'; g.price = p;
      // В демо покупатель находится сам через 15 секунд
      setTimeout(() => { const x = S.items.find(y => y.id === g.id && y.status === 'listed'); if (!x) return; S.items = S.items.filter(y => y.id !== g.id); S.balance += x.price - Math.ceil(x.price * C.MARKET_FEE); S.volume += x.price; save(); window.GlintDemo.onEvent && window.GlintDemo.onEvent(`💰 ${SELLERS[rint(SELLERS.length)]} купил(а) твой лот за ★ ${x.price}`); }, 15000);
      return { ok: true };
    },
    'POST /api/market/unlist': b => { const g = own(b.id, 'listed'); g.status = 'owned'; delete g.price; return { ok: true }; },
    'POST /api/market/buy': b => {
      const i = S.market.findIndex(g => g.id === b.id); if (i < 0) err('Лот уже продан', 409);
      const g = S.market[i]; spend(g.price); S.market.splice(i, 1); S.volume += g.price;
      const n = { ...g, status: 'owned' }; delete n.price; delete n.seller; S.items.push(n); S.xp += 30; bump('buy'); return { gift: n };
    },
    'POST /api/gift/link': b => { const g = own(b.id); g.status = 'gifting'; S.xp += 50; bump('send'); return { code: id(), url: location.href.split('?')[0] }; },
    'POST /api/gift/cancel': b => { own(b.id, 'gifting').status = 'owned'; return { ok: true }; },
    'POST /api/gift/claim': () => err('В демо подарки по ссылке не принимаются'),
    'POST /api/pass/buy': () => { if (S.pass) err('Пропуск уже активен'); spend(C.PASS_PRICE); S.pass = true; return { ok: true }; },
    'POST /api/pass/claim': b => {
      const r = C.PASS_REWARDS.find(x => x.lvl === b.lvl); if (!r || level(S.xp) < r.lvl || (r.prem && !S.pass) || S.passClaimed.includes(r.lvl)) err('Награда недоступна');
      S.passClaimed.push(r.lvl); let gift = null; if (r.stars) S.balance += r.stars; if (r.gift) S.items.push(gift = mint(r.gift.model, r.gift.tier));
      return { stars: r.stars || 0, gift };
    },
    'POST /api/invoice': b => { const p = C.PACKS.find(x => x.id === b.pack); S.balance += p.stars + p.bonus; return { demoCredited: p.stars + p.bonus }; },
  };

  window.GlintDemo = {
    async api(path, body) {
      await new Promise(r => setTimeout(r, 120));
      const key = `${body ? 'POST' : 'GET'} ${path.split('?')[0]}`;
      const fn = routes[key] || (() => err('Не найдено', 404));
      const out = fn(body || {}, path); save(); return JSON.parse(JSON.stringify(out));
    },
    reset() { S = fresh(); save(); },
  };
})();
