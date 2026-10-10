-- Auto-load REAPER MCP bridge on startup
-- Запускает file-based bridge для total-reaper-mcp при каждом старте REAPER.
local bridge = reaper.GetResourcePath() .. '/Scripts/mcp_bridge_file_v2.lua'
local f = io.open(bridge, 'r')
if f then
  f:close()
  dofile(bridge)
else
  reaper.ShowConsoleMsg('MCP bridge not found: ' .. bridge .. '\n')
end
