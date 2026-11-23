/* Аркада Glint: Плинко, Курочка, Колесо дня, лидеры. Монеты бесплатные, результаты считает сервер. */
window.GlintGames = function (ctx) {
  const { api, toast, notify, haptic, fmt, esc, $ } = ctx;
  const A = window.GLINT.ARCADE, FX = window.GlintFX;
  let ARC = null, game = null, busy = false;
  const st = { bet: 50, plRisk: 'low', chRisk: 'easy', run: null, crashed: false };
  const COIN = '<span class="coin">🪙</span>';
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const setCoins = n => { ARC.coins = n; FX.count($('#arcCoins'), n); };

  async function load() { ARC = await api('/api/arcade'); if (ARC.chicken) { st.run = ARC.chicken; st.crashed = false; } }

  /* ---------- общие куски ---------- */
  const head = (title, sub) => `
    <div class="arc-head">
      ${game ? '<button class="arc-back" data-arc="back" aria-label="Назад">‹</button>' : ''}
      <div style="flex:1;min-width:0"><p class="eyebrow">${sub}</p><h1 class="h1" style="margin:2px 0 0">${title}</h1></div>
      <div class="arc-coins glass">${COIN}<b id="arcCoins">${fmt(ARC.coins)}</b></div>
    </div>`;
  const betBox = (disabled) => `
    <div class="bet glass ${disabled ? 'off' : ''}">
      <button data-bet="half">½</button>
      <label>${COIN}<input id="betIn" type="number" inputmode="numeric" value="${st.bet}" min="${A.MIN_BET}" max="${A.MAX_BET}" ${disabled ? 'disabled' : ''}/></label>
      <button data-bet="double">×2</button><button data-bet="max">MAX</button>
    </div>`;
  const chips = (key, opts, cur, disabled) => `<div class="chips" style="margin-bottom:12px">${opts.map(([k, n]) => `<button class="chip ${cur === k ? 'on' : ''}" data-${key}="${k}" ${disabled ? 'disabled' : ''}>${n}</button>`).join('')}</div>`;

  /* ---------- лобби ---------- */
  function lobby() {
    return `${head('Аркада', 'Бесплатные монеты')}
      <div class="bento" style="margin-top:14px">
        <button class="tile glass arc-daily ${ARC.bonusReady ? 'ready' : ''}" data-arc="bonus" ${ARC.bonusReady ? '' : 'disabled'}>
          <h3>Бонус дня</h3><p>${ARC.bonusReady ? 'Забери бесплатные монеты' : 'Возвращайся завтра'}</p><div class="tile__big">+${A.DAILY}</div></button>
        <button class="tile glass arc-daily ${ARC.wheelReady ? 'ready' : ''}" data-arc="wheel"><h3>Колесо дня</h3><p>${ARC.wheelReady ? 'Бесплатный спин' : 'Уже крутили сегодня'}</p><div class="tile__big">🎡</div></button>
      </div>
      <button class="game-card glass gc-plinko" data-arc="plinko">
        <div class="gc-art">${plinkoMini()}</div>
        <div class="gc-t"><b>Плинко</b><small>Шарик падает по штырькам — множитель до ×76</small></div><span class="gc-go">Играть</span>
      </button>
      <button class="game-card glass gc-chicken" data-arc="chicken">
        <div class="gc-art"><span style="font-size:46px">🐔</span></div>
        <div class="gc-t"><b>Курочка</b><small>Переведи через дорогу и забери вовремя${ARC.chicken ? ' · <span style="color:var(--accent2)">забег идёт</span>' : ''}</small></div><span class="gc-go">Играть</span>
      </button>
      <section class="section">
        <div class="section__head"><h2>Лидеры аркады</h2><span>${ARC.rank ? 'ты #' + ARC.rank : 'выиграй, чтобы попасть'}</span></div>
        ${ARC.top.length ? ARC.top.map((t, i) => `<div class="lead glass ${t.me ? 'me' : ''}"><span class="lead__n">${['🥇', '🥈', '🥉'][i] || i + 1}</span><b>${esc(t.name)}</b><span>${COIN} ${fmt(t.won)}</span></div>`).join('') : '<div class="empty">Пока никого — стань первым</div>'}
      </section>
      <p class="sub" style="text-align:center;font-size:12px;margin-top:18px">Монеты нельзя купить, вывести или обменять на звёзды и подарки. Играем ради азарта, XP и места в таблице.</p>`;
  }
  function plinkoMini() {
    let s = '<svg viewBox="0 0 80 64" width="80" height="64">';
    for (let r = 0; r < 5; r++) for (let i = 0; i <= r; i++) s += `<circle cx="${40 + (i - r / 2) * 14}" cy="${8 + r * 11}" r="2.6" fill="rgba(255,255,255,.6)"/>`;
    return s + '<circle cx="47" cy="25" r="5" fill="#ffcc4d"/></svg>';
  }

  /* ---------- плинко ---------- */
  const PG = { gap: 26, row: 26, top: 24, w: 300 };
  function plinkoBoard() {
    const rows = A.PLINKO_ROWS, t = A.PLINKO[st.plRisk], cx = PG.w / 2;
    let pegs = '';
    for (let r = 0; r < rows; r++) for (let i = 0; i <= r + 1; i++) pegs += `<circle cx="${cx + (i - (r + 1) / 2) * PG.gap}" cy="${PG.top + r * PG.row}" r="3.2" class="peg" data-p="${r}-${i}"/>`;
    const y = PG.top + rows * PG.row;
    const slots = t.map((m, k) => {
      const hot = m >= 5 ? 'h3' : m >= 1.5 ? 'h2' : m >= 1 ? 'h1' : 'h0';
      return `<g class="slot-m ${hot}" data-slot="${k}"><rect x="${cx + (k - 5) * PG.gap - 12}" y="${y - 4}" width="24" height="22" rx="6"/><text x="${cx + (k - 5) * PG.gap}" y="${y + 11}">${m >= 10 ? Math.round(m) : m}</text></g>`;
    }).join('');
    return `<svg id="plBoard" class="pl-board" viewBox="0 0 ${PG.w} ${y + 24}">${pegs}${slots}</svg>`;
  }
  function plinko() {
    return `${head('Плинко', 'Аркада')}
      <div class="glass pl-wrap">${plinkoBoard()}</div>
      ${chips('plr', [['low', 'Низкий риск'], ['mid', 'Средний'], ['high', 'Высокий']], st.plRisk)}
      ${betBox(false)}
      <button class="btn btn--primary btn--block" data-arc="drop" style="margin-top:12px">Бросить шарик</button>`;
  }
  async function drop() {
    const bet = readBet(); if (!bet) return;
    if (bet > ARC.coins) { notify('error'); return toast('Не хватает монет'); }
    let r;
    try { r = await api('/api/arcade/plinko', { bet, risk: st.plRisk }); } catch (e) { notify('error'); return toast(e.message); }
    setCoins(ARC.coins - bet); haptic('light'); FX.sfx.pop();
    const svg = $('#plBoard'); if (!svg) return;
    const ns = 'http://www.w3.org/2000/svg', ball = document.createElementNS(ns, 'circle');
    ball.setAttribute('r', '7'); ball.setAttribute('class', 'pl-ball'); svg.appendChild(ball);
    const cx = PG.w / 2, pts = [[cx, PG.top - 18]];
    let rights = 0; const hits = [null];
    r.path.forEach((d, row) => { hits.push(`${row}-${rights + d}`); rights += d; pts.push([cx + (rights - (row + 1) / 2) * PG.gap, PG.top + row * PG.row + PG.row / 2]); });
    pts.push([cx + (r.slot - 5) * PG.gap, PG.top + A.PLINKO_ROWS * PG.row + 6]);
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], t0 = performance.now(), dur = 110;
      await new Promise(res => { (function f(now) { const k = Math.min(1, (now - t0) / dur), hop = Math.sin(k * Math.PI) * 6; ball.setAttribute('cx', x0 + (x1 - x0) * k); ball.setAttribute('cy', y0 + (y1 - y0) * k - hop); k < 1 ? requestAnimationFrame(f) : res(); })(t0); });
      if (i < pts.length - 1) {
        haptic('light'); FX.sfx.tick();
        const peg = hits[i] && svg.querySelector(`[data-p="${hits[i]}"]`);
        if (peg) { peg.classList.add('lit'); setTimeout(() => peg.classList.remove('lit'), 260); }
      }
    }
    const slot = svg.querySelector(`[data-slot="${r.slot}"]`); if (slot) { slot.classList.remove('flash'); void slot.getBBox(); slot.classList.add('flash'); }
    setTimeout(() => ball.remove(), 400);
    const pop = document.createElementNS(ns, 'text'); pop.setAttribute('x', pts.at(-1)[0]); pop.setAttribute('y', pts.at(-1)[1] - 14); pop.setAttribute('class', 'pl-pop');
    pop.textContent = '×' + r.mult; svg.appendChild(pop); setTimeout(() => pop.remove(), 1000);
    const at = slot ? FX.center(slot) : null, col = r.mult >= 5 ? '#ff4d8d' : r.mult >= 1.5 ? '#b56cff' : r.mult >= 1 ? '#3fa9ff' : '#9aa4bf';
    if (at) FX.burst(at[0], at[1], { colors: [col, '#fff'], n: r.mult >= 1 ? 18 + Math.min(60, r.mult * 4) : 8, speed: r.mult >= 5 ? 9 : 5 });
    if (r.mult >= 5) { FX.sfx.big(); if (at) FX.burst(at[0], at[1] - 60, { colors: ['#ffcc4d', '#ff4d8d', '#8b6cff', '#26e3c8', '#fff'], n: 80, speed: 12, kind: 'confetti', g: .3, life: 1.5 }); }
    else if (r.mult >= 1) FX.sfx.win(); else FX.sfx.tap();
    if (r.win > 0 && at) await FX.fly(at, '#arcCoins', { n: Math.max(3, Math.min(12, Math.round(r.mult * 3))) });
    setCoins(r.coins);
    if (r.mult >= 2) { notify('success'); toast(`×${r.mult} · +${fmt(r.win)} 🪙`); } else if (r.mult >= 1) toast(`×${r.mult} · ${fmt(r.win)} 🪙`);
  }

  /* ---------- курочка ---------- */
  function chicken() {
    const run = st.run, p = A.CHICKEN.risk[run ? run.risk : st.chRisk], step = run ? run.step : 0;
    const lanes = Array.from({ length: A.CHICKEN.lanes }, (_, i) => {
      const k = i + 1, passed = run && k <= step, here = k === step;
      return `<div class="lane ${passed ? 'passed' : ''} ${here && st.crashed ? 'boom' : ''}"><span class="lane__m">×${window.GLINT.chickenMult(k, p)}</span>
        <i class="car" style="animation-delay:-${(i * 0.37) % 1.6}s;animation-duration:${1.2 + (i % 3) * 0.35}s">${['🚗', '🚕', '🚙', '🚌', '🏎️'][i % 5]}</i>
        ${here ? `<span class="hen">${st.crashed ? '💥' : '🐔'}</span>` : ''}</div>`;
    }).join('');
    const live = run && !st.crashed;
    const cashTo = live && step > 0 ? Math.floor(run.bet * window.GLINT.chickenMult(step, p)) : 0;
    return `${head('Курочка', 'Аркада')}
      <div class="road glass" id="road"><div class="curb">${!run || step === 0 ? '<span class="hen">🐔</span>' : ''}</div>${lanes}<div class="curb finish">🏁</div></div>
      ${chips('chr', [['easy', 'Легко'], ['mid', 'Средне'], ['hard', 'Хардкор']], run ? run.risk : st.chRisk, !!live)}
      ${betBox(!!live)}
      ${live ? `<div class="row2" style="margin-top:12px"><button class="btn btn--ghost" data-arc="cash" ${step ? '' : 'disabled'}>Забрать ${step ? fmt(cashTo) + ' 🪙' : ''}</button><button class="btn btn--primary" data-arc="go">Вперёд →</button></div>`
        : `<button class="btn btn--primary btn--block" data-arc="start" style="margin-top:12px">${st.crashed ? 'Ещё раз' : 'Старт'}</button>`}`;
  }
  function scrollRoad() { const road = $('#road'), hen = road && road.querySelector('.lane .hen'); if (hen) road.scrollTo({ left: hen.parentElement.offsetLeft - road.clientWidth / 2 + 36, behavior: 'smooth' }); }

  /* ---------- колесо дня ---------- */
  function wheel() {
    const n = A.WHEEL.length, seg = 360 / n, R = 120;
    const total = A.WHEEL.reduce((s, x) => s + x.w, 0);
    const parts = A.WHEEL.map((s, i) => {
      const a0 = (i * seg - 90) * Math.PI / 180, a1 = ((i + 1) * seg - 90) * Math.PI / 180, am = ((i + .5) * seg - 90) * Math.PI / 180;
      return `<path d="M0 0L${R * Math.cos(a0)} ${R * Math.sin(a0)}A${R} ${R} 0 0 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)}Z" fill="${s.c}" opacity="${.35 + i * .1}"/>
        <text x="${R * .66 * Math.cos(am)}" y="${R * .66 * Math.sin(am)}" transform="rotate(${(i + .5) * seg} ${R * .66 * Math.cos(am)} ${R * .66 * Math.sin(am)})">${s.coins}</text>`;
    }).join('');
    return `${head('Колесо дня', 'Аркада')}
      <div class="wheel-wrap"><div class="wheel-pin"></div>
        <svg id="wheel" class="wheel" viewBox="-130 -130 260 260"><circle r="128" fill="#0e0e18" stroke="rgba(255,255,255,.15)" stroke-width="2"/>${parts}<circle r="22" fill="#0e0e18" stroke="rgba(255,255,255,.3)"/><text y="6" style="font-size:18px">🪙</text></svg></div>
      <button class="btn btn--primary btn--block" data-arc="spin" ${ARC.wheelReady ? '' : 'disabled'}>${ARC.wheelReady ? 'Крутить бесплатно' : 'Следующий спин — завтра'}</button>
      <p class="sub" style="text-align:center;font-size:12px;margin-top:12px">Шансы: ${A.WHEEL.map(s => `${s.coins} — ${Math.round(s.w / total * 100)}%`).join(' · ')}</p>`;
  }
  let wheelAngle = 0;
  async function spin() {
    let r; try { r = await api('/api/arcade/wheel', {}); } catch (e) { notify('error'); return toast(e.message); }
    ARC.wheelReady = false;
    const seg = 360 / A.WHEEL.length, target = 360 * 6 + (360 - (r.index + .5) * seg);
    wheelAngle = wheelAngle - (wheelAngle % 360) + target;
    const w = $('#wheel'); w.style.transform = `rotate(${wheelAngle}deg)`; FX.sfx.whoosh();
    // щелчки замедляются вместе с колесом
    const t0 = performance.now(); let last = 0;
    await new Promise(done => (function f(now) {
      const k = (now - t0) / 4100; if (k >= 1) return done();
      const gap = 40 + Math.pow(k, 2.2) * 420; if (now - last > gap) { last = now; FX.sfx.tick(); haptic('light'); }
      requestAnimationFrame(f);
    })(t0));
    await sleep(150);
    const [x, y] = FX.center(w); notify('success'); r.got >= 500 ? FX.sfx.big() : FX.sfx.win();
    FX.burst(x, y, { colors: [A.WHEEL[r.index].c, '#fff', '#ffcc4d'], n: 60 + (r.got >= 500 ? 80 : 0), speed: 10, kind: r.got >= 200 ? 'confetti' : 'spark', g: .25, life: 1.4 });
    await FX.fly([x, y], '#arcCoins', { n: Math.min(14, 4 + Math.round(r.got / 80)) });
    setCoins(r.coins); toast(`+${fmt(r.got)} 🪙`);
    const b = document.querySelector('[data-arc="spin"]'); if (b) { b.disabled = true; b.textContent = 'Следующий спин — завтра'; }
  }

  /* ---------- ввод ставки ---------- */
  function readBet() {
    const v = Math.floor(Number(($('#betIn') || {}).value || st.bet));
    if (!(v >= A.MIN_BET && v <= A.MAX_BET)) { toast(`Ставка от ${A.MIN_BET} до ${A.MAX_BET}`); return 0; }
    return (st.bet = v);
  }
  function setBet(kind) {
    const cur = readBet() || A.MIN_BET;
    st.bet = Math.max(A.MIN_BET, Math.min(A.MAX_BET, kind === 'half' ? Math.floor(cur / 2) : kind === 'double' ? cur * 2 : Math.min(ARC.coins, A.MAX_BET)));
    $('#betIn').value = st.bet; haptic();
  }

  /* ---------- API для app.js ---------- */
  const screen = () => (!ARC ? '<div class="empty">Загрузка…</div>' : game === 'plinko' ? plinko() : game === 'chicken' ? chicken() : game === 'wheel' ? wheel() : lobby());
  const paint = () => { $('#view').innerHTML = screen(); if (game === 'chicken') scrollRoad(); };
  async function onClick(el) {
    const bt = el.closest('[data-bet]'); if (bt) return setBet(bt.dataset.bet);
    const pr = el.closest('[data-plr]'); if (pr) { st.plRisk = pr.dataset.plr; haptic(); return paint(); }
    const cr = el.closest('[data-chr]'); if (cr) { st.chRisk = cr.dataset.chr; haptic(); return paint(); }
    const a = el.closest('[data-arc]'); if (!a) return false;
    const k = a.dataset.arc;
    if (k === 'drop') { drop(); return true; }
    if (busy) return true; busy = true;
    try {
      if (k === 'back') { game = null; await load(); paint(); }
      else if (k === 'plinko' || k === 'chicken' || k === 'wheel') { game = k; if (k === 'chicken' && st.run && !st.crashed) {} else if (k === 'chicken') { st.run = null; st.crashed = false; } paint(); window.scrollTo({ top: 0 }); }
      else if (k === 'bonus') { const r = await api('/api/arcade/bonus', {}); ARC.bonusReady = false; notify('success'); FX.sfx.win(); await FX.fly(a, '#arcCoins', { n: 12 }); setCoins(r.coins); toast(`+${r.got} 🪙`); paint(); }
      else if (k === 'spin') { await spin(); }
      else if (k === 'start') {
        FX.sfx.pop();
        const bet = readBet(); if (!bet) return true;
        const r = await api('/api/arcade/chicken/start', { bet, risk: st.chRisk });
        st.run = { id: r.id, bet: r.bet, risk: r.risk, step: 0 }; st.crashed = false; setCoins(r.coins); haptic('medium'); paint();
      }
      else if (k === 'go') {
        const r = await api('/api/arcade/chicken/step', {});
        st.run.step = r.step;
        if (r.crashed) {
          st.crashed = true; notify('error'); haptic('heavy'); FX.sfx.lose(); paint();
          const road = $('#road'); road.classList.add('shake', 'crash'); const hen = road.querySelector('.lane .hen');
          if (hen) { const [x, y] = FX.center(hen); FX.burst(x, y, { colors: ['#ff4d8d', '#ffb23f', '#fff'], n: 50, speed: 9 }); }
          toast('Сбила машина 💥');
        }
        else if (r.finished) {
          st.crashed = false; const won = r.win; st.run = null; notify('success'); FX.sfx.big(); paint();
          const road = $('#road'), [x, y] = FX.center(road); FX.burst(x, y, { colors: ['#ffcc4d', '#26e3c8', '#ff4d8d', '#fff'], n: 120, speed: 13, kind: 'confetti', g: .3, life: 1.6 });
          await FX.fly([x, y], '#arcCoins', { n: 14 }); setCoins(r.coins); toast(`Дошла до финиша! +${fmt(won)} 🪙`);
        }
        else { haptic('medium'); FX.sfx.hop(); paint(); const l = document.querySelector('.lane .hen'); if (l) l.parentElement.classList.add('here-new'); }
      }
      else if (k === 'cash') {
        const r = await api('/api/arcade/chicken/cash', {}); const hen = document.querySelector('.lane .hen'), from = hen ? FX.center(hen) : a;
        st.run = null; st.crashed = false; notify('success'); FX.sfx.win(); paint();
        await FX.fly(from, '#arcCoins', { n: Math.max(4, Math.min(14, Math.round(r.win / 20))) }); setCoins(r.coins); toast(`+${fmt(r.win)} 🪙`);
      }
    } catch (e) { notify('error'); toast(e.message); }
    finally { busy = false; }
    return true;
  }
  async function enter() { try { await load(); } catch (e) { toast(e.message); } }
  return { screen, onClick, enter };
};
