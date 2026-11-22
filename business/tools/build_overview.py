"""Собирает всю систему в один HTML-файл business/overview.html (для просмотра и публикации артефактом)."""
import json, pathlib, re, subprocess, html
ROOT = pathlib.Path(__file__).resolve().parents[1]

def md(path, shift=1):
    text = (ROOT / path).read_text(encoding="utf-8")
    text = re.sub(r"^---\n.*?\n---\n", "", text, flags=re.S)
    out = subprocess.run(["pandoc", "-f", "gfm", "-t", "html", f"--shift-heading-level-by={shift}"],
                         input=text, capture_output=True, text=True, check=True).stdout
    out = out.replace("<table", '<div class="tw"><table').replace("</table>", "</table></div>")
    out = re.sub(r'<a href="(?!https?://)[^"]*">(.*?)</a>', r"<code>\1</code>", out)  # локальные ссылки → текст
    return out

videos = json.loads((ROOT / "content/videos.json").read_text(encoding="utf-8"))
vcards = []
for v in videos:
    e = html.escape
    chips = "".join(f"<li>{e(s)}</li>" for s in v["screen"])
    vcards.append(f'''<article class="vid" data-type="{e(v['type'])}">
  <video src="videos/video-{v['id']:02d}.mp4" controls preload="none" playsinline muted
    poster="data:image/gif;base64,R0lGODlhAQABAAAAACw="></video>
  <div class="vid-body">
    <p class="vid-meta"><span class="mono">#{v['id']:02d}</span><span class="pill">{e(v['type'])}</span></p>
    <h3>{e(v['hook'])}</h3>
    <dl>
      <dt>Сценарий</dt><dd>{e(v['script'])}</dd>
      <dt>Текст на экране</dt><dd><ol class="screen">{chips}</ol></dd>
      <dt>Описание</dt><dd>{e(v['description'])}</dd>
      <dt>CTA</dt><dd>{e(v['cta'])}</dd>
      <dt>Визуал</dt><dd>{e(v['visual'])}</dd>
    </dl>
    <button class="copy" type="button" data-copy="{e(v['description'])}">Скопировать описание</button>
  </div>
</article>''')
types = sorted({v["type"] for v in videos})
filters = '<button class="f on" type="button" data-f="">Все · 30</button>' + "".join(
    f'<button class="f" type="button" data-f="{html.escape(t)}">{html.escape(t)} · {sum(v["type"]==t for v in videos)}</button>' for t in types)

tpl = (ROOT / "tools/overview_template.html").read_text(encoding="utf-8")
page = (tpl.replace("{{PRODUCT}}", md("product/hook-bank.md"))
           .replace("{{RESEARCH}}", md("01-research.md"))
           .replace("{{LAUNCH}}", md("02-mvp-sales-site.md"))
           .replace("{{PLAN}}", md("03-automation-and-30-days.md"))
           .replace("{{FILTERS}}", filters)
           .replace("{{VIDEOS}}", "\n".join(vcards)))
(ROOT / "overview.html").write_text(page, encoding="utf-8")
print("OK", ROOT / "overview.html", len(page) // 1024, "KB")
