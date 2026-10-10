#!/usr/bin/env python3
"""Список плагинов и цепочек FX из кэшей REAPER → Markdown. Плагины не загружаются.

  python3 scripts/plugin_scan.py [-o PLUGINS.md] [--chains ПАПКА ...]

Источники: reaper-vstplugins_arm64.ini (VST/VST3), reaper-auplugins_arm64.ini,
reaper-clap-macos-aarch64.ini, категории — reaper-fxtags.ini, цепочки — FXChains
и папки из --chains. Скилл: ~/.claude/skills/reaper-plugins.
"""
import os, re, glob, argparse, subprocess
from collections import defaultdict

RES = os.path.expanduser('~/Library/Application Support/REAPER')
# python может идти под Rosetta — архитектуру железа спрашиваем у sysctl
ARCH = 'arm64' if subprocess.run(['sysctl', '-n', 'hw.optional.arm64'], capture_output=True, text=True).stdout.strip() == '1' else '64'
CLAP_ARCH = 'aarch64' if ARCH == 'arm64' else 'x86_64'

# fxtags заполнен не у всех; иначе — по словам в имени
GUESS = [('EQ', r'\bEQ\b|Pro-Q|Equali'), ('Dynamics', r'Comp|Limit|Pro-[CLGM]|Gate|Expand|De-?ess|Pro-DS|Transient'),
         ('Reverb', r'Reverb|Verb|Pro-R|Room|Hall|Plate'), ('Delay', r'Delay|Echo|Timeless'),
         ('Distortion', r'Satur|Distort|Drive|Saturn|Tape|Fuzz'), ('Amp', r'Amp|Guitar Rig|Cab'),
         ('Mastering', r'Ozone|Master'), ('Vocal', r'Nectar|Vocal|Tune'), ('Filter', r'Filter|Volcano|Micro|Simplon'),
         ('Modulation', r'Chorus|Flang|Phas|Trem'), ('Analysis', r'SPAN|Meter|Analy|Scope|Loud')]


def split_name(s):
    """«Addictive Drums 2 (XLN Audio) (18 out)» → ('Addictive Drums 2', 'XLN Audio')."""
    s = re.sub(r'\s*\(\d+(\s*->\s*\d+)?\s*(out|ch)\)', '', s)
    s = re.sub(r'\s*\(mono\)', '', s, flags=re.I).strip()
    m = re.match(r'(.*)\s+\(([^()]*)\)$', s)
    name, vendor = (m.group(1), m.group(2)) if m else (s, '')
    if vendor and name.startswith(vendor + ' '):
        name = name[len(vendor) + 1:]
    return name.strip(), vendor.strip()


def ini_sections(path):
    sec, out = None, defaultdict(dict)
    if not os.path.exists(path):
        return out
    for ln in open(path, encoding='utf-8', errors='replace'):
        ln = ln.rstrip('\n')
        if ln.startswith('['):
            sec = ln.strip('[]')
        elif '=' in ln and sec:
            k, v = ln.split('=', 1)
            out[sec][k] = v
    return out


