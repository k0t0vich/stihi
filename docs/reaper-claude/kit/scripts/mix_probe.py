#!/usr/bin/env python3
"""Замер микса в REAPER: стемы звучащих дорожек + мастер → цифры для сведения.

  python3 scripts/mix_probe.py render  ПАПКА_ЗАМЕРА        # lua в открытый проект, ждёт рендер
  python3 scripts/mix_probe.py analyze ПАПКА_ЗАМЕРА [--ref ПАПКА_ДО]

render: стемы невыключенных дорожек + Master.wav, project.json (дорожки, громкость,
панорама, FX). Настройки рендера проекта возвращаются как были.
analyze: LUFS-I/LRA/true peak по BS.1770-4, спектр по третьоктавам, маскировка по
полосам, стерео по полосам, наклон тонального баланса. Скилл: ~/.claude/skills/reaper-mix.
"""
import os, sys, json, time, glob, argparse, subprocess
import numpy as np
import soundfile as sf
from scipy import signal

REAPER = '/Applications/REAPER.app/Contents/MacOS/REAPER'

# ---------- рендер ----------

LUA = r'''
local OUT = "%s"
local function q(s) return '"' .. tostring(s):gsub('\\', '\\\\'):gsub('"', '\\"') .. '"' end
local keys_s = {"RENDER_FILE", "RENDER_PATTERN", "RENDER_FORMAT"}
local keys_n = {"RENDER_SETTINGS", "RENDER_BOUNDSFLAG", "RENDER_SRATE", "RENDER_CHANNELS", "RENDER_ADDTOPROJ"}
local saved_s, saved_n = {}, {}
for _, k in ipairs(keys_s) do saved_s[k] = select(2, reaper.GetSetProjectInfo_String(0, k, "", false)) end
for _, k in ipairs(keys_n) do saved_n[k] = reaper.GetSetProjectInfo(0, k, 0, false) end
local BYPASS = {%s}
local off = {}
local function each_track(fn) fn(reaper.GetMasterTrack(0)); for i = 0, reaper.CountTracks(0) - 1 do fn(reaper.GetTrack(0, i)) end end
each_track(function(tr)
  for f = 0, reaper.TrackFX_GetCount(tr) - 1 do
    local _, rn = reaper.TrackFX_GetNamedConfigParm(tr, f, "renamed_name")
    for _, b in ipairs(BYPASS) do
      if rn == "mix: " .. b and reaper.TrackFX_GetEnabled(tr, f) then reaper.TrackFX_SetEnabled(tr, f, false); off[#off + 1] = {tr, f} end
    end
  end
end)
local sel = {}
for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  sel[i] = reaper.IsTrackSelected(tr)
end

-- project.json: дорожки, FX, уровни
local j = {'{"project": ' .. q(reaper.GetProjectName(0, "")) .. ', "tracks": ['}
local function fxlist(tr, master)
  local t = {}
  for f = 0, reaper.TrackFX_GetCount(tr) - 1 do
    local _, nm = reaper.TrackFX_GetFXName(tr, f, "")
    t[#t + 1] = '{"name": ' .. q(nm) .. ', "on": ' .. tostring(reaper.TrackFX_GetEnabled(tr, f)) .. '}'
  end
  return '[' .. table.concat(t, ', ') .. ']'
end
local rows = {}
for i = 0, reaper.CountTracks(0) - 1 do
  local tr = reaper.GetTrack(0, i)
  local _, nm = reaper.GetTrackName(tr)
  local vol = reaper.GetMediaTrackInfo_Value(tr, "D_VOL")
  rows[#rows + 1] = '{"i": ' .. i .. ', "name": ' .. q(nm) ..
    ', "vol_db": ' .. string.format("%%.2f", 20 * math.log(math.max(vol, 1e-9), 10)) ..
    ', "pan": ' .. string.format("%%.2f", reaper.GetMediaTrackInfo_Value(tr, "D_PAN")) ..
    ', "mute": ' .. math.floor(reaper.GetMediaTrackInfo_Value(tr, "B_MUTE")) ..
    ', "fx": ' .. fxlist(tr) .. '}'
  reaper.SetTrackSelected(tr, reaper.GetMediaTrackInfo_Value(tr, "B_MUTE") == 0)
end
j[#j + 1] = table.concat(rows, ', ') .. '], "master_fx": ' .. fxlist(reaper.GetMasterTrack(0)) .. '}'
local f = io.open(OUT .. "/project.json", "w"); f:write(table.concat(j)); f:close()

reaper.GetSetProjectInfo_String(0, "RENDER_FILE", OUT, true)
reaper.GetSetProjectInfo_String(0, "RENDER_PATTERN", "$track", true)
reaper.GetSetProjectInfo_String(0, "RENDER_FORMAT", "evaw", true)
reaper.GetSetProjectInfo(0, "RENDER_SETTINGS", 1, true)     -- мастер + стемы выделенных
reaper.GetSetProjectInfo(0, "RENDER_BOUNDSFLAG", 1, true)
reaper.GetSetProjectInfo(0, "RENDER_SRATE", 48000, true)
reaper.GetSetProjectInfo(0, "RENDER_CHANNELS", 2, true)
reaper.GetSetProjectInfo(0, "RENDER_ADDTOPROJ", 0, true)
reaper.Main_OnCommand(42230, 0)                              -- рендер с последними настройками, без диалога

for _, k in ipairs(keys_s) do reaper.GetSetProjectInfo_String(0, k, saved_s[k], true) end
for _, k in ipairs(keys_n) do reaper.GetSetProjectInfo(0, k, saved_n[k], true) end
for i, s in pairs(sel) do reaper.SetTrackSelected(reaper.GetTrack(0, i), s) end
for _, o in ipairs(off) do reaper.TrackFX_SetEnabled(o[1], o[2], true) end

-- сверка LUFS-I с измерителем REAPER: gain до -23 LUFS → LUFS = -23 - 20log10(gain)
local src = reaper.PCM_Source_CreateFromFile(OUT .. "/Master.wav")
local g = reaper.CalculateNormalization(src, 0, -23, 0, 0)
reaper.PCM_Source_Destroy(src)
f = io.open(OUT .. "/done.txt", "w")
f:write(string.format("reaper_lufs_i %%.2f\n", -23 - 20 * math.log(g, 10))); f:close()
'''


