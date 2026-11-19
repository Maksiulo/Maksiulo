(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const root = document.documentElement;

  /* ---------- Theme ---------- */
  try {
    const saved = localStorage.getItem("theme");
    if (saved) root.dataset.theme = saved;
    else if (matchMedia("(prefers-color-scheme: light)").matches) root.dataset.theme = "light";
  } catch (e) {}
  $("#themeToggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) {}
  });

  /* ---------- Loader ---------- */
  document.body.classList.add("loading");
  const bar = $("#loaderBar"), pct = $("#loaderPct");
  let p = 0;
  const tick = setInterval(() => {
    p = Math.min(100, p + Math.random() * 18 + 6);
    bar.style.width = p + "%";
    pct.textContent = Math.round(p);
    if (p >= 100) {
      clearInterval(tick);
      setTimeout(() => {
        $("#loader").classList.add("done");
        document.body.classList.remove("loading");
        document.body.classList.add("ready");
        startTyping();
      }, 250);
    }
  }, reduced ? 10 : 90);

  /* ---------- Clock & year ---------- */
  const clock = $("#clock");
  const setClock = () => {
    try {
      clock.textContent = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" });
    } catch (e) { clock.textContent = new Date().toTimeString().slice(0, 5); }
  };
  setClock(); setInterval(setClock, 15000);
  $("#year").textContent = new Date().getFullYear();

  /* ---------- Hero word stagger ---------- */
  $$(".hero__title .word").forEach((w, i) => (w.style.transitionDelay = 0.08 * i + "s"));

  /* ---------- Typed word ---------- */
  function startTyping() {
    const el = $("#typed");
    const words = ["пройти", "листать", "запомнить", "показать", "купить"];
    if (reduced) return;
    let wi = 0, ci = words[0].length, del = true;
    setTimeout(function loop() {
      const w = words[wi];
      ci += del ? -1 : 1;
      el.textContent = w.slice(0, ci) || "​";
      let d = del ? 55 : 95;
      if (!del && ci === w.length) { del = true; d = 2200; }
      else if (del && ci === 0) { del = false; wi = (wi + 1) % words.length; d = 300; }
      setTimeout(loop, d);
    }, 2600);
  }

  /* ---------- Reveal on scroll ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const sibs = $$(".reveal", el.parentElement);
      el.style.transitionDelay = Math.min(sibs.indexOf(el), 5) * 0.08 + "s";
      el.classList.add("in");
      io.unobserve(el);
      setTimeout(() => (el.style.transitionDelay = ""), 1400);
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
  $$(".reveal").forEach((el) => io.observe(el));

  /* ---------- Counters ---------- */
  const cio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target, to = +el.dataset.to, dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || "";
      const t0 = performance.now(), dur = reduced ? 1 : 1800;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), v = to * (1 - Math.pow(1 - k, 4));
        el.textContent = v.toFixed(dec).replace(".", ",") + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    });
  }, { threshold: 0.6 });
  $$(".count").forEach((el) => cio.observe(el));

  /* ---------- Nav: hide on scroll, progress, active link ---------- */
  const nav = $("#nav"), prog = $("#progress");
  let lastY = 0;
  const onScroll = () => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle("scrolled", y > 20);
    nav.classList.toggle("hidden", y > lastY && y > 400 && !$("#navLinks").classList.contains("open"));
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  const links = $$(".nav__links a");
  const sio = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
    });
  }, { rootMargin: "-45% 0px -50% 0px" });
  $$("section[id]").forEach((s) => sio.observe(s));

  /* ---------- Mobile menu ---------- */
  const burger = $("#burger"), menu = $("#navLinks");
  burger.addEventListener("click", () => {
    const open = menu.classList.toggle("open");
    burger.setAttribute("aria-expanded", open);
  });
  links.forEach((a) => a.addEventListener("click", () => { menu.classList.remove("open"); burger.setAttribute("aria-expanded", false); }));

  /* ---------- Cursor, magnetic, tilt, glow ---------- */
  if (finePointer && !reduced) {
    const cur = $("#cursor");
    let cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener("mousemove", (e) => { tx = e.clientX; ty = e.clientY; });
    (function follow() {
      cx += (tx - cx) * 0.18; cy += (ty - cy) * 0.18;
      cur.style.transform = `translate(${cx}px, ${cy}px)`;
      requestAnimationFrame(follow);
    })();
    $$("a, button, .project, input, textarea").forEach((el) => {
      el.addEventListener("mouseenter", () => cur.classList.add("hover"));
      el.addEventListener("mouseleave", () => cur.classList.remove("hover"));
    });

    $$(".magnetic").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect();
        el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.25}px, ${(e.clientY - r.top - r.height / 2) * 0.35}px)`;
      });
      el.addEventListener("mouseleave", () => (el.style.transform = ""));
    });

    $$(".tilt").forEach((el) => {
      el.addEventListener("mousemove", (e) => {
        const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * 7}deg) rotateY(${(x - 0.5) * 9}deg) translateY(-4px)`;
        el.style.setProperty("--mx", x * 100 + "%");
        el.style.setProperty("--my", y * 100 + "%");
      });
      el.addEventListener("mouseleave", () => (el.style.transform = ""));
    });
  }

  /* ---------- RPG dialog ---------- */
  const lines = [
    "Привет! Я превращаю идеи в продукты, которые цепляют с первой секунды.",
    "Сайт, приложение или ролик — у каждого проекта есть сюжет и финал.",
    "Моя суперсила: сделать так, чтобы человек дошёл до конца. И кликнул.",
    "Готов к новому заданию? Жми «Связаться» ⚔️",
  ];
  let li = 0, typingTimer;
  const dText = $("#dialogText");
  const typeLine = (s) => {
    clearInterval(typingTimer);
    if (reduced) { dText.textContent = s; return; }
    let i = 0; dText.textContent = "";
    typingTimer = setInterval(() => { dText.textContent = s.slice(0, ++i); if (i >= s.length) clearInterval(typingTimer); }, 22);
  };
  $("#dialogNext").addEventListener("click", () => { li = (li + 1) % lines.length; typeLine(lines[li]); });

  /* ---------- Project filter ---------- */
  $$(".filter").forEach((btn) => btn.addEventListener("click", () => {
    $$(".filter").forEach((b) => b.classList.toggle("is-active", b === btn));
    const f = btn.dataset.filter;
    $$(".project").forEach((p) => {
      const show = f === "all" || p.dataset.cat === f;
      p.classList.toggle("out", !show);
      if (show) { p.classList.remove("in"); requestAnimationFrame(() => requestAnimationFrame(() => p.classList.add("in"))); }
    });
  }));

  /* ---------- Toast ---------- */
  const toast = $("#toast");
  const showToast = (msg) => {
    toast.textContent = msg; toast.classList.add("show");
    clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.classList.remove("show"), 2800);
  };
  $$(".project").forEach((p) => p.addEventListener("click", () => showToast("УРОВЕНЬ: " + $("h3", p).textContent.toUpperCase() + " ✓")));

  /* ---------- Form ---------- */
  $("#form").addEventListener("submit", (e) => {
    e.preventDefault();
    const form = e.target;
    let ok = true;
    $$("input, textarea", form).forEach((f) => {
      const valid = f.value.trim() && (f.type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
      f.parentElement.classList.toggle("error", !valid);
      if (!valid) ok = false;
    });
    const msg = $("#formMsg");
    if (!ok) { msg.style.color = "#ff4d6d"; msg.textContent = "−10 HP · заполни все поля корректно"; return; }
    const d = new FormData(form);
    const body = encodeURIComponent(`${d.get("msg")}\n\n— ${d.get("name")} (${d.get("email")})`);
    msg.style.color = ""; msg.textContent = "+100 XP · открываю почтовый клиент…";
    showToast("ЗАДАНИЕ ВЫПОЛНЕНО ✓");
    setTimeout(() => (location.href = `mailto:?subject=${encodeURIComponent("Проект для Maksiulo")}&body=${body}`), 600);
    form.reset();
  });

  /* ---------- Background: aurora + constellation ---------- */
  const cv = $("#bg"), ctx = cv.getContext("2d");
  let W, H, dpr, pts = [], mouse = { x: -999, y: -999 };
  const resize = () => {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = cv.width = innerWidth * dpr; H = cv.height = innerHeight * dpr;
    const n = Math.round(Math.min(90, (innerWidth * innerHeight) / 16000));
    pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.25 * dpr, vy: (Math.random() - 0.5) * 0.25 * dpr, r: (Math.random() * 1.4 + 0.6) * dpr }));
  };
  resize(); addEventListener("resize", resize);
  addEventListener("mousemove", (e) => { mouse.x = e.clientX * dpr; mouse.y = e.clientY * dpr; });
  const css = (v) => getComputedStyle(root).getPropertyValue(v).trim();
  let t = 0;
  const draw = () => {
    t += 0.0025;
    const light = root.dataset.theme === "light";
    ctx.clearRect(0, 0, W, H);
    const blobs = [
      [css("--a1"), 0.25 + Math.sin(t) * 0.12, 0.2 + Math.cos(t * 1.3) * 0.1, 0.55],
      [css("--a2"), 0.8 + Math.cos(t * 0.9) * 0.1, 0.35 + Math.sin(t * 1.1) * 0.12, 0.45],
      [css("--a3"), 0.55 + Math.sin(t * 0.7) * 0.15, 0.9 + Math.cos(t) * 0.08, 0.5],
    ];
    ctx.globalCompositeOperation = light ? "source-over" : "lighter";
    blobs.forEach(([c, x, y, r]) => {
      const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
      g.addColorStop(0, c + (light ? "2a" : "33"));
      g.addColorStop(1, c + "00");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    ctx.globalCompositeOperation = "source-over";
    const dotC = light ? "40,30,90" : "220,220,255";
    const maxD = 140 * dpr;
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
      const dx = p.x - mouse.x, dy = p.y - mouse.y, dm = Math.hypot(dx, dy);
      if (dm < 120 * dpr) { p.x += dx / dm; p.y += dy / dm; }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      for (let j = i + 1; j < pts.length; j++) {
        const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < maxD) {
          ctx.strokeStyle = `rgba(${dotC},${(1 - d / maxD) * 0.14})`;
          ctx.lineWidth = dpr * 0.8;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${dotC},0.5)`;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduced) requestAnimationFrame(draw);
  };
  draw();
})();
