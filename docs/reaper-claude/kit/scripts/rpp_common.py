"""Общее для reaper_song.py: выжимка из audio2midi (suno_project.py, make_project.py)."""

import os, uuid



A2M = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FXCHAINS = os.path.join(A2M, 'fxchains')

BASS_SAMPLES = os.path.join(A2M, 'samples-bass-finger')



def guid():
    return '{%s}' % str(uuid.uuid4()).upper()


def track_head(name, mute=0, height=80):
    return f'''  <TRACK {guid()}
    NAME "{name}"
    PEAKCOL 16576
    BEAT -1
    AUTOMODE 0
    VOLPAN 1 0 -1 -1 1
    MUTESOLO {mute} 0 0
    IPHASE 0
    PLAYOFFS 0 1
    ISBUS 0 0
    BUSCOMP 0 0 0 0 0
    SHOWINMIX 1 0.6667 0.5 1 0.5 0 0 0 0
    SEL 0
    REC 0 0 1 0 0 0 0 0
    VU 2
    TRACKHEIGHT {height} 0 0 0 0 0 0
    INQ 0 0 0 0.5 100 0 0 100
    NCHAN 2
    FX 1
    TRACKID {guid()}
    PERF 0
    MIDIOUT -1 -1
    MAINSEND 1 0
'''


def col(r, g, b):
    return 0x1000000 | (b << 16) | (g << 8) | r


def js_transpose(semi):
    return (f'BYPASS 0 0 0\n<JS MIDI/midi_transpose ""\n{semi} 1 0 127' + ' -' * 60 + '\n>\n'
            f'FLOATPOS 0 0 0 0\nFXID {guid()}\nWAK 0 0\n')


def fx(name, transpose=0):
    """Цепочка из шаблона; FXID новые, иначе REAPER путает копии."""
    p = os.path.join(FXCHAINS, name + '.RfxChain')
    if not os.path.exists(p):
        return None
    body = (js_transpose(transpose) if transpose else '') + ''.join(('FXID ' + guid() + '\n') if ln.startswith('FXID ') else ln
                   for ln in open(p, encoding='utf-8').readlines())
    return ('    <FXCHAIN\n      SHOW 0\n      LASTSEL 0\n      DOCKED 0\n'
            + ''.join('      ' + ln for ln in body.splitlines(keepends=True)) + '    >\n')
