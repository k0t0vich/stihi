#!/usr/bin/env python3
import re

# Читаем HTML файл
with open('../top.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Исправляем лишние фигурные скобки
def fix_double_braces(html_content):
    # Заменяем { { на { 
    html_content = re.sub(r'\{\s*\{', '{', html_content)
    # Заменяем } } на }
    html_content = re.sub(r'\}\s*\}', '}', html_content)
    return html_content

# Применяем исправления
updated_html = fix_double_braces(html_content)

# Сохраняем исправленный файл
with open('../top.html', 'w', encoding='utf-8') as f:
    f.write(updated_html)

print("Лишние фигурные скобки исправлены в top.html") 