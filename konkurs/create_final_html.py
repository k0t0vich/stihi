import csv

def get_judge_top4():
    # Читаем CSV файл
    with open('Таблица-Tаблица 1.csv', 'r', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=';')
        rows = list(reader)
    
    # Получаем заголовки (имена судей) - колонки 2-58 (индексы 1-57)
    judges = rows[1][1:58]  # Пропускаем первые две пустые колонки
    
    # Создаем словарь для хранения топ-4 каждого судьи
    judge_top4 = {}
    
    # Обрабатываем каждую строку с песнями (начиная с индекса 2)
    for row_idx, row in enumerate(rows[2:], start=1):  # id песен начинаются с 1
        song_id = row_idx
        
        # Обрабатываем оценки судей (колонки 2-58)
        for judge_idx, judge_name in enumerate(judges):
            if judge_idx < len(row) - 2:  # Проверяем, что колонка существует
                score_str = row[judge_idx + 2]  # +2 потому что первые две колонки пустые
                
                if score_str and score_str.strip():
                    try:
                        score = float(score_str.replace(',', '.'))
                        
                        # Инициализируем список оценок для судьи, если его нет
                        if judge_name not in judge_top4:
                            judge_top4[judge_name] = []
                        
                        # Добавляем оценку
                        judge_top4[judge_name].append((song_id, score))
                    except ValueError:
                        continue
    
    # Для каждого судьи находим топ-4 с максимальными оценками
    for judge_name, scores in judge_top4.items():
        # Сортируем по убыванию оценок и берем топ-4
        top4 = sorted(scores, key=lambda x: x[1], reverse=True)[:4]
        judge_top4[judge_name] = [song_id for song_id, score in top4]
    
    return judge_top4

