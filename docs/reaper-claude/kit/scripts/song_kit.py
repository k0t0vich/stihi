#!/usr/bin/env python3
"""Готовые детали для песни в REAPER: ноты инструментов, приёмы Odin III, дроби,
оживление, дорожки с цепочками, сборка .rpp. Сама песня — отдельный файл (пример:
songs/grunge_demo.py): форма, аккорды, партии.

  python3 scripts/song_kit.py ПЕСНЯ.py ПАПКА [--name имя] [--bpm 108] [--guitars ample,odin] [--add]
  /Applications/REAPER.app/Contents/MacOS/REAPER -nonewinst ПАПКА/open.lua

Скилл: ~/.claude/skills/reaper-song/SKILL.md.
"""
import os, sys, glob, time, random, argparse, subprocess, importlib.util
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rpp_common import track_head, fx, col, guid, A2M, BASS_SAMPLES

TPQ = 960
# AD2, не GM: ad2_keymap.py
KICK, SNARE, RIM, HH, HHO, CRASH1, CRASH2, FTOM = 36, 38, 37, 49, 55, 77, 79, 65
TOMS = (71, 69, 67, 65)
SHALLOW = 43   # Snare Shallow Hit: тихие удары дроби
# Ample Guitar VC — стандартный строй, ниже E2 (40) нот нет; бас RS5K — только 28..39
GTR_LOW, BASS_LO, BASS_HI = 40, 28, 39
# Odin III keyswitch'и (список в GUI, C-1 = 0), держать, пока звучит нота: не залипают
KS_RANGE = set(range(0, 36)) | set(range(101, 109))
KS_SLIDE_IN, KS_SLIDE_OUT_DOWN = 5, 2        # Slide Fast From Down, Slide Slow To Down
KS_SCRAPE, KS_NAT_HARM = 19, 21              # Scrapes, Natural Harmonic
KS_MUTE_SEMI, KS_MUTE_CLOSED = 28, 31        # Down Mute Semi Closed, Down Mute Closed
PINCH = 127                                  # velocity 127 = Pinch Harmonic, 35..126 — обычный штрих

# ---------- партии: [(доля от начала секции, длина в долях, нота, velocity)] ----------

def snare_roll(hit, rnd, o, beats, v0, v1, step=0.25):
    """Дробь малого. Линейная рампа ровными 1/16 на слух — «механизм бьёт»: крещендо
    по кривой, ведущая рука сильнее, тихие удары shallow, к концу барабанщик подгоняет."""
    k = int(round(beats / step))
    for i in range(k):
        x = i / max(1, k - 1)
        v = v0 + (v1 - v0) * x ** 1.7 + (7 if i % 2 == 0 else -7) + (8 if i % 4 == 0 else 0) + rnd.randint(-8, 8)
        v = max(30, min(127, round(v)))
        at = o + i * step - 0.015 * x + rnd.uniform(-0.012, 0.012)
        hit(at, SNARE if v >= 88 else SHALLOW, v)
        if i % 4 == 0 and v >= 95 and rnd.random() < 0.35:
            hit(at - 0.03, SHALLOW, rnd.randint(42, 58))      # форшлаг


