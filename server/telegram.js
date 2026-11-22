const crypto = require('crypto');

const TOKEN = process.env.BOT_TOKEN || '';
const API = (process.env.TG_API || 'https://api.telegram.org').replace(/\/$/, '');

/* Проверка подписи initData из Telegram.WebApp (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app) */
function verifyInitData(initData, maxAgeSec = 86400) {
  if (!initData || !TOKEN) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  const a = Buffer.from(calc, 'hex'), b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const age = Date.now() / 1000 - Number(params.get('auth_date') || 0);
  if (!(age < maxAgeSec)) return null;
  try {
    const user = JSON.parse(params.get('user') || 'null');
    if (!user || !user.id) return null;
    return { user, startParam: params.get('start_param') || '' };
  } catch (e) { return null; }
}

async function call(method, body = {}) {
  const r = await fetch(`${API}/bot${TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({ ok: false, description: 'bad json' }));
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description || r.status}`);
  return j.result;
}

/* Секрет вебхука выводится из токена, чтобы не заводить ещё одну переменную */
const webhookSecret = () => crypto.createHash('sha256').update('glint-webhook:' + TOKEN).digest('hex').slice(0, 48);

module.exports = { TOKEN, verifyInitData, call, webhookSecret };
