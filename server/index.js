/* Glint — сервер: раздаёт Mini App, API игры, вебхук бота и платежи Telegram Stars. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const C = require('../gifts/catalog.js');
const db = require('./db');
const tg = require('./telegram');
const game = require('./game');
const arcade = require('./arcade');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_URL = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, '');
const ADMIN_IDS = String(process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const SUPPORT = process.env.SUPPORT_CONTACT || '';
const STATIC = path.join(__dirname, '..', 'gifts');
let BOT_USERNAME = process.env.BOT_USERNAME || '';

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };
const SEC = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin' };

function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { ...SEC, 'content-type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', ...headers });
  res.end(isBuf || typeof body === 'string' ? body : JSON.stringify(body));
}
function readBody(req, limit = 32 * 1024) {
  return new Promise((ok, bad) => {
    let size = 0; const chunks = [];
    req.on('data', d => { size += d.length; if (size > limit) { bad(new game.GameError('Слишком большой запрос', 413)); req.destroy(); } else chunks.push(d); });
    req.on('end', () => { try { ok(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { bad(new game.GameError('Неверный JSON')); } });
    req.on('error', bad);
  });
}
function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.join(STATIC, rel);
  if (!file.startsWith(STATIC + path.sep) || rel.endsWith('.md')) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, { error: 'not found' });
    const ext = path.extname(file);
    send(res, 200, data, { 'content-type': TYPES[ext] || 'application/octet-stream', 'cache-control': ext === '.html' ? 'no-cache' : 'public, max-age=300' });
  });
}

/* Простой лимит частоты: RATE_LIMIT запросов за 10 секунд на пользователя (по умолчанию 60) */
const RATE = Number(process.env.RATE_LIMIT || 60);
const hits = new Map();
function limited(uid) {
  const now = Date.now(), h = hits.get(uid) || { t: now, n: 0 };
  if (now - h.t > 10000) { h.t = now; h.n = 0; }
  h.n++; hits.set(uid, h);
  return h.n > RATE;
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) if (now - v.t > 60000) hits.delete(k); }, 60000).unref();

const notify = (chatId, text, extra = {}) => tg.call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra }).catch(e => console.warn('notify:', e.message));
const esc = s => String(s || '').replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
const giftName = g => `${C.MODELS[g.model].name} #${g.num}`;
const appButton = (text, query = '') => ({ reply_markup: { inline_keyboard: [[{ text, web_app: { url: PUBLIC_URL + '/' + query } }]] } });

/* ---------------- API ---------------- */
const routes = {
  'GET /api/me': async ({ uid }) => ({ ...(await game.state(uid)), bot: BOT_USERNAME, payments: !!tg.TOKEN }),
  'POST /api/checkin': ({ uid }) => game.checkin(uid),
  'POST /api/quest': ({ uid, body }) => game.claimQuest(uid, String(body.k)),
  'POST /api/drop/mint': ({ uid }) => game.mintDrop(uid),
  'POST /api/forge': ({ uid, body }) => game.forge(uid, body.ids),
  'GET /api/market': ({ uid, url }) => game.market(url.searchParams.get('sort'), uid),
  'POST /api/market/list': ({ uid, body }) => game.list(uid, String(body.id), body.price),
  'POST /api/market/unlist': ({ uid, body }) => game.unlist(uid, String(body.id)),
  'POST /api/market/buy': async ({ uid, body }) => {
    const r = await game.buy(uid, String(body.id));
    notify(r.seller, `💰 Твой лот <b>${giftName(r.gift)}</b> продан за ★ ${r.price}.\nНа баланс: ★ ${r.price - r.fee} (комиссия ★ ${r.fee}).`);
    return { gift: r.gift };
  },
  'POST /api/gift/link': async ({ uid, body }) => {
    const r = await game.giftLink(uid, String(body.id));
    return { ...r, url: BOT_USERNAME ? `https://t.me/${BOT_USERNAME}?start=g_${r.code}` : `${PUBLIC_URL}/?claim=${r.code}` };
  },
  'POST /api/gift/cancel': ({ uid, body }) => game.giftCancel(uid, String(body.id)),
  'POST /api/gift/claim': async ({ uid, user, body }) => {
    const r = await game.giftClaim(uid, String(body.code));
    notify(r.fromId, `🎁 ${esc(user.first_name)} забрал(а) твой подарок <b>${giftName(r.gift)}</b>!`);
    return { gift: r.gift, from: r.from };
  },
  'POST /api/pass/buy': ({ uid }) => game.buyPass(uid),
  'POST /api/pass/claim': ({ uid, body }) => game.claimPass(uid, body.lvl),
  'GET /api/arcade': ({ uid }) => arcade.info(uid),
  'POST /api/arcade/bonus': ({ uid }) => arcade.bonus(uid),
  'POST /api/arcade/wheel': ({ uid }) => arcade.wheel(uid),
  'POST /api/arcade/plinko': ({ uid, body }) => arcade.plinko(uid, body.bet, String(body.risk)),
  'POST /api/arcade/chicken/start': ({ uid, body }) => arcade.chickenStart(uid, body.bet, String(body.risk)),
  'POST /api/arcade/chicken/step': ({ uid }) => arcade.chickenStep(uid),
  'POST /api/arcade/chicken/cash': ({ uid }) => arcade.chickenCash(uid),
  'POST /api/invoice': async ({ body }) => {
    const pack = C.PACKS.find(p => p.id === body.pack);
    if (!pack) throw new game.GameError('Нет такого пакета');
    const link = await tg.call('createInvoiceLink', {
      title: `${pack.stars + pack.bonus} звёзд Glint`,
      description: pack.bonus ? `${pack.stars} + ${pack.bonus} бонусом на баланс Glint` : `${pack.stars} звёзд на баланс Glint`,
      payload: 'pack:' + pack.id, currency: 'XTR', prices: [{ label: 'Звёзды Glint', amount: pack.stars }],
    });
    return { link };
  },
};

