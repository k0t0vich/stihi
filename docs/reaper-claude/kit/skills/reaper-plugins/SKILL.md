---
name: reaper-plugins
description: Список плагинов REAPER (инструменты и эффекты по категориям, производитель, форматы VST/VST3/AU/CLAP), цепочек FX с их составом и шаблонов проектов — из кэшей REAPER, без загрузки плагинов. Используй по фразам «какие у меня плагины», «просканируй плагины», «что есть из инструментов / компрессоров / ревербов», «обнови список плагинов», и перед выбором инструментов в reaper-song и reaper-mix.
---

# Плагины REAPER

Готовый список — [PLUGINS.md](PLUGINS.md) рядом. Сначала читать его; пересканировать,
если пользователь ставил новые плагины или плагина нет в списке.

```bash
python3 ~/reaper-claude-kit/scripts/plugin_scan.py --chains ~/reaper-claude-kit/fxchains \
  -o ~/.claude/skills/reaper-plugins/PLUGINS.md
```

| Раздел | Откуда |
|---|---|
| инструменты / эффекты | `reaper-vstplugins_arm64.ini`, `reaper-auplugins_arm64.ini`, `reaper-clap-macos-aarch64.ini` |
| категория | `reaper-fxtags.ini`, иначе по словам в имени |
| цепочки FX | `FXChains/` REAPER + папки из `--chains` |
| шаблоны | `ProjectTemplates/`, `TrackTemplates/` (сейчас пусты) |

Кэши обновляет сам REAPER: новый плагин появится после
Options → Preferences → Plug-ins → VST → Re-scan.

## Грабли

| Что | Как |
|---|---|
| в списке ≠ звучит | список не загружает плагины: Ample Bass P в кэше есть, а семплов нет — молчит; Kontakt 8 есть, библиотек нет. Перед партией — пробный рендер |
| одно имя, разные версии | Guitar Rig 6/7, Ozone 11/12, Pro-Q 2/3/4 — брать старшую |
| `(x86_64)` | плагин под Rosetta, грузится через мост — медленнее, лучше нативный |
| имя для `TrackFX_AddByName` | `VST3: <Плагин> (<Производитель>)`, например `VST3: Pro-Q 4 (FabFilter)` |