def create_final_html():
    # Получаем топ-4 для каждого судьи
    judge_top4 = get_judge_top4()
    
    # Создаем маппинг имен судей из CSV в имена из HTML
    judge_mapping = {
        "Тима Сусляев": "Тима Сусляев",
        "Ai Accordions": "Ai Accordions", 
        "Надежда Капустина": "Надежда Капустина",
        "Оксана Лащилина": "Оксана Лащилина",
        "Артур Колесник": "Артур Колесник",
        "Макс Громов": "Макс Громов",
        "Константин Бондаренко (Отряд Котовскага)": "Отряд Котовскага",
        "Алексей Алмавем": "Алексей Алмавем",
        "iva Muzhskoi": "iva Muzhskoi",
        "Виталий Мартюков": "Виталий Мартюков",
        "Алексей Леонтьев": "Алексей Леонтьев",
        "Яан Лодди": "Яан Лодди",
        "Елена Слободчикова ": "Елена Слободчикова",
        "Илья Дорожкин": "Илья Дорожкин",
        "Александр Сулимов": "Александр Сулимов",
        "Андрей Салов": "Андрей Салов",
        "Евгений Мазаков": "Евгений Мазаков",
        "Денис Смирнов": "Денис Смирнов",
        "Константин Бондаренко (b'n'd)": "Константин Бондаренко (b'n'd)",
        "Руслан Назарович": "Руслан Назарович",
        "Татьяна Руденко": "Татьяна Руденко",
        "Максим Дубровский": "Максим Дубровский",
        "Neldy Music": "Neldy Music",
        "Ze Gamer": "Ze Gamer",
        "Наталия Фомина": "Наталия Фомина",
        "Бред Питт": "Бред Питт",
        "Анна Чулкова": "Анна Чулкова",
        "Михаил Юршевич": "Михаил Юршевич",
        "Ольга Гавришина": "Ольга Гавришина",
        "Маруся Хмельная": "Маруся Хмельная",
        "Михаил Дмитриев": "Михаил Дмитриев",
        "Арон Авесин": "Арон Авесин",
        "Ai Sound Architect Digital Composer": "Ai Sound Architect Digital Composer",
        "Николай Петров": "Николай Петров",
        "Аиболид Творческое Объединение": "Аиболид Творческое Объединение",
        "Ивита Полонская": "Ивита Полонская",
        "Павел Желибо": "Павел Желибо",
        "Папа Сэм": "Папа Сэм",
        "Валерий Востриков": "Валерий Востриков",
        "Granny Dances": "Granny Dances",
        "Максим Яшин": "Максим Яшин",
        "Hito Shniperson": "Hito Shniperson",
        "Екатерина Евстратова": "Екатерина Евстратова",
        "Евгений Александрович": "Евгений Александрович",
        "Sashka Rheanomalia": "Sashka Rheanomalia",
        "Кирилл Панов": "Кирилл Панов",
        "Николай Баркалов": "Николай Баркалов",
        "Sergey Chayka": "Sergey Chayka",
        "Skart Ai Project": "Skart Ai Project",
        "Владимир Морозов": "Владимир Морозов",
        "Михаил Зиновьев": "Михаил Зиновьев",
        "Дмитрий Люсков": "Дмитрий Люсков",
        "Амалия Жучок": "Амалия Жучок",
        "Наталья Дьякова": "Наталья Дьякова",
        "Андрей Воронин": "Андрей Воронин",
        "Ирина Воскобойникова": "Ирина Воскобойникова",
        "Kazladur Brink": "Kazladur Brink"
    }
    
    # Создаем обновленные данные участников
    participants_data = [
        { "id": 1, "name": "Cол Иодим", "song": "На дороге иной - Сол на Марсе (SoM)", "score": 3.8, "isJudge": False },
        { "id": 2, "name": "Отряд Котовскага", "song": "Плюшевые поэты - Отряд Котовскага", "score": 2.5, "isJudge": True, "top": judge_top4.get("Константин Бондаренко (Отряд Котовскага)", []) },
        { "id": 3, "name": "Ивита Полонская", "song": "Devil made me do it - sky ivi music", "score": 2.4, "isJudge": True, "top": judge_top4.get("Ивита Полонская", []) },
        { "id": 4, "name": "Ze Gamer", "song": "На дорогах лесных - Ze Game", "score": 2.2, "isJudge": True, "top": judge_top4.get("Ze Gamer", []) },
        { "id": 5, "name": "Павел Желибо", "song": "Палач (демо версия) - Павел Желибо", "score": 1.9, "isJudge": True, "top": judge_top4.get("Павел Желибо", []) },
        { "id": 6, "name": "Neldy Music", "song": "Сколько лет — сколько зим… - MetaZvuk", "score": 1.9, "isJudge": False },
        { "id": 7, "name": "Надежда Капустина", "song": "Цвет ночи - NadinKa", "score": 1.8, "isJudge": True, "top": judge_top4.get("Надежда Капустина", []) },
        { "id": 8, "name": "Kazladur Brink", "song": "Notice.me - Kazladur", "score": 1.6, "isJudge": True, "top": judge_top4.get("Kazladur Brink", []) },
        { "id": 9, "name": "Татьяна Руденко", "song": "Лети - Руденко Т.В. + Рифф", "score": 1.6, "isJudge": True, "top": judge_top4.get("Татьяна Руденко", []) },
        { "id": 10, "name": "Екатерина Евстратова", "song": "Echoes in the Hollow - Kate's world", "score": 1.5, "isJudge": True, "top": judge_top4.get("Екатерина Евстратова", []) },
        { "id": 11, "name": "Илья Дорожкин", "song": "После жизни - Даркарт", "score": 1.5, "isJudge": True, "top": judge_top4.get("Илья Дорожкин", []) },
        { "id": 12, "name": "Dj Neophron", "song": "Мы-снова чемпионы (версия 2.0) - DJ NEOPHRON feat BAD SONGS PROJECT", "score": 1.4, "isJudge": False },
        { "id": 13, "name": "Алексей Алмавем", "song": "Птицы в небе - Алмавем", "score": 1.4, "isJudge": True, "top": judge_top4.get("Алексей Алмавем", []) },
        { "id": 14, "name": "Оксана Лащилина", "song": "Сашка-гармонист - ЛОВiNicE", "score": 1.3, "isJudge": True, "top": judge_top4.get("Оксана Лащилина", []) },
        { "id": 15, "name": "Sashka Rheanomalia", "song": "Hushwires - Rheanomalia", "score": 1.2, "isJudge": True, "top": judge_top4.get("Sashka Rheanomalia", []) },
        { "id": 16, "name": "Сережа Грякалов", "song": "Это Финал - SerGGGG ft. Мышь Band", "score": 1.2, "isJudge": False },
        { "id": 17, "name": "Евгений Александрович", "song": "Serpent's Gift - Soulles Machine", "score": 1.1, "isJudge": True, "top": judge_top4.get("Евгений Александрович", []) },
        { "id": 18, "name": "Анна Чулкова", "song": "Алиса, посоветуй! - Neferet & PASE feat. SunoAI", "score": 1.1, "isJudge": True, "top": judge_top4.get("Анна Чулкова", []) },
        { "id": 19, "name": "Hito Shniperson", "song": "Сделай это со мной - hito", "score": 1.1, "isJudge": True, "top": judge_top4.get("Hito Shniperson", []) },
        { "id": 20, "name": "Алексей Леонтьев", "song": "Чужое Солнце (2025) - Turbin", "score": 1.1, "isJudge": True, "top": judge_top4.get("Алексей Леонтьев", []) },
        { "id": 21, "name": "Максим Яшин", "song": "Enough - FearTheChipper", "score": 1.0, "isJudge": True, "top": judge_top4.get("Максим Яшин", []) },
        { "id": 22, "name": "Ольга Гавришина", "song": "Ураган - Ол`ka", "score": 1.0, "isJudge": True, "top": judge_top4.get("Ольга Гавришина", []) },
        { "id": 23, "name": "Артур Колесник", "song": "Свет дозволенных Рифм - Scary_Man", "score": 0.9, "isJudge": True, "top": judge_top4.get("Артур Колесник", []) },
        { "id": 24, "name": "Михаил Дмитриев", "song": "Эмодзи - Sona", "score": 0.9, "isJudge": True, "top": judge_top4.get("Михаил Дмитриев", []) },
        { "id": 25, "name": "Яан Лодди", "song": "Distortion of Memory - Cycle of Desire", "score": 0.8, "isJudge": True, "top": judge_top4.get("Яан Лодди", []) },
        { "id": 26, "name": "Юлия Журженко", "song": "Вампир - Lisaviel", "score": 0.8, "isJudge": False },
        { "id": 27, "name": "Павел Гупало", "song": "Гречка - наше всё - PoulSoul", "score": 0.8, "isJudge": False },
        { "id": 28, "name": "Бред Питт", "song": "Дебил, но любил - N-Morson", "score": 0.8, "isJudge": True, "top": judge_top4.get("Бред Питт", []) },
        { "id": 29, "name": "Ai Sound Architect Digital Composer", "song": "Это вирус - ИNVGEN", "score": 0.8, "isJudge": True, "top": judge_top4.get("Ai Sound Architect Digital Composer", []) },
        { "id": 30, "name": "Николай Постернак", "song": "Нарисованный мальчишка - Posternak", "score": 0.7, "isJudge": False },
        { "id": 31, "name": "Sergey Chayka", "song": "Возможно - Сергей Чайка", "score": 0.7, "isJudge": True, "top": judge_top4.get("Sergey Chayka", []) },
        { "id": 32, "name": "Skart Ai Project", "song": "Качает вагон - SK-AI projecT", "score": 0.7, "isJudge": True, "top": judge_top4.get("Skart Ai Project", []) },
        { "id": 33, "name": "Кирилл Генкин", "song": "Неоновые Сны - ТехноСфера Вечности", "score": 0.7, "isJudge": False },
        { "id": 34, "name": "Михаил Зиновьев", "song": "Тут у моря - Михаил Зиновьев", "score": 0.7, "isJudge": True, "top": judge_top4.get("Михаил Зиновьев", []) },
        { "id": 35, "name": "Наталья Дьякова", "song": "Чезабретта - Наташка Дьякова & SAI", "score": 0.7, "isJudge": True, "top": judge_top4.get("Наталья Дьякова", []) },
        { "id": 36, "name": "Дмитрий Люсков", "song": "Индия - Дмитрий Люсков и Suno v 4.5", "score": 0.6, "isJudge": True, "top": judge_top4.get("Дмитрий Люсков", []) },
        { "id": 37, "name": "Ирина Воскобойникова", "song": "Сердце моё в огне - iRicha", "score": 0.6, "isJudge": True, "top": judge_top4.get("Ирина Воскобойникова", []) },
        { "id": 38, "name": "Александр Сулимов", "song": "Солнце скрылось - Sulimov project", "score": 0.6, "isJudge": True, "top": judge_top4.get("Александр Сулимов", []) },
        { "id": 39, "name": "iva Muzhskoi", "song": "Toronto Fader - НейроДрейк", "score": 0.5, "isJudge": True, "top": judge_top4.get("iva Muzhskoi", []) },
        { "id": 40, "name": "Константин Леонов-Шуанский", "song": "Актриса спускается в партер - AI Илья Недобитый", "score": 0.5, "isJudge": False },
        { "id": 41, "name": "Амалия Жучок", "song": "В темноте - ZHUCHOK", "score": 0.5, "isJudge": True, "top": judge_top4.get("Амалия Жучок", []) },
        { "id": 42, "name": "Андрей Воронин", "song": "Разговор с собой (feat. SUNO) - StonedMilkBye", "score": 0.5, "isJudge": True, "top": judge_top4.get("Андрей Воронин", []) },
        { "id": 43, "name": "Папа Сэм", "song": "Echo - Папа Сэм", "score": 0.4, "isJudge": True, "top": judge_top4.get("Папа Сэм", []) },
        { "id": 44, "name": "Дима Cавченко", "song": "Hold me tight (kpop) - Mane x Luna", "score": 0.4, "isJudge": False },
        { "id": 45, "name": "Юн-Софус Кумле", "song": "Инклюз - ОПМ", "score": 0.4, "isJudge": False },
        { "id": 46, "name": "Сова Сумрачная", "song": "Лонгин Сотник - Сова Сумрачная AI", "score": 0.4, "isJudge": False },
        { "id": 47, "name": "Yulisse Cobre", "song": "Румба Шредингера - Celsa", "score": 0.4, "isJudge": False },
        { "id": 48, "name": "Marty Macflay", "song": "Слёзы сбереги - MartyMacflay", "score": 0.4, "isJudge": False },
        { "id": 49, "name": "Виталий Сазонов", "song": "Ты не ангел мой (rock version) - Vitaly Sazonov", "score": 0.4, "isJudge": False },
        { "id": 50, "name": "Granny Dances", "song": "Упала ночь на землю - Granny dances (+Suno AI)", "score": 0.4, "isJudge": True, "top": judge_top4.get("Granny Dances", []) },
        { "id": 51, "name": "Станислав Земсков", "song": "Упс! - Dj Zem", "score": 0.4, "isJudge": False },
        { "id": 52, "name": "Дмитрий Выхин", "song": "Бабки любят бабки - Satir-X", "score": 0.3, "isJudge": False },
        { "id": 53, "name": "Коловрат Коло", "song": "Гром неба - Коловрат", "score": 0.3, "isJudge": False },
        { "id": 54, "name": "Елена Слободчикова", "song": "Если ты уйдешь - Елена Слободчикова", "score": 0.3, "isJudge": True, "top": judge_top4.get("Елена Слободчикова ", []) },
        { "id": 55, "name": "Андрей Лабазов", "song": "Relic - Lbz", "score": 0.3, "isJudge": False },
        { "id": 56, "name": "Владимир Морозов", "song": "Жара - Владимир Морозов", "score": 0.3, "isJudge": True, "top": judge_top4.get("Владимир Морозов", []) },
        { "id": 57, "name": "Андрей Салов", "song": "Интернет - НейроДюха", "score": 0.3, "isJudge": True, "top": judge_top4.get("Андрей Салов", []) },
        { "id": 58, "name": "Николай Петров", "song": "Транс Вальс - blackpudding", "score": 0.3, "isJudge": True, "top": judge_top4.get("Николай Петров", []) },
        { "id": 59, "name": "Денис Смирнов", "song": "40 лет - Ai Kine$hma", "score": 0.2, "isJudge": True, "top": judge_top4.get("Денис Смирнов", []) },
        { "id": 60, "name": "Сергей Миньков", "song": "Азовское море зовёт - awaxino", "score": 0.2, "isJudge": False },
        { "id": 61, "name": "Евгений Абрамов", "song": "Если бы - Tvoy toy", "score": 0.2, "isJudge": False },
        { "id": 62, "name": "Роберт Астаповский", "song": "Завтра - Телефон Доверия", "score": 0.2, "isJudge": False },
        { "id": 63, "name": "Руслан Назарович", "song": "Иди - The NeuroSong", "score": 0.2, "isJudge": True, "top": judge_top4.get("Руслан Назарович", []) },
        { "id": 64, "name": "Валерий Востриков", "song": "Миры Хэмингуэя - N-Morson, В.Востриков", "score": 0.2, "isJudge": True, "top": judge_top4.get("Валерий Востриков", []) },
        { "id": 65, "name": "Арон Авесин", "song": "ЭХ, МАРС, ТВОЮ МАТЬ! - Арон Авесин & SUNO AI", "score": 0.2, "isJudge": True, "top": judge_top4.get("Арон Авесин", []) },
        { "id": 66, "name": "Sky Vashuk", "song": "be-the-light - Sky Vashuk", "score": 0.1, "isJudge": False },
        { "id": 67, "name": "Юрий Петухов", "song": "I Won't Say Goodbye - Yury Petukhov", "score": 0.1, "isJudge": False },
        { "id": 68, "name": "Константин Бондаренко (b'n'd)", "song": "День Х - b'n'd", "score": 0.1, "isJudge": True, "top": judge_top4.get("Константин Бондаренко (b'n'd)", []) },
        { "id": 69, "name": "Михаил Жаров", "song": "Июньский день - Gor Nagat", "score": 0.1, "isJudge": False },
        # Судьи, которые только голосовали (не участвовали как исполнители)
        { "id": 70, "name": "Тима Сусляев", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Тима Сусляев", []) },
        { "id": 71, "name": "Ai Accordions", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Ai Accordions", []) },
        { "id": 72, "name": "Макс Громов", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Макс Громов", []) },
        { "id": 73, "name": "Виталий Мартюков", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Виталий Мартюков", []) },
        { "id": 74, "name": "Евгений Мазаков", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Евгений Мазаков", []) },
        { "id": 75, "name": "Максим Дубровский", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Максим Дубровский", []) },
        { "id": 76, "name": "Наталия Фомина", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Наталия Фомина", []) },
        { "id": 77, "name": "Михаил Юршевич", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Михаил Юршевич", []) },
        { "id": 78, "name": "Маруся Хмельная", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Маруся Хмельная", []) },
        { "id": 79, "name": "Аиболид Творческое Объединение", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Аиболид Творческое Объединение", []) },
        { "id": 80, "name": "Кирилл Панов", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Кирилл Панов", []) },
        { "id": 81, "name": "Николай Баркалов", "song": "", "score": 0, "isJudge": True, "top": judge_top4.get("Николай Баркалов", []) }
    ]
    
    # Создаем строку с данными участников для вставки в HTML
    participants_str = ",\n                ".join([
        f'{{ id: {p["id"]}, name: "{p["name"]}", song: "{p["song"]}", score: {p["score"]}, isJudge: {str(p["isJudge"]).lower()}{", top: " + str(p["top"]) if "top" in p else ""} }}'
        for p in participants_data
    ])
    
    print("Данные участников готовы для вставки в HTML:")
    print(participants_str)
    
    return participants_str

if __name__ == "__main__":
    create_final_html() 