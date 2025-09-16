import csv

# Читаем CSV файл
with open('1.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (имена судей)
judges = rows[0][1:]  # Пропускаем первую пустую колонку
print("Судьи в CSV:")
for i, judge in enumerate(judges):
    print(f"{i+1}: {judge}")

# Находим Отряда Котовскага
otrad_index = None
for i, judge in enumerate(judges):
    if "Отряд Котовскага" in judge:
        otrad_index = i
        break

if otrad_index is None:
    print("Отряд Котовскага не найден!")
    exit()

print(f"\nОтряд Котовскага найден в колонке {otrad_index + 1} (индекс {otrad_index})")

# Получаем оценки Отряда Котовскага (начиная со строки 1, так как 0 - заголовки)
otrad_scores = []
for i, row in enumerate(rows[1:], 1):  # Нумерация строк начинается с 1
    if len(row) > otrad_index + 1:  # +1 потому что первая колонка пустая
        score_str = row[otrad_index + 1].strip()
        if score_str and score_str != '':
            try:
                score = float(score_str.replace(',', '.'))
                otrad_scores.append((i, score, row[0]))  # (номер строки, оценка, название песни)
            except ValueError:
                pass

# Сортируем по оценкам (по убыванию)
otrad_scores.sort(key=lambda x: x[1], reverse=True)

print(f"\nВсе оценки Отряда Котовскага ({len(otrad_scores)} оценок):")
for row_num, score, song in otrad_scores:
    print(f"Строка {row_num}: {song} - {score}")

print(f"\nТоп-4 Отряда Котовскага:")
for i, (row_num, score, song) in enumerate(otrad_scores[:4]):
    print(f"{i+1}. Строка {row_num}: {song} - {score}")

# Теперь создаем маппинг между номерами строк CSV и ID в HTML
# Создаем словарь: номер строки CSV -> ID в HTML
csv_to_html_mapping = {}

# Данные из HTML (участники с ID 1-69)
html_participants = [
    { "id": 1, "name": "Cол Иодим", "song": "На дороге иной - Сол на Марсе (SoM)" },
    { "id": 2, "name": "Отряд Котовскага", "song": "Плюшевые поэты - Отряд Котовскага" },
    { "id": 3, "name": "Ивита Полонская", "song": "Devil made me do it - sky ivi music" },
    { "id": 4, "name": "Ze Gamer", "song": "На дорогах лесных - Ze Game" },
    { "id": 5, "name": "Павел Желибо", "song": "Палач (демо версия) - Павел Желибо" },
    { "id": 6, "name": "Neldy Music", "song": "Сколько лет — сколько зим… - MetaZvuk" },
    { "id": 7, "name": "Надежда Капустина", "song": "Цвет ночи - NadinKa" },
    { "id": 8, "name": "Kazladur Brink", "song": "Notice.me - Kazladur" },
    { "id": 9, "name": "Татьяна Руденко", "song": "Лети - Руденко Т.В. + Рифф" },
    { "id": 10, "name": "Екатерина Евстратова", "song": "Echoes in the Hollow - Kate's world" },
    { "id": 11, "name": "Илья Дорожкин", "song": "После жизни - Даркарт" },
    { "id": 12, "name": "Dj Neophron", "song": "Мы-снова чемпионы (версия 2.0) - DJ NEOPHRON feat BAD SONGS PROJECT" },
    { "id": 13, "name": "Алексей Алмавем", "song": "Птицы в небе - Алмавем" },
    { "id": 14, "name": "Оксана Лащилина", "song": "Сашка-гармонист - ЛОВiNicE" },
    { "id": 15, "name": "Sashka Rheanomalia", "song": "Hushwires - Rheanomalia" },
    { "id": 16, "name": "Сережа Грякалов", "song": "Это Финал - SerGGGG ft. Мышь Band" },
    { "id": 17, "name": "Евгений Александрович", "song": "Serpent's Gift - Soulles Machine" },
    { "id": 18, "name": "Анна Чулкова", "song": "Алиса, посоветуй! - Neferet & PASE feat. SunoAI" },
    { "id": 19, "name": "Hito Shniperson", "song": "Сделай это со мной - hito" },
    { "id": 20, "name": "Алексей Леонтьев", "song": "Чужое Солнце (2025) - Turbin" },
    { "id": 21, "name": "Максим Яшин", "song": "Enough - FearTheChipper" },
    { "id": 22, "name": "Ольга Гавришина", "song": "Ураган - Ол`ka" },
    { "id": 23, "name": "Артур Колесник", "song": "Свет дозволенных Рифм - Scary_Man" },
    { "id": 24, "name": "Михаил Дмитриев", "song": "Эмодзи - Sona" },
    { "id": 25, "name": "Яан Лодди", "song": "Distortion of Memory - Cycle of Desire" },
    { "id": 26, "name": "Юлия Журженко", "song": "Вампир - Lisaviel" },
    { "id": 27, "name": "Павел Гупало", "song": "Гречка - наше всё - PoulSoul" },
    { "id": 28, "name": "Бред Питт", "song": "Дебил, но любил - N-Morson" },
    { "id": 29, "name": "Ai Sound Architect Digital Composer", "song": "Это вирус - ИNVGEN" },
    { "id": 30, "name": "Николай Постернак", "song": "Нарисованный мальчишка - Posternak" },
    { "id": 31, "name": "Sergey Chayka", "song": "Возможно - Сергей Чайка" },
    { "id": 32, "name": "Skart Ai Project", "song": "Качает вагон - SK-AI projecT" },
    { "id": 33, "name": "Кирилл Генкин", "song": "Неоновые Сны - ТехноСфера Вечности" },
    { "id": 34, "name": "Михаил Зиновьев", "song": "Тут у моря - Михаил Зиновьев" },
    { "id": 35, "name": "Наталья Дьякова", "song": "Чезабретта - Наташка Дьякова & SAI" },
    { "id": 36, "name": "Дмитрий Люсков", "song": "Индия - Дмитрий Люсков и Suno v 4.5" },
    { "id": 37, "name": "Ирина Воскобойникова", "song": "Сердце моё в огне - iRicha" },
    { "id": 38, "name": "Александр Сулимов", "song": "Солнце скрылось - Sulimov project" },
    { "id": 39, "name": "iva Muzhskoi", "song": "Toronto Fader - НейроДрейк" },
    { "id": 40, "name": "Константин Леонов-Шуанский", "song": "Актриса спускается в партер - AI Илья Недобитый" },
    { "id": 41, "name": "Амалия Жучок", "song": "В темноте - ZHUCHOK" },
    { "id": 42, "name": "Андрей Воронин", "song": "Разговор с собой (feat. SUNO) - StonedMilkBye" },
    { "id": 43, "name": "Папа Сэм", "song": "Echo - Папа Сэм" },
    { "id": 44, "name": "Дима Cавченко", "song": "Hold me tight (kpop) - Mane x Luna" },
    { "id": 45, "name": "Юн-Софус Кумле", "song": "Инклюз - ОПМ" },
    { "id": 46, "name": "Сова Сумрачная", "song": "Лонгин Сотник - Сова Сумрачная AI" },
    { "id": 47, "name": "Yulisse Cobre", "song": "Румба Шредингера - Celsa" },
    { "id": 48, "name": "Marty Macflay", "song": "Слёзы сбереги - MartyMacflay" },
    { "id": 49, "name": "Виталий Сазонов", "song": "Ты не ангел мой (rock version) - Vitaly Sazonov" },
    { "id": 50, "name": "Granny Dances", "song": "Упала ночь на землю - Granny dances (+Suno AI)" },
    { "id": 51, "name": "Станислав Земсков", "song": "Упс! - Dj Zem" },
    { "id": 52, "name": "Дмитрий Выхин", "song": "Бабки любят бабки - Satir-X" },
    { "id": 53, "name": "Коловрат Коло", "song": "Гром неба - Коловрат" },
    { "id": 54, "name": "Елена Слободчикова", "song": "Если ты уйдешь - Елена Слободчикова" },
    { "id": 55, "name": "Андрей Лабазов", "song": "Relic - Lbz" },
    { "id": 56, "name": "Владимир Морозов", "song": "Жара - Владимир Морозов" },
    { "id": 57, "name": "Андрей Салов", "song": "Интернет - НейроДюха" },
    { "id": 58, "name": "Николай Петров", "song": "Транс Вальс - blackpudding" },
    { "id": 59, "name": "Денис Смирнов", "song": "40 лет - Ai Kine$hma" },
    { "id": 60, "name": "Сергей Миньков", "song": "Азовское море зовёт - awaxino" },
    { "id": 61, "name": "Евгений Абрамов", "song": "Если бы - Tvoy toy" },
    { "id": 62, "name": "Роберт Астаповский", "song": "Завтра - Телефон Доверия" },
    { "id": 63, "name": "Руслан Назарович", "song": "Иди - The NeuroSong" },
    { "id": 64, "name": "Валерий Востриков", "song": "Миры Хэмингуэя - N-Morson, В.Востриков" },
    { "id": 65, "name": "Арон Авесин", "song": "ЭХ, МАРС, ТВОЮ МАТЬ! - Арон Авесин & SUNO AI" },
    { "id": 66, "name": "Sky Vashuk", "song": "be-the-light - Sky Vashuk" },
    { "id": 67, "name": "Юрий Петухов", "song": "I Won't Say Goodbye - Yury Petukhov" },
    { "id": 68, "name": "Константин Бондаренко (b'n'd)", "song": "День Х - b'n'd" },
    { "id": 69, "name": "Михаил Жаров", "song": "Июньский день - Gor Nagat" }
]

print(f"\nСоздание маппинга между CSV и HTML:")
print("=" * 50)

# Создаем маппинг: номер строки CSV -> ID в HTML
for i, row in enumerate(rows[1:], 1):  # Нумерация строк начинается с 1
    csv_song = row[0].strip()
    if csv_song:
        # Ищем соответствующую песню в HTML
        for html_p in html_participants:
            if html_p["song"] in csv_song or csv_song in html_p["song"]:
                csv_to_html_mapping[i] = html_p["id"]
                print(f"CSV строка {i}: '{csv_song}' -> HTML ID {html_p['id']}: '{html_p['song']}'")
                break

print(f"\nПравильный топ-4 для Отряда Котовскага:")
correct_top4 = []
for row_num, score, song in otrad_scores[:4]:
    if row_num in csv_to_html_mapping:
        html_id = csv_to_html_mapping[row_num]
        correct_top4.append(html_id)
        html_p = next(p for p in html_participants if p["id"] == html_id)
        print(f"CSV строка {row_num}: {song} (оценка {score}) -> HTML ID {html_id}: {html_p['name']} - {html_p['song']}")

print(f"\nФинальный топ-4 ID для HTML: {correct_top4}") 