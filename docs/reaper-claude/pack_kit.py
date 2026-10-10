#!/usr/bin/env python3
"""Комплект для скачивания: kit/ и reaper-claude-kit.zip. python3 pack_kit.py
Источники — рабочие копии в ~/w/audio2midi и ~/.claude/skills; пути в копиях
переписываются на ~/reaper-claude-kit, зависимости от audio2midi — в rpp_common.py."""
import os, sys, re, glob, shutil, inspect, zipfile

HOME = os.path.expanduser('~')
A2M = os.path.join(HOME, 'w', 'audio2midi')
SKILLS = os.path.join(HOME, '.claude', 'skills')
REAPER_SCRIPTS = os.path.join(HOME, 'Library', 'Application Support', 'REAPER', 'Scripts')
HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, 'kit')
DEST = '~/reaper-claude-kit'

sys.path[:0] = [A2M, os.path.join(A2M, 'scripts')]
import suno_project as SP
import make_project as MP

PATHS = [('~/w/audio2midi/scripts/', f'{DEST}/scripts/'),
         ('~/w/audio2midi/experiments/data/fxchains/', f'{DEST}/fxchains/'),
         ('~/w/audio2midi/experiments/data/fxchains', f'{DEST}/fxchains'),
         ('`~/w/audio2midi/ad2_keymap.py`, `gm_to_ad2.py`', f'`{DEST}/scripts/ad2_keymap.py`')]


def put(rel, text):
    p = os.path.join(KIT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    open(p, 'w', encoding='utf-8').write(text)


def fix(text):
    for a, b in PATHS:
        text = text.replace(a, b)
    return text


shutil.rmtree(KIT, ignore_errors=True)

# скиллы
for name in ('reaper-song', 'reaper-mix', 'reaper-plugins'):
    for f in sorted(glob.glob(os.path.join(SKILLS, name, '*'))):
        if f.endswith('PLUGINS.md'):
            continue                      # личный список, у каждого свой
        put(f'skills/{name}/{os.path.basename(f)}', fix(open(f, encoding='utf-8').read()))

# скрипты
for f in ('mix_probe.py', 'mix_apply.py', 'mix_calibrate.py', 'rs5k_bass_sampler.lua', 'plugin_scan.py'):
    put(f'scripts/{f}', open(os.path.join(A2M, 'scripts', f), encoding='utf-8').read())
put('scripts/ad2_keymap.py', open(os.path.join(A2M, 'ad2_keymap.py'), encoding='utf-8').read())
song = open(os.path.join(A2M, 'scripts', 'song_kit.py'), encoding='utf-8').read()
song = song.replace('from make_project import track_head\nfrom suno_project import fx, col, guid, A2M, BASS_SAMPLES',
                    'from rpp_common import track_head, fx, col, guid, A2M, BASS_SAMPLES')
assert 'rpp_common' in song, 'импорты song_kit.py поменялись'
put('scripts/song_kit.py', song)
for f in glob.glob(os.path.join(A2M, 'scripts', 'songs', '*.py')):
    put(f'scripts/songs/{os.path.basename(f)}', open(f, encoding='utf-8').read())
common = ['"""Общее для song_kit.py: выжимка из audio2midi (suno_project.py, make_project.py)."""',
          'import os, uuid', '',
          "A2M = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))",
          "FXCHAINS = os.path.join(A2M, 'fxchains')",
          "BASS_SAMPLES = os.path.join(A2M, 'samples-bass-finger')", '']
common += [inspect.getsource(fn) for fn in (SP.guid, MP.track_head, SP.col, SP.js_transpose, SP.fx)]
put('scripts/rpp_common.py', '\n\n'.join(common))

# шаблоны FX, семплы баса
shutil.copytree(SP.FXCHAINS, os.path.join(KIT, 'fxchains'))
shutil.copytree(SP.BASS_SAMPLES, os.path.join(KIT, 'samples-bass-finger'))

# автозапуск моста MCP в REAPER
put('mcp/__startup.lua', open(os.path.join(REAPER_SCRIPTS, '__startup.lua'), encoding='utf-8').read())
shutil.copy(os.path.join(HERE, 'INSTALL.md'), os.path.join(KIT, 'INSTALL.md'))
shutil.copy(os.path.join(HERE, 'INSTALL-PROMPT.md'), os.path.join(KIT, 'INSTALL-PROMPT.md'))

# архив
z = os.path.join(HERE, 'reaper-claude-kit.zip')
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(KIT):
        for f in sorted(files):
            if f.startswith('.'):
                continue
            p = os.path.join(root, f)
            zf.write(p, os.path.join('reaper-claude-kit', os.path.relpath(p, KIT)))
left = [p for p in glob.glob(os.path.join(KIT, '**', '*'), recursive=True)
        if os.path.isfile(p) and not p.endswith(('.m4a', '.RfxChain'))
        and re.search(r'w/audio2midi|experiments/data', open(p, encoding='utf-8', errors='ignore').read())]
print('→', z, f'{os.path.getsize(z) / 1e6:.1f} МБ')
print('пути audio2midi остались в:', left or 'нигде')
