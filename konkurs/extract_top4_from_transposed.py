#!/usr/bin/env python3
import csv
import json

# Читаем перевернутую таблицу
with open('1_transposed.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (названия песен)
songs = rows[0][1:]  # Пропускаем первую пустую колонку

# Маппинг названий песен -> HTML ID
song_to_html_mapping = {
    "Это Финал - SerGGGG ft. Мышь Band (Сережа Грякалов)": 16,
    "Палач (демо версия) - Павел Желибо (Павел Желибо)": 5,
    "На дороге иной - Сол на Марсе (SoM) (Cол Иодим)": 1,
    "I Won't Say Goodbye - Yury Petukhov (Юрий Петухов)": 67,
    '"Сколько лет — сколько зим…" - MetaZvuk (Neldy Music)': 6,
    "Сашка-гармонист - ЛОВiNicE (Оксана Лащилина)": 14,
    "Бабки любят бабки - Satir-X (Славомир feat. Мирослава) (Дмитрий Выхин)": 52,
    "Мы-снова чемпионы (версия 2.0) - DJ NEOPHRON feat BAD SONGS PROJECT (Dj Neophron)": 12,
    "Птицы в небе - Алмавем (Алексей Алмавем)": 13,
    "Алиса, посоветуй! - Neferet & PASE feat. SunoAI (Анна Чулкова)": 18,
    "Интернет - НейроДюха (Андрей Салов)": 57,
    "Сделай это со мной - hito (Hito Shniperson)": 19,
    "Гречка - наше всё - PoulSoul (Павел Гупало)": 27,
    "Enough - FearTheChipper (Максим Яшин)": 21,
    "Лонгин Сотник - Сова Сумрачная AI (Сова Сумрачная)": 46,
    "Неоновые Сны - ТехноСфера Вечности (Кирилл Генкин)": 33,
    "Лети - Руденко Т.В. + Рифф (Татьяна Руденко)": 9,
    "Сердце моё в огне - iRicha (Ирина Воскобойникова)": 37,
    "Румба Шредингера - Celsa (Yulisse Cobre)": 47,
    "Цвет ночи - NadinKa (Надежда Капустина)": 7,
    "Чезабретта - Наташка Дьякова & SAI (Наталья Дьякова)": 35,
    "Notice.me - Kazladur (Kazladur Brink)": 8,
    "Солнце скрылось - Sulimov project (Александр Сулимов)": 38,
    "Индия - Дмитрий Люсков и Suno v 4.5 (Дмитрий Люсков)": 36,
    "Ураган - Ол`ka (Ольга Гавришина)": 22,
    "Актриса спускается в партер - AI Илья Недобитый (Константин Леонов-Шуанский)": 40,
    "Азовское море зовёт - awaxino (Сергей Миньков)": 60,
    "Инклюз - ОПМ (Юн-Софус Кумле)": 45,
    "Если ты уйдешь - Елена Слободчикова (Елена Слободчикова)": 54,
    "Плюшевые поэты - (Отряд Котовскага)": 2,
    "Свет дозволенных Рифм - Scary_Man (Артур Колесник)": 23,
    "Слёзы сбереги - MartyMacflay (Marty Macflay)": 48,
    "Июньский день - Gor Nagat (Михаил Жаров)": 69,
    "На дорогах лесных - Ze Game (Ze Gamer)": 4,
    "Нарисованный мальчишка - Posternak (Николай Постернак)": 30,
    "Distortion of Memory - Cycle of Desire (Яан Лодди)": 25,
    "40 лет - Ai Kine$hma (Денис Смирнов)": 59,
    "Devil made me do it - sky ivi music (Ивита Полонская)": 3,
    "Чужое Солнце (2025) - Turbin (Алексей Леонтьев)": 20,
    "Иди - The NeuroSong (Руслан Назарович)": 63,
    "be-the-light - Sky Vashuk (Sky Vashuk)": 66,
    "Hushwires - Rheanomalia (Sashka Rheanomalia)": 15,
    "Гром неба - Коловрат (Коловрат Коло)": 53,
    "После жизни - Даркарт (Илья Дорожкин)": 11,
    "Echoes in the Hollow - Kate's world (seductivepiano669) (Екатерина Евстратова)": 10,
    "В темноте - ZHUCHOK (Амалия Жучок)": 41,
    "Эмодзи - Sona (Михаил Дмитриев)": 24,
    "Вампир - Lisaviel (Юлия Журженко)": 26,
    "Миры Хэмингуэя - N-Morson, В.Востриков (Валерий Востриков)": 64,
    "Разговор с собой (feat. SUNO) - StonedMilkBye (Андрей Воронин)": 42,
    "Echo - Папа Сэм (Папа Сэм)": 43,
    "Hold me tight (kpop) - Mane x Luna (Дима Cавченко)": 44,
    "Toronto Fader - НейроДрейк (Iva Muzhskoi)": 39,
    "Возможно - Сергей Чайка (Sergey Chayka)": 31,
    "Дебил, но любил - N-Morson (Бред Питт)": 28,
    "Serpent's Gift - Soulles Machine (Евгений Александрович)": 17,
    "ЭХ, МАРС, ТВОЮ МАТЬ! - Арон Авесин & SUNO AI (Арон Авесин)": 65,
    "Упс! - Dj Zem (Станислав Земсков)": 51,
    "Relic - Lbz (Андрей Лабазов)": 55,
    "Упала ночь на землю - Granny dances (+Suno AI) (Granny Dances)": 50,
    "Качает вагон - SK-AI projecT (Skart Ai Project)": 32,
    "День Х - b'n'd (Константин Бондаренко)": 68,
    "Это вирус - ИNVGEN (Ai Sound Architect Digital Composer)": 29,
    "Если бы - Tvoy toy (Евгений Абрамов)": 61,
    "Тут у моря - Михаил Зиновьев (Михаил Зиновьев)": 34,
    "Жара - Владимир Морозов (Владимир Морозов)": 56,
    "Транс Вальс - blackpudding (Николай Петров)": 58,
    "Завтра - Телефон Доверия (Роберт Астаповский)": 62,
    "Ты не ангел мой (rock version) - Vitaly Sazonov (Виталий Сазонов)": 49
}

# Список судей-участников (ID в HTML)
judge_ids = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15, 17, 18, 19, 20, 21, 22, 23, 24, 25, 28, 29, 31, 32, 34, 35, 36, 37, 38, 39, 41, 42, 43, 50, 54, 56, 57, 58, 59, 63, 64, 65, 68, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80, 81]

