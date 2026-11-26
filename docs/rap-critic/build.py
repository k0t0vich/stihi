#!/usr/bin/env python3
"""Синхронизировать страницу и самостоятельный Markdown skill; --check проверяет актуальность."""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'prompts' / 'rap_critic_prompt.txt'
PAGE = Path(__file__).with_name('index.html')
SKILL = ROOT / 'skills' / 'rap-critic' / 'SKILL.md'
PUBLIC_SKILL = Path(__file__).with_name('rap-critic.md')
START = '// PROMPT_TEMPLATE_START'
END = '// PROMPT_TEMPLATE_END'
SKILL_START = '<!-- CRITIQUE_PROMPT_START -->'
SKILL_END = '<!-- CRITIQUE_PROMPT_END -->'


def replace_block(original, start, end, content):
    if original.count(start) != 1 or original.count(end) != 1:
        raise ValueError(f'Маркеры {start} / {end} должны встречаться один раз')
    pattern = re.escape(start) + r'.*?' + re.escape(end)
    updated, count = re.subn(pattern, lambda _: f'{start}\n{content}\n{end}', original, flags=re.S)
    if count != 1:
        raise ValueError(f'Неверный порядок маркеров {start} / {end}')
    return updated


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    prompt = SOURCE.read_bytes()
    template = prompt.decode('utf-8')
    for key in ('TONE', 'DEPTH', 'TEXT', 'CONTEXT'):
        if '{{' + key + '}}' not in template:
            raise ValueError(f'В промпте отсутствует {{{{{key}}}}}')
    encoded = json.dumps(template, ensure_ascii=False).replace('</', '<\\/')
    updated_page = replace_block(PAGE.read_text(encoding='utf-8'), START, END, f'const TEMPLATE = {encoded};')
    updated_skill = replace_block(SKILL.read_text(encoding='utf-8'), SKILL_START, SKILL_END, template).encode('utf-8')
    artifacts = {
        PAGE: updated_page.encode('utf-8'),
        SKILL: updated_skill,
        PUBLIC_SKILL: updated_skill,
    }
    stale = [path for path, content in artifacts.items() if not path.exists() or path.read_bytes() != content]
    if args.check:
        if stale:
            names = ', '.join(str(path.relative_to(ROOT)) for path in stale)
            print(f'Устарели: {names}. Запустите python3 docs/rap-critic/build.py.', file=sys.stderr)
            return 1
        print('Страница, методика skill и публичный Markdown актуальны.')
    else:
        for path in stale:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(artifacts[path])
        print('Страница, методика skill и публичный Markdown собраны.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
