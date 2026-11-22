/* SVG-арт подарков (процедурный, оригинальный). Требует catalog.js. */
(function () {
  const { MODELS, SKINS, BACKDROPS, SYMBOLS } = window.GLINT;
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
  window.GlintArt = { giftSVG, backdropSVG, art };
})();
