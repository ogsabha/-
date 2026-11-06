"""Regenerates mess-menu.html, timetable.html, robots.txt and sitemap.xml from the JSON files.
Run from the site folder: python3 build_pages.py  (after editing menu.json or timetable.json)"""
import json, html, os
from datetime import date

SITE = "https://og-sabha.web.app"
DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
e = html.escape

def load(name):
    for p in (f"data/{name}", name):
        if os.path.exists(p):
            return json.load(open(p, encoding="utf-8"))
    raise SystemExit(f"{name} not found")

def t12(s):
    h, m = map(int, s.split(":"))
    return f"{h % 12 or 12}:{m:02d} {'PM' if h >= 12 else 'AM'}"

def page(slug, theme, title, desc, h1, body, ld):
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{e(title)}</title>
  <meta name="description" content="{e(desc)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="{SITE}/{slug}">
  <meta name="theme-color" content="#FFF0C2">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Og Sabha">
  <meta property="og:title" content="{e(title)}">
  <meta property="og:description" content="{e(desc)}">
  <meta property="og:url" content="{SITE}/{slug}">
  <meta property="og:image" content="{SITE}/og-image.png">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" href="/favicon.ico" sizes="48x48">
  <link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500..800&family=DM+Sans:wght@400;500;700&display=swap">
  <link rel="stylesheet" href="style.css">
  <script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body data-theme="{theme}">
  <main class="static-page">
    <p><a href="./">&larr; Og Sabha home</a></p>
    <h1 class="static-h1">{e(h1)}</h1>
{body}
  </main>
  <footer>
    <p class="muted">Og Sabha is made by UG 2026 students of DCSMAT, Vagamon. It is not an official college site, so always confirm with the college.</p>
    <p class="muted"><a href="./#food">Food</a> · <a href="./#classes">Classes</a> · <a href="./#wall">Wall</a> · <a href="./#gigs">Gigs</a></p>
  </footer>
</body>
</html>
"""

menu = load("menu.json")
body = ('    <p class="muted">Weekly mess menu at DCSMAT, Vagamon. Menu may change with the supply of raw materials. '
        'For live ratings and what is being served right now, open the <a href="./#food">Food tab</a>.</p>\n')
for d in DAYS:
    body += f'    <h2 id="{d.lower()}">{d}</h2>\n'
    for m in menu["meals"]:
        txt = menu["days"].get(d, {}).get(m["name"], "Not added yet")
        body += (f'    <div class="card"><h3>{e(m["name"])}</h3>'
                 f'<p class="muted">{t12(m["start"])} &ndash; {t12(m["end"])}</p><p>{e(txt)}</p></div>\n')
ld = {"@context":"https://schema.org","@type":"WebPage","name":"DCSMAT Mess Menu","url":f"{SITE}/mess-menu.html",
      "description":"Weekly mess menu with meal timings at DCSMAT, Vagamon.","isPartOf":{"@id":f"{SITE}/#website"}}
open("mess-menu.html","w",encoding="utf-8").write(page(
    "mess-menu.html","food","DCSMAT Mess Menu This Week | Breakfast, Lunch, Snacks, Dinner | Og Sabha",
    "Weekly DCSMAT Vagamon mess menu with breakfast, lunch, snacks and dinner timings for every day of the week.",
    "DCSMAT Weekly Mess Menu", body, ld))

tt = load("timetable.json")
per = {p["no"]: p for p in tt["periods"]}
body = ('    <p class="muted">Class timetables for DCSMAT, Vagamon. For the live view with the current period and teacher status, '
        'open the <a href="./#classes">Classes tab</a>.</p>\n')
for cls, days in tt["classes"].items():
    body += f'    <h2 id="{cls.lower().replace(" ", "-")}">{e(cls)} timetable</h2>\n'
    for d in DAYS:
        slots = days.get(d, [])
        if not slots:
            continue
        body += f'    <h3>{d}</h3>\n    <table>\n'
        for s in slots:
            p = per.get(s["period"])
            when = f'P{s["period"]} · {t12(p["start"])}' if p else f'P{s["period"]}'
            body += (f'      <tr><td class="muted">{when}</td><td><strong>{e(s["subject"])}</strong>'
                     f'<div class="muted">{e(s["teacher"])}</div></td></tr>\n')
        body += '    </table>\n'
ld = {"@context":"https://schema.org","@type":"WebPage","name":"DCSMAT Class Timetable","url":f"{SITE}/timetable.html",
      "description":"BBA 2026 and BCA 2026 class timetables at DCSMAT, Vagamon.","isPartOf":{"@id":f"{SITE}/#website"}}
open("timetable.html","w",encoding="utf-8").write(page(
    "timetable.html","classes","DCSMAT Class Timetable | BBA 2026 & BCA 2026 | Og Sabha",
    "Day-by-day class timetable for BBA 2026 and BCA 2026 at DCSMAT, Vagamon, with periods, subjects and teachers.",
    "DCSMAT Class Timetable", body, ld))

today = date.today().isoformat()
open("robots.txt","w").write(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n")
urls = [("", "1.0"), ("mess-menu.html", "0.8"), ("timetable.html", "0.8")]
open("sitemap.xml","w").write(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    "".join(f"  <url><loc>{SITE}/{u}</loc><lastmod>{today}</lastmod><priority>{p}</priority></url>\n" for u, p in urls) +
    "</urlset>\n")
print("built")
