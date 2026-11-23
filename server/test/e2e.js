/* Сквозной тест: поднимает имитацию Telegram Bot API, запускает сервер и проходит все сценарии.
   Запуск: DATABASE_URL=postgres://... npm test  (база будет очищена!) */
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');
const assert = require('assert');
const { Pool } = require('pg');

const TOKEN = '123456:TEST_TOKEN';
const PORT = 3100, TG_PORT = 4001, BASE = `http://127.0.0.1:${PORT}`;
const sent = [], answers = [];

const mock = http.createServer((req, res) => {
  let b = ''; req.on('data', d => (b += d)); req.on('end', () => {
    const method = req.url.split('/').pop(), body = b ? JSON.parse(b) : {};
    const ok = result => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })); };
    if (!req.url.startsWith(`/bot${TOKEN}/`)) { res.writeHead(401); return res.end('{"ok":false,"description":"Unauthorized"}'); }
    if (method === 'getMe') return ok({ id: 999, username: 'GlintTestBot' });
    if (method === 'sendMessage') { sent.push(body); return ok({}); }
    if (method === 'answerPreCheckoutQuery') { answers.push(body); return ok(true); }
    if (method === 'createInvoiceLink') { assert.equal(body.currency, 'XTR'); return ok('https://t.me/$invoice-' + body.payload); }
    ok(true);
  });
});

