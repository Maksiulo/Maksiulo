/* Аркада на бесплатных монетах: плинко, курочка, колесо дня, лидеры.
   Монеты не покупаются и не обмениваются на звёзды или подарки — это не азартная игра на деньги. */
const crypto = require('crypto');
const C = require('../gifts/catalog.js');
const { pool, tx } = require('./db');
const { GameError } = require('./game');

const A = C.ARCADE;
const fail = (m, s) => { throw new GameError(m, s); };
const today = () => new Date().toISOString().slice(0, 10);
const rand = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;
function betOf(v) {
  const b = Number(v);
  if (!Number.isSafeInteger(b) || b < A.MIN_BET || b > A.MAX_BET) fail(`Ставка от ${A.MIN_BET} до ${A.MAX_BET} монет`);
  return b;
}
async function lock(c, uid) {
  const r = await c.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [uid]);
  if (!r.rowCount) fail('Пользователь не найден', 404);
  return r.rows[0];
}
async function coins(c, uid, delta, won = 0) {
  const r = await c.query('UPDATE users SET coins = coins + $2, coins_won = coins_won + $3 WHERE id = $1 AND coins + $2 >= 0 RETURNING coins', [uid, delta, won]);
  if (!r.rowCount) fail('Не хватает монет — забери бонус дня или крутани колесо', 402);
  return Number(r.rows[0].coins);
}
/* XP за игры с дневным лимитом, чтобы пропуск нельзя было «нафармить» */
async function gameXP(c, u) {
  const x = u.arcade_xp && u.arcade_xp.d === today() ? u.arcade_xp : { d: today(), n: 0 };
  if (x.n >= A.XP_DAY_CAP) return;
  x.n += A.XP_PER_GAME;
  await c.query('UPDATE users SET xp = xp + $2, arcade_xp = $3 WHERE id = $1', [u.id, A.XP_PER_GAME, x]);
}

async function info(uid) {
  const [u, top, live] = await Promise.all([
    pool.query('SELECT id, coins, coins_won, coins_bonus, wheel_day FROM users WHERE id = $1', [uid]).then(r => r.rows[0]),
    pool.query('SELECT id, first_name, coins_won FROM users WHERE coins_won > 0 ORDER BY coins_won DESC LIMIT 10').then(r => r.rows),
    pool.query(`SELECT id, bet, risk, step FROM chicken WHERE user_id = $1 AND status = 'live'`, [uid]).then(r => r.rows[0]),
  ]);
  const rank = u.coins_won > 0 ? Number((await pool.query('SELECT count(*) + 1 AS r FROM users WHERE coins_won > $1', [u.coins_won])).rows[0].r) : null;
  return {
    coins: Number(u.coins), won: Number(u.coins_won), rank,
    bonusReady: u.coins_bonus !== today(), wheelReady: u.wheel_day !== today(),
    top: top.map(t => ({ name: t.first_name, won: Number(t.coins_won), me: String(t.id) === String(uid) })),
    chicken: live ? { id: live.id, bet: Number(live.bet), risk: live.risk, step: live.step } : null,
  };
}

async function bonus(uid) {
  return tx(async c => {
    const u = await lock(c, uid);
    if (u.coins_bonus === today()) fail('Бонус уже получен — приходи завтра');
    await c.query('UPDATE users SET coins_bonus = $2 WHERE id = $1', [uid, today()]);
    return { coins: await coins(c, uid, A.DAILY), got: A.DAILY };
  });
}

async function wheel(uid) {
  return tx(async c => {
    const u = await lock(c, uid);
    if (u.wheel_day === today()) fail('Колесо уже крутили сегодня');
    const total = A.WHEEL.reduce((s, x) => s + x.w, 0);
    let r = crypto.randomInt(total), i = 0;
    for (; i < A.WHEEL.length; i++) if ((r -= A.WHEEL[i].w) < 0) break;
    const seg = A.WHEEL[i];
    await c.query('UPDATE users SET wheel_day = $2 WHERE id = $1', [uid, today()]);
    return { index: i, got: seg.coins, coins: await coins(c, uid, seg.coins) };
  });
}

async function plinko(uid, betIn, risk) {
  const table = A.PLINKO[risk] || fail('Неверный риск');
  const bet = betOf(betIn);
  return tx(async c => {
    const u = await lock(c, uid);
    await coins(c, uid, -bet);
    const path = Array.from({ length: A.PLINKO_ROWS }, () => crypto.randomInt(2));
    const slot = path.reduce((s, x) => s + x, 0), mult = table[slot];
    const win = Math.floor(bet * mult);
    const bal = await coins(c, uid, win, Math.max(0, win - bet));
    await gameXP(c, u);
    return { path, slot, mult, win, coins: bal };
  });
}

async function chickenStart(uid, betIn, risk) {
  if (!A.CHICKEN.risk[risk]) fail('Неверная сложность');
  const bet = betOf(betIn);
  return tx(async c => {
    const u = await lock(c, uid);
    const live = await c.query(`SELECT 1 FROM chicken WHERE user_id = $1 AND status = 'live'`, [uid]);
    if (live.rowCount) fail('Сначала закончи текущий забег');
    const bal = await coins(c, uid, -bet);
    const id = crypto.randomBytes(8).toString('hex');
    await c.query('INSERT INTO chicken(id, user_id, bet, risk) VALUES ($1,$2,$3,$4)', [id, uid, bet, risk]);
    await gameXP(c, u);
    return { id, bet, risk, step: 0, coins: bal };
  });
}
async function liveRun(c, uid) {
  const g = (await c.query(`SELECT * FROM chicken WHERE user_id = $1 AND status = 'live' FOR UPDATE`, [uid])).rows[0];
  if (!g) fail('Нет активного забега');
  return g;
}
async function chickenStep(uid) {
  return tx(async c => {
    const g = await liveRun(c, uid), p = A.CHICKEN.risk[g.risk];
    if (rand() >= p) {
      await c.query(`UPDATE chicken SET status = 'lost', step = step + 1 WHERE id = $1`, [g.id]);
      return { crashed: true, step: g.step + 1, win: 0 };
    }
    const step = g.step + 1;
    if (step >= A.CHICKEN.lanes) {
      const win = Math.floor(Number(g.bet) * C.chickenMult(step, p));
      await c.query(`UPDATE chicken SET status = 'won', step = $2 WHERE id = $1`, [g.id, step]);
      const bal = await coins(c, uid, win, Math.max(0, win - Number(g.bet)));
      return { crashed: false, step, finished: true, win, coins: bal };
    }
    await c.query('UPDATE chicken SET step = $2 WHERE id = $1', [g.id, step]);
    return { crashed: false, step, mult: C.chickenMult(step, p) };
  });
}
async function chickenCash(uid) {
  return tx(async c => {
    const g = await liveRun(c, uid);
    if (g.step === 0) fail('Сделай хотя бы один шаг');
    const win = Math.floor(Number(g.bet) * C.chickenMult(g.step, A.CHICKEN.risk[g.risk]));
    await c.query(`UPDATE chicken SET status = 'won' WHERE id = $1`, [g.id]);
    const bal = await coins(c, uid, win, Math.max(0, win - Number(g.bet)));
    return { win, step: g.step, coins: bal };
  });
}

module.exports = { info, bonus, wheel, plinko, chickenStart, chickenStep, chickenCash };