def tom_run(hit, o, beats, v0):
    """Сбег по томам сверху вниз шестнадцатыми с нарастанием."""
    for i in range(int(beats * 4)):
        hit(o + i / 4, TOMS[min(3, i * 4 // int(beats * 4))], v0 + i * 3)

# ---------- оживление и MIDI ----------

def drift_curve(rnd, amp, step=8):
    """Плавающая громкость: опорные точки раз в 2 такта, между ними линейно."""
    pts = {}
    def f(qn):
        k, x = int(qn // step), (qn % step) / step
        for j in (k, k + 1):
            pts.setdefault(j, rnd.uniform(-amp, amp))
        return pts[k] * (1 - x) + pts[k + 1] * x
    return f


def humanize(notes, rnd, jitter, vjit, delay=0, drift=None, base=0, strum=0, vmax=127):
    """vjit — общий разброс на одновременные ноты (аккорд бьётся одной рукой), по
    ноте ещё ±2; drift — медленный дрейф по фразе; strum — тиков между струнами;
    vmax — потолок (у Odin 127 = pinch harmonic, поэтому 126; v=127 в партии — намеренный пинч)."""
    groups = {}
    for at, ln, p, v in notes:
        groups.setdefault(round(at, 3), []).append((at, ln, p, v))
    out = []
    for key, g in groups.items():
        dv = rnd.randint(-vjit, vjit) + (drift(base + key) if drift else 0)
        for i, (at, ln, p, v) in enumerate(sorted(g, key=lambda e: e[2])):
            if p in KS_RANGE:         # keyswitch Odin: не сдвигать, иначе включится после ноты
                out.append((max(0, round(at * TPQ) + delay), round(ln * TPQ), p, 100)); continue
            a = max(0, round(at * TPQ) + delay + rnd.randint(-jitter, jitter) + i * strum)
            vv = 127 if v >= 127 else max(1, min(vmax, round(v + dv) + rnd.randint(-2, 2)))
            out.append((a, max(30, round(ln * TPQ) - i * strum), p, vv))
    return out


def midi_source(notes, length_qn, ch):
    ev = []
    for a, ln, p, v in notes:
        # на одном тике keyswitch раньше ноты, иначе Odin сыграет её прежним приёмом
        ev += [(a, 1 + (p not in KS_RANGE), f'{0x90 | ch:02x} {p:02x} {v:02x}'), (a + ln, 0, f'{0x80 | ch:02x} {p:02x} 00')]
    ev.sort(key=lambda e: (e[0], e[1]))
    lines, prev = [], 0
    for t, _, msg in ev:
        lines.append(f'        E {t - prev} {msg}'); prev = t
    end = max(prev, round(length_qn * TPQ))
    lines.append(f'        E {end - prev} b{ch:x} 7b 00')
    return '      <SOURCE MIDI\n        HASDATA 1 960 QN\n' + '\n'.join(lines) + '\n      >\n'

# ---------- RPP ----------

def item(name, pos, length, src):
    return (f'    <ITEM\n      POSITION {pos:.6f}\n      LENGTH {length:.6f}\n      LOOP 0\n'
            f'      MUTE 0 0\n      IGUID {guid()}\n      NAME "{name}"\n      VOLPAN 1 0 1 -1\n'
            f'      SOFFS 0 0\n      PLAYRATE 1 1 0 -1 0 0.0025\n      CHANMODE 0\n      GUID {guid()}\n'
            + src + '    >\n')


def track(name, color, vol_db, pan, chain):
    h = track_head(name, height=70).replace('PEAKCOL 16576', f'PEAKCOL {color}')
    return h.replace('VOLPAN 1 0 -1 -1 1', f'VOLPAN {10 ** (vol_db / 20):.4f} {pan} -1 -1 1') + (chain or '')


# индекс параметра Odin III → значение (TrackFX_SetParam, 0..1); имена — TrackFX_GetParamName
ODIN_PARAMS = {1: 1 / 3,    # Amp Choice: DI / Rhythm / Lead / Clean → Rhythm, без Guitar Rig
               13: 0.25,    # Human String: шумы струн у звукоснимателей
               14: 0.25}    # Human Left Hand: шумы левой руки по грифу


def odin_params_lua():
    sets = '\n'.join(f'      reaper.TrackFX_SetParam(tr, 0, {k}, {v:.4f})' for k, v in ODIN_PARAMS.items())
    return f'''for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  local _, nm = reaper.GetTrackName(tr)
  if nm == "Odin III" then
{sets}
  end
end
'''


def odin_chain():
    """Odin III без Guitar Rig: из шаблона guitar_odin_gr7 только первый плагин.
    Amp Choice в шаблоне DI — ставится на Rhythm уже в REAPER (set_param)."""
    full = fx('guitar_odin_gr7')
    cut = full.index('      BYPASS', full.index('<VST "VST3i: Odin'))
    return full[:cut] + '    >\n'


def parts(song, guitars):
    """Состав дорожек из партий песни: имя, цвет, дБ, панорама, цепочка, партия, канал,
    разброс тиков, сдвиг, дрейф vel, strum. Партии, которых в песне нет, пропускаются."""
    # уровни: при 0/−2/−4/−4 дБ мастер упирался в 0 дБFS (5553 сэмпла), бас при −3 давал пик −3 дБFS
    g = lambda name: getattr(song, name, None)
    p = [('Drums AD2', col(200, 70, 60), -6, 0, fx('ad2'), g('drums'), 9, 6, 0, 6, 0),
         ('Bass', col(60, 110, 210), -6, 0, None, g('bass'), 0, 10, 0, 7, 0)]
    if 'ample' in guitars:
        p += [('Guitar L', col(230, 150, 40), -6, -0.75, fx('guitar_ample_gr7'), g('guitar_l'), 0, 12, 0, 10, 6),
              ('Guitar R', col(240, 180, 70), -6, 0.75, fx('guitar_ample_gr7'), g('guitar_r'), 0, 12, 10, 10, 6)]
    if 'odin' in guitars:
        # Odin сам двоит гитару (Guitar 01/02 на ±50) и раскатывает аккорд (Auto Chord Delay) — свой strum не нужен
        p += [('Odin III', col(150, 90, 200), -6, 0, odin_chain(), g('odin'), 0, 12, 0, 10, 0)]
    return [x for x in p if x[5]]


def track_chunk(song, ti, part, spb, seed):
    tname, c, db, pan, chain, gen, ch, jit, delay, damp, strum = part
    rnd = random.Random(seed * 100 + ti)
    drift = drift_curve(random.Random(seed * 1000 + ti), damp)
    body = track(tname, c, db, pan, chain)
    bar0 = 0
    for sec, bars in song.SECTIONS:
        notes = gen(sec, bars)
        if notes:
            hn = humanize(notes, rnd, jit, 6, delay, drift, bar0 * 4, strum, 126 if tname.startswith('Odin') else 127)
            body += item(f'{tname} — {sec}', bar0 * 4 * spb, bars * 4 * spb, midi_source(hn, bars * 4, ch))
        bar0 += bars
    return body + '  >\n'


def add_lua(song, folder, bpm, guitars, seed=7):
    """Дорожки в уже открытый проект: вставить в конец, Ample-гитары заглушить. Не сохраняет."""
    spb, lua = 60 / bpm, []
    for ti, part in enumerate(parts(song, guitars)):
        if part[0] in ('Drums AD2', 'Bass'):
            continue
        lua.append(f'''for i = reaper.CountTracks(0) - 1, 0, -1 do
  local _, nm = reaper.GetTrackName(reaper.GetTrack(0, i))
  if nm == "{part[0]}" then reaper.DeleteTrack(reaper.GetTrack(0, i)) end
end
do
  local n = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(n, false)
  reaper.SetTrackStateChunk(reaper.GetTrack(0, n), [==[{track_chunk(song, ti + 10, part, spb, seed)}]==], false)
end''')
    out = os.path.join(folder, 'add_' + '_'.join(guitars) + '.lua')
    open(out, 'w', encoding='utf-8').write('reaper.Undo_BeginBlock()\n' + '\n'.join(lua) + '''
for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  local _, nm = reaper.GetTrackName(tr)
  if nm == "Guitar L" or nm == "Guitar R" then reaper.SetMediaTrackInfo_Value(tr, "B_MUTE", 1) end
end
''' + odin_params_lua() + '''reaper.Undo_EndBlock("Добавить гитары", -1)
''')
    print(f'→ {out}')
    return out


def build(song, folder, name, bpm, seed=7, guitars=('ample',)):
    spb = 60 / bpm
    body = ''.join(track_chunk(song, ti, part, spb, seed) for ti, part in enumerate(parts(song, guitars)))
    marks, bar0 = [], 0
    for i, (sec, bars) in enumerate(song.SECTIONS, 1):
        marks += [f'  MARKER {i} {bar0 * 4 * spb:.6f} "{sec}" 1', f'  MARKER {i} {(bar0 + bars) * 4 * spb:.6f} "" 1']
        bar0 += bars
    out = os.path.join(folder, name + '.rpp')
    if os.path.exists(out):
        # тот же путь REAPER берёт из кэша — пересборка только под новым именем
        out = out[:-4] + time.strftime('_%Y%m%d_%H%M%S') + '.rpp'
    open(out, 'w', encoding='utf-8').write(f'''<REAPER_PROJECT 0.1 "7.78/macOS-arm64" {int(time.time())} 0
  RIPPLE 0 0
  AUTOXFADE 129
  PANLAW 1
  SAMPLERATE 48000 0 0
  TEMPO {bpm} 4 4
  CURSOR 0
  ZOOM 8 0 0
  LOOP 0
  RECORD_PATH "Media" ""
  RENDER_FILE "{os.path.join(folder, 'render')}"
  RENDER_PATTERN $track
  RENDER_FMT 0 2 48000
{chr(10).join(marks)}
{body}>
''')
    lua = bass_lua(folder, out)
    print(f'→ {out}\n→ {lua}')
    return out


def bass_lua(folder, rpp):
    """Ample Bass P без семплов молчит («Loading samples failed»), Kontakt без
    библиотек — бас на RS5K: семплы Finger Bass → ПАПКА/Bass/samples, lua вешает
    RS5K на дорожку Bass в проекте, открытом в новой вкладке, и сохраняет."""
    d = os.path.join(folder, 'Bass', 'samples')
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(BASS_SAMPLES, '*.m4a')):
        w = os.path.join(d, os.path.basename(f)[:-4] + '.wav')
        if not os.path.exists(w):
            subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16', f, w], check=True)
    src = open(os.path.join(A2M, 'scripts', 'rs5k_bass_sampler.lua'), encoding='utf-8').read()
    src = (src.replace('local DIR = "/Users/k0t0vich/Documents/reaper/Millstone/Bass/samples/"', f'local DIR = "{d}/"')
              .replace('local TRACKS = {"Bass MuScriptor"}', 'local TRACKS = {"Bass"}')
              .replace('local LO, HI = 22, 48', 'local LO, HI = 28, 40'))
    src = f'reaper.Main_OnCommand(40859, 0)\nreaper.Main_openProject("noprompt:{rpp}")\n' + odin_params_lua() + src
    out = os.path.join(folder, 'open.lua')
    open(out, 'w', encoding='utf-8').write(src)
    return out


def load_song(path):
    spec = importlib.util.spec_from_file_location('song', os.path.abspath(os.path.expanduser(path)))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('song', help='файл песни: SECTIONS + функции drums/bass/guitar_l/guitar_r/odin')
    ap.add_argument('folder')
    ap.add_argument('--name', help='по умолчанию NAME из песни')
    ap.add_argument('--bpm', type=float, help='по умолчанию BPM из песни')
    ap.add_argument('--guitars', default='ample', help='ample, odin или ample,odin')
    ap.add_argument('--add', action='store_true', help='только lua: гитары в уже открытый проект')
    a = ap.parse_args()
    song = load_song(a.song)
    folder, g = os.path.abspath(os.path.expanduser(a.folder)), tuple(a.guitars.split(','))
    name, bpm = a.name or song.NAME, a.bpm or song.BPM
    os.makedirs(folder, exist_ok=True)
    if a.add:
        add_lua(song, folder, bpm, g)
    else:
        build(song, folder, name, bpm, guitars=g)
