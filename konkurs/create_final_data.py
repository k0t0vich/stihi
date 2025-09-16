import csv

# Читаем CSV файл
with open('1.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (имена судей)
judges = rows[0][1:]  # Пропускаем первую пустую колонку

# Данные из HTML с оригинальными баллами
html_participants = [
    { "id": 1, "name": "Cол Иодим", "song": "На дороге иной - Сол на Марсе (SoM)", "score": 3.8, "isJudge": False },
    { "id": 2, "name": "Отряд Котовскага", "song": "Плюшевые поэты - Отряд Котовскага", "score": 2.5, "isJudge": True },
    { "id": 3, "name": "Ивита Полонская", "song": "Devil made me do it - sky ivi music", "score": 2.4, "isJudge": True },
    { "id": 4, "name": "Ze Gamer", "song": "На дорогах лесных - Ze Game", "score": 2.2, "isJudge": True },
    { "id": 5, "name": "Павел Желибо", "song": "Палач (демо версия) - Павел Желибо", "score": 1.9, "isJudge": True },
    { "id": 6, "name": "Neldy Music", "song": "Сколько лет — сколько зим… - MetaZvuk", "score": 1.9, "isJudge": False },
    { "id": 7, "name": "Надежда Капустина", "song": "Цвет ночи - NadinKa", "score": 1.8, "isJudge": True },
    { "id": 8, "name": "Kazladur Brink", "song": "Notice.me - Kazladur", "score": 1.6, "isJudge": True },
    { "id": 9, "name": "Татьяна Руденко", "song": "Лети - Руденко Т.В. + Рифф", "score": 1.6, "isJudge": True },
    { "id": 10, "name": "Екатерина Евстратова", "song": "Echoes in the Hollow - Kate's world", "score": 1.5, "isJudge": True },
    { "id": 11, "name": "Илья Дорожкин", "song": "После жизни - Даркарт", "score": 1.5, "isJudge": True },
    { "id": 12, "name": "Dj Neophron", "song": "Мы-снова чемпионы (версия 2.0) - DJ NEOPHRON feat BAD SONGS PROJECT", "score": 1.4, "isJudge": False },
    { "id": 13, "name": "Алексей Алмавем", "song": "Птицы в небе - Алмавем", "score": 1.4, "isJudge": True },
    { "id": 14, "name": "Оксана Лащилина", "song": "Сашка-гармонист - ЛОВiNicE", "score": 1.3, "isJudge": True },
    { "id": 15, "name": "Sashka Rheanomalia", "song": "Hushwires - Rheanomalia", "score": 1.2, "isJudge": True },
    { "id": 16, "name": "Сережа Грякалов", "song": "Это Финал - SerGGGG ft. Мышь Band", "score": 1.2, "isJudge": False },
    { "id": 17, "name": "Евгений Александрович", "song": "Serpent's Gift - Soulles Machine", "score": 1.1, "isJudge": True },
    { "id": 18, "name": "Анна Чулкова", "song": "Алиса, посоветуй! - Neferet & PASE feat. SunoAI", "score": 1.1, "isJudge": True },
    { "id": 19, "name": "Hito Shniperson", "song": "Сделай это со мной - hito", "score": 1.1, "isJudge": True },
    { "id": 20, "name": "Алексей Леонтьев", "song": "Чужое Солнце (2025) - Turbin", "score": 1.1, "isJudge": True },
    { "id": 21, "name": "Максим Яшин", "song": "Enough - FearTheChipper", "score": 1.0, "isJudge": True },
    { "id": 22, "name": "Ольга Гавришина", "song": "Ураган - Ол`ka", "score": 1.0, "isJudge": True },
    { "id": 23, "name": "Артур Колесник", "song": "Свет дозволенных Рифм - Scary_Man", "score": 0.9, "isJudge": True },
    { "id": 24, "name": "Михаил Дмитриев", "song": "Эмодзи - Sona", "score": 0.9, "isJudge": True },
    { "id": 25, "name": "Яан Лодди", "song": "Distortion of Memory - Cycle of Desire", "score": 0.8, "isJudge": True },
    { "id": 26, "name": "Юлия Журженко", "song": "Вампир - Lisaviel", "score": 0.8, "isJudge": False },
    { "id": 27, "name": "Павел Гупало", "song": "Гречка - наше всё - PoulSoul", "score": 0.8, "isJudge": False },
    { "id": 28, "name": "Бред Питт", "song": "Дебил, но любил - N-Morson", "score": 0.8, "isJudge": True },
    { "id": 29, "name": "Ai Sound Architect Digital Composer", "song": "Это вирус - ИNVGEN", "score": 0.8, "isJudge": True },
    { "id": 30, "name": "Николай Постернак", "song": "Нарисованный мальчишка - Posternak", "score": 0.7, "isJudge": False },
    { "id": 31, "name": "Sergey Chayka", "song": "Возможно - Сергей Чайка", "score": 0.7, "isJudge": True },
    { "id": 32, "name": "Skart Ai Project", "song": "Качает вагон - SK-AI projecT", "score": 0.7, "isJudge": True },
    { "id": 33, "name": "Кирилл Генкин", "song": "Неоновые Сны - ТехноСфера Вечности", "score": 0.7, "isJudge": False },
    { "id": 34, "name": "Михаил Зиновьев", "song": "Тут у моря - Михаил Зиновьев", "score": 0.7, "isJudge": True },
    { "id": 35, "name": "Наталья Дьякова", "song": "Чезабретта - Наташка Дьякова & SAI", "score": 0.7, "isJudge": True },
    { "id": 36, "name": "Дмитрий Люсков", "song": "Индия - Дмитрий Люсков и Suno v 4.5", "score": 0.6, "isJudge": True },
    { "id": 37, "name": "Ирина Воскобойникова", "song": "Сердце моё в огне - iRicha", "score": 0.6, "isJudge": True },
    { "id": 38, "name": "Александр Сулимов", "song": "Солнце скрылось - Sulimov project", "score": 0.6, "isJudge": True },
    { "id": 39, "name": "iva Muzhskoi", "song": "Toronto Fader - НейроДрейк", "score": 0.5, "isJudge": True },
    { "id": 40, "name": "Константин Леонов-Шуанский", "song": "Актриса спускается в партер - AI Илья Недобитый", "score": 0.5, "isJudge": False },
    { "id": 41, "name": "Амалия Жучок", "song": "В темноте - ZHUCHOK", "score": 0.5, "isJudge": True },
    { "id": 42, "name": "Андрей Воронин", "song": "Разговор с собой (feat. SUNO) - StonedMilkBye", "score": 0.5, "isJudge": True },
    { "id": 43, "name": "Папа Сэм", "song": "Echo - Папа Сэм", "score": 0.4, "isJudge": True },
    { "id": 44, "name": "Дима Cавченко", "song": "Hold me tight (kpop) - Mane x Luna", "score": 0.4, "isJudge": False },
    { "id": 45, "name": "Юн-Софус Кумле", "song": "Инклюз - ОПМ", "score": 0.4, "isJudge": False },
    { "id": 46, "name": "Сова Сумрачная", "song": "Лонгин Сотник - Сова Сумрачная AI", "score": 0.4, "isJudge": False },
    { "id": 47, "name": "Yulisse Cobre", "song": "Румба Шредингера - Celsa", "score": 0.4, "isJudge": False },
    { "id": 48, "name": "Marty Macflay", "song": "Слёзы сбереги - MartyMacflay", "score": 0.4, "isJudge": False },
    { "id": 49, "name": "Виталий Сазонов", "song": "Ты не ангел мой (rock version) - Vitaly Sazonov", "score": 0.4, "isJudge": False },
    { "id": 50, "name": "Granny Dances", "song": "Упала ночь на землю - Granny dances (+Suno AI)", "score": 0.4, "isJudge": True },
    { "id": 51, "name": "Станислав Земсков", "song": "Упс! - Dj Zem", "score": 0.4, "isJudge": False },
    { "id": 52, "name": "Дмитрий Выхин", "song": "Бабки любят бабки - Satir-X", "score": 0.3, "isJudge": False },
    { "id": 53, "name": "Коловрат Коло", "song": "Гром неба - Коловрат", "score": 0.3, "isJudge": False },
    { "id": 54, "name": "Елена Слободчикова", "song": "Если ты уйдешь - Елена Слободчикова", "score": 0.3, "isJudge": True },
    { "id": 55, "name": "Андрей Лабазов", "song": "Relic - Lbz", "score": 0.3, "isJudge": False },
    { "id": 56, "name": "Владимир Морозов", "song": "Жара - Владимир Морозов", "score": 0.3, "isJudge": True },
    { "id": 57, "name": "Андрей Салов", "song": "Интернет - НейроДюха", "score": 0.3, "isJudge": True },
    { "id": 58, "name": "Николай Петров", "song": "Транс Вальс - blackpudding", "score": 0.3, "isJudge": True },
    { "id": 59, "name": "Денис Смирнов", "song": "40 лет - Ai Kine$hma", "score": 0.2, "isJudge": True },
    { "id": 60, "name": "Сергей Миньков", "song": "Азовское море зовёт - awaxino", "score": 0.2, "isJudge": False },
    { "id": 61, "name": "Евгений Абрамов", "song": "Если бы - Tvoy toy", "score": 0.2, "isJudge": False },
    { "id": 62, "name": "Роберт Астаповский", "song": "Завтра - Телефон Доверия", "score": 0.2, "isJudge": False },
    { "id": 63, "name": "Руслан Назарович", "song": "Иди - The NeuroSong", "score": 0.2, "isJudge": True },
    { "id": 64, "name": "Валерий Востриков", "song": "Миры Хэмингуэя - N-Morson, В.Востриков", "score": 0.2, "isJudge": True },
    { "id": 65, "name": "Арон Авесин", "song": "ЭХ, МАРС, ТВОЮ МАТЬ! - Арон Авесин & SUNO AI", "score": 0.2, "isJudge": True },
    { "id": 66, "name": "Sky Vashuk", "song": "be-the-light - Sky Vashuk", "score": 0.1, "isJudge": False },
    { "id": 67, "name": "Юрий Петухов", "song": "I Won't Say Goodbye - Yury Petukhov", "score": 0.1, "isJudge": False },
    { "id": 68, "name": "Константин Бондаренко (b'n'd)", "song": "День Х - b'n'd", "score": 0.1, "isJudge": True },
    { "id": 69, "name": "Михаил Жаров", "song": "Июньский день - Gor Nagat", "score": 0.1, "isJudge": False }
]

# Создаем маппинг: номер строки CSV -> ID в HTML
csv_to_html_mapping = {}
for i, row in enumerate(rows[1:], 1):  # Нумерация строк начинается с 1
    csv_song = row[0].strip()
    if csv_song:
        # Ищем соответствующую песню в HTML
        for html_p in html_participants:
            if html_p["song"] in csv_song or csv_song in html_p["song"]:
                csv_to_html_mapping[i] = html_p["id"]
                break

# Маппинг имен судей из CSV в имена в HTML
judge_name_mapping = {
    " Отряд Котовскага": "Отряд Котовскага",
    "Константин Бондаренко (b'n'd)": "Константин Бондаренко (b'n'd)",
    "Iva Muzhskoi": "iva Muzhskoi",
    "Елена Слободчикова ": "Елена Слободчикова"  # Убираем лишний пробел
}

# Функция для получения топ-4 судьи
def get_judge_top4(judge_index):
    judge_scores = []
    for i, row in enumerate(rows[1:], 1):  # Нумерация строк начинается с 1
        if len(row) > judge_index + 1:  # +1 потому что первая колонка пустая
            score_str = row[judge_index + 1].strip()
            if score_str and score_str != '':
                try:
                    score = float(score_str.replace(',', '.'))
                    judge_scores.append((i, score))  # (номер строки, оценка)
                except ValueError:
                    pass
    
    # Сортируем по оценкам (по убыванию) и берем топ-4
    judge_scores.sort(key=lambda x: x[1], reverse=True)
    
    # Преобразуем номера строк в HTML ID
    top4_ids = []
    for row_num, score in judge_scores[:4]:
        if row_num in csv_to_html_mapping:
            top4_ids.append(csv_to_html_mapping[row_num])
    
    return top4_ids

# Получаем топ-4 для всех судей
all_judges_top4 = {}
for i, judge_name in enumerate(judges):
    # Нормализуем имя судьи
    normalized_name = judge_name.strip()
    if normalized_name in judge_name_mapping:
        normalized_name = judge_name_mapping[normalized_name]
    
    top4 = get_judge_top4(i)
    all_judges_top4[normalized_name] = top4

# Создаем обновленный список participants для HTML
updated_participants = []

# Добавляем участников с обновленными топ-4
for html_p in html_participants:
    if html_p["name"] in all_judges_top4:
        # Это судья, добавляем топ-4
        updated_participants.append({
            **html_p,
            "isJudge": True,
            "top": all_judges_top4[html_p["name"]]
        })
    else:
        # Это обычный участник
        updated_participants.append({
            **html_p,
            "isJudge": False
        })

# Добавляем судей, которые только голосовали (не участвовали как исполнители)
judges_only = [
    { "id": 70, "name": "Тима Сусляев", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Тима Сусляев", []) },
    { "id": 71, "name": "Ai Accordions", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Ai Accordions", []) },
    { "id": 72, "name": "Макс Громов", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Макс Громов", []) },
    { "id": 73, "name": "Виталий Мартюков", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Виталий Мартюков", []) },
    { "id": 74, "name": "Евгений Мазаков", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Евгений Мазаков", []) },
    { "id": 75, "name": "Максим Дубровский", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Максим Дубровский", []) },
    { "id": 76, "name": "Наталия Фомина", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Наталия Фомина", []) },
    { "id": 77, "name": "Михаил Юршевич", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Михаил Юршевич", []) },
    { "id": 78, "name": "Маруся Хмельная", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Маруся Хмельная", []) },
    { "id": 79, "name": "Аиболид Творческое Объединение", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Аиболид Творческое Объединение", []) },
    { "id": 80, "name": "Кирилл Панов", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Кирилл Панов", []) },
    { "id": 81, "name": "Николай Баркалов", "song": "", "score": 0, "isJudge": True, "top": all_judges_top4.get("Николай Баркалов", []) }
]

updated_participants.extend(judges_only)

# Выводим обновленные данные для вставки в HTML
print("const contestData = {")
print("    participants: [")

for i, p in enumerate(updated_participants):
    if p["isJudge"]:
        if p["song"]:  # Судья-участник
            print(f"        {{ id: {p['id']}, name: \"{p['name']}\", song: \"{p['song']}\", score: {p['score']}, isJudge: true, top: {p['top']} }},")
        else:  # Судья, который только голосовал
            print(f"        {{ id: {p['id']}, name: \"{p['name']}\", song: \"\", score: 0, isJudge: true, top: {p['top']} }},")
    else:
        print(f"        {{ id: {p['id']}, name: \"{p['name']}\", song: \"{p['song']}\", score: {p['score']}, isJudge: false }},")

print("    ],")
print("    totalJudges: 57,")
print("    totalParticipants: 101,")
print("    correctionFactor: 1 + 1/(57-1)")
print("};") 