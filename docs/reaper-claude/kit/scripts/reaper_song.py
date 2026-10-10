#!/usr/bin/env python3
"""Демо-трек в REAPER с нуля: гранж в ми-миноре, ударные AD2, бас RS5K на семплах
Finger Bass, две гитары Ample Guitar VC + Guitar Rig 7. MIDI инлайном, по айтему на секцию.

  python3 scripts/reaper_song.py ПАПКА [--name grunge_demo] [--bpm 108]
  /Applications/REAPER.app/Contents/MacOS/REAPER -nonewinst ПАПКА/open.lua

Скилл: ~/.claude/skills/reaper-song/SKILL.md.
"""
import os, sys, glob, zlib, time, random, argparse, subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rpp_common import track_head, fx, col, guid, A2M, BASS_SAMPLES

TPQ = 960
SECTIONS = [('Intro', 4), ('Verse 1', 8), ('Chorus 1', 8), ('Verse 2', 8),
            ('Chorus 2', 8), ('Bridge', 8), ('Chorus 3', 8), ('Outro', 2)]

# Ample Guitar VC — стандартный строй, ниже E2 (40) нот нет
CHORD = {'E5': (40, 47, 52), 'G5': (43, 50, 55), 'A5': (45, 52, 57), 'C5': (48, 55, 60),
         'D5': (50, 57, 62), 'B5': (47, 54, 59)}
BASS = {'E5': 28, 'G5': 31, 'A5': 33, 'C5': 36, 'D5': 38, 'B5': 35}
CHORUS = ['E5', 'C5', 'G5', 'D5', 'E5', 'C5', 'G5', 'B5']
BRIDGE = ['A5', 'C5', 'E5', 'D5', 'A5', 'C5', 'B5', 'B5']
# AD2, не GM: ad2_keymap.py
KICK, SNARE, RIM, HH, HHO, CRASH1, CRASH2, FTOM = 36, 38, 37, 49, 55, 77, 79, 65
TOMS = (71, 69, 67, 65)
SHALLOW = 43   # Snare Shallow Hit: тихие удары дроби
# Odin III keyswitch'и (список в GUI, C-1 = 0), держать, пока звучит нота: не залипают
KS_RANGE = set(range(0, 36)) | set(range(101, 109))
KS_SLIDE_IN, KS_SLIDE_OUT_DOWN = 5, 2        # Slide Fast From Down, Slide Slow To Down
KS_SCRAPE, KS_NAT_HARM = 19, 21              # Scrapes, Natural Harmonic
KS_MUTE_SEMI, KS_MUTE_CLOSED = 28, 31        # Down Mute Semi Closed, Down Mute Closed
PINCH = 127                                  # velocity 127 = Pinch Harmonic, 35..126 — обычный штрих

# ---------- партии: [(доля от начала секции, длина в долях, нота, velocity)] ----------

def chord(n, at, ln, name, vel):
    n += [(at, ln, p, vel) for p in CHORD[name]]


def gtr_chorus_bar(n, b, name, vel=112):
    # синкопа 1.5 + 1 + 1 + 0.5: стена, но с качем
    for at, ln, v in ((0, 1.4, vel), (1.5, 0.9, vel - 8), (2.5, 0.9, vel - 4), (3.5, 0.45, vel - 12)):
        chord(n, b * 4 + at, ln, name, v)


def gtr_verse_bar(n, b, variant):
    o = b * 4
    if variant == 'a':
        for i in range(6):
            n += [(o + i / 2, 0.22, p, 72 + (10 if i % 2 == 0 else 0)) for p in CHORD['E5'][:2]]
        chord(n, o + 3, 0.45, 'G5', 96); chord(n, o + 3.5, 0.45, 'A5', 100)
    else:
        for i in range(4):
            n += [(o + i / 2, 0.22, p, 72 + (10 if i % 2 == 0 else 0)) for p in CHORD['E5'][:2]]
        chord(n, o + 2, 0.9, 'C5', 100); chord(n, o + 3, 0.9, 'B5', 104)


