-- Сэмплер баса в REAPER: RS5K на каждый семпл <midi-нота>.wav из DIR, на дорожки TRACKS.
-- Запуск в открытом REAPER: /Applications/REAPER.app/Contents/MacOS/REAPER -nonewinst этот.lua
-- Снимает все FX с дорожки и собирает цепочку заново. Лог — DIR/build_log.txt.
local DIR = "/Users/k0t0vich/Documents/reaper/Millstone/Bass/samples/"
local TRACKS = {"Bass MuScriptor"}
local LO, HI = 22, 48   -- диапазон партии: крайние семплы растягиваются до него

local LOG = io.open(DIR .. "build_log.txt", "w")
local function log(s) LOG:write(s .. "\n") end

local roots = {}
local i = 0
while true do
  local f = reaper.EnumerateFiles(DIR, i)
  if not f then break end
  local n = f:match("^(%d+)%.wav$")
  if n then roots[#roots + 1] = tonumber(n) end
  i = i + 1
end
table.sort(roots)
if #roots == 0 then log("нет семплов <нота>.wav в " .. DIR); LOG:close(); return end

-- нота между семплами играется нижним семплом со сдвигом вверх
local map = {}
for k, r in ipairs(roots) do
  local lo = (k == 1) and math.min(LO, r) or r
  local hi = (k == #roots) and math.max(HI, r) or roots[k + 1] - 1
  map[#map + 1] = {r, lo, hi}
end

local function find(name)
  for t = 0, reaper.CountTracks(0) - 1 do
    local tt = reaper.GetTrack(0, t)
    local _, n = reaper.GetTrackName(tt)
    if n == name then return tt end
  end
end

local tr

-- имя целиком: подстрока "mode" цепляет «Round-robin mode»
local function pidx(fx, name)
  for p = 0, reaper.TrackFX_GetNumParams(tr, fx) - 1 do
    local _, n = reaper.TrackFX_GetParamName(tr, fx, p)
    if n:lower() == name then return p end
  end
end

local function set(fx, name, v)
  local p = pidx(fx, name)
  if not p then log("  нет параметра " .. name); return end
  reaper.TrackFX_SetParamNormalized(tr, fx, p, v)
  local _, f = reaper.TrackFX_GetFormattedParamValue(tr, fx, p)
  log(string.format("  %s = %.4f -> %s", name, v, f))
end

for _, name in ipairs(TRACKS) do
  tr = find(name)
  if not tr then log("нет дорожки " .. name) else
    log("== " .. name)
    for fx = reaper.TrackFX_GetCount(tr) - 1, 0, -1 do reaper.TrackFX_Delete(tr, fx) end
    for _, m in ipairs(map) do
      local root, lo, hi = m[1], m[2], m[3]
      local fx = reaper.TrackFX_AddByName(tr, "ReaSamplOmatic5000 (Cockos)", false, -1)
      reaper.TrackFX_SetNamedConfigParm(tr, fx, "FILE0", DIR .. root .. ".wav")
      reaper.TrackFX_SetNamedConfigParm(tr, fx, "DONE", "")
      log(string.format("fx %d: %d.wav  ноты %d..%d", fx, root, lo, hi))
      set(fx, "note range start", lo / 127)
      set(fx, "note range end", hi / 127)
      -- высота линейно от start к end; параметра Mode у RS5K нет. Шкала ±80 полутонов
      set(fx, "pitch for start note", 0.5 + (lo - root) / 160)
      set(fx, "pitch for end note", 0.5 + (hi - root) / 160)
      set(fx, "obey note-offs", 1)
      set(fx, "release", 0.002)
    end
  end
end
LOG:close()
reaper.Main_SaveProject(0, false)