async function handleApi(req, res, url) {
  const key = `${req.method} ${url.pathname}`;
  const fn = routes[key];
  if (!fn) return send(res, 404, { error: 'Не найдено' });
  const auth = tg.verifyInitData(req.headers['x-init-data']);
  if (!auth) return send(res, 401, { error: 'Открой приложение из Telegram' });
  const uid = auth.user.id;
  if (limited(uid)) return send(res, 429, { error: 'Слишком часто — подожди пару секунд' });
  try {
    if (key === 'GET /api/me') await game.upsertUser(auth.user, auth.startParam);
    const body = req.method === 'POST' ? await readBody(req) : {};
    send(res, 200, await fn({ uid, user: auth.user, body, url }));
  } catch (e) {
    if (e instanceof game.GameError) return send(res, e.status, { error: e.message });
    console.error(key, e);
    send(res, 500, { error: 'Ошибка сервера, попробуй ещё раз' });
  }
}

/* ---------------- бот ---------------- */
const TERMS = `<b>Условия Glint</b>
• Звёзды Glint (★) — внутриигровая валюта. Её нельзя вывести или обменять на деньги.
• Монеты аркады (🪙) бесплатные: их нельзя купить, вывести или обменять на звёзды и подарки.
• Подарки — цифровые коллекционные предметы для игры, обмена и подарков. Это не инвестиция: их цена не гарантирована.
• Случайные только внешние признаки подарков. Редкость в дропе и Кузне всегда указана заранее.
• Возврат по покупкам — через /paysupport в течение 14 дней, если звёзды ещё не потрачены.`;

async function onUpdate(u) {
  if (u.pre_checkout_query) {
    const q = u.pre_checkout_query, pack = C.PACKS.find(p => 'pack:' + p.id === q.invoice_payload);
    const ok = !!pack && q.currency === 'XTR' && q.total_amount === pack.stars;
    return tg.call('answerPreCheckoutQuery', ok ? { pre_checkout_query_id: q.id, ok: true } : { pre_checkout_query_id: q.id, ok: false, error_message: 'Пакет устарел, открой магазин заново' });
  }
  const m = u.message;
  if (!m || !m.from) return;
  if (m.successful_payment) {
    const p = m.successful_payment;
    await game.upsertUser(m.from, '');
    const r = await game.creditPayment(m.from.id, p.telegram_payment_charge_id, p.total_amount, p.invoice_payload);
    if (r.duplicate) return;
    notify(m.chat.id, `✅ Начислено ★ ${r.credited}. Спасибо!`, appButton('Открыть Glint'));
    if (r.referrer && r.refBonus) notify(r.referrer, `🤝 Твой друг пополнил баланс — тебе +★ ${r.refBonus}`);
    return;
  }
  const text = (m.text || '').trim();
  const [cmd, ...args] = text.split(/\s+/);
  const isAdmin = ADMIN_IDS.includes(String(m.from.id));
  switch (cmd.replace(/@.*/, '')) {
    case '/start': {
      const payload = args[0] || '';
      await game.upsertUser(m.from, payload);
      if (payload.startsWith('g_')) return notify(m.chat.id, '🎁 Тебе прислали подарок! Жми, чтобы забрать:', appButton('Забрать подарок', '?claim=' + encodeURIComponent(payload.slice(2))));
      return notify(m.chat.id, `✨ <b>Glint</b> — коллекционные подарки.\n\nЗабирай лимитированные дропы, сплавляй 3 подарка в более редкий, торгуй на маркете и дари друзьям.`, appButton('Открыть Glint'));
    }
    case '/terms': return notify(m.chat.id, TERMS);
    case '/paysupport': return notify(m.chat.id, `Проблема с оплатой? Опиши её одним сообщением${SUPPORT ? ' и напиши ' + esc(SUPPORT) : ''}. Укажи дату и сумму — ответим в течение 24 часов.`);
    case '/stats': {
      if (!isAdmin) return;
      const s = await game.stats();
      return notify(m.chat.id, `<b>Glint · статистика</b>
👥 Игроков: ${s.users.total} (+${s.users.new24} за сутки), активны за сутки: ${s.users.dau}
⭐ Оплачено Stars: ${s.payments.total} (за сутки ${s.payments.d24}), платящих: ${s.payments.payers}
🛍 Маркет за сутки: ${s.sales24.n} сделок, оборот ★ ${s.sales24.vol}, комиссия ★ ${s.sales24.fees}
🎁 Дроп: ${s.drop ? `${esc(s.drop.title)} — ${s.drop.minted}/${s.drop.supply}` : 'нет'}`);
    }
    case '/drop': {
      if (!isAdmin) return;
      // /drop Название | модель | редкость | цена | тираж | часов
      const parts = text.slice(5).split('|').map(s => s.trim());
      if (parts.length !== 6) return notify(m.chat.id, `Формат: <code>/drop Название | модель 0-7 | редкость 0-4 | цена | тираж | часов</code>\nМодели: ${C.MODELS.map((x, i) => i + '=' + x.name).join(', ')}\nРедкость: ${C.TIERS.map((x, i) => i + '=' + x.name).join(', ')}`);
      try {
        const d = await game.createDrop({ title: parts[0], model: parts[1], tier: parts[2], price: parts[3], supply: parts[4], hours: parts[5] });
        return notify(m.chat.id, `🚀 Дроп «${esc(d.title)}» запущен: ${d.supply} шт. по ★ ${d.price}`);
      } catch (e) { return notify(m.chat.id, '❌ ' + esc(e.message)); }
    }
    case '/refund': {
      if (!isAdmin) return;
      const [userId, charge] = args;
      try {
        await tg.call('refundStarPayment', { user_id: Number(userId), telegram_payment_charge_id: charge });
        await db.pool.query('UPDATE payments SET refunded = true WHERE charge_id = $1', [charge]);
        return notify(m.chat.id, '↩️ Возврат выполнен. Начисленные ★ спиши вручную, если нужно.');
      } catch (e) { return notify(m.chat.id, '❌ ' + esc(e.message)); }
    }
    default:
      if (m.chat.type === 'private') return notify(m.chat.id, 'Жми кнопку, чтобы открыть Glint 👇', appButton('Открыть Glint'));
  }
}