def guitar(sec, bars, double):
    n = []
    if sec == 'Intro':
        for b in range(bars):
            if double and b < 2:
                continue           # вторая гитара входит вместе с бандой
            gtr_chorus_bar(n, b, CHORUS[b])
    elif sec.startswith('Verse'):
        if double:
            return n
        for b in range(bars):
            gtr_verse_bar(n, b, 'a' if b % 2 == 0 else 'b')
    elif sec.startswith('Chorus'):
        for b in range(bars):
            gtr_chorus_bar(n, b, CHORUS[b])
    elif sec == 'Bridge':
        for b in range(6):
            chord(n, b * 4, 3.9, BRIDGE[b], 104)
        for i in range(16):        # разгон к последнему припеву
            chord(n, 24 + i / 2, 0.45, 'B5', 78 + i * 3)
    elif sec == 'Outro':
        chord(n, 0, 7.5, 'E5', 120)
    return n


def odin_guitar(sec, bars):
    """Партия гитары + приёмы Odin III: глушение, скрейп, слайд, пинч, флажолеты."""
    n = guitar(sec, bars, False)
    ks = lambda at, ln, k: n.append((at - 0.03, ln + 0.03, k, 100))
    if sec.startswith('Verse'):
        for b in range(bars):
            ks(b * 4, 2.9 if b % 2 == 0 else 1.9, KS_MUTE_CLOSED)   # чаги глушёные; конец до акцента с разбросом ±12 тиков
        o = (bars - 1) * 4
        n.append((o + 3.5, 0.5, 40, 100)); ks(o + 3.5, 0.5, KS_SCRAPE)  # скрейп медиатором в припев
    elif sec.startswith('Chorus') or sec == 'Intro':
        ks(0, 0.3, KS_SLIDE_IN)                             # въезд слайдом в первый аккорд
        last = bars - 1 if sec.startswith('Chorus') else 1
        if not (sec == 'Chorus 3'):
            n[:] = [x for x in n if not (x[0] == last * 4 + 3.5 and x[2] not in KS_RANGE)]
            top = max(CHORD[(CHORUS[last])])
            n.append((last * 4 + 3.5, 0.5, top, PINCH))             # пинч вместо последней восьмой
    elif sec == 'Bridge':
        n[:] = [x for x in n if not 16 <= x[0] < 24]
        for i, p in enumerate((57, 64, 69, 76, 60, 67, 72, 79)):    # флажолеты: A5 и C5
            n.append((16 + i, 1.5, p, 92))
        ks(16, 8, KS_NAT_HARM)
        ks(24, 4, KS_MUTE_SEMI)                                     # разгон: глушёный, потом открытый
    elif sec == 'Outro':
        n[:] = [(at, 5.5, p, v) for at, ln, p, v in n]
        n.append((5.5, 2, 40, 110)); ks(5.5, 2, KS_SLIDE_OUT_DOWN)  # съезд вниз в конце
    return n


def bass(sec, bars):
    n = []
    if sec == 'Intro':
        for b in range(2, bars):
            for i in range(8):
                n.append((b * 4 + i / 2, 0.45, BASS[CHORUS[b]], 108 if i % 2 == 0 else 96))
    elif sec.startswith('Verse'):
        for b in range(bars):
            o = b * 4
            k = 6 if b % 2 == 0 else 4
            n += [(o + i / 2, 0.4, 28, 100 if i % 2 == 0 else 88) for i in range(k)]
            if b % 2 == 0:
                n += [(o + 3, 0.45, 31, 100), (o + 3.5, 0.45, 33, 104)]
            else:
                n += [(o + 2, 0.9, 36, 104), (o + 3, 0.9, 35, 106)]
    elif sec.startswith('Chorus'):
        for b in range(bars):
            r, nxt = BASS[CHORUS[b]], BASS[CHORUS[(b + 1) % bars]]
            for i in range(8):
                # подхват — полутон к следующему корню; октава вверх не годится: семплы RS5K только 28..39
                p = (nxt - 1 if nxt > 28 else 29) if i == 7 and nxt != r else r
                n.append((b * 4 + i / 2, 0.45, p, 110 if i % 2 == 0 else 98))
    elif sec == 'Bridge':
        for b in range(6):
            r = BASS[BRIDGE[b]]
            n += [(b * 4, 1.9, r, 104), (b * 4 + 2, 1.9, r, 96)]
        n += [(24 + i / 2, 0.45, 35, 80 + i * 3) for i in range(16)]
    elif sec == 'Outro':
        n.append((0, 7.5, 28, 118))
    return n


