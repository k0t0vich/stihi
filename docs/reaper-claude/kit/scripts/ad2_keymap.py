#!/usr/bin/env python3
"""Раскладка Addictive Drums 2. Источник: официальный keymap PDF от XLN Audio.

AD2 НЕ совместим с GM. Ключевые расхождения, которые ломают всё:
  нота 42: GM Closed HiHat  ->  AD2 Snare SideStick
  нота 46: GM Open HiHat    ->  AD2 Cymbal 1 Choke... нет, Cymbal
  нота 49: GM Crash 1       ->  AD2 HiHat Closed1 Tip
  нота 50: GM High Tom      ->  AD2 HiHat Closed1 Shaft
  нота 51: GM Ride          ->  AD2 HiHat Closed2 Tip
"""

AD2 = {
    36: 'Kick',
    37: 'Snare Rimshot Open Hit',
    38: 'Snare Open Hit',
    41: 'Snare Shallow Rimshot',
    42: 'Snare SideStick',
    43: 'Snare Shallow Hit',
    45: 'Ride (alt)',
    46: 'Cymbal (alt)',
    47: 'Flexi',
    48: 'HiHat Pedal Closed',
    49: 'HiHat Closed1 Tip',
    50: 'HiHat Closed1 Shaft',
    51: 'HiHat Closed2 Tip',
    52: 'HiHat Closed2 Shaft',
    53: 'HiHat Closed Bell',
    54: 'HiHat Open A',
    55: 'HiHat Open B',
    56: 'HiHat Open C',
    57: 'HiHat Open D',
    58: 'HiHat Open Bell',
    59: 'HiHat Pedal Open',
    60: 'Ride 1 Tip (softer)',
    61: 'Ride 1 Bell',
    62: 'Ride 1 Shaft (stronger)',
    63: 'Ride 1 Choke',
    65: 'Tom 4 Open Hit',
    66: 'Tom 4 Rimshot',
    67: 'Tom 3 Open Hit',
    68: 'Tom 3 Rimshot',
    69: 'Tom 2 Open Hit',
    70: 'Tom 2 Rimshot',
    71: 'Tom 1 Open Hit',
    72: 'Tom 1 Rimshot',
    73: 'Flexi 1 Hit B',
    74: 'Flexi 1 Hit C',
    75: 'Snare Sticks',
    76: 'Flexi 1 Hit D',
    77: 'Cymbal 1 Hit',
    78: 'Cymbal 1 Choke',
    79: 'Cymbal 2 Hit',
    80: 'Cymbal 2 Choke',
    81: 'Cymbal 3 Hit',
    82: 'Cymbal 3 Choke',
    84: 'Ride 2 Tip (softer)',
    85: 'Ride 2 Bell',
    86: 'Ride 2 Shaft (stronger)',
    87: 'Ride 2 Choke',
    89: 'Cymbal 4 Hit',
    90: 'Cymbal 4 Choke',
    91: 'Cymbal 5 Hit',
    92: 'Cymbal 5 Choke',
    93: 'Cymbal 6 Hit',
    94: 'Cymbal 6 Choke',
    96: 'Flexi 2 Hit A',
    97: 'Flexi 2 Hit B',
    98: 'Flexi 2 Hit C',
    99: 'Flexi 2 Hit D',
    100: 'Flexi 3 Hit A',
    101: 'Flexi 3 Hit B',
}

# CC для непрерывного контроля
AD2_CC = {
    3: 'Ride 2 position (Tip<>Bell)',
    4: 'Ride 1 position (Tip<>Bell)',
    5: 'Snare position [brush]',
    6: 'Snare position (Open<>Shallow)',
    7: 'HiHat CC Shaft',
    8: 'HiHat CC Tip',
    9: 'HiHat CC Bell',
}

# Соответствие "длина звона -> нота AD2", измерено на эталонах.
# Нужно, потому что имя класса не говорит о длине: детектор может назвать
# crash короткий удар, а звучать он должен как закрытый хэт.
RING_TO_NOTE = [
    ( 40, 48, 'HiHat Pedal Closed'),      # только совсем глухой
    ( 70, 49, 'HiHat Closed1 Tip'),
    (100, 50, 'HiHat Closed1 Shaft'),
    (110, 51, 'HiHat Closed2 Tip'),
    (240, 52, 'HiHat Closed2 Shaft'),
    (340, 54, 'HiHat Open A'),
    (450, 55, 'HiHat Open B'),
    (600, 56, 'HiHat Open C'),
    (10**9, 77, 'Cymbal 1 Hit'),
]

# Под барабаном верх маскируется низом, и звон меряется КОРОЧЕ реального.
# Измерено: первое событие Suno показало 53мс под киком, на слух - длиннее.
MASK_FACTOR = 2.2

def note_by_ring(hi_decay_ms, label=None, masked=False):
    """Нота по фактической длине звона, а не по имени класса.

    masked=True - удар звучит вместе с барабаном: замер занижен, компенсируем.
    """
    v = hi_decay_ms * (MASK_FACTOR if masked else 1.0)
    for lim, note, _ in RING_TO_NOTE:
        if v < lim:
            return note
    return 77

# куда класть результат классификатора
LABEL_TO_AD2 = {
    'kick':   36,
    'snare':  38,
    'tom':    69,   # Tom 2, средний
    'hihat':  52,   # Closed2 Shaft - длинный закрытый, подобран на слух
    'hh_open': 54,  # HiHat Open A
    'hihat_open': 54,
    'pedal':  48,   # HiHat Pedal Closed
    'hihat_pedal': 48,
    'ride':   60,   # Ride 1 Tip
    'crash':  77,   # Cymbal 1
    'stick':  75,   # Snare Sticks - палочки друг о друга
    'pedal':  48,   # HiHat Pedal Closed
}

if __name__ == '__main__':
    print('Addictive Drums 2 keymap\n')
    for n in sorted(AD2):
        print(f'  {n:3}  {AD2[n]}')
    print('\nCC:')
    for n in sorted(AD2_CC):
        print(f'  CC{n:<3} {AD2_CC[n]}')