def render(out, bypass=(), timeout=600):
    out = os.path.abspath(os.path.expanduser(out))
    os.makedirs(out, exist_ok=True)
    for f in glob.glob(os.path.join(out, '*.wav')) + glob.glob(os.path.join(out, 'done.txt')):
        os.remove(f)
    lua = os.path.join(out, 'probe.lua')
    open(lua, 'w', encoding='utf-8').write(LUA % (out, ', '.join(json.dumps(b, ensure_ascii=False) for b in bypass)))
    subprocess.run([REAPER, '-nonewinst', lua], capture_output=True)
    t0 = time.time()
    while not os.path.exists(os.path.join(out, 'done.txt')):
        if time.time() - t0 > timeout:
            sys.exit('рендер не закончился')
        time.sleep(2)
    print(open(os.path.join(out, 'done.txt')).read().strip())
    print('→', out, sorted(os.path.basename(f) for f in glob.glob(os.path.join(out, '*.wav'))))

# ---------- BS.1770-4 ----------

def k_weight(x, sr):
    # коэффициенты ITU-R BS.1770-4 для 48 кГц; другие частоты — пересчёт билинейным преобразованием не нужен, рендерим 48 к
    assert sr == 48000, 'K-фильтр задан для 48 кГц'
    b1, a1 = [1.53512485958697, -2.69169618940638, 1.19839281085285], [1.0, -1.69065929318241, 0.73248077421585]
    b2, a2 = [1.0, -2.0, 1.0], [1.0, -1.99004745483398, 0.99007225036621]
    return signal.lfilter(b2, a2, signal.lfilter(b1, a1, x, axis=0), axis=0)


def block_loudness(xk, sr, win, hop):
    n = int(win * sr); h = int(hop * sr)
    if len(xk) < n:
        return np.array([])
    idx = np.arange(0, len(xk) - n + 1, h)
    p = np.array([(xk[i:i + n] ** 2).mean(axis=0).sum() for i in idx])   # каналы L+R с весом 1
    return -0.691 + 10 * np.log10(p + 1e-20)


def lufs_i(x, sr):
    xk = k_weight(x, sr)
    l = block_loudness(xk, sr, 0.4, 0.1)
    l = l[l > -70]
    if not len(l):
        return -np.inf
    rel = 10 * np.log10(np.mean(10 ** (l / 10))) - 10
    l = l[l > rel]
    return 10 * np.log10(np.mean(10 ** (l / 10)))


def lra(x, sr):
    s = block_loudness(k_weight(x, sr), sr, 3.0, 1.0)
    s = s[s > -70]
    if len(s) < 2:
        return 0.0
    rel = 10 * np.log10(np.mean(10 ** (s / 10))) - 20
    s = s[s > rel]
    return float(np.percentile(s, 95) - np.percentile(s, 10))


def true_peak(x):
    return 20 * np.log10(np.abs(signal.resample_poly(x, 4, 1, axis=0)).max() + 1e-12)

# ---------- спектр, стерео, маскировка ----------

