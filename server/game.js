const crypto = require('crypto');
const C = require('../gifts/catalog.js');
const { pool, tx } = require('./db');

class GameError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const fail = (m, s) => { throw new GameError(m, s); };

const SEASON = Number(process.env.SEASON || 1);
const today = () => new Date().toISOString().slice(0, 10);
const level = xp => Math.min(C.PASS_REWARDS.length, 1 + Math.floor(xp / C.XP_PER_LEVEL));
const newId = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n + 2);
function wroll(arr) {
  const total = arr.reduce((s, x) => s + x.w * 10, 0);
  let r = crypto.randomInt(total);
  for (let i = 0; i < arr.length; i++) { if ((r -= arr[i].w * 10) < 0) return i; }
  return 0;
}
const int = (v, name) => { const n = Number(v); if (!Number.isSafeInteger(n)) fail(`Неверное поле ${name}`); return n; };

/* ---------- базовые операции ---------- */
async function addBalance(c, uid, delta, reason) {
  const r = await c.query('UPDATE users SET balance = balance + $2 WHERE id = $1 AND balance + $2 >= 0 RETURNING balance', [uid, delta]);
  if (!r.rowCount) fail('Не хватает звёзд', 402);
  await c.query('INSERT INTO ledger(user_id, delta, reason) VALUES ($1,$2,$3)', [uid, delta, reason]);
  return Number(r.rows[0].balance);
}
async function mintGift(c, owner, model, tier, origin, fixed = {}) {
  const n = await c.query(`INSERT INTO counters(model, n) VALUES ($1, 1) ON CONFLICT (model) DO UPDATE SET n = counters.n + 1 RETURNING n`, [model]);
  const g = {
    id: newId(), owner, model, tier,
    skin: fixed.skin ?? wroll(C.SKINS), bd: fixed.bd ?? wroll(C.BACKDROPS), sym: fixed.sym ?? wroll(C.SYMBOLS),
    num: n.rows[0].n, origin,
  };
  await c.query('INSERT INTO gifts(id, owner, model, tier, skin, bd, sym, num, origin) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
    [g.id, g.owner, g.model, g.tier, g.skin, g.bd, g.sym, g.num, g.origin]);
  return pub(g);
}
const pub = g => ({ id: g.id, model: g.model, tier: g.tier, skin: g.skin, bd: g.bd, sym: g.sym, num: g.num, status: g.status || 'owned' });
async function lockUser(c, uid) {
  const r = await c.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [uid]);
  if (!r.rowCount) fail('Пользователь не найден', 404);
  return r.rows[0];
}
function questsOf(u) { const q = u.quests || {}; return q.d === today() ? q : { d: today(), claimed: [] }; }
async function bumpQuest(c, uid, k) {
  const u = (await c.query('SELECT quests FROM users WHERE id = $1', [uid])).rows[0];
  const q = questsOf(u); q[k] = (q[k] || 0) + 1;
  await c.query('UPDATE users SET quests = $2 WHERE id = $1', [uid, q]);
}
const addXP = (c, uid, n) => c.query('UPDATE users SET xp = xp + $2 WHERE id = $1', [uid, n]);
async function ownGift(c, uid, id, status = 'owned') {
  const r = await c.query('SELECT * FROM gifts WHERE id = $1 FOR UPDATE', [String(id)]);
  const g = r.rows[0];
  if (!g || String(g.owner) !== String(uid)) fail('Это не твой подарок', 403);
  if (g.status !== status) fail('Подарок сейчас недоступен');
  return g;
}

