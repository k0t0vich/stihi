#!/usr/bin/env python3
"""index.html из туториала проекта REAPER: python3 build.py
Источник — ~/Documents/reaper/test_claude/docs/README.md, картинки копируются в img/."""
import os, re, shutil
import markdown

SRC = os.path.expanduser('~/Documents/reaper/test_claude/docs/README.md')
HERE = os.path.dirname(os.path.abspath(__file__))

md = open(SRC, encoding='utf-8').read()
# «Файлы» — карта локальной папки проекта, читателю сайта не нужна
md = re.sub(r'\n## Файлы\n.*?(?=\n## |\Z)', '\n', md, flags=re.S)
# python-markdown не видит список без пустой строки перед ним (GitHub видит)
md = re.sub(r'(\n[^\n\-|][^\n]*)\n(- )', r'\1\n\n\2', md)
os.makedirs(os.path.join(HERE, 'img'), exist_ok=True)
for img in set(re.findall(r'\]\((img/[^)]+)\)', md)):
    shutil.copy(os.path.join(os.path.dirname(SRC), img), os.path.join(HERE, img))

title = md.splitlines()[0].lstrip('# ').strip()
body = markdown.markdown(md.split('\n', 1)[1], extensions=['tables', 'fenced_code'])
# картинка — ссылка на себя в полном размере
body = re.sub(r'<img alt="([^"]*)" src="([^"]+)" />',
              r'<figure><a href="\2" target="_blank"><img alt="\1" src="\2" loading="lazy"></a><figcaption>\1</figcaption></figure>', body)
# плеер — сразу после вводного абзаца
player = '''<div class="player"><div class="player-title">🎸 Итоговый мастер · −10 LUFS · 2:00</div>
<audio controls preload="metadata" src="grunge_demo.m4a"></audio></div>
<div class="kit">🧰 Скиллы, скрипты и шаблоны из статьи — <a href="install.html">комплект и установка</a>
· <a href="reaper-claude-kit.zip">reaper-claude-kit.zip</a></div>'''
body = body.replace('</p>', '</p>\n' + player, 1)


def page(title, body, back=''):
    html = f'''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
         min-height: 100vh; padding: 24px 16px; color: #24243a; line-height: 1.6; }}
  .wrap {{ max-width: 900px; margin: 0 auto; }}
  h1 {{ color: #fff; font-size: 2.1em; line-height: 1.25; margin-bottom: 20px; text-shadow: 2px 2px 4px rgba(0,0,0,.2); }}
  article {{ background: #fff; border-radius: 12px; padding: 32px; box-shadow: 0 10px 30px rgba(0,0,0,.2); }}
  article h2 {{ font-size: 1.45em; margin: 36px 0 12px; color: #4b3a8f; }}
  article h3 {{ font-size: 1.15em; margin: 24px 0 10px; color: #4b3a8f; }}
  article p, article ul {{ margin: 10px 0; }}
  article ul {{ padding-left: 22px; }}
  article code {{ background: #f1effa; padding: 1px 5px; border-radius: 4px; font-size: .9em; }}
  .tbl {{ overflow-x: auto; margin: 14px 0; }}
  table {{ border-collapse: collapse; width: 100%; font-size: .93em; }}
  th, td {{ border: 1px solid #e3e0f2; padding: 7px 10px; text-align: left; vertical-align: top; }}
  th {{ background: #f4f2fc; }}
  figure {{ margin: 18px 0; text-align: center; }}
  figure img {{ max-width: 100%; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.18); }}
  figcaption {{ font-size: .85em; color: #777; margin-top: 6px; }}
  .player {{ background: #f4f2fc; border-radius: 10px; padding: 16px; margin: 20px 0; }}
  .player-title {{ font-weight: 600; margin-bottom: 8px; color: #4b3a8f; }}
  .player audio {{ width: 100%; }}
  .kit {{ background: #fff8e6; border-radius: 10px; padding: 12px 16px; margin: 0 0 20px; }}
  .back {{ display: inline-block; color: #fff; text-decoration: none; margin-bottom: 16px; opacity: .85; }}
  article pre {{ background: #1e1e2e; color: #e6e6f0; padding: 12px 14px; border-radius: 8px; overflow-x: auto; margin: 10px 0; }}
  article pre code {{ background: none; padding: 0; color: inherit; }}
  @media (max-width: 600px) {{ article {{ padding: 18px; }} h1 {{ font-size: 1.6em; }} }}
</style>
</head>
<body>
<div class="wrap">
{back}<h1>{title}</h1>
<article>
{body}
</article>
</div>
</body>
</html>
'''
    return re.sub(r'<table>(.*?)</table>', r'<div class="tbl"><table>\1</table></div>', html, flags=re.S)


open(os.path.join(HERE, 'index.html'), 'w', encoding='utf-8').write(page(title, body))
inst = open(os.path.join(HERE, 'INSTALL.md'), encoding='utf-8').read()
open(os.path.join(HERE, 'install.html'), 'w', encoding='utf-8').write(page(
    inst.splitlines()[0].lstrip('# ').strip(),
    markdown.markdown(inst.split('\n', 1)[1], extensions=['tables', 'fenced_code']),
    '<a class="back" href="./">← к статье</a>\n'))
print('→ index.html, install.html')
