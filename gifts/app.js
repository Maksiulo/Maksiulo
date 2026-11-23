/* Glint — клиент Telegram Mini App. Все действия проходят через сервер (/api), баланс и подарки хранятся в базе. */
(() => {
  'use strict';
  const tg = window.Telegram && window.Telegram.WebApp;
  const C = window.GLINT;
  const { TIERS, MODELS, SKINS, BACKDROPS, SYMBOLS } = C;
  const { giftSVG, art } = window.GlintArt;
  const $ = (s, r = document) => r.querySelector(s);
  const fmt = n => Math.round(n).toLocaleString('ru-RU');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const pct = (arr, x) => (x.w / arr.reduce((s, y) => s + y.w, 0) * 100).toFixed(1).replace('.0', '') + '%';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const haptic = (t = 'light') => { try { tg.HapticFeedback.impactOccurred(t); } catch (e) {} };
  const notify = t => { try { tg.HapticFeedback.notificationOccurred(t); } catch (e) {} };
  const valueOf = g => Math.round(TIERS[g.tier].value * (SKINS[g.skin].w < 5 ? 2.2 : 1));

  /* ---------------- API ---------------- */
  const API = (window.GLINT_API || '').replace(/\/$/, '');
  let DEMO = false;
  async function api(path, body) {
    if (DEMO) return window.GlintDemo.api(path, body);
    const r = await fetch(API + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', 'x-init-data': (tg && tg.initData) || '' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({ error: 'Нет связи с сервером' }));
    if (!r.ok) { const e = new Error(j.error || 'Ошибка'); e.status = r.status; throw e; }
    return j;
  }
  let busy = false;
  async function act(fn) {
    if (busy) return; busy = true;
    try { return await fn(); }
    catch (e) { notify('error'); toast(e.message); if (e.status === 402) openTopUp(); }
    finally { busy = false; }
  }

  /* ---------------- состояние ---------------- */
  let S = null, MARKET = [], tab = 'home', cdTimer;
  const ui = { vf: 'all', mf: 'new', fsel: [] };
  async function refresh() { S = await api('/api/me'); paintTop(); }
  function paintTop() {
    $('#balance').textContent = fmt(S.user.balance);
    $('#meLvl').textContent = S.user.level;
    $('#meName').textContent = S.user.name || 'Игрок';
    $('.me__ava').textContent = (S.user.name || 'G')[0].toUpperCase();
  }
  function bump() { const w = $('#wallet'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }

  let toastT;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  function card(g, extra = '') {
    const t = TIERS[g.tier];
    const badge = g.status === 'listed' ? `<span class="badge">★ ${fmt(g.price)}</span>` : g.status === 'gifting' ? '<span class="badge">💌 ждёт</span>' : '';
    return `<button class="card ${extra}" data-id="${esc(g.id)}" data-r="${t.key}" style="--rc:${t.c}">
      <div class="card__art">${art(g)}<div class="card__holo"></div>${badge}</div>
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
  const screens = {
    home() {
      const d = S.drop, u = S.user;
      const hero = d ? `
      <section class="hero glass">
        <span class="hero__live">LIVE ДРОП</span>
        <h1 class="h1" style="margin-top:12px">${esc(d.title)}</h1>
        <p class="sub"><span class="rar" style="color:${TIERS[d.tier].c}">${TIERS[d.tier].name}</span> · тираж ${fmt(d.supply)}. После sold out — только на маркете.</p>
        <div class="hero__stage"><div class="hero__ring"></div>${giftSVG({ model: d.model, tier: d.tier, skin: 0, bd: 6, sym: 1 })}</div>
        <div class="hero__meta">
          <div class="stat"><small>Цена</small><b><span class="star">★</span> ${fmt(d.price)}</b></div>
          <div class="stat"><small>Осталось</small><b>${fmt(d.supply - d.minted)}</b></div>
          <div class="stat"><small>Финиш</small><b id="cd">--:--:--</b></div>
        </div>
        <div class="supply"><i style="width:${d.minted / d.supply * 100}%"></i></div>
        <button class="btn btn--primary btn--block" id="mintBtn">Забрать за ★ ${fmt(d.price)}</button>
      </section>` : `
      <section class="hero glass" style="text-align:center">
        <span class="hero__live">СКОРО</span>
        <h1 class="h1" style="margin-top:12px">Новый дроп<br/>готовится</h1>
        <p class="sub">А пока — редкие подарки на маркете и сплав в Кузне.</p>
        <div class="hero__stage"><div class="hero__ring"></div>${giftSVG({ model: 5, tier: 3, skin: 4, bd: 6, sym: 1 })}</div>
        <button class="btn btn--primary btn--block" data-go="market">На маркет</button>
      </section>`;
      const days = ['1', '2', '3', '4', '5', '6', '7'];
      const doneN = u.checkedToday ? u.streak : (u.streak % 7);
      return `${hero}
      <section class="section bento">
        <div class="tile tile--wide glass">
          <h3>Серия входов · ${u.streak} дн.</h3>
          <p>Заходи каждый день. На 7-й день — гарантированный Эпик-подарок</p>
          <div class="streak">${days.map((d, i) => {
            const done = i < doneN, today = !u.checkedToday && i === doneN, rw = C.checkinReward(i + 1);
            return `<div class="streak__d ${done ? 'done' : ''} ${today ? 'today' : ''}">День ${d}<b>${rw.gift !== undefined ? '🎁' : done ? '✓' : '+' + rw.stars}</b></div>`;
          }).join('')}</div>
          <button class="btn ${u.checkedToday ? 'btn--ghost' : 'btn--primary'} btn--block" id="checkin" style="margin-top:12px;height:46px" ${u.checkedToday ? 'disabled' : ''}>${u.checkedToday ? 'Возвращайся завтра' : 'Забрать награду дня'}</button>
        </div>
        <div class="tile glass" data-go="vault"><h3>Коллекция</h3><p>подарков в сейфе</p><div class="tile__big">${S.items.length}</div></div>
        <div class="tile glass" data-go="vault"><h3>Оценка</h3><p>по базовой цене</p><div class="tile__big"><span class="star">★</span>${fmt(S.items.reduce((s, g) => s + valueOf(g), 0))}</div></div>
      </section>
      <section class="section">
        <div class="section__head"><h2>Задания дня</h2><span>обнов. в 03:00 МСК</span></div>
        ${S.quests.map(q => `<div class="quest glass"><div class="quest__ic">${q.ic}</div>
          <div class="quest__t"><b>${q.t}</b><div class="quest__bar"><i style="width:${q.p / q.n * 100}%"></i></div></div>
          <button class="quest__r ${q.claimed ? 'got' : q.p >= q.n ? 'claim' : ''}" data-q="${q.k}">${q.claimed ? 'Получено' : '★ ' + q.r}</button></div>`).join('')}
      </section>`;
    },

    vault() {
      const list = S.items.filter(g => ui.vf === 'all' || TIERS[g.tier].key === ui.vf);
      return `
      <p class="eyebrow">Сейф</p><h1 class="h1">Моя коллекция</h1>
      <p class="sub" style="margin-bottom:16px">${S.items.length} подарков · нажми, чтобы подарить или продать</p>
      <div class="chips">${[['all', 'Все'], ...TIERS.map(t => [t.key, t.name])].map(([k, n]) => `<button class="chip ${ui.vf === k ? 'on' : ''}" data-vf="${k}">${n}</button>`).join('')}</div>
      ${list.length ? `<div class="grid">${list.map(g => card(g)).join('')}</div>` : '<div class="empty">Здесь пока пусто — загляни в Дроп или на Маркет</div>'}`;
    },

    forge() {
      const items = ui.fsel.map(id => S.items.find(g => g.id === id)).filter(Boolean);
      const tier = items[0] ? items[0].tier : null, next = tier !== null ? TIERS[tier + 1] : null;
      const pool = S.items.filter(g => g.tier < 4 && g.status === 'owned').sort((a, b) => a.tier - b.tier);
      const fee = tier !== null ? C.FORGE_FEE[tier] : 0;
      return `
      <section class="forge glass" id="forgeBox">
        <p class="eyebrow">Кузня</p><h1 class="h1">3 → 1</h1>
        <p class="sub">Сплавь три подарка одной редкости — получишь подарок <b>гарантированно</b> на уровень выше. Модель и признаки — случайные.</p>
        <div class="forge__core"><div class="forge__q" ${next ? `style="color:${next.c};-webkit-text-fill-color:currentColor"` : ''}>?</div></div>
        <div class="slots">${[0, 1, 2].map(i => items[i] ? `<div class="slot full">${art(items[i])}</div>` : '<div class="slot">+</div>').join('')}</div>
        <div class="odds"><span>Результат: <b style="color:${next ? next.c : 'inherit'}">${next ? next.name : '—'}</b></span><span>Сбор: <b>★ ${fee || '—'}</b></span></div>
        <button class="btn btn--primary btn--block" id="forgeBtn" ${items.length === 3 ? '' : 'disabled'}>${items.length === 3 ? 'Сплавить' : `Выбери ещё ${3 - items.length}`}</button>
      </section>
      <section class="section">
        <div class="section__head"><h2>Выбери подарки</h2><span>${items.length}/3</span></div>
        ${pool.length ? `<div class="grid">${pool.map(g => card(g, ui.fsel.includes(g.id) ? 'sel' : (tier !== null && g.tier !== tier) || items.length === 3 ? 'dim' : '')).join('')}</div>` : '<div class="empty">Нет подарков для сплава</div>'}
      </section>`;
    },

    market() {
      return `
      <p class="eyebrow">Маркет · комиссия ${C.MARKET_FEE * 100}%</p><h1 class="h1">Торговая площадь</h1>
      <p class="sub" style="margin-bottom:16px">Оборот за 24 ч: <b style="color:var(--ink)">★ ${fmt(S.volume24h)}</b> · лотов: ${MARKET.length}</p>
      <div class="chips">${[['new', '✨ Новые'], ['cheap', 'Дешевле'], ['rare', 'Редкие']].map(([k, n]) => `<button class="chip ${ui.mf === k ? 'on' : ''}" data-mf="${k}">${n}</button>`).join('')}</div>
      ${MARKET.map(g => { const t = TIERS[g.tier]; return `
        <div class="lot glass">
          <div class="lot__art" style="position:relative">${art(g)}</div>
          <div class="lot__t"><b>${MODELS[g.model].name} #${g.num}</b><small><span class="rar" style="color:${t.c}">${t.name}</span> · ${SKINS[g.skin].n} · ${esc(g.seller)}</small></div>
          <div class="lot__buy">${g.mine ? `<button class="btn btn--ghost" data-unlist="${esc(g.id)}">Снять</button><span class="lot__chg" style="color:var(--mute)">твой лот</span>` : `<button class="btn btn--ghost" data-buy="${esc(g.id)}">★ ${fmt(g.price)}</button>`}</div>
        </div>`; }).join('') || '<div class="empty">Лотов пока нет.<br/>Выстави свой подарок первым — из Коллекции.</div>'}`;
    },

    pass() {
      const u = S.user, into = u.xp % C.XP_PER_LEVEL;
      return `
      <section class="pass glass">
        <p class="eyebrow">Сезон ${S.season} · «Genesis»</p>
        <h1 class="h1">Glint Pass</h1>
        <p class="sub">Выполняй задания, копи опыт и забирай награды. Премиум-трек — подарки, которых нет в продаже.</p>
        <div class="xp"><i style="width:${into / C.XP_PER_LEVEL * 100}%"></i></div>
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700;color:var(--mute)"><span>Уровень ${u.level}</span><span>${into}/${C.XP_PER_LEVEL} XP</span></div>
        <button class="btn ${u.pass ? 'btn--ghost' : 'btn--primary'} btn--block" id="passBtn" style="margin-top:16px" ${u.pass ? 'disabled' : ''}>${u.pass ? '✓ Премиум активен' : 'Открыть премиум · ★ ' + C.PASS_PRICE}</button>
      </section>
      <section class="section">
        <div class="section__head"><h2>Награды</h2><span>листай →</span></div>
        <div class="track">${C.PASS_REWARDS.map(r => {
          const got = u.passClaimed.includes(r.lvl), can = !got && u.level >= r.lvl && (!r.prem || u.pass);
          const g = r.gift && { ...r.gift, skin: r.lvl % SKINS.length, bd: r.lvl % BACKDROPS.length, sym: r.lvl % SYMBOLS.length };
          return `<button class="lvl glass ${got ? 'got' : can ? 'can' : 'lock'} ${r.prem ? 'premium' : ''}" ${can ? `data-lvl="${r.lvl}"` : ''}><div class="lvl__n">${r.prem ? 'PREMIUM · ' : ''}${r.lvl}</div>
            <div class="lvl__art">${r.stars ? `<div class="tile__big" style="margin:0;font-size:22px"><span class="star">★</span>${r.stars}</div>` : giftSVG(g)}</div>
            <div class="lvl__r" style="${g && !got && !can ? 'color:' + TIERS[g.tier].c : ''}">${got ? 'Получено' : can ? 'Забрать' : r.stars ? 'Звёзды' : TIERS[g.tier].name}</div></button>`;
        }).join('')}</div>
      </section>
      <section class="section">
        <div class="section__head"><h2>Пригласи друзей</h2></div>
        <div class="tile glass" style="display:flex;align-items:center;gap:14px">
          <div style="font-size:34px">🤝</div>
          <div style="flex:1"><h3>+${C.REF_SHARE * 100}% от их пополнений</h3><p>Навсегда, звёздами на баланс. Друг получает бонусный подарок.</p></div>
        </div>
        <button class="btn btn--primary btn--block" id="refBtn" style="margin-top:10px">Пригласить друга</button>
      </section>`;
    },
  };

  /* ---------------- навигация ---------------- */
  async function render(t = tab, keepScroll) {
    tab = t;
    document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
    if (t === 'market' && !keepScroll) { try { MARKET = await api('/api/market?sort=' + ui.mf); } catch (e) { toast(e.message); } }
    const view = $('#view');
    view.innerHTML = screens[t]();
    if (!keepScroll) { view.style.animation = 'none'; void view.offsetWidth; view.style.animation = ''; window.scrollTo({ top: 0 }); }
    tilt(view);
    clearInterval(cdTimer);
    if (t === 'home' && S.drop) {
      const end = new Date(S.drop.endsAt).getTime();
      const tick = () => { const s = Math.max(0, (end - Date.now()) / 1000 | 0), el = $('#cd'); if (!el) return; const d = s / 86400 | 0; el.textContent = d > 0 ? `${d}д ${(s / 3600 | 0) % 24}ч` : [s / 3600 | 0, (s / 60 | 0) % 60, s % 60].map(x => String(x).padStart(2, '0')).join(':'); };
      tick(); cdTimer = setInterval(tick, 1000);
    }
  }
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b && S) { haptic(); render(b.dataset.tab); } });

  /* ---------------- действия ---------------- */
  $('#view').addEventListener('click', e => {
    const el = e.target;
    const go = el.closest('[data-go]'); if (go) return render(go.dataset.go);
    if (el.closest('#mintBtn')) return act(async () => { const r = await api('/api/drop/mint', {}); await refresh(); bump(); reveal(r.gift, 'Твой новый подарок'); render('home', true); });
    if (el.closest('#checkin')) return act(async () => {
      const r = await api('/api/checkin', {}); await refresh();
      if (r.gift) reveal(r.gift, `День ${r.day} — Эпик-подарок!`); else { bump(); notify('success'); toast(`День ${r.day}: +${r.stars} ★`); }
      render('home', true);
    });
    const q = el.closest('[data-q]');
    if (q) {
      const qd = S.quests.find(x => x.k === q.dataset.q);
      if (qd.claimed) return;
      if (qd.p < qd.n) { toast('Сначала выполни задание'); return setTimeout(() => render({ forge: 'forge', send: 'vault', buy: 'market', mint: 'home' }[qd.k]), 500); }
      return act(async () => { const r = await api('/api/quest', { k: qd.k }); await refresh(); bump(); notify('success'); toast(`+${r.stars} ★ и +60 XP`); render('home', true); });
    }
    const vf = el.closest('[data-vf]'); if (vf) { ui.vf = vf.dataset.vf; haptic(); return render('vault', true); }
    const mf = el.closest('[data-mf]'); if (mf) { ui.mf = mf.dataset.mf; haptic(); return render('market'); }
    const buy = el.closest('[data-buy]');
    if (buy) {
      const g = MARKET.find(x => x.id === buy.dataset.buy);
      return confirmSheet(`Купить ${MODELS[g.model].name} #${g.num}?`, `Спишется ★ ${fmt(g.price)}`, 'Купить', () => act(async () => {
        const r = await api('/api/market/buy', { id: g.id }); MARKET = MARKET.filter(x => x.id !== g.id); await refresh(); reveal(r.gift, 'Покупка в сейфе'); render('market', true);
      }));
    }
    const un = el.closest('[data-unlist]'); if (un) return act(async () => { await api('/api/market/unlist', { id: un.dataset.unlist }); await refresh(); toast('Лот снят'); render('market'); });
    if (el.closest('#forgeBtn')) return doForge();
    if (el.closest('#passBtn')) return confirmSheet('Открыть Glint Pass?', `Спишется ★ ${C.PASS_PRICE}. Премиум-награды до конца сезона.`, 'Открыть', () => act(async () => { await api('/api/pass/buy', {}); await refresh(); notify('success'); toast('Glint Pass активирован ✨'); render('pass', true); }));
    const lv = el.closest('[data-lvl]'); if (lv) return act(async () => { const r = await api('/api/pass/claim', { lvl: +lv.dataset.lvl }); await refresh(); if (r.gift) reveal(r.gift, `Награда уровня ${lv.dataset.lvl}`); else { bump(); notify('success'); toast(`+${r.stars} ★`); } render('pass', true); });
    if (el.closest('#refBtn')) {
      const link = S.bot ? `https://t.me/${S.bot}?start=ref_${S.user.id}` : location.origin;
      return share(link, 'Забери бесплатный коллекционный подарок в Glint 🎁');
    }
    const c = el.closest('.card');
    if (c) {
      if (tab === 'forge') { const id = c.dataset.id, at = ui.fsel.indexOf(id); at >= 0 ? ui.fsel.splice(at, 1) : ui.fsel.length < 3 && ui.fsel.push(id); haptic(); return render('forge', true); }
      const g = S.items.find(x => x.id === c.dataset.id); if (g) openDetail(g);
    }
  });

  function share(url, text) {
    if (DEMO) return toast('В Telegram ссылка сразу уйдёт другу 💌');
    const u = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    try { if (tg && tg.openTelegramLink) return tg.openTelegramLink(u); } catch (e) {}
    try { navigator.clipboard.writeText(url); toast('Ссылка скопирована'); } catch (e) { window.open(u, '_blank'); }
  }

  async function doForge() {
    if (ui.fsel.length !== 3) return;
    const box = $('#forgeBox'); box.classList.add('burn'); haptic('heavy');
    let n = 0; const hb = setInterval(() => haptic(n++ % 2 ? 'light' : 'medium'), 140);
    try {
      const [r] = await Promise.all([api('/api/forge', { ids: ui.fsel }), sleep(1400)]);
      ui.fsel = []; await refresh(); reveal(r.gift, 'Сплав завершён');
    } catch (e) { notify('error'); toast(e.message); }
    finally { clearInterval(hb); render('forge', true); }
  }

  /* ---------------- нижние листы ---------------- */
  const sheet = $('#sheet');
  function openSheet(html) { $('#sheetBody').innerHTML = html; sheet.classList.add('open'); sheet.setAttribute('aria-hidden', 'false'); haptic(); }
  function closeSheet() { sheet.classList.remove('open'); sheet.setAttribute('aria-hidden', 'true'); }
  sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
  function confirmSheet(title, sub, cta, fn) {
    openSheet(`<h2 style="text-align:center;font-size:20px">${esc(title)}</h2><p class="sub" style="text-align:center;margin:8px 0 18px">${esc(sub)}</p>
      <div class="row2"><button class="btn btn--ghost" data-close>Отмена</button><button class="btn btn--primary" id="cOk">${esc(cta)}</button></div>`);
    $('#cOk').onclick = () => { closeSheet(); fn(); };
  }

  function openDetail(g) {
    const t = TIERS[g.tier], sk = SKINS[g.skin], bd = BACKDROPS[g.bd], sy = SYMBOLS[g.sym];
    const actions = {
      owned: `<div class="row2"><button class="btn btn--primary" id="dSend">💌 Подарить</button><button class="btn btn--ghost" id="dSell">Продать</button></div>`,
      listed: `<p class="sub" style="text-align:center;margin-bottom:12px">Выставлен на маркет за <b style="color:var(--ink)">★ ${fmt(g.price || 0)}</b></p><button class="btn btn--ghost btn--block" id="dUnlist">Снять с продажи</button>`,
      gifting: `<p class="sub" style="text-align:center;margin-bottom:12px">Ссылка отправлена — ждём, когда друг заберёт</p><button class="btn btn--ghost btn--block" id="dCancel">Отозвать подарок</button>`,
    }[g.status];
    openSheet(`
      <div class="detail__art" id="dArt">${art(g)}<div class="card__holo" style="opacity:.3"></div></div>
      <div class="detail__head"><span class="rar" style="color:${t.c};justify-content:center">${t.name}</span>
        <h2>${MODELS[g.model].name} <span style="color:var(--mute)">#${g.num}</span></h2></div>
      <div class="traits">
        <div class="trait"><small>Модель</small><b>${sk.n}</b><em>${pct(SKINS, sk)}</em></div>
        <div class="trait"><small>Фон</small><b>${bd.n}</b><em>${pct(BACKDROPS, bd)}</em></div>
        <div class="trait"><small>Узор</small><b>${sy.n}</b><em>${pct(SYMBOLS, sy)}</em></div>
      </div>${actions}`);
    const da = $('#dArt'), gi = da.querySelector('.gift'), holo = da.querySelector('.card__holo');
    da.addEventListener('pointermove', e => { const r = da.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height; gi.style.transform = `rotateY(${(x - .5) * 30}deg) rotateX(${(.5 - y) * 30}deg) scale(1.04)`; holo.style.setProperty('--hx', x * 100 + '%'); holo.style.setProperty('--hy', y * 100 + '%'); });
    da.addEventListener('pointerleave', () => { gi.style.transform = ''; });
    const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
    on('#dSend', () => act(async () => {
      const r = await api('/api/gift/link', { id: g.id }); closeSheet(); await refresh(); notify('success');
      share(r.url, `Я дарю тебе ${MODELS[g.model].name} #${g.num} 🎁 Забирай!`); render(tab, true);
    }));
    on('#dSell', () => sellSheet(g));
    on('#dUnlist', () => act(async () => { await api('/api/market/unlist', { id: g.id }); closeSheet(); await refresh(); toast('Лот снят'); render(tab, true); }));
    on('#dCancel', () => act(async () => { await api('/api/gift/cancel', { id: g.id }); closeSheet(); await refresh(); toast('Подарок вернулся в сейф'); render(tab, true); }));
  }

  function sellSheet(g) {
    const base = valueOf(g);
    openSheet(`<h2 style="text-align:center;font-size:20px">Выставить на маркет</h2>
      <p class="sub" style="text-align:center;margin:6px 0 16px">${MODELS[g.model].name} #${g.num} · базовая цена ★ ${fmt(base)}</p>
      <label class="field"><span class="star">★</span><input id="price" type="number" inputmode="numeric" min="10" step="1" value="${base}"/></label>
      <p class="sub" id="net" style="text-align:center;margin:10px 0 16px"></p>
      <button class="btn btn--primary btn--block" id="doList">Выставить</button>`);
    const inp = $('#price'), net = $('#net');
    const upd = () => { const p = Math.floor(+inp.value || 0); net.textContent = `Ты получишь ★ ${fmt(p - Math.ceil(p * C.MARKET_FEE))} после комиссии ${C.MARKET_FEE * 100}%`; };
    inp.oninput = upd; upd();
    $('#doList').onclick = () => act(async () => { await api('/api/market/list', { id: g.id, price: Math.floor(+inp.value) }); closeSheet(); await refresh(); notify('success'); toast('Лот на маркете'); render(tab, true); });
  }

  function openTopUp() {
    openSheet(`<h2 style="text-align:center;font-size:20px">Пополнить звёзды</h2>
      <p class="sub" style="text-align:center;margin:6px 0 16px">Оплата Telegram Stars — без карт, в два касания</p>
      ${C.PACKS.map(p => `<button class="pack" data-pack="${p.id}"><span class="star" style="font-size:26px">★</span><span class="pack__s">${fmt(p.stars + p.bonus)}${p.tag ? `<span class="pack__tag">${p.tag}</span>` : ''}<small>${p.bonus ? `${fmt(p.stars)} + ${fmt(p.bonus)} бонус` : 'звёзд'}</small></span><span class="pack__p">⭐ ${fmt(p.stars)}</span></button>`).join('')}
      <p class="sub" style="text-align:center;font-size:12px;margin-top:10px">Звёзды Glint нельзя вывести — это игровая валюта. Условия: /terms в боте</p>`);
    $('#sheetBody').querySelectorAll('[data-pack]').forEach(b => b.onclick = () => act(async () => {
      if (DEMO) { const r = await api('/api/invoice', { pack: b.dataset.pack }); closeSheet(); await refresh(); bump(); notify('success'); toast(`Демо: +${fmt(r.demoCredited)} ★ без оплаты`); return render(tab, true); }
      if (!S.payments || !tg || !tg.openInvoice) throw new Error('Оплата доступна внутри Telegram');
      const { link } = await api('/api/invoice', { pack: b.dataset.pack });
      closeSheet();
      tg.openInvoice(link, async status => {
        if (status !== 'paid') return status === 'failed' && toast('Оплата не прошла');
        notify('success'); toast('Оплачено! Начисляем…');
        const before = S.user.balance;
        for (let i = 0; i < 8; i++) { await sleep(1200); await refresh(); if (S.user.balance > before) break; }
        bump(); render(tab, true);
      });
    }));
  }
  $('#topUp').onclick = () => S && openTopUp();
  $('#meBtn').onclick = () => S && render('pass');

  /* ---------------- открытие подарка ---------------- */
  const rv = $('#reveal');
  function reveal(g, title) {
    const t = TIERS[g.tier];
    $('#revealBody').innerHTML = `<p class="eyebrow">${esc(title)}</p>
      <div class="reveal__card">${card(g)}</div>
      <h2>${MODELS[g.model].name} #${g.num}</h2>
      <span class="rar" style="color:${t.c}">${t.name} · ${SKINS[g.skin].n} · ${BACKDROPS[g.bd].n}</span>
      <button class="btn btn--primary btn--block" id="rvOk">В коллекцию</button>`;
    rv.classList.add('open'); rv.setAttribute('aria-hidden', 'false'); notify('success');
    tilt(rv); confetti(g.tier);
    $('#rvOk').onclick = () => { rv.classList.remove('open'); rv.setAttribute('aria-hidden', 'true'); };
  }
  function confetti(tier) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti'), ctx = cv.getContext('2d'), dpr = devicePixelRatio || 1;
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cols = ['#8b6cff', '#26e3c8', '#ffcc4d', '#ff4d8d', '#3fa9ff', '#fff'], R = (a, b) => a + Math.random() * (b - a);
    const P = Array.from({ length: 60 + tier * 40 }, () => ({ x: innerWidth / 2, y: innerHeight * .42, vx: R(-9, 9), vy: R(-15, -4), r: R(3, 7), c: cols[Math.random() * cols.length | 0], a: R(0, 6), s: R(-.3, .3), life: 1 }));
    let f = 0;
    (function loop() {
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      P.forEach(p => { p.vy += .35; p.vx *= .99; p.x += p.vx; p.y += p.vy; p.a += p.s; p.life -= .006;
        ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); });
      if (++f < 200 && rv.classList.contains('open')) requestAnimationFrame(loop); else ctx.clearRect(0, 0, innerWidth, innerHeight);
    })();
  }

  /* ---------------- старт ---------------- */
  function gate(html) { $('#view').innerHTML = `<section class="hero glass" style="text-align:center;margin-top:30px"><div class="hero__stage"><div class="hero__ring"></div>${giftSVG({ model: 0, tier: 3, skin: 0, bd: 6, sym: 1 })}</div>${html}</section>`; }
  async function boot() {
    if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor('#06060b'); tg.setBackgroundColor('#06060b'); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch (e) {} }
    if (!tg || !tg.initData) {
      DEMO = true;
      window.GlintDemo.onEvent = async msg => { notify('success'); toast(msg); await refresh(); render(tab, true); };
      document.body.classList.add('is-demo');
    }
    try { await refresh(); }
    catch (e) { return gate(`<h1 class="h1">Не удалось загрузить</h1><p class="sub" style="margin:8px 0 18px">${esc(e.message)}</p><button class="btn btn--primary btn--block" onclick="location.reload()">Повторить</button>`); }
    await render('home');
    const sp = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || '';
    const claim = new URLSearchParams(location.search).get('claim') || (sp.startsWith('g_') ? sp.slice(2) : '');
    if (claim) {
      try { history.replaceState(null, '', location.pathname); } catch (e) {}
      act(async () => { const r = await api('/api/gift/claim', { code: claim }); await refresh(); reveal(r.gift, r.from ? `Подарок от ${r.from}` : 'Тебе подарок!'); render('home', true); });
    }
  }
  if (document.readyState === 'complete') boot(); else addEventListener('load', boot);
})();
