"""Собирает PDF продукта и бесплатный лид-магнит из markdown.
Запуск: python3 business/tools/build_product.py  (нужны pandoc и playwright/chromium)."""
import pathlib, re, shutil, subprocess, sys
ROOT = pathlib.Path(__file__).resolve().parents[1]
SRC = ROOT / "product" / "hook-bank.md"
OUT = ROOT / "product" / "dist"
OUT.mkdir(exist_ok=True)
CSS = ROOT / "tools" / "product.css"

def free_version(md: str) -> str:
    """Лид-магнит: инструкция + категории 1–2 (20 хуков) + приглашение к полной версии."""
    parts = re.split(r"\n(?=# )", md)
    keep = [p for p in parts if p.startswith("---") or p.startswith("# Как пользоваться")
            or p.startswith("# 1.") or p.startswith("# 2.")]
    text = "\n".join(keep).replace('title: "ХУК-БАНК"', 'title: "ХУК-БАНК · мини"')
    text = text.replace("100 первых фраз, 10 сценариев и 30-дневный план",
                        "20 бесплатных хуков из полной версии")
    return text + ("\n\n# Хочешь остальные 80?\n\nПолная версия: ещё 80 хуков в 8 категориях, "
                   "10 шаблонов сценариев по секундам и готовый план на 30 дней.\n\n"
                   "**Ссылка — в профиле автора.**\n")

def to_pdf(md_text: str, name: str):
    md_file = OUT / f"{name}.md"; html = OUT / f"{name}.html"; pdf = OUT / f"{name}.pdf"
    md_file.write_text(md_text, encoding="utf-8")
    subprocess.run(["pandoc", str(md_file), "-s", "--embed-resources", "-c", str(CSS),
                    "-o", str(html), "--metadata", "lang=ru"], check=True)
    js = f"""const {{chromium}}=require('playwright');(async()=>{{const b=await chromium.launch();
const p=await b.newPage();await p.goto('file://{html}');
await p.pdf({{path:'{pdf}',format:'A4',printBackground:true}});await b.close();}})();"""
    try:
        subprocess.run(["node", "-e", js], check=True)
    except (subprocess.CalledProcessError, FileNotFoundError):
        # GitHub Actions: в ubuntu-latest уже установлен google-chrome
        chrome = shutil.which("google-chrome") or shutil.which("chromium") or "chromium-browser"
        subprocess.run([chrome, "--headless", "--no-sandbox", "--no-pdf-header-footer",
                        f"--print-to-pdf={pdf}", f"file://{html}"], check=True)
    md_file.unlink(); html.unlink()
    print("OK", pdf)

md = SRC.read_text(encoding="utf-8")
to_pdf(md, "hook-bank-full")
to_pdf(free_version(md), "hook-bank-free")