/* ---------- пользователи ---------- */
async function upsertUser(tg, startParam) {
  return tx(async c => {
    const ref = /^ref_(\d+)$/.exec(startParam || '');
    const referrer = ref && ref[1] !== String(tg.id) ? ref[1] : null;
    const r = await c.query(`
      INSERT INTO users(id, first_name, username, referrer) VALUES ($1,$2,$3,
        (SELECT id FROM users WHERE id = $4::bigint))
      ON CONFLICT (id) DO UPDATE SET first_name = EXCLUDED.first_name, username = EXCLUDED.username, seen_at = now()
      RETURNING (xmax = 0) AS created`, [tg.id, String(tg.first_name || '').slice(0, 64), tg.username || null, referrer]);
    if (r.rows[0].created) {
      // Стартовый набор: два Обычных подарка, чтобы сразу было что смотреть и сплавлять
      for (let i = 0; i < 2; i++) await mintGift(c, tg.id, crypto.randomInt(C.MODELS.length), 0, 'welcome');
      if (referrer) await mintGift(c, tg.id, crypto.randomInt(C.MODELS.length), 0, 'referral');
    }
    return r.rows[0].created;
  });
}

async function activeDrop(c = pool) {
  const r = await c.query('SELECT * FROM drops WHERE ends_at > now() AND minted < supply ORDER BY id DESC LIMIT 1');
  return r.rows[0] || null;
}

async function state(uid) {
  const [u, items, drop, vol] = await Promise.all([
    pool.query('SELECT * FROM users WHERE id = $1', [uid]).then(r => r.rows[0]),
    pool.query(`SELECT g.*, l.price FROM gifts g LEFT JOIN listings l ON l.gift_id = g.id
                WHERE g.owner = $1 AND g.status IN ('owned','listed','gifting') ORDER BY g.tier DESC, g.created_at DESC`, [uid]).then(r => r.rows),
    activeDrop(),
    pool.query(`SELECT COALESCE(sum(price),0)::bigint AS v FROM sales WHERE at > now() - interval '24 hours'`).then(r => Number(r.rows[0].v)),
  ]);
  if (!u) fail('Пользователь не найден', 404);
  const q = questsOf(u);
  const checkedToday = u.last_checkin === today();
  return {
    user: { id: String(u.id), name: u.first_name, balance: Number(u.balance), xp: u.xp, level: level(u.xp),
      pass: u.pass_season === SEASON, passClaimed: u.pass_claimed, streak: u.streak, checkedToday, firstPurchase: Number(u.stars_paid) === 0 },
    quests: C.QUESTS.map(x => ({ ...x, p: Math.min(q[x.k] || 0, x.n), claimed: (q.claimed || []).includes(x.k) })),
    items: items.map(g => ({ ...pub(g), price: g.price ? Number(g.price) : undefined })),
    drop: drop && { id: drop.id, title: drop.title, model: drop.model, tier: drop.tier, price: Number(drop.price), supply: drop.supply, minted: drop.minted, endsAt: drop.ends_at },
    volume24h: vol, season: SEASON,
  };
}

/* ---------- ежедневные награды ---------- */
async function checkin(uid) {
  return tx(async c => {
    const u = await lockUser(c, uid);
    const last = u.last_checkin;
    if (last === today()) fail('Сегодня награда уже получена');
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    const day = last === yesterday ? (u.streak % 7) + 1 : 1;
    await c.query('UPDATE users SET streak = $2, last_checkin = $3 WHERE id = $1', [uid, day, today()]);
    const rw = C.checkinReward(day);
    let gift = null;
    if (rw.stars) await addBalance(c, uid, rw.stars, 'checkin');
    if (rw.gift !== undefined) gift = await mintGift(c, uid, crypto.randomInt(C.MODELS.length), rw.gift, 'streak');
    await addXP(c, uid, 20);
    return { day, stars: rw.stars || 0, gift };
  });
}
async function claimQuest(uid, k) {
  const def = C.QUESTS.find(x => x.k === k) || fail('Нет такого задания');
  return tx(async c => {
    const u = await lockUser(c, uid);
    const q = questsOf(u);
    if ((q.claimed || []).includes(k)) fail('Уже получено');
    if ((q[k] || 0) < def.n) fail('Сначала выполни задание');
    q.claimed = [...(q.claimed || []), k];
    await c.query('UPDATE users SET quests = $2 WHERE id = $1', [uid, q]);
    await addBalance(c, uid, def.r, 'quest:' + k);
    await addXP(c, uid, 60);
    return { stars: def.r };
  });
}

