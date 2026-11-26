#!/usr/bin/env python3
"""Встроить исходный промпт в страницу; --check проверяет актуальность."""
import argparse
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'prompts' / 'rap_critic_prompt.txt'
PAGE = Path(__file__).with_name('index.html')
START = '// PROMPT_TEMPLATE_START'
END = '// PROMPT_TEMPLATE_END'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    template = SOURCE.read_text(encoding='utf-8')
    for key in ('TONE', 'DEPTH', 'TEXT', 'CONTEXT'):
        if '{{' + key + '}}' not in template:
            raise ValueError(f'В промпте отсутствует {{{{{key}}}}}')
    encoded = json.dumps(template, ensure_ascii=False).replace('</', '<\\/')
    original = PAGE.read_text(encoding='utf-8')
    pattern = re.escape(START) + r'.*?' + re.escape(END)
    updated, count = re.subn(pattern, lambda _: f'{START}\nconst TEMPLATE = {encoded};\n{END}', original, flags=re.S)
    if count != 1:
        raise ValueError('Маркеры промпта должны встречаться один раз')
    if args.check:
        if original != updated:
            print('Промпт на странице устарел. Запустите python3 docs/rap-critic/build.py.', file=sys.stderr)
            return 1
        print('Промпт на странице актуален.')
    else:
        PAGE.write_text(updated, encoding='utf-8')
        print('Промпт встроен в страницу.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