def scan():
    tags = ini_sections(os.path.join(RES, 'reaper-fxtags.ini'))
    cat = {k.lower(): v for k, v in tags.get('category', {}).items()}
    P = {}

    def add(name, vendor, inst, fmt, key=''):
        k = (name.lower(), vendor.lower())
        p = P.setdefault(k, dict(name=name, vendor=vendor, inst=inst, fmts=set(), cat=''))
        p['fmts'].add(fmt)
        p['inst'] |= inst
        p['cat'] = p['cat'] or cat.get(key.lower(), '')

    for k, v in ini_sections(os.path.join(RES, f'reaper-vstplugins_{ARCH}.ini')).get('vstcache', {}).items():
        parts = v.split(',', 2)
        if len(parts) < 3 or not parts[2].strip():
            continue                      # не плагин или не просканирован
        inst = parts[2].endswith('!!!VSTi')
        name, vendor = split_name(parts[2].replace('!!!VSTi', ''))
        add(name, vendor, inst, 'VST3' if '.vst3' in k else 'VST', k)
    for k, v in ini_sections(os.path.join(RES, f'reaper-auplugins_{ARCH}.ini')).get('auplugins', {}).items():
        vendor, _, name = k.partition(': ')
        if vendor != 'Apple':
            add(*split_name(f'{name} ({vendor})'), v == '<inst>', 'AU', k)
    for sec, kv in ini_sections(os.path.join(RES, f'reaper-clap-macos-{CLAP_ARCH}.ini')).items():
        for k, v in kv.items():
            if k != '_' and '|' in v:
                flag, desc = v.split('|', 1)
                add(*split_name(desc), flag == '1', 'CLAP', k)
    for p in P.values():
        if not p['cat']:
            p['cat'] = 'Synth' if p['inst'] else next((c for c, rx in GUESS if re.search(rx, p['name'], re.I)), 'Other')
    return sorted(P.values(), key=lambda p: (not p['inst'], p['cat'], p['vendor'].lower(), p['name'].lower()))


def chain_plugins(path):
    """Плагины цепочки по порядку: строки <VST "VST3: Pro-Q 4 (FabFilter)" …, <AU, <CLAP, <JS."""
    out = []
    for ln in open(path, encoding='utf-8', errors='replace'):
        m = re.match(r'\s*<(VST|AU|CLAP|JS)\s+(?:"([^"]*)"|(\S+))', ln)
        if m:
            s = re.sub(r'^(VST3?i?|AUi?|CLAPi?):\s*', '', m.group(2) or m.group(3))
            out.append(split_name(s)[0] if m.group(1) != 'JS' else 'JS: ' + s)
    return out


def md(plugins, chain_dirs):
    L = [f'# Плагины REAPER ({ARCH})', '',
         f'Из кэшей REAPER, без загрузки. Инструментов: {sum(p["inst"] for p in plugins)}, '
         f'эффектов: {sum(not p["inst"] for p in plugins)}. Apple AU и JSFX не включены.', '']
    for inst, title in ((True, 'Инструменты'), (False, 'Эффекты')):
        group = [p for p in plugins if p['inst'] == inst]
        L += [f'## {title}', '', '| Категория | Плагин | Производитель | Форматы |', '|---|---|---|---|']
        L += [f'| {p["cat"]} | {p["name"]} | {p["vendor"]} | {", ".join(sorted(p["fmts"]))} |' for p in group]
        L.append('')
    chains = [f for d in chain_dirs for f in sorted(glob.glob(os.path.join(os.path.abspath(os.path.expanduser(d)), '*.RfxChain')))]
    tpl = [f for d in ('ProjectTemplates', 'TrackTemplates') for f in glob.glob(os.path.join(RES, d, '**', '*'), recursive=True)
           if f.endswith(('.RPP', '.rpp', '.RPP-TPL', '.RTrackTemplate'))]
    L += ['## Цепочки FX', '', '| Файл | Плагины по порядку |', '|---|---|']
    L += [f'| `{f.replace(os.path.expanduser("~"), "~")}` | {" → ".join(chain_plugins(f)) or "—"} |' for f in chains]
    L += ['', '## Шаблоны проектов и дорожек', '']
    L += [f'- `{f.replace(os.path.expanduser("~"), "~")}`' for f in tpl] or ['нет: `ProjectTemplates` и `TrackTemplates` пусты']
    return '\n'.join(L) + '\n'


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('-o', '--out')
    ap.add_argument('--chains', nargs='*', default=[], help='доп. папки с .RfxChain')
    a = ap.parse_args()
    text = md(scan(), [os.path.join(RES, 'FXChains')] + a.chains)
    if a.out:
        open(os.path.expanduser(a.out), 'w', encoding='utf-8').write(text)
        print('→', a.out)
    else:
        print(text)
