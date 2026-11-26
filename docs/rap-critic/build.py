#!/usr/bin/env python3
"""Собрать страницу, встроенный промпт skill и ZIP; --check проверяет актуальность."""
import argparse
from io import BytesIO
import json
from pathlib import Path
import re
import sys
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'prompts' / 'rap_critic_prompt.txt'
PAGE = Path(__file__).with_name('index.html')
SKILL = ROOT / 'skills' / 'rap-critic'
BUNDLED = SKILL / 'references' / 'critique-prompt.txt'
ARCHIVE = Path(__file__).with_name('rap-critic.zip')
START = '// PROMPT_TEMPLATE_START'
END = '// PROMPT_TEMPLATE_END'


def skill_archive(prompt):
    files = {}
    for path in sorted(SKILL.rglob('*')):
        relative = path.relative_to(SKILL)
        if any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
            continue
        if path.is_symlink():
            raise ValueError(f'Символическая ссылка в skill: {relative}')
        if path.is_file():
            files[relative.as_posix()] = path.read_bytes()
    files[BUNDLED.relative_to(SKILL).as_posix()] = prompt
    if 'SKILL.md' not in files:
        raise ValueError('Отсутствует SKILL.md')
    output = BytesIO()
    with ZipFile(output, 'w', compression=ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(files.items()):
            info = ZipInfo(f'rap-critic/{name}', date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, content, compress_type=ZIP_DEFLATED, compresslevel=9)
    return output.getvalue()


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
    original = PAGE.read_text(encoding='utf-8')
    pattern = re.escape(START) + r'.*?' + re.escape(END)
    updated, count = re.subn(pattern, lambda _: f'{START}\nconst TEMPLATE = {encoded};\n{END}', original, flags=re.S)
    if count != 1:
        raise ValueError('Маркеры промпта должны встречаться один раз')
    artifacts = {
        PAGE: updated.encode('utf-8'),
        BUNDLED: prompt,
        ARCHIVE: skill_archive(prompt),
    }
    stale = [path for path, content in artifacts.items() if not path.exists() or path.read_bytes() != content]
    if args.check:
        if stale:
            names = ', '.join(str(path.relative_to(ROOT)) for path in stale)
            print(f'Устарели: {names}. Запустите python3 docs/rap-critic/build.py.', file=sys.stderr)
            return 1
        print('Страница, встроенный промпт skill и ZIP актуальны.')
    else:
        for path in stale:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(artifacts[path])
        print('Страница, встроенный промпт skill и ZIP собраны.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