THIRD = 1000 * 2 ** (np.arange(-15, 14) / 3)       # 31.5 Гц … 20 кГц
OCT = [(40, 'низ <80'), (80, '80–160'), (160, '160–315'), (315, '315–630'), (630, '630–1.25k'),
       (1250, '1.25–2.5k'), (2500, '2.5–5k'), (5000, '5–10k'), (10000, '10–20k')]
OCT_EDGES = [20, 80, 160, 315, 630, 1250, 2500, 5000, 10000, 20000]


def psd(x, sr):
    f, p = signal.welch(x, sr, nperseg=8192, axis=0)
    return f, p


def band_db(f, p, lo, hi):
    m = (f >= lo) & (f < hi)
    return 10 * np.log10(p[m].sum() + 1e-20)


def analyze(d, ref=None):
    d = os.path.abspath(os.path.expanduser(d))
    files = {os.path.basename(f)[:-4]: f for f in glob.glob(os.path.join(d, '*.wav'))}
    st = {}
    for n, f in files.items():
        x, sr = sf.read(f)
        if x.ndim == 1:
            x = np.stack([x, x], 1)
        st[n] = x
    names = ['Master'] + sorted(n for n in st if n != 'Master')
    res = {'stems': {}}
    print(f'\n## Громкость ({os.path.basename(d)})\n')
    print('| дорожка | LUFS-I | LRA | true peak | PLR | crest RMS→пик |')
    print('|---|---|---|---|---|---|')
    for n in names:
        x = st[n]
        if np.abs(x).max() < 1e-6:
            continue
        li, lr, tp = lufs_i(x, sr), lra(x, sr), true_peak(x)
        rms = 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)
        res['stems'][n] = dict(lufs_i=round(li, 2), lra=round(lr, 2), tp=round(tp, 2), plr=round(tp - li, 2),
                               crest=round(20 * np.log10(np.abs(x).max() + 1e-12) - rms, 2))
        r = res['stems'][n]
        print(f"| {n} | {r['lufs_i']} | {r['lra']} | {r['tp']} | {r['plr']} | {r['crest']} |")

    # полосы: уровень дорожки относительно мастера в этой полосе
    live = [n for n in names if n in res['stems'] and n != 'Master']
    spec = {n: psd(st[n].mean(1), sr) for n in ['Master'] + live}
    side = {n: psd((st[n][:, 0] - st[n][:, 1]) / 2, sr) for n in ['Master'] + live}
    mid = {n: psd((st[n][:, 0] + st[n][:, 1]) / 2, sr) for n in ['Master'] + live}
    print('\n## Кто занимает полосу: уровень дорожки относительно мастера, дБ\n')
    print('| полоса | ' + ' | '.join(live) + ' | спор |')
    print('|---|' + '---|' * (len(live) + 1))
    res['bands'] = []
    for k, (lo, hi) in enumerate(zip(OCT_EDGES[:-1], OCT_EDGES[1:])):
        mdb = band_db(*spec['Master'], lo, hi)
        rel = {n: band_db(*spec[n], lo, hi) - mdb for n in live}
        # спор: две и больше дорожки в пределах 6 дБ друг от друга и не тише мастера на 10 дБ
        top = sorted(((v, n) for n, v in rel.items() if v > -10), reverse=True)
        fight = [n for v, n in top if top and v > top[0][0] - 6]
        res['bands'].append(dict(band=OCT[k][1], master_db=round(mdb, 1), rel={n: round(v, 1) for n, v in rel.items()},
                                 fight=fight if len(fight) > 1 else []))
        print(f'| {OCT[k][1]} | ' + ' | '.join(f'{rel[n]:+.1f}' for n in live) + f" | {', '.join(fight) if len(fight) > 1 else ''} |")

    print('\n## Стерео: доля Side к Mid по полосам, дБ (−∞ = моно)\n')
    print('| полоса | ' + ' | '.join(['Master'] + live) + ' |')
    print('|---|' + '---|' * (len(live) + 1))
    for k, (lo, hi) in enumerate(zip(OCT_EDGES[:-1], OCT_EDGES[1:])):
        print(f'| {OCT[k][1]} | ' + ' | '.join(f'{band_db(*side[n], lo, hi) - band_db(*mid[n], lo, hi):+.1f}' for n in ['Master'] + live) + ' |')

    # тональный баланс мастера по третьоктавам и наклон 50 Гц–10 кГц
    f, p = spec['Master']
    cen = THIRD[(THIRD >= 40) & (THIRD <= 16000)]
    lv = np.array([band_db(f, p, c / 2 ** (1 / 6), c * 2 ** (1 / 6)) for c in cen])
    m = (cen >= 50) & (cen <= 10000)
    slope, icpt = np.polyfit(np.log2(cen[m]), lv[m], 1)
    dev = lv - (slope * np.log2(cen) + icpt)
    res['tonal'] = dict(slope_db_oct=round(slope, 2), dev={f'{c:.0f}': round(v, 1) for c, v in zip(cen, dev)})
    print(f'\n## Тональный баланс мастера\n\nНаклон 50 Гц–10 кГц: **{slope:.2f} дБ/окт**. Отклонения от прямой (третьоктавы), дБ:\n')
    print(' '.join(f'{c:.0f}:{v:+.1f}' for c, v in zip(cen, dev)))

    # корреляция L/R ниже 120 Гц у мастера — моно низа
    sos = signal.butter(4, 120, 'low', fs=sr, output='sos')
    lo = signal.sosfilt(sos, st['Master'], axis=0)
    corr = np.corrcoef(lo[:, 0], lo[:, 1])[0, 1]
    res['low_corr'] = round(float(corr), 3)
    print(f'\nКорреляция L/R мастера ниже 120 Гц: **{corr:.3f}** (1 — моно)')

    if ref:
        old = json.load(open(os.path.join(os.path.abspath(os.path.expanduser(ref)), 'probe.json')))
        print('\n## Было → стало\n\n| дорожка | LUFS-I | LRA | PLR |\n|---|---|---|---|')
        for n, r in res['stems'].items():
            o = old['stems'].get(n)
            if o:
                print(f"| {n} | {o['lufs_i']} → {r['lufs_i']} | {o['lra']} → {r['lra']} | {o['plr']} → {r['plr']} |")
        print(f"\nНаклон: {old['tonal']['slope_db_oct']} → {res['tonal']['slope_db_oct']} дБ/окт; "
              f"корреляция низа: {old['low_corr']} → {res['low_corr']}")
    json.dump(res, open(os.path.join(d, 'probe.json'), 'w'), ensure_ascii=False, indent=1)