def drums(sec, bars):
    n = []
    hit = lambda at, p, v: n.append((at, 0.25, p, v))

    def verse_bar(o):
        for i in range(8):
            hit(o + i / 2, HH, 92 if i % 2 == 0 else 66)
        for at in (0, 1.5, 2.5):
            hit(o + at, KICK, 108)
        for at in (1, 3):
            hit(o + at, SNARE, 112)

    def chorus_bar(o, crash):
        for i in range(8):
            if not (crash and i == 0):
                hit(o + i / 2, HHO, 92 if i % 2 == 0 else 74)
        if crash:
            hit(o, CRASH1, 118)
        for at in (0, 1.5, 2.5):
            hit(o + at, KICK, 115)
        for at in (1, 3):
            hit(o + at, RIM, 122)

    rnd = random.Random(zlib.crc32(sec.encode()))

    def snare_roll(o, beats, v0, v1, step=0.25):
        # линейная рампа ровными 1/16 на слух — «механизм бьёт»: крещендо по кривой,
        # ведущая рука сильнее, тихие удары shallow, к концу сбивки барабанщик подгоняет
        k = int(round(beats / step))
        for i in range(k):
            x = i / max(1, k - 1)
            v = v0 + (v1 - v0) * x ** 1.7 + (7 if i % 2 == 0 else -7) + (8 if i % 4 == 0 else 0) + rnd.randint(-8, 8)
            v = max(30, min(127, round(v)))
            at = o + i * step - 0.015 * x + rnd.uniform(-0.012, 0.012)
            hit(at, SNARE if v >= 88 else SHALLOW, v)
            if i % 4 == 0 and v >= 95 and rnd.random() < 0.35:
                hit(at - 0.03, SHALLOW, rnd.randint(42, 58))      # форшлаг

    def tom_run(o, beats, v0):
        for i in range(int(beats * 4)):
            hit(o + i / 4, TOMS[min(3, i * 4 // int(beats * 4))], v0 + i * 3)

    if sec == 'Intro':
        snare_roll(4 + 2, 2, 76, 116)        # подхват перед входом банды
        for b in (2, 3):
            chorus_bar(b * 4, crash=b == 2)
    elif sec.startswith('Verse'):
        for b in range(bars - 1):
            verse_bar(b * 4)
        o = (bars - 1) * 4                   # сбивка по томам в припев
        hit(o, KICK, 110); hit(o + 1, SNARE, 112)
        for i in range(8):
            hit(o + 2 + i / 4, TOMS[i // 2], 100 + i * 3)
    elif sec.startswith('Chorus'):
        for b in range(bars - 1):
            chorus_bar(b * 4, crash=b % 4 == 0)
        o = (bars - 1) * 4
        hit(o, KICK, 112); hit(o, CRASH2, 108); hit(o + 1, RIM, 120); hit(o + 1.5, KICK, 110)
        k = sec[-1]                          # у каждого припева своя сбивка
        if k == '1':
            snare_roll(o + 2, 2, 82, 122)
        elif k == '2':
            snare_roll(o + 2, 1, 84, 112); tom_run(o + 3, 1, 104)
        else:
            snare_roll(o + 2, 2, 80, 124, step=1 / 3)            # триоли перед концовкой
    elif sec == 'Bridge':
        for b in range(6):                   # половинный размах: бочка 1, снейр 3, флор-том восьмыми
            o = b * 4
            if b in (0, 4):
                hit(o, CRASH2, 110)
            for i in range(8):
                hit(o + i / 2, FTOM, 88 if i % 2 == 0 else 70)
            hit(o, KICK, 112); hit(o + 2.5, KICK, 96); hit(o + 2, RIM, 120)
        snare_roll(24, 4, 66, 104, step=0.5)
        for i in range(0, 8, 2):
            hit(24 + i / 2, KICK, 90)
        snare_roll(28, 3, 80, 124)
        tom_run(31, 1, 108)
        for i in range(4):
            hit(28 + i, KICK, 112)
    elif sec == 'Outro':
        hit(0, KICK, 124); hit(0, CRASH1, 124); hit(0, CRASH2, 120)
    return n

# ---------- RPP ----------

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


def parts(guitars):
    """имя, цвет, дБ, панорама, цепочка, генератор, канал, разброс тиков, сдвиг, дрейф vel, strum"""
    # уровни: при 0/−2/−4/−4 дБ мастер упирался в 0 дБFS (5553 сэмпла), бас при −3 давал пик −3 дБFS
    p = [('Drums AD2', col(200, 70, 60), -6, 0, fx('ad2'), drums, 9, 6, 0, 6, 0),
         ('Bass', col(60, 110, 210), -6, 0, None, bass, 0, 10, 0, 7, 0)]
    if 'ample' in guitars:
        p += [('Guitar L', col(230, 150, 40), -6, -0.75, fx('guitar_ample_gr7'),
               lambda s, b: guitar(s, b, False), 0, 12, 0, 10, 6),
              ('Guitar R', col(240, 180, 70), -6, 0.75, fx('guitar_ample_gr7'),
               lambda s, b: guitar(s, b, True), 0, 12, 10, 10, 6)]
    if 'odin' in guitars:
        # Odin сам двоит гитару (Guitar 01/02 на ±50) и раскатывает аккорд (Auto Chord Delay) — свой strum не нужен
        p += [('Odin III', col(150, 90, 200), -6, 0, odin_chain(),
               odin_guitar, 0, 12, 0, 10, 0)]
    return p


def track_chunk(ti, part, spb, seed):
    tname, c, db, pan, chain, gen, ch, jit, delay, damp, strum = part
    rnd = random.Random(seed * 100 + ti)
    drift = drift_curve(random.Random(seed * 1000 + ti), damp)
    body = track(tname, c, db, pan, chain)
    bar0 = 0
    for sec, bars in SECTIONS:
        notes = gen(sec, bars)
        if notes:
            hn = humanize(notes, rnd, jit, 6, delay, drift, bar0 * 4, strum, 126 if tname.startswith('Odin') else 127)
            body += item(f'{tname} — {sec}', bar0 * 4 * spb, bars * 4 * spb, midi_source(hn, bars * 4, ch))
        bar0 += bars
    return body + '  >\n'


def add_lua(folder, bpm, guitars, seed=7):
    """Дорожки в уже открытый проект: вставить в конец, Ample-гитары заглушить. Не сохраняет."""
    spb, lua = 60 / bpm, []
    for ti, part in enumerate(parts(guitars)):
        if part[0] in ('Drums AD2', 'Bass'):
            continue
        lua.append(f'''for i = reaper.CountTracks(0) - 1, 0, -1 do
  local _, nm = reaper.GetTrackName(reaper.GetTrack(0, i))
  if nm == "{part[0]}" then reaper.DeleteTrack(reaper.GetTrack(0, i)) end
end
do
  local n = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(n, false)
  reaper.SetTrackStateChunk(reaper.GetTrack(0, n), [==[{track_chunk(ti + 10, part, spb, seed)}]==], false)
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


def build(folder, name, bpm, seed=7, guitars=('ample',)):
    spb = 60 / bpm
    body = ''.join(track_chunk(ti, part, spb, seed) for ti, part in enumerate(parts(guitars)))
    marks, bar0 = [], 0
    for i, (sec, bars) in enumerate(SECTIONS, 1):
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


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--name', default='grunge_demo')
    ap.add_argument('--bpm', type=float, default=108)
    ap.add_argument('--guitars', default='ample', help='ample, odin или ample,odin')
    ap.add_argument('--add', action='store_true', help='только lua: гитары в уже открытый проект')
    a = ap.parse_args()
    folder, g = os.path.abspath(os.path.expanduser(a.folder)), tuple(a.guitars.split(','))
    os.makedirs(folder, exist_ok=True)
    if a.add:
        add_lua(folder, a.bpm, g)
    else:
        build(folder, a.name, a.bpm, guitars=g)
