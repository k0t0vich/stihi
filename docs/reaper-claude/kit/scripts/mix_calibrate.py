#!/usr/bin/env python3
"""Пороги компрессоров по настоящему подавлению: REAPER играет отрезок, lua снимает
GainReduction_dB каждого «mix: <tag>», порог сдвигается на (GR − цель)/(1 − 1/ratio).

  python3 scripts/mix_calibrate.py ПАПКА --from 26.7 --to 44.4 \\
      --comp "шина ударных:3:2" --comp "компрессия баса:4:4" [--makeup]

Звук играет вслух. Симуляция детектора врёт: Pro-C 2 на шине гитар давил 8.5 дБ
там, где модель с пиковым детектором обещала 1.5.
"""
import os, sys, json, time, argparse, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mix_apply import HELPERS, REAPER

LUA = r'''
local function find_tag(tag)
  local function scan(tr)
    for f = 0, reaper.TrackFX_GetCount(tr) - 1 do
      local _, rn = reaper.TrackFX_GetNamedConfigParm(tr, f, "renamed_name")
      if rn == "mix: " .. tag then return f end
    end
  end
  local m = reaper.GetMasterTrack(0)
  local f = scan(m); if f then return m, f end
  for i = 0, reaper.CountTracks(0) - 1 do
    local tr = reaper.GetTrack(0, i); f = scan(tr); if f then return tr, f end
  end
end
local COMPS = %s           -- {tag, порог или nil, makeup или nil}
local T0, T1 = %f, %f
local acc = {}
for _, c in ipairs(COMPS) do
  local tr, f = find_tag(c[1])
  if not tr then log("!! нет " .. c[1]) else
    if c[2] then setp(tr, f, "Threshold", c[2]) end
    if c[3] then setp(tr, f, "Output Level", c[3]) end
    local p = pidx(tr, f, "Threshold")
    local _, thr = reaper.TrackFX_GetFormattedParamValue(tr, f, p, "")
    acc[#acc + 1] = {tag = c[1], tr = tr, f = f, sum = 0, n = 0, mx = 0, thr = num(thr)}
  end
end
reaper.SetEditCurPos(T0, false, false)
reaper.OnPlayButton()
local function tick()
  local pos = reaper.GetPlayPosition()
  if reaper.GetPlayState() & 1 == 1 and pos < T1 then
    if pos > T0 + 0.5 then   -- первые полсекунды — разгон огибающей
      for _, a in ipairs(acc) do
        local ok, v = reaper.TrackFX_GetNamedConfigParm(a.tr, a.f, "GainReduction_dB")
        v = tonumber(v) or 0
        a.sum = a.sum - v; a.n = a.n + 1; if -v > a.mx then a.mx = -v end
      end
    end
    reaper.defer(tick)
  else
    reaper.OnStopButton()
    local out = {}
    for _, a in ipairs(acc) do
      out[#out + 1] = string.format('{"tag": "%%s", "thr": %%.2f, "gr": %%.2f, "max": %%.2f, "n": %%d}', a.tag, a.thr, a.sum / math.max(a.n, 1), a.mx, a.n)
    end
    local f = io.open(RESULT, "w"); f:write("[" .. table.concat(out, ", ") .. "]"); f:close()
    log("done"); LOG:close()
  end
end
tick()
'''


def run(d, comps, t0, t1):
    log, res = os.path.join(d, 'calib_log.txt'), os.path.join(d, 'calib.json')
    for f in (log, res):
        if os.path.exists(f):
            os.remove(f)
    lua_comps = '{' + ', '.join('{%s, %s, %s}' % (json.dumps(t, ensure_ascii=False),
                                                   'nil' if th is None else repr(th), 'nil' if mk is None else repr(mk))
                                for t, th, mk in comps) + '}'
    src = (f'local LOGPATH = {json.dumps(log)}\nlocal RESULT = {json.dumps(res)}\n' + HELPERS
           + LUA % (lua_comps, t0, t1))
    p = os.path.join(d, 'calib.lua')
    open(p, 'w', encoding='utf-8').write(src)
    subprocess.run([REAPER, '-nonewinst', p], capture_output=True)
    t = time.time()
    while not os.path.exists(res):
        if time.time() - t > (t1 - t0) + 60:
            sys.exit('замер не закончился: ' + log)
        time.sleep(1)
    time.sleep(0.5)
    return {r['tag']: r for r in json.load(open(res))}


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('dir')
    ap.add_argument('--from', dest='t0', type=float, required=True)
    ap.add_argument('--to', dest='t1', type=float, required=True)
    ap.add_argument('--comp', action='append', required=True, help='тег:цель_дБ:ratio')
    ap.add_argument('--tol', type=float, default=0.3)
    ap.add_argument('--iters', type=int, default=5)
    ap.add_argument('--makeup', action='store_true', help='в конце Output Level = среднее подавление')
    a = ap.parse_args()
    d = os.path.abspath(os.path.expanduser(a.dir)); os.makedirs(d, exist_ok=True)
    spec = {}
    for c in a.comp:
        tag, tgt, r = c.rsplit(':', 2)
        spec[tag] = (float(tgt), float(r))
    nxt = {t: None for t in spec}
    for it in range(a.iters):
        m = run(d, [(t, nxt[t], None) for t in spec], a.t0, a.t1)
        done = True
        for t, (tgt, r) in spec.items():
            g = m[t]
            print(f"#{it + 1} {t}: порог {g['thr']:.1f} → подавление {g['gr']:.2f} дБ (макс {g['max']:.1f}), цель {tgt}")
            if abs(g['gr'] - tgt) > a.tol:
                done = False
                nxt[t] = round(g['thr'] + (g['gr'] - tgt) / (1 - 1 / r), 2)
            else:
                nxt[t] = None
        if done:
            break
    if a.makeup:
        run(d, [(t, None, round(m[t]['gr'], 1)) for t in spec], a.t0, a.t0 + 1)
        print('makeup:', {t: round(m[t]['gr'], 1) for t in spec})
    json.dump(m, open(os.path.join(d, 'calib_final.json'), 'w'), ensure_ascii=False, indent=1)
