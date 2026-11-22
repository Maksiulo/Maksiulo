"""Из content/videos.json делает:
  1) content/out/video-XX.mp4 — вертикальные 1080x1920 ролики «текст на экране» (без звука:
     звук добавляешь в TikTok/Instagram из библиотеки трендов, это бесплатно и даёт охват);
  2) content/05-videos.md — читаемый документ со всеми сценариями;
  3) content/out/schedule.csv — расписание публикаций (1 ролик в день).
Запуск: python3 business/tools/render_videos.py [--only 1,2,3] [--no-video]"""
import json, pathlib, subprocess, sys, textwrap, datetime, csv, tempfile
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = json.loads((ROOT / "content" / "videos.json").read_text(encoding="utf-8"))
OUT = ROOT / "content" / "out"; OUT.mkdir(parents=True, exist_ok=True)
W, H, SEC = 1080, 1920, 2.6
FONT_B = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG_TOP, BG_BOT, ACCENT = (11, 11, 18), (40, 22, 90), (0, 224, 198)

def font(size):
    try: return ImageFont.truetype(FONT_B, size)
    except OSError: return ImageFont.load_default()

def frame(text, idx, total, path, first=False):
    img = Image.new("RGB", (W, H)); d = ImageDraw.Draw(img)
    for y in range(H):  # вертикальный градиент
        t = y / H
        d.line([(0, y), (W, y)], fill=tuple(int(BG_TOP[i] * (1 - t) + BG_BOT[i] * t) for i in range(3)))
    size = 92 if first else 78
    f = font(size); lines = textwrap.wrap(text, 16 if first else 19)
    lh = int(size * 1.25); y0 = (H - lh * len(lines)) // 2 - 80
    for i, ln in enumerate(lines):
        w = d.textlength(ln, font=f)
        d.text(((W - w) / 2, y0 + i * lh), ln, font=f, fill=ACCENT if first else (245, 245, 250))
    # прогресс-бар — удерживает внимание
    d.rectangle([120, 1560, 120 + int((W - 240) * (idx + 1) / total), 1572], fill=ACCENT)
    img.save(path)

def render(v):
    slides = v["screen"]
    with tempfile.TemporaryDirectory() as td:
        lst = pathlib.Path(td) / "list.txt"; entries = []
        for i, s in enumerate(slides):
            p = pathlib.Path(td) / f"{i:02d}.png"; frame(s, i, len(slides), p, first=(i == 0))
            entries.append(f"file '{p}'\nduration {SEC if i else 2.0}")
        entries.append(f"file '{pathlib.Path(td) / f'{len(slides)-1:02d}.png'}'")
        lst.write_text("\n".join(entries))
        out = OUT / f"video-{v['id']:02d}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst),
                        "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", str(out)], check=True)
        print("OK", out.name)

def write_md():
    md = ["# ЭТАП 5 — 30 роликов для TikTok + Instagram", "",
          "Файл генерируется автоматически из `videos.json`. Правишь JSON, запускаешь скрипт, и всё обновляется.", "",
          "Баланс: ~80% чистая польза/истории, ~20% мягкое упоминание продукта (тип «продукт-мягко»).", ""]
    for v in DATA:
        md += [f"## Ролик {v['id']} · {v['type']}", "",
               f"**Hook (0–2 с):** {v['hook']}", "", f"**Сценарий:** {v['script']}", "",
               "**Текст на экране:** " + " → ".join(f"«{s}»" for s in v["screen"]), "",
               f"**Описание:** {v['description']}", "", f"**CTA:** {v['cta']}", "",
               f"**Визуал:** {v['visual']}", ""]
    (ROOT / "content" / "05-videos.md").write_text("\n".join(md), encoding="utf-8")

def write_csv(start=None):
    start = start or datetime.date.today() + datetime.timedelta(days=1)
    with open(OUT / "schedule.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["date", "time", "file", "caption"])
        for i, v in enumerate(DATA):
            w.writerow([(start + datetime.timedelta(days=i)).isoformat(), "19:00",
                        f"video-{v['id']:02d}.mp4", v["description"]])

if __name__ == "__main__":
    only = None
    if "--only" in sys.argv: only = {int(x) for x in sys.argv[sys.argv.index("--only") + 1].split(",")}
    write_md(); write_csv()
    if "--no-video" not in sys.argv:
        for v in DATA:
            if not only or v["id"] in only: render(v)