/* ---------- дроп ---------- */
async function mintDrop(uid) {
  return tx(async c => {
    const d = (await c.query('SELECT * FROM drops WHERE ends_at > now() AND minted < supply ORDER BY id DESC LIMIT 1 FOR UPDATE')).rows[0];
    if (!d) fail('Дроп закончился — ищи на маркете');
    await addBalance(c, uid, -Number(d.price), 'drop:' + d.id);
    await c.query('UPDATE drops SET minted = minted + 1 WHERE id = $1', [d.id]);
    const g = await mintGift(c, uid, d.model, d.tier, 'drop:' + d.id);
    await addXP(c, uid, 40); await bumpQuest(c, uid, 'mint');
    return { gift: g };
  });
}
async function createDrop({ title, model, tier, price, supply, hours }) {
  model = int(model, 'model'); tier = int(tier, 'tier'); price = int(price, 'price'); supply = int(supply, 'supply'); hours = int(hours, 'hours');
  if (!(model >= 0 && model < C.MODELS.length) || !(tier >= 0 && tier < C.TIERS.length) || price < 1 || supply < 1 || hours < 1) fail('Неверные параметры дропа');
  const r = await pool.query(`INSERT INTO drops(title, model, tier, price, supply, ends_at) VALUES ($1,$2,$3,$4,$5, now() + ($6 || ' hours')::interval) RETURNING *`,
    [String(title || C.MODELS[model].name).slice(0, 60), model, tier, price, supply, String(hours)]);
  return r.rows[0];
}

/* ---------- кузня ---------- */
async function forge(uid, ids) {
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) fail('Нужно ровно 3 разных подарка');
  return tx(async c => {
    const gs = [];
    for (const id of ids) gs.push(await ownGift(c, uid, id));
    const tier = gs[0].tier;
    if (gs.some(g => g.tier !== tier)) fail('Подарки должны быть одной редкости');
    if (tier >= C.TIERS.length - 1) fail('Это уже максимальная редкость');
    await addBalance(c, uid, -C.FORGE_FEE[tier], 'forge');
    await c.query(`UPDATE gifts SET status = 'burned', owner = NULL WHERE id = ANY($1)`, [ids]);
    const g = await mintGift(c, uid, crypto.randomInt(C.MODELS.length), tier + 1, 'forge');
    await addXP(c, uid, 80); await bumpQuest(c, uid, 'forge');
    return { gift: g };
  });
}