function initData(user, extra = {}) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: 'q', user: JSON.stringify(user), ...extra });
  const check = [...p.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  p.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return p.toString();
}
const A = { id: 1001, first_name: 'Alice' }, B = { id: 1002, first_name: 'Bob' };
async function api(user, path, body, raw) {
  const r = await fetch(BASE + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-init-data': raw ?? (user ? initData(user) : '') }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json() };
}
const secret = crypto.createHash('sha256').update('glint-webhook:' + TOKEN).digest('hex').slice(0, 48);
const hook = (upd, s = secret) => fetch(BASE + '/tg/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': s }, body: JSON.stringify(upd) });
let uid = 1;
const msg = (from, text, extra = {}) => ({ update_id: uid++, message: { message_id: uid, from, chat: { id: from.id, type: 'private' }, date: 0, text, ...extra } });
const pay = (from, stars, payload, charge) => msg(from, undefined, { successful_payment: { currency: 'XTR', total_amount: stars, invoice_payload: payload, telegram_payment_charge_id: charge } });
const me = u => api(u, '/api/me').then(r => r.j);

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await new Promise(r => mock.listen(TG_PORT, r));
  const srv = spawn('node', ['index.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT, BOT_TOKEN: TOKEN, TG_API: `http://127.0.0.1:${TG_PORT}`, PUBLIC_URL: BASE, ADMIN_ID: '1001', RATE_LIMIT: '100000' }, stdio: ['ignore', 'inherit', 'inherit'] });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/health'); break; } catch (e) { await new Promise(r => setTimeout(r, 200)); } }
  let passed = 0; const t = async (name, fn) => { await fn(); passed++; console.log('  ✓', name); };
  try {
    await t('статика и защита путей', async () => {
      assert.equal((await fetch(BASE + '/')).status, 200);
      assert.equal((await fetch(BASE + '/catalog.js')).status, 200);
      assert.equal((await fetch(BASE + '/README.md')).status, 404);
      assert.equal((await fetch(BASE + '/..%2fserver%2fdb.js')).status, 404);
    });
    await t('без подписи и с подделкой — 401', async () => {
      assert.equal((await api(null, '/api/me')).status, 401);
      const fake = initData(A).replace('Alice', 'Mallory');
      assert.equal((await api(null, '/api/me', null, fake)).status, 401);
    });
    await t('вебхук без секрета — 403', async () => assert.equal((await hook({}, 'nope')).status, 403));
    await t('новый игрок получает стартовые подарки', async () => {
      const s = await me(A);
      assert.equal(s.user.balance, 0); assert.equal(s.items.length, 2); assert.equal(s.bot, 'GlintTestBot'); assert.ok(s.drop);
    });
    await t('/start ref_ — реферал и бонусный подарок', async () => {
      await hook(msg(B, '/start ref_1001'));
      assert.ok(sent.at(-1).reply_markup.inline_keyboard[0][0].web_app.url.startsWith(BASE));
      const s = await me(B); assert.equal(s.items.length, 3);
    });
    await t('нет звёзд — 402', async () => assert.equal((await api(B, '/api/drop/mint', {})).status, 402));
    await t('pre_checkout: верный пакет ок, неверная сумма — отказ', async () => {
      await hook({ update_id: uid++, pre_checkout_query: { id: 'pc1', from: B, currency: 'XTR', total_amount: 750, invoice_payload: 'pack:p750' } });
      await hook({ update_id: uid++, pre_checkout_query: { id: 'pc2', from: B, currency: 'XTR', total_amount: 1, invoice_payload: 'pack:p750' } });
      assert.equal(answers[0].ok, true); assert.equal(answers[1].ok, false);
    });
    await t('оплата Stars зачисляется один раз + 10% рефереру', async () => {
      await hook(pay(B, 750, 'pack:p750', 'ch1')); await hook(pay(B, 750, 'pack:p750', 'ch1'));
      assert.equal((await me(B)).user.balance, 1500); // первая покупка ×2
      assert.equal((await me(A)).user.balance, 75);
      assert.equal((await me(B)).user.firstPurchase, false);
    });
    await t('инвойс создаётся в XTR', async () => {
      const r = await api(B, '/api/invoice', { pack: 'p2000' }); assert.equal(r.status, 200); assert.ok(r.j.link.includes('pack:p2000'));
    });
    await t('дроп: списание и выпуск', async () => {
      const r = await api(B, '/api/drop/mint', {}); assert.equal(r.status, 200); assert.equal(r.j.gift.tier, 1);
      const s = await me(B); assert.equal(s.user.balance, 1250); assert.equal(s.drop.minted, 1);
    });
    await t('вход дня: один раз в сутки', async () => {
      const r = await api(B, '/api/checkin', {}); assert.equal(r.j.day, 1); assert.equal(r.j.stars, 25);
      assert.equal((await api(B, '/api/checkin', {})).status, 400);
    });
    await t('Кузня 3→1 и задание', async () => {
      const commons = (await me(B)).items.filter(g => g.tier === 0).map(g => g.id);
      assert.equal(commons.length, 3);
      assert.equal((await api(B, '/api/forge', { ids: [commons[0], commons[0], commons[1]] })).status, 400);
      const r = await api(B, '/api/forge', { ids: commons }); assert.equal(r.status, 200); assert.equal(r.j.gift.tier, 1);
      assert.equal((await api(B, '/api/forge', { ids: commons })).status, 403);
      const q = await api(B, '/api/quest', { k: 'forge' }); assert.equal(q.j.stars, 60);
      assert.equal((await api(B, '/api/quest', { k: 'forge' })).status, 400);
      assert.equal((await me(B)).user.balance, 1250 + 25 - 40 + 60);
    });
    await t('маркет: выставить, нельзя купить своё, покупка с комиссией', async () => {
      const gid = (await me(A)).items[0].id;
      assert.equal((await api(A, '/api/market/list', { id: gid, price: 5 })).status, 400);
      assert.equal((await api(B, '/api/market/list', { id: gid, price: 100 })).status, 403);
      assert.equal((await api(A, '/api/market/list', { id: gid, price: 100 })).status, 200);
      assert.equal((await api(A, '/api/forge', { ids: [gid, 'x', 'y'] })).status, 400);
      assert.equal((await api(A, '/api/market/buy', { id: gid })).status, 400);
      const lots = (await api(B, '/api/market')).j; assert.equal(lots.length, 1); assert.equal(lots[0].seller, 'Alice');
      const [r1, r2] = await Promise.all([api(B, '/api/market/buy', { id: gid }), api(B, '/api/market/buy', { id: gid })]);
      assert.deepEqual([r1.status, r2.status].sort(), [200, 409]);
      assert.equal((await me(A)).user.balance, 75 + 95);
      assert.ok(sent.some(m => m.chat_id == 1001 && m.text.includes('продан')));
    });
    await t('параллельные покупки не уводят баланс в минус', async () => {
      const rs = await Promise.all(Array.from({ length: 6 }, () => api(A, '/api/drop/mint', {})));
      assert.ok(rs.every(r => r.status === 402));
      await hook(pay(A, 750, 'pack:p750', 'ch2'));
      const rs2 = await Promise.all(Array.from({ length: 9 }, () => api(A, '/api/drop/mint', {})));
      assert.equal(rs2.filter(r => r.status === 200).length, 6); // 170 + 750×2 = 1670 → 6 по 250
      assert.equal((await me(A)).user.balance, 170 + 1500 - 1500);
    });
    await t('подарок по ссылке: забрать один раз, уведомить отправителя', async () => {
      const gid = (await me(B)).items.find(g => g.status === 'owned').id;
      const l = await api(B, '/api/gift/link', { id: gid }); assert.ok(l.j.url.includes('start=g_'));
      assert.equal((await api(B, '/api/gift/claim', { code: l.j.code })).status, 400);
      const c = await api(A, '/api/gift/claim', { code: l.j.code }); assert.equal(c.status, 200); assert.equal(c.j.from, 'Bob');
      assert.equal((await api(A, '/api/gift/claim', { code: l.j.code })).status, 409);
      assert.ok((await me(A)).items.some(g => g.id === gid));
      assert.ok(sent.some(m => m.chat_id == 1002 && m.text.includes('забрал')));
      await hook(msg(B, '/start g_' + l.j.code)); assert.ok(sent.at(-1).reply_markup.inline_keyboard[0][0].web_app.url.includes('claim='));
    });
    await t('пропуск и награды уровней', async () => {
      assert.equal((await api(B, '/api/pass/claim', { lvl: 3 })).status, 400);
      await hook(pay(B, 750, 'pack:p750', 'ch3'));
      assert.equal((await api(B, '/api/pass/buy', {})).status, 200);
      assert.equal((await api(B, '/api/pass/buy', {})).status, 400);
      const r = await api(B, '/api/pass/claim', { lvl: 1 }); assert.equal(r.status, 200);
      assert.equal((await api(B, '/api/pass/claim', { lvl: 1 })).status, 400);
      assert.equal((await api(B, '/api/pass/claim', { lvl: 12 })).status, 400);
    });
    await t('админ: /stats и /drop, чужим недоступно', async () => {
      const n = sent.length; await hook(msg(B, '/stats')); assert.equal(sent.length, n);
      await hook(msg(A, '/stats')); assert.ok(sent.at(-1).text.includes('Игроков: 2'));
      await hook(msg(A, '/drop Regalia Gold | 3 | 3 | 1500 | 100 | 48')); assert.ok(sent.at(-1).text.includes('запущен'));
      assert.equal((await me(A)).drop.title, 'Regalia Gold');
    });
    await t('аркада: честные коэффициенты (возврат < 100%)', async () => {
      const C = require('../../gifts/catalog.js'), comb = (n, k) => { let r = 1; for (let i = 1; i <= k; i++) r = r * (n - i + 1) / i; return r; };
      for (const [k, tb] of Object.entries(C.ARCADE.PLINKO)) {
        const ev = tb.reduce((s, m, i) => s + m * comb(10, i) / 1024, 0);
        assert.ok(ev < 1 && ev > 0.95, `plinko ${k} ev=${ev}`);
      }
      for (const p of Object.values(C.ARCADE.CHICKEN.risk)) for (let s = 1; s <= 10; s++) assert.ok(Math.pow(p, s) * C.chickenMult(s, p) <= 0.97 + 1e-9);
    });
    await t('аркада: бонус и колесо раз в день', async () => {
      let a = (await api(B, '/api/arcade')).j; assert.equal(a.coins, 500); assert.ok(a.bonusReady && a.wheelReady);
      assert.equal((await api(B, '/api/arcade/bonus', {})).j.coins, 800);
      assert.equal((await api(B, '/api/arcade/bonus', {})).status, 400);
      const w = (await api(B, '/api/arcade/wheel', {})).j; assert.ok(w.got >= 25); assert.equal(w.coins, 800 + w.got);
      assert.equal((await api(B, '/api/arcade/wheel', {})).status, 400);
    });
    await t('аркада: плинко — ставки, лимиты, выплаты', async () => {
      assert.equal((await api(B, '/api/arcade/plinko', { bet: 5, risk: 'low' })).status, 400);
      assert.equal((await api(B, '/api/arcade/plinko', { bet: 100, risk: 'nope' })).status, 400);
      assert.equal((await api(B, '/api/arcade/plinko', { bet: 5000, risk: 'low' })).status, 402);
      let bal = (await api(B, '/api/arcade')).j.coins;
      for (let i = 0; i < 5; i++) {
        const rr = await api(B, '/api/arcade/plinko', { bet: 20, risk: 'mid' }), r = rr.j; assert.equal(rr.status, 200, JSON.stringify(r));
        assert.equal(r.path.length, 10); assert.equal(r.slot, r.path.reduce((s, x) => s + x, 0));
        assert.equal(r.win, Math.floor(20 * r.mult)); assert.equal(r.coins, bal - 20 + r.win); bal = r.coins;
      }
      const rs = await Promise.all(Array.from({ length: 8 }, () => api(A, '/api/arcade/plinko', { bet: 100, risk: 'high' })));
      assert.ok(rs.every(r => r.status === 200 || r.status === 402));
      assert.ok((await api(A, '/api/arcade')).j.coins >= 0);
    });
    await t('аркада: курочка — шаги, вылет, забрать выигрыш', async () => {
      const s = await api(B, '/api/arcade/chicken/start', { bet: 50, risk: 'easy' }); assert.equal(s.status, 200);
      assert.equal((await api(B, '/api/arcade/chicken/start', { bet: 50, risk: 'easy' })).status, 400);
      assert.equal((await api(B, '/api/arcade/chicken/cash', {})).status, 400);
      let r = (await api(B, '/api/arcade/chicken/step', {})).j;
      if (r.crashed) { assert.equal((await api(B, '/api/arcade/chicken/cash', {})).status, 400); }
      else {
        const before = (await api(B, '/api/arcade')).j.coins;
        const cash = (await api(B, '/api/arcade/chicken/cash', {})).j;
        assert.equal(cash.win, Math.floor(50 * r.mult)); assert.equal(cash.coins, before + cash.win);
      }
      assert.equal((await api(B, '/api/arcade')).j.chicken, null);
      const top = (await api(B, '/api/arcade')).j.top; assert.ok(Array.isArray(top));
    });
    await t('журнал сходится с балансами', async () => {
      const r = await pool.query('SELECT u.id, u.balance, COALESCE(sum(l.delta),0) s FROM users u LEFT JOIN ledger l ON l.user_id = u.id GROUP BY u.id');
      r.rows.forEach(x => assert.equal(Number(x.balance), Number(x.s)));
    });
    console.log(`\nВсе тесты пройдены: ${passed}`);
  } catch (e) { console.error('\n✗ ПРОВАЛ:', e); process.exitCode = 1; }
  finally { srv.kill(); mock.close(); await pool.end(); }
})();
