"""Гранж-демо в ми-миноре, 108 bpm: Intro/Verse/Chorus/Verse/Chorus/Bridge/Chorus/Outro.
Сочинено в диалоге с Claude; оживление, приёмы и сборка — в song_kit.py.

Журнал: запрос → что поменял
  «гранжевое демо: куплет, припев, бридж»  → форма, ми-минор, 108 bpm, партии ударных, баса, двух гитар
  «звучит механистически, сбивки снейра»   → у каждого припева своя сбивка, бридж кончается томами;
                                              сама дробь — song_kit.snare_roll
  «велосити плавающая, на гитарах тоже»    → song_kit.humanize: дрейф по фразе, аккорд одной рукой
  «подключи Odin III на его примочках»     → odin_guitar: глушения, скрейп, слайды, пинч, флажолеты

  python3 scripts/song_kit.py scripts/songs/grunge_demo.py ПАПКА --guitars ample,odin
"""
import zlib, random
from song_kit import (KICK, SNARE, RIM, HH, HHO, CRASH1, CRASH2, FTOM, TOMS, KS_RANGE,
                      KS_SLIDE_IN, KS_SLIDE_OUT_DOWN, KS_SCRAPE, KS_NAT_HARM, KS_MUTE_SEMI,
                      KS_MUTE_CLOSED, PINCH, snare_roll, tom_run)

NAME, BPM = 'grunge_demo', 108
SECTIONS = [('Intro', 4), ('Verse 1', 8), ('Chorus 1', 8), ('Verse 2', 8),
            ('Chorus 2', 8), ('Bridge', 8), ('Chorus 3', 8), ('Outro', 2)]

# Ample Guitar VC — стандартный строй, ниже E2 (40) нот нет
CHORD = {'E5': (40, 47, 52), 'G5': (43, 50, 55), 'A5': (45, 52, 57), 'C5': (48, 55, 60),
         'D5': (50, 57, 62), 'B5': (47, 54, 59)}
BASS = {'E5': 28, 'G5': 31, 'A5': 33, 'C5': 36, 'D5': 38, 'B5': 35}
CHORUS = ['E5', 'C5', 'G5', 'D5', 'E5', 'C5', 'G5', 'B5']
BRIDGE = ['A5', 'C5', 'E5', 'D5', 'A5', 'C5', 'B5', 'B5']

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

    roll = lambda o, beats, v0, v1, step=0.25: snare_roll(hit, rnd, o, beats, v0, v1, step)
    toms = lambda o, beats, v0: tom_run(hit, o, beats, v0)

    if sec == 'Intro':
        roll(4 + 2, 2, 76, 116)        # подхват перед входом банды
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
            roll(o + 2, 2, 82, 122)
        elif k == '2':
            roll(o + 2, 1, 84, 112); toms(o + 3, 1, 104)
        else:
            roll(o + 2, 2, 80, 124, step=1 / 3)            # триоли перед концовкой
    elif sec == 'Bridge':
        for b in range(6):                   # половинный размах: бочка 1, снейр 3, флор-том восьмыми
            o = b * 4
            if b in (0, 4):
                hit(o, CRASH2, 110)
            for i in range(8):
                hit(o + i / 2, FTOM, 88 if i % 2 == 0 else 70)
            hit(o, KICK, 112); hit(o + 2.5, KICK, 96); hit(o + 2, RIM, 120)
        roll(24, 4, 66, 104, step=0.5)
        for i in range(0, 8, 2):
            hit(24 + i / 2, KICK, 90)
        roll(28, 3, 80, 124)
        toms(31, 1, 108)
        for i in range(4):
            hit(28 + i, KICK, 112)
    elif sec == 'Outro':
        hit(0, KICK, 124); hit(0, CRASH1, 124); hit(0, CRASH2, 120)
    return n


# дорожки, которые соберёт song_kit.parts
def guitar_l(sec, bars):
    return guitar(sec, bars, False)


def guitar_r(sec, bars):
    return guitar(sec, bars, True)


odin = odin_guitar