/* ---------- маркет ---------- */
async function market(sort = 'new', uid) {
  const order = { cheap: 'l.price ASC', rare: 'g.tier DESC, l.price DESC', new: 'l.created_at DESC' }[sort] || 'l.created_at DESC';
  const r = await pool.query(`SELECT g.*, l.price, l.seller, u.first_name AS seller_name FROM listings l
    JOIN gifts g ON g.id = l.gift_id JOIN users u ON u.id = l.seller ORDER BY ${order} LIMIT 100`);
  return r.rows.map(g => ({ ...pub(g), price: Number(g.price), seller: g.seller_name, mine: String(g.seller) === String(uid) }));
}
async function list(uid, id, price) {
  price = int(price, 'price');
  if (price < 10 || price > 10_000_000) fail('Цена от 10 до 10 000 000 ★');
  return tx(async c => {
    await ownGift(c, uid, id);
    await c.query(`UPDATE gifts SET status = 'listed' WHERE id = $1`, [id]);
    await c.query('INSERT INTO listings(gift_id, seller, price) VALUES ($1,$2,$3)', [id, uid, price]);
    return { ok: true };
  });
}
async function unlist(uid, id) {
  return tx(async c => {
    await ownGift(c, uid, id, 'listed');
    await c.query('DELETE FROM listings WHERE gift_id = $1', [id]);
    await c.query(`UPDATE gifts SET status = 'owned' WHERE id = $1`, [id]);
    return { ok: true };
  });
}
async function buy(uid, id) {
  return tx(async c => {
    const l = (await c.query('SELECT * FROM listings WHERE gift_id = $1 FOR UPDATE', [String(id)])).rows[0];
    if (!l) fail('Лот уже продан', 409);
    if (String(l.seller) === String(uid)) fail('Нельзя купить свой лот');
    const price = Number(l.price), fee = Math.ceil(price * C.MARKET_FEE);
    await addBalance(c, uid, -price, 'buy:' + id);
    await addBalance(c, l.seller, price - fee, 'sell:' + id);
    await c.query('DELETE FROM listings WHERE gift_id = $1', [id]);
    const g = (await c.query(`UPDATE gifts SET owner = $2, status = 'owned' WHERE id = $1 RETURNING *`, [id, uid])).rows[0];
    await c.query('INSERT INTO sales(gift_id, seller, buyer, price, fee) VALUES ($1,$2,$3,$4,$5)', [id, l.seller, uid, price, fee]);
    await addXP(c, uid, 30); await bumpQuest(c, uid, 'buy');
    return { gift: pub(g), seller: l.seller, price, fee };
  });
}

/* ---------- подарить другу по ссылке ---------- */
async function giftLink(uid, id) {
  return tx(async c => {
    await ownGift(c, uid, id);
    const code = newId(10);
    await c.query(`UPDATE gifts SET status = 'gifting' WHERE id = $1`, [id]);
    await c.query('INSERT INTO gift_links(code, gift_id, from_user) VALUES ($1,$2,$3)', [code, id, uid]);
    await addXP(c, uid, 50); await bumpQuest(c, uid, 'send');
    return { code };
  });
}
async function giftCancel(uid, id) {
  return tx(async c => {
    await ownGift(c, uid, id, 'gifting');
    await c.query('DELETE FROM gift_links WHERE gift_id = $1 AND claimed_by IS NULL', [id]);
    await c.query(`UPDATE gifts SET status = 'owned' WHERE id = $1`, [id]);
    return { ok: true };
  });
}
async function giftClaim(uid, code) {
  return tx(async c => {
    const l = (await c.query('SELECT * FROM gift_links WHERE code = $1 FOR UPDATE', [String(code)])).rows[0];
    if (!l) fail('Ссылка недействительна', 404);
    if (l.claimed_by) fail(String(l.claimed_by) === String(uid) ? 'Ты уже забрал этот подарок' : 'Этот подарок уже забрали', 409);
    if (String(l.from_user) === String(uid)) fail('Это твой подарок — отправь ссылку другу');
    const g = (await c.query('SELECT * FROM gifts WHERE id = $1 FOR UPDATE', [l.gift_id])).rows[0];
    if (!g || g.status !== 'gifting') fail('Подарок отозван', 410);
    await c.query('UPDATE gift_links SET claimed_by = $2 WHERE code = $1', [code, uid]);
    const ng = (await c.query(`UPDATE gifts SET owner = $2, status = 'owned' WHERE id = $1 RETURNING *`, [g.id, uid])).rows[0];
    const from = (await c.query('SELECT first_name FROM users WHERE id = $1', [l.from_user])).rows[0];
    return { gift: pub(ng), from: from ? from.first_name : '', fromId: l.from_user };
  });
}

