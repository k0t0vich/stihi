# Комплект: Claude Code + REAPER

Всё, чем были сделаны демо и сведение из статьи: три скилла, скрипты, шаблоны цепочек FX, семплы баса и автозапуск моста MCP. Проверено на macOS (Apple Silicon), REAPER 7. Под Windows комплект надо переписать — промпт-установщик просит Claude сделать это первым шагом.

[Скачать reaper-claude-kit.zip](reaper-claude-kit.zip)

## Что внутри

| Путь | Что |
|---|---|
| `skills/reaper-song/` | скилл «напиши песню в рипере»: инструменты, ноты AD2, оживление партий, Odin III (`ODIN.md`) |
| `skills/reaper-mix/` | скилл «сведи трек»: порядок замер → план → калибровка → лимитер, числа из источников (`SOURCES.md`), шаблон плана |
| `skills/reaper-plugins/` | скилл «какие у меня плагины»: список инструментов, эффектов и цепочек FX из кэшей REAPER |
| `scripts/song_kit.py` | готовые детали: ноты AD2, приёмы Odin, дроби, оживление, дорожки, сборка `.rpp` |
| `scripts/songs/grunge_demo.py` | песня из статьи: форма, аккорды, партии и журнал правок — пример для своих |
| `scripts/rs5k_bass_sampler.lua` | бас на ReaSamplOmatic5000 из семплов `<нота>.wav` |
| `scripts/mix_probe.py` | рендер стемов и замер: LUFS, true peak, полосы, маскировка, стерео |
| `scripts/mix_apply.py` | план сведения (JSON) → плагины в открытом проекте; точечно `--set` |
| `scripts/mix_calibrate.py` | пороги компрессоров по реальному подавлению |
| `scripts/plugin_scan.py` | сканер плагинов → `PLUGINS.md` |
| `scripts/rpp_common.py`, `ad2_keymap.py` | общие функции `.rpp`, раскладка Addictive Drums 2 |
| `fxchains/` | цепочки: `ad2`, `guitar_ample_gr7`, `guitar_odin_gr7` |
| `samples-bass-finger/` | 12 нот пальцевого баса, E1–D#2 (MIDI 28–39) |
| `INSTALL-PROMPT.md` | промпт для Claude: проверить, поставить, настроить под себя |
| `mcp/__startup.lua` | автозапуск моста MCP при старте REAPER |

## Что нужно заранее

| Что | Зачем | Без него |
|---|---|---|
| [REAPER](https://www.reaper.fm/) 7, macOS | всё | — |
| [Claude Code](https://claude.com/claude-code) | агент, скиллы | — |
| Python 3.10+ | MCP-сервер и скрипты | — |
| `pip install numpy scipy soundfile` | `mix_probe.py` | нет замера |
| Addictive Drums 2 | ударные | заменить шаблон `ad2` |
| Ample Guitar VC + Guitar Rig 7 или Odin III | гитары | генератор спросит, какие есть |
| FabFilter Pro-Q 4, Pro-C 2, Saturn 2, Pro-R 2, Pro-L 2 | сведение | поменять имена плагинов и параметров в плане |

## Установка

**Проще всего — через Claude.** «Скачал и запустил» может не сработать: у вас другие плагины, пути и версии. Распакуйте архив, откройте Claude Code в папке `reaper-claude-kit` и вставьте [промпт-установщик](install-prompt.html) (в архиве — `INSTALL-PROMPT.md`). Claude проверит, что есть, поставит недостающее, проверит связь с REAPER и спросит, на какие фразы подключать скиллы.

Руками — по шагам ниже.


**1. MCP-сервер REAPER** — [shiehn/total-reaper-mcp](https://github.com/shiehn/total-reaper-mcp), без изменений в коде:

```bash
git clone https://github.com/shiehn/total-reaper-mcp.git ~/reaper-mcp/total-reaper-mcp
cd ~/reaper-mcp/total-reaper-mcp
python3.10 -m venv .venv && .venv/bin/pip install -e .
./scripts/install_bridge.sh
```

`install_bridge.sh` кладёт мост `mcp_bridge_file_v2.lua` в `~/Library/Application Support/REAPER/Scripts/`.

**2. Автозапуск моста** — моя доделка: без неё мост надо запускать руками из Actions после каждого старта REAPER.

```bash
cp ~/reaper-claude-kit/mcp/__startup.lua ~/Library/Application\ Support/REAPER/Scripts/
```

Если `__startup.lua` уже есть — дописать его содержимое в конец своего. Перезапустить REAPER, в консоли должно появиться `REAPER MCP Bridge (File-based, Full API) started`.

**3. Подключить к Claude Code:**

```bash
claude mcp add reaper -- ~/reaper-mcp/total-reaper-mcp/.venv/bin/python -m server.app --profile dsl-production
```

Профиль `dsl-production` — ~53 инструмента (дорожки, FX, MIDI, рендер). `full` — 600+, многим клиентам столько не принять.

**4. Комплект:**

```bash
unzip reaper-claude-kit.zip -d ~
cp -R ~/reaper-claude-kit/skills/* ~/.claude/skills/
```

Скрипты ждут комплект именно в `~/reaper-claude-kit` — пути в скиллах указывают туда.

## Как пользоваться

REAPER должен быть открыт. Дальше — обычными словами в Claude Code:

| Фраза | Скилл | Что будет |
|---|---|---|
| «напиши гранж-демо в рипере в папке ~/Documents/reaper/demo» | `reaper-song` | спросит про гитары, соберёт проект, откроет в новой вкладке |
| «звучит механистически» | `reaper-song` | разброс времени и силы удара, дрейф по фразе |
| «какие у меня плагины» | `reaper-plugins` | список по категориям; первый раз — скан, дальше из `PLUGINS.md` |
| «сведи трек, мастер в −10 LUFS» | `reaper-mix` | замер, план, плагины на копии проекта, калибровка, таблица «было → стало» |

Без агента, руками:

```bash
python3 ~/reaper-claude-kit/scripts/song_kit.py ~/reaper-claude-kit/scripts/songs/grunge_demo.py ~/Documents/reaper/demo --guitars odin
/Applications/REAPER.app/Contents/MacOS/REAPER -nonewinst ~/Documents/reaper/demo/open.lua
python3 ~/reaper-claude-kit/scripts/mix_probe.py render ~/Documents/reaper/demo/mix/00_before
python3 ~/reaper-claude-kit/scripts/mix_probe.py analyze ~/Documents/reaper/demo/mix/00_before
```

## Грабли

| Что | Как |
|---|---|
| REAPER открыл старую версию проекта | он кэширует проекты по пути: пересобранный проект — только под новым именем |
| плагин не встал | имена в шаблонах и плане — как в списке FX REAPER (`VST3: Pro-Q 4 (FabFilter)`); у другой версии — поправить |
| калибровка компрессоров играет вслух | так и задумано: каждый проход — около 18 с звука |