def comp_gr(x, sr, thr, ratio, knee, att_ms, rel_ms, blk_ms=1.0):
    """Подавление прямоточного компрессора с пиковым детектором (как Pro-C 2 Bus/Clean,
    приближённо): огибающая — пик стерео-связки по блокам 1 мс, сглаживание в дБ."""
    b = int(sr * blk_ms / 1000)
    n = len(x) // b
    pk = np.abs(x[:n * b]).max(axis=1).reshape(n, b).max(axis=1)
    xdb = 20 * np.log10(pk + 1e-9)
    d = xdb - thr
    slope = 1 / ratio - 1
    g = np.where(2 * d < -knee, 0.0, np.where(2 * np.abs(d) <= knee, slope * (d + knee / 2) ** 2 / (2 * max(knee, 1e-6)), slope * d))
    aa, ar = np.exp(-blk_ms / att_ms), np.exp(-blk_ms / rel_ms)
    out, y = np.empty(n), 0.0
    for i in range(n):
        y = aa * y + (1 - aa) * g[i] if g[i] < y else ar * y + (1 - ar) * g[i]
        out[i] = y
    return out, xdb


def fit_threshold(wav, pre_gain_db, ratio, knee, att, rel, target):
    x, sr = sf.read(wav)
    x = x if x.ndim == 2 else np.stack([x, x], 1)
    x = x * 10 ** (pre_gain_db / 20)          # стем записан после фейдера → вход плагина
    lo, hi = -60.0, 0.0
    for _ in range(30):
        t = (lo + hi) / 2
        g, xdb = comp_gr(x, sr, t, ratio, knee, att, rel)
        act = xdb > xdb.max() - 30             # только где играет
        gr = -g[act].mean()
        lo, hi = (t, hi) if gr > target else (lo, t)
    return round((lo + hi) / 2, 1), round(gr, 2), round(-g[act].min(), 1)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('step', choices=('render', 'analyze', 'thr'))
    ap.add_argument('dir', help='папка замера; для thr — wav стема до компрессора')
    ap.add_argument('--ref')
    ap.add_argument('--bypass', default='', help='теги FX «mix: …» через запятую — выключить на время рендера')
    ap.add_argument('--pre', type=float, default=0, help='thr: дБ от стема ко входу плагина (минус фейдер)')
    ap.add_argument('--ratio', type=float, default=2)
    ap.add_argument('--knee', type=float, default=6)
    ap.add_argument('--att', type=float, default=30)
    ap.add_argument('--rel', type=float, default=100)
    ap.add_argument('--target', type=float, default=3, help='thr: среднее подавление, дБ')
    a = ap.parse_args()
    if a.step == 'render':
        render(a.dir, [b for b in a.bypass.split(',') if b])
    elif a.step == 'analyze':
        analyze(a.dir, a.ref)
    else:
        t, gr, mx = fit_threshold(a.dir, a.pre, a.ratio, a.knee, a.att, a.rel, a.target)
        print(f'порог {t} дБ: среднее подавление {gr} дБ, максимум {mx} дБ')
