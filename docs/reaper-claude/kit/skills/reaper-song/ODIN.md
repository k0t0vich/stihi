# Odin III (Solemn Tones) — приёмы для живой гитары

Снято с GUI плагина (кнопка Keyswitch List) и из `TrackFX_GetParamName`, 2026-10-09.
Нумерация: C-1 = MIDI 0, C1 = 24, C2 = 36. Играемые ноты — от C2 (36).

**Keyswitch'и не залипают** (`Keyswitch Latching` = Off): нота-keyswitch должна
звучать, пока звучат ноты с этим приёмом, и начинаться **раньше** них (в
`reaper_song.py` на 0.03 доли, без humanize, на одном тике идёт первой).

## Keyswitch'и

| Нота | Приём | Нота | Приём | Нота | Приём |
|---|---|---|---|---|---|
| 0 C-1 | Slide Slow From Up | 12 C0 | Down Open Palm Mute | 24 C1 | Alternate Picked (по умолчанию) |
| 1 C#-1 | Slide Slow From Down | 13 C#0 | Hammer-On | 25 C#1 | Down Picked |
| 2 D-1 | Slide Slow To Down | 14 D0 | Pull-Off | 26 D1 | Up Picked |
| 3 D#-1 | Slide Slow To Up | 15 D#0 | Up Open Palm Mute | 27 D#1 | Alternate Mute Semi Closed |
| 4 E-1 | Slide Fast From Up | 16 E0 | Bend Up Fast | 28 E1 | Down Mute Semi Closed |
| 5 F-1 | Slide Fast From Down | 17 F0 | Bend Up Slow | 29 F1 | Up Mute Semi Closed |
| 6 F#-1 | Slide Fast To Down | 18 F#0 | Auto Slide | 30 F#1 | Alternate Mute Closed |
| 7 G-1 | Slide Fast To Up | 19 G0 | **Scrapes** (скрейп медиатором) | 31 G1 | Down Mute Closed |
| 8 G#-1 | Auto Power Chord | 20 G#0 | Tremolo Picked | 32 G#1 | Up Mute Closed |
| 9 A-1 | Finger Pluck Open | 21 A0 | **Natural Harmonic** | 33 A1 | Alternate Mute Dead |
| 10 A#-1 | Finger Pluck Dead | 22 A#0 | **Pinch Harmonic** | 34 A#1 | Down Mute Dead |
| 11 B-1 | Thumb Slap | 23 B0 | Nasty Pinch Harmonic | 35 B1 | Up Mute Dead |

Выбор струны (String Mod): F7 (101) — струна 8 … C8 (108) — струна 1.

## Velocity Triggers — работают без keyswitch

| Velocity | Что играет |
|---|---|
| 127 | Pinch Harmonic |
| 35–126 | обычный штрих (alt pick) |
| 25–34 | Palm Mutes |
| 15–24 | Palm Mutes Closed |
| 0–14 | Palm Mutes Dead |

**Грабли:** плавающая велосити легко даёт 127 → случайный визг. Потолок 126,
127 — только намеренно. Тихие ноты ниже 35 превращаются в глушения.

## Параметры (индекс для `TrackFX_SetParam`, значение 0..1)

| # | Параметр | Значения |
|---|---|---|
| 1 | Amp Choice | 0 DI · 1/3 Rhythm (перегруз) · 2/3 Lead · 1 Clean (чистый с дилеем) |
| 2 | Pickup Choice | Bridge Modern / Bridge Def / Neck |
| 6 | Humanize | 0..1 = 0..100 %, случайный тайминг; для проверки тайминга 0 |
| 13 / 14 | Human String / Human Left Hand | шумы струн у звукоснимателей / левой руки по грифу, 0..1 = 0..100 |
| 15 | Human Mute | шумы глушения в конце нот |
| 16 | Auto Chord Delay | раскат аккорда (0.078 = 8 мс); свой strum поверх не нужен |
| 23 | Human Noises | ошибки и шумы исполнителя, On/Off |
| 24 | Auto Slide | слайд между перекрывающимися нотами |
| 7 / 8 / 19 | Guitar 01 / 02 Pan, Pan Link | Odin — сразу дабл L/R (±50) |

Без Guitar Rig: Amp Choice → Rhythm. Шаблон `guitar_odin_gr7` хранит DI под GR7,
`reaper_song.odin_chain()` берёт из него только Odin.

## Что делает `odin_guitar` в демо

| Место | Приём |
|---|---|
| куплет, чаги E5 | Down Mute Closed (31), акценты открыты |
| последняя доля куплета | Scrapes (19) — скрейп в припев |
| первый аккорд припева | Slide Fast From Down (5) |
| последняя восьмая припева / вступления | пинч (velocity 127) на верхней ноте аккорда |
| бридж, такты 5–6 | Natural Harmonic (21), арпеджио флажолетов |
| разгон бриджа | Down Mute Semi Closed (28) → открытый |
| концовка | Slide Slow To Down (2) |

На слух не проверено: подтверждено только, что параметры встали и что приёмы есть в MIDI.
