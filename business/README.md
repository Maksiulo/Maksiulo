# Бизнес-система «Хук-Банк» — $0

| Файл | Что внутри |
|---|---|
| [01-research.md](01-research.md) | 10 возможностей, 12 пунктов по каждой, выбор для теста |
| [02-mvp-sales-site.md](02-mvp-sales-site.md) | MVP, приём оплаты, страница продукта |
| [03-automation-and-30-days.md](03-automation-and-30-days.md) | Workflow, твоя роль, план на 30 дней, правила |
| [content/05-videos.md](content/05-videos.md) | 30 роликов (генерируется из `videos.json`) |
| `product/dist/*.pdf` | Готовый продукт + бесплатный лид-магнит |
| `content/out/*.mp4` | 30 готовых вертикальных видео + `schedule.csv` |
| [`../shop/index.html`](../shop/index.html) | Страница продукта (GitHub Pages) |

**Автоматизация:** правишь `product/hook-bank.md` или `content/videos.json`, а GitHub Actions сам пересобирает PDF, видео и расписание.
Локально: `python3 business/tools/build_product.py && python3 business/tools/render_videos.py`.
