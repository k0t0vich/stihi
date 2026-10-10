#!/usr/bin/env python3
"""План сведения (JSON) → lua для открытого REAPER.

  python3 scripts/mix_apply.py ПЛАН.json [--copy-to НОВЫЙ.rpp]
  python3 scripts/mix_apply.py --set "лимитер:Gain=3.5" [--set ...] [--log ПАПКА]   # точечно, без пересборки цепочек

--copy-to: сохранить текущую вкладку копией и открыть копию в новой вкладке,
план применить к ней — исходный проект не трогается. Без него — в активную вкладку.
Плагины ставятся с именем «mix: <tag>»; повторный прогон их снимает и ставит заново.
Значения — в единицах, которые показывает плагин: Гц, дБ, мс (секунды → мс), текст
для перечислений. Итог каждого параметра — в ПАПКА_ПЛАНА/apply_log.txt.
Скилл: ~/.claude/skills/reaper-mix.
"""
import os, sys, json, time, argparse, subprocess

REAPER = '/Applications/REAPER.app/Contents/MacOS/REAPER'

HELPERS = r'''
local LOG = io.open(LOGPATH, "w")
local function log(s) LOG:write(s .. "\n"); LOG:flush() end

local function track(name)
  if name == "MASTER" then return reaper.GetMasterTrack(0) end
  for i = 0, reaper.CountTracks(0) - 1 do
    local tr = reaper.GetTrack(0, i)
    local _, n = reaper.GetTrackName(tr)
    if n == name then return tr end
  end
end

local function num(s)
  -- число из подписи плагина в базовых единицах: Гц, мс, дБ
  if s:find("INF") then return s:find("-") and -1e9 or 1e9 end
  local v = tonumber(s:match("[-+]?%d+%.?%d*"))
  if not v then return nil end
  if s:find("kHz") then v = v * 1000 end
  if s:find("%d sec") or s:find("%d s$") or s:find("%d s ") then v = v * 1000 end
  return v
end

local function fmt(tr, fx, p, x)
  local _, s = reaper.TrackFX_FormatParamValueNormalized(tr, fx, p, x, "")
  return s
end

local function pidx(tr, fx, name)
  for p = 0, reaper.TrackFX_GetNumParams(tr, fx) - 1 do
    local _, pn = reaper.TrackFX_GetParamName(tr, fx, p, "")
    if pn == name then return p end
  end
end

local function setp(tr, fx, name, val)
  local p = pidx(tr, fx, name)
  if not p then log("  !! нет параметра " .. name); return end
  if type(val) == "string" then
    local seen, prev = {}, nil
    for k = 0, 1000 do
      local s = fmt(tr, fx, p, k / 1000)
      if s == val then reaper.TrackFX_SetParamNormalized(tr, fx, p, k / 1000); seen = nil; break end
      if s ~= prev then seen[#seen + 1] = s; prev = s end
    end
    if seen then log("  !! " .. name .. " = " .. val .. " не найдено; есть: " .. table.concat(seen, " | ")); return end
  else
    local lo, hi = 0.0, 1.0
    local up = (num(fmt(tr, fx, p, 1)) or 0) >= (num(fmt(tr, fx, p, 0)) or 0)
    for _ = 1, 40 do
      local m = (lo + hi) / 2
      local v = num(fmt(tr, fx, p, m)) or 0
      if (v < val) == up then lo = m else hi = m end
    end
    reaper.TrackFX_SetParamNormalized(tr, fx, p, (lo + hi) / 2)
  end
  local _, got = reaper.TrackFX_GetFormattedParamValue(tr, fx, p, "")
  log("  " .. name .. " → " .. got)
end

local function clear_mix(tr)
  for f = reaper.TrackFX_GetCount(tr) - 1, 0, -1 do
    local _, rn = reaper.TrackFX_GetNamedConfigParm(tr, f, "renamed_name")
    if rn and rn:sub(1, 4) == "mix:" then reaper.TrackFX_Delete(tr, f) end
  end
end

local function addfx(tr, name, tag, params)
  local fx = reaper.TrackFX_AddByName(tr, name, false, -1)
  if fx < 0 then log("!! не встал " .. name); return end
  reaper.TrackFX_SetNamedConfigParm(tr, fx, "renamed_name", "mix: " .. tag)
  log("+ " .. tag .. " (" .. name .. ")")
  for _, kv in ipairs(params) do setp(tr, fx, kv[1], kv[2]) end
end
'''


def lua_val(v):
    return json.dumps(v, ensure_ascii=False) if isinstance(v, str) else repr(float(v))


def lua_params(ps):
    return '{' + ', '.join(f'{{{json.dumps(k, ensure_ascii=False)}, {lua_val(v)}}}' for k, v in ps) + '}'


