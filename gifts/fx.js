/* Glint FX: звуки (синтез Web Audio, без файлов), частицы, летящие монеты, счётчики. */
window.GlintFX = (function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let muted = false;
  try { muted = localStorage.getItem('glint.mute') === '1'; } catch (e) {}

  /* ---------- звук ---------- */
  let ac = null;
  const ctx = () => { if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === 'suspended') ac.resume(); return ac; };
  function tone(freq, dur = 0.12, { type = 'sine', vol = 0.18, slide = 0, delay = 0 } = {}) {
    if (muted) return; const a = ctx(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur = 0.25, vol = 0.25) {
    if (muted) return; const a = ctx(); if (!a) return;
    const b = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const s = a.createBufferSource(), g = a.createGain(), f = a.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = vol; s.buffer = b; s.connect(f).connect(g).connect(a.destination); s.start();
  }
  const sfx = {
    tap: () => tone(660, 0.05, { type: 'triangle', vol: 0.06 }),
    tick: () => tone(1200 + Math.random() * 300, 0.035, { type: 'square', vol: 0.03 }),
    pop: () => tone(520, 0.09, { type: 'triangle', vol: 0.12, slide: 380 }),
    coin: (i = 0) => { tone(1318, 0.07, { type: 'square', vol: 0.05, delay: i * 0.05 }); tone(1976, 0.12, { type: 'square', vol: 0.04, delay: i * 0.05 + 0.06 }); },
    win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.08 })),
    big: () => { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, { type: 'sawtooth', vol: 0.07, delay: i * 0.07 })); tone(1568, 0.6, { type: 'triangle', vol: 0.1, delay: 0.45 }); },
    lose: () => { tone(300, 0.3, { type: 'sawtooth', vol: 0.08, slide: -200 }); noise(0.35, 0.3); },
    whoosh: () => { noise(0.4, 0.12); tone(200, 0.4, { vol: 0.05, slide: 600 }); },
    charge: () => tone(180, 0.9, { type: 'sawtooth', vol: 0.05, slide: 900 }),
    hop: () => tone(440, 0.1, { type: 'triangle', vol: 0.1, slide: 300 }),
  };

  /* ---------- слой частиц ---------- */
  let cv, c2, parts = [], running = false;
  function layer() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.className = 'fx-layer'; document.body.appendChild(cv); c2 = cv.getContext('2d');
    const fit = () => { const d = devicePixelRatio || 1; cv.width = innerWidth * d; cv.height = innerHeight * d; c2.setTransform(d, 0, 0, d, 0, 0); };
    fit(); addEventListener('resize', fit);
  }
  function loop() {
    running = true;
    c2.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(p => p.life > 0);
    for (const p of parts) {
      p.life -= p.decay; p.vx *= p.drag; p.vy = p.vy * p.drag + p.g; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      c2.save(); c2.globalAlpha = Math.max(0, Math.min(1, p.life)); c2.translate(p.x, p.y); c2.rotate(p.rot);
      if (p.kind === 'spark') { c2.fillStyle = p.c; c2.shadowColor = p.c; c2.shadowBlur = 10; c2.beginPath(); c2.arc(0, 0, Math.max(0.1, p.r * p.life), 0, 7); c2.fill(); }
      else { c2.fillStyle = p.c; c2.fillRect(-p.r, -p.r / 2.5, p.r * 2, p.r / 1.25); }
      c2.restore();
    }
    if (parts.length) requestAnimationFrame(loop); else { running = false; c2.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function burst(x, y, { colors = ['#fff'], n = 40, speed = 8, kind = 'spark', g = 0.15, life = 1 } = {}) {
    if (reduce) return; layer();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8);
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (kind === 'confetti' ? speed * 0.6 : 0), g, drag: 0.96, r: kind === 'spark' ? 2 + Math.random() * 3 : 4 + Math.random() * 4,
        c: colors[i % colors.length], life, decay: 0.012 + Math.random() * 0.012, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, kind });
    }
    if (!running) loop();
  }
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };

  /* ---------- летящие монеты ---------- */
  function fly(from, to, { emoji = '🪙', n = 8 } = {}) {
    const target = typeof to === 'string' ? document.querySelector(to) : to;
    if (!target) return Promise.resolve();
    const [tx, ty] = center(target), [fx, fy] = Array.isArray(from) ? from : center(from);
    if (reduce) return Promise.resolve();
    return new Promise(done => {
      let left = n;
      for (let i = 0; i < n; i++) {
        const el = document.createElement('div'); el.className = 'fx-coin'; el.textContent = emoji; document.body.appendChild(el);
        const sx = fx + (Math.random() - 0.5) * 60, sy = fy + (Math.random() - 0.5) * 40, cx = (sx + tx) / 2 + (Math.random() - 0.5) * 160, cy = Math.min(sy, ty) - 80 - Math.random() * 80;
        const t0 = performance.now() + i * 45, dur = 620 + Math.random() * 200;
        (function f(now) {
          const k = Math.max(0, Math.min(1, (now - t0) / dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * tx, y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ty;
          el.style.transform = `translate(${x - 11}px,${y - 11}px) scale(${1 - e * 0.4}) rotate(${e * 360}deg)`; el.style.opacity = k > 0 ? 1 : 0;
          if (k < 1) requestAnimationFrame(f);
          else { el.remove(); sfx.coin(); target.classList.remove('fx-hit'); void target.offsetWidth; target.classList.add('fx-hit'); if (--left === 0) done(); }
        })(performance.now());
      }
    });
  }

  /* ---------- плавный счётчик ---------- */
  const counters = new WeakMap();
  function count(el, to, fmt = n => Math.round(n).toLocaleString('ru-RU')) {
    if (!el) return;
    const from = counters.has(el) ? counters.get(el) : to;
    counters.set(el, to);
    if (reduce || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = Math.min(1200, 300 + Math.abs(to - from) * 2);
    (function f(now) {
      if (counters.get(el) !== to) return;
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(f);
    })(t0);
  }

  return {
    sfx, burst, fly, count, center,
    get muted() { return muted; },
    toggleMute() { muted = !muted; try { localStorage.setItem('glint.mute', muted ? '1' : '0'); } catch (e) {} if (!muted) sfx.pop(); return muted; },
  };
})();