# Список имен судей из HTML (соответствует judge_ids)
judge_names = [
    "Отряд Котовскага", "Ивита Полонская", "Ze Gamer", "Павел Желибо", "Neldy Music", 
    "Надежда Капустина", "Kazladur Brink", "Татьяна Руденко", "Екатерина Евстратова", 
    "Илья Дорожкин", "Алексей Алмавем", "Оксана Лащилина", "Sashka Rheanomalia", 
    "Евгений Александрович", "Анна Чулкова", "Hito Shniperson", "Алексей Леонтьев", 
    "Максим Яшин", "Ольга Гавришина", "Артур Колесник", "Михаил Дмитриев", "Яан Лодди", 
    "Бред Питт", "Ai Sound Architect Digital Composer", "Sergey Chayka", "Skart Ai Project", 
    "Михаил Зиновьев", "Наталья Дьякова", "Дмитрий Люсков", "Ирина Воскобойникова", 
    "Александр Сулимов", "iva Muzhskoi", "Амалия Жучок", "Андрей Воронин", "Папа Сэм", 
    "Granny Dances", "Елена Слободчикова", "Владимир Морозов", "Андрей Салов", 
    "Николай Петров", "Денис Смирнов", "Руслан Назарович", "Валерий Востриков", 
    "Арон Авесин", "Константин Бондаренко (b'n'd)", "Тима Сусляев", "Ai Accordions", 
    "Макс Громов", "Виталий Мартюков", "Евгений Мазаков", "Наталия Фомина", 
    "Михаил Юршевич", "Маруся Хмельная", "Аиболид Творческое Объединение", 
    "Кирилл Панов", "Николай Баркалов"
]

# Словарь для хранения результатов
judge_top4 = {}

print("Извлекаем топ-4 для всех судей из перевернутой таблицы...")
print("=" * 60)

for judge_id in judge_ids:
    judge_name = judge_names[judge_ids.index(judge_id)]
    
    # Ищем строку судьи в перевернутой таблице
    judge_row = None
    for row in rows[1:]:  # Пропускаем заголовок
        if row[0].strip() == judge_name:
            judge_row = row
            break
    
    if judge_row is None:
        print(f"❌ Судья {judge_name} (ID {judge_id}) не найден в перевернутой таблице")
        continue
    
    # Собираем оценки судьи
    judge_scores = []
    for i, score_str in enumerate(judge_row[1:], 1):  # Пропускаем имя судьи
        if score_str.strip() and score_str.strip() != '':
            try:
                score = float(score_str.replace(',', '.'))
                song_name = songs[i-1]  # Получаем название песни
                if song_name in song_to_html_mapping:
                    html_id = song_to_html_mapping[song_name]
                    judge_scores.append((html_id, score, song_name))
            except ValueError:
                pass
    
    # Сортируем по оценкам (по убыванию)
    judge_scores.sort(key=lambda x: x[1], reverse=True)
    
    # Берем топ-4
    top4_ids = [html_id for html_id, score, song in judge_scores[:4]]
    
    judge_top4[judge_id] = top4_ids
    print(f"✅ {judge_name} (ID {judge_id}): {top4_ids} ({len(top4_ids)} оценок)")

# Сохраняем результаты в JSON
with open('judge_top4_final.json', 'w', encoding='utf-8') as f:
    json.dump(judge_top4, f, ensure_ascii=False, indent=2)

print(f"\nРезультаты сохранены в judge_top4_final.json")
print(f"Всего судей обработано: {len(judge_top4)}")

# Создаем готовый код для вставки в HTML
print(f"\nГотовый код для вставки в HTML:")
print("=" * 60)
for judge_id in sorted(judge_top4.keys()):
    top4 = judge_top4[judge_id]
    judge_name = judge_names[judge_ids.index(judge_id)]
    print(f'                {{ id: {judge_id}, name: "{judge_name}", song: "...", score: ..., isJudge: true, top: {top4} }},') 