def build(plan, plan_dir, copy_to=None):
    L = [f'local LOGPATH = {json.dumps(os.path.join(plan_dir, "apply_log.txt"))}', HELPERS]
    if copy_to:
        # копия текущей вкладки → новая вкладка с копией: исходник не трогаем
        L.append(f'''reaper.Main_SaveProjectEx(0, {json.dumps(copy_to)}, 0)
reaper.Main_OnCommand(40859, 0)
reaper.Main_openProject("noprompt:" .. {json.dumps(copy_to)})
log("проект: " .. reaper.GetProjectName(0, ""))''')
    L.append('reaper.Undo_BeginBlock()\nreaper.PreventUIRefresh(1)')
    for name in plan.get('bypass_master', []):
        L.append(f'''do local m = reaper.GetMasterTrack(0)
  for f = 0, reaper.TrackFX_GetCount(m) - 1 do
    local _, n = reaper.TrackFX_GetFXName(m, f, "")
    if n:find({json.dumps(name)}, 1, true) then reaper.TrackFX_SetEnabled(m, f, false); log("мастер: выключен " .. n) end
  end end''')
    for fo in plan.get('folders', []):
        first, last = fo['children'][0], fo['children'][-1]
        L.append(f'''if not track({json.dumps(fo["name"])}) then
  local i = math.floor(reaper.GetMediaTrackInfo_Value(track({json.dumps(first)}), "IP_TRACKNUMBER")) - 1
  reaper.InsertTrackAtIndex(i, false)
  local f = reaper.GetTrack(0, i)
  reaper.GetSetMediaTrackInfo_String(f, "P_NAME", {json.dumps(fo["name"])}, true)
  reaper.SetMediaTrackInfo_Value(f, "I_FOLDERDEPTH", 1)
  reaper.SetMediaTrackInfo_Value(track({json.dumps(last)}), "I_FOLDERDEPTH", -1)
  log("папка " .. {json.dumps(fo["name"])})
end''')
    for bus in plan.get('buses', []):
        L.append(f'''if not track({json.dumps(bus["name"])}) then
  local n = reaper.CountTracks(0)
  reaper.InsertTrackAtIndex(n, false)
  reaper.GetSetMediaTrackInfo_String(reaper.GetTrack(0, n), "P_NAME", {json.dumps(bus["name"])}, true)
end
do local b = track({json.dumps(bus["name"])})
  for s = reaper.GetTrackNumSends(b, -1) - 1, 0, -1 do reaper.RemoveTrackSend(b, -1, s) end''')
        for src, db in bus.get('sends_from', {}).items():
            L.append(f'''  do local s = reaper.CreateTrackSend(track({json.dumps(src)}), b)
    reaper.SetTrackSendInfo_Value(track({json.dumps(src)}), 0, s, "D_VOL", {10 ** (db / 20):.6f})
    log("посыл " .. {json.dumps(src)} .. " → " .. {json.dumps(bus["name"])} .. " {db} дБ") end''')
        L.append('end')
    for tname, t in list(plan.get('tracks', {}).items()) + [('MASTER', plan['master'])] if 'master' in plan else plan.get('tracks', {}).items():
        L.append(f'do local tr = track({json.dumps(tname)})\nif not tr then log("!! нет дорожки {tname}") else\nclear_mix(tr)\nlog("== {tname}")')
        if 'vol_db' in t:
            L.append(f'reaper.SetMediaTrackInfo_Value(tr, "D_VOL", {10 ** (t["vol_db"] / 20):.6f})')
        if 'pan' in t:
            L.append(f'reaper.SetMediaTrackInfo_Value(tr, "D_PAN", {t["pan"]})')
        for fx in t.get('fx', []):
            L.append(f'addfx(tr, {json.dumps(fx["name"])}, {json.dumps(fx["tag"], ensure_ascii=False)}, {lua_params(fx.get("params", []))})')
        L.append('end end')
    L.append('reaper.PreventUIRefresh(-1)\nreaper.Undo_EndBlock("mix_apply", -1)')
    if copy_to:
        L.append('reaper.Main_SaveProject(0, false)')
    L.append('log("done")\nLOG:close()')
    return '\n'.join(L)


def set_lua(sets, d):
    L = [f'local LOGPATH = {json.dumps(os.path.join(d, "apply_log.txt"))}', HELPERS]
    for s in sets:
        tag, kv = s.split(':', 1)
        k, v = kv.split('=', 1)
        try:
            v = float(v)
        except ValueError:
            pass
        L.append(f'''do local done = false
  local function scan(tr)
    for f = 0, reaper.TrackFX_GetCount(tr) - 1 do
      local _, rn = reaper.TrackFX_GetNamedConfigParm(tr, f, "renamed_name")
      if rn == "mix: " .. {json.dumps(tag, ensure_ascii=False)} then log("{tag}"); setp(tr, f, {json.dumps(k)}, {lua_val(v)}); done = true end
    end
  end
  scan(reaper.GetMasterTrack(0)); for i = 0, reaper.CountTracks(0) - 1 do scan(reaper.GetTrack(0, i)) end
  if not done then log("!! нет {tag}") end end''')
    L.append('log("done")\nLOG:close()')
    return '\n'.join(L)


def run_lua(src, d):
    lua, log = os.path.join(d, 'apply.lua'), os.path.join(d, 'apply_log.txt')
    open(lua, 'w', encoding='utf-8').write(src)
    if os.path.exists(log):
        os.remove(log)
    subprocess.run([REAPER, '-nonewinst', lua], capture_output=True)
    t0 = time.time()
    while not (os.path.exists(log) and open(log).read().rstrip().endswith('done')):
        if time.time() - t0 > 180:
            sys.exit('lua не закончил: ' + log)
        time.sleep(1)
    return open(log).read()


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('plan', nargs='?')
    ap.add_argument('--copy-to')
    ap.add_argument('--set', action='append', default=[], help='тег:Параметр=значение')
    ap.add_argument('--log', default='.', help='папка для apply.lua и лога в режиме --set')
    a = ap.parse_args()
    if a.set:
        d = os.path.abspath(os.path.expanduser(a.log)); os.makedirs(d, exist_ok=True)
        print(run_lua(set_lua(a.set, d), d)); sys.exit()
    plan_path = os.path.abspath(os.path.expanduser(a.plan))
    d = os.path.dirname(plan_path)
    plan = json.load(open(plan_path))
    copy_to = os.path.abspath(os.path.expanduser(a.copy_to)) if a.copy_to else None
    if copy_to and os.path.exists(copy_to):
        sys.exit(f'{copy_to} уже есть — REAPER возьмёт его из кэша; нужно новое имя')
    print(run_lua(build(plan, d, copy_to), d))