/* ---------- сезонный пропуск ---------- */
async function buyPass(uid) {
  return tx(async c => {
    const u = await lockUser(c, uid);
    if (u.pass_season === SEASON) fail('Пропуск уже активен');
    await addBalance(c, uid, -C.PASS_PRICE, 'pass:' + SEASON);
    await c.query(`UPDATE users SET pass_season = $2, pass_claimed = '{}' WHERE id = $1`, [uid, SEASON]);
    return { ok: true };
  });
}
async function claimPass(uid, lvl) {
  lvl = int(lvl, 'lvl');
  const rw = C.PASS_REWARDS.find(r => r.lvl === lvl) || fail('Нет такого уровня');
  return tx(async c => {
    const u = await lockUser(c, uid);
    if (level(u.xp) < lvl) fail('Уровень ещё не открыт');
    if (rw.prem && u.pass_season !== SEASON) fail('Нужен премиум-пропуск');
    if (u.pass_claimed.includes(lvl)) fail('Уже получено');
    await c.query('UPDATE users SET pass_claimed = array_append(pass_claimed, $2) WHERE id = $1', [uid, lvl]);
    let gift = null;
    if (rw.stars) await addBalance(c, uid, rw.stars, 'pass-lvl:' + lvl);
    if (rw.gift) gift = await mintGift(c, uid, rw.gift.model, rw.gift.tier, 'pass:' + SEASON);
    return { stars: rw.stars || 0, gift };
  });
}

/* ---------- платежи Stars ---------- */
async function creditPayment(uid, chargeId, stars, payload) {
  const pack = C.PACKS.find(p => 'pack:' + p.id === payload);
  if (!pack || pack.stars !== stars) throw new Error(`Payment mismatch ${payload} ${stars}`);
  return tx(async c => {
    // Первая покупка — звёзды ×2 (бонус равен оплаченной сумме)
    const first = !(await c.query('SELECT 1 FROM payments WHERE user_id = $1 LIMIT 1', [uid])).rowCount;
    const credited = pack.stars + pack.bonus + (first ? pack.stars : 0);
    const ins = await c.query('INSERT INTO payments(charge_id, user_id, stars, credited, payload) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',
      [chargeId, uid, stars, credited, payload]);
    if (!ins.rowCount) return { duplicate: true };
    await addBalance(c, uid, credited, 'topup:' + chargeId);
    await c.query('UPDATE users SET stars_paid = stars_paid + $2 WHERE id = $1', [uid, stars]);
    const ref = (await c.query('SELECT referrer FROM users WHERE id = $1', [uid])).rows[0];
    let refBonus = 0;
    if (ref && ref.referrer) {
      refBonus = Math.floor(stars * C.REF_SHARE);
      if (refBonus > 0) await addBalance(c, ref.referrer, refBonus, 'ref:' + uid);
    }
    return { credited, first, referrer: ref && ref.referrer, refBonus };
  });
}

async function stats() {
  const q = s => pool.query(s).then(r => r.rows[0]);
  const [u, p, s, d] = await Promise.all([
    q(`SELECT count(*)::int total, count(*) FILTER (WHERE created_at > now() - interval '24 hours')::int new24, count(*) FILTER (WHERE seen_at > now() - interval '24 hours')::int dau FROM users`),
    q(`SELECT COALESCE(sum(stars) FILTER (WHERE NOT refunded),0)::bigint total, COALESCE(sum(stars) FILTER (WHERE at > now() - interval '24 hours' AND NOT refunded),0)::bigint d24, count(DISTINCT user_id)::int payers FROM payments`),
    q(`SELECT count(*)::int n, COALESCE(sum(price),0)::bigint vol, COALESCE(sum(fee),0)::bigint fees FROM sales WHERE at > now() - interval '24 hours'`),
    q(`SELECT title, minted, supply FROM drops ORDER BY id DESC LIMIT 1`),
  ]);
  return { users: u, payments: p, sales24: s, drop: d };
}

module.exports = {
  GameError, upsertUser, state, checkin, claimQuest, mintDrop, createDrop, activeDrop, forge,
  market, list, unlist, buy, giftLink, giftCancel, giftClaim, buyPass, claimPass, creditPayment, stats,
};