async function handleWebhook(req, res) {
  if (req.headers['x-telegram-bot-api-secret-token'] !== tg.webhookSecret()) return send(res, 403, { error: 'forbidden' });
  let upd;
  try { upd = await readBody(req, 256 * 1024); } catch (e) { return send(res, 400, { error: 'bad' }); }
  try { await onUpdate(upd); } catch (e) { console.error('update', e); }
  send(res, 200, { ok: true });
}

/* ---------------- запуск ---------------- */
async function setupBot() {
  if (!tg.TOKEN) return console.warn('BOT_TOKEN не задан — бот и платежи выключены');
  try {
    const me = await tg.call('getMe');
    BOT_USERNAME = me.username;
    if (!PUBLIC_URL) return console.warn('PUBLIC_URL не задан — вебхук не настроен');
    await tg.call('setWebhook', { url: PUBLIC_URL + '/tg/webhook', secret_token: tg.webhookSecret(), allowed_updates: ['message', 'pre_checkout_query'], drop_pending_updates: false });
    await tg.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Glint', web_app: { url: PUBLIC_URL + '/' } } });
    await tg.call('setMyCommands', { commands: [{ command: 'start', description: 'Открыть Glint' }, { command: 'terms', description: 'Условия' }, { command: 'paysupport', description: 'Помощь с оплатой' }] });
    console.log(`Бот @${BOT_USERNAME} подключён, вебхук: ${PUBLIC_URL}/tg/webhook`);
  } catch (e) { console.error('Настройка бота не удалась:', e.message); }
}

async function main() {
  await db.migrate();
  const any = await db.pool.query('SELECT 1 FROM drops LIMIT 1');
  if (!any.rowCount) await game.createDrop({ title: 'Nova Orb Genesis', model: 0, tier: 1, price: 250, supply: 5000, hours: 24 * 14 });
  http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/health') return send(res, 200, { ok: true });
    if (url.pathname === '/tg/webhook' && req.method === 'POST') return handleWebhook(req, res);
    if (url.pathname.startsWith('/api/')) return handleApi(req, res, url);
    if (req.method === 'GET') return serveStatic(req, res, url.pathname);
    send(res, 405, { error: 'method' });
  }).listen(PORT, () => console.log(`Glint слушает порт ${PORT}`));
  setupBot();
  // Бесплатный Render усыпляет сервис без входящих запросов — будим себя каждые 10 минут
  if (PUBLIC_URL && process.env.KEEPALIVE !== '0') setInterval(() => fetch(PUBLIC_URL + '/health').catch(() => {}), 10 * 60 * 1000).unref();
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { onUpdate };
