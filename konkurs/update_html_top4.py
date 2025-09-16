import csv
import re

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

def update_html_file():
    # Получаем топ-4 для каждого судьи
    judge_top4 = get_judge_top4()
    
    # Читаем HTML файл
    with open('../index.html', 'r', encoding='utf-8') as file:
        html_content = file.read()
    
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
    
    # Обновляем топ-4 для каждого судьи в HTML
    for csv_name, html_name in judge_mapping.items():
        if csv_name in judge_top4:
            top4 = judge_top4[csv_name]
            
            # Ищем строку с судьей в HTML и обновляем топ-4
            pattern = rf'name: "{re.escape(html_name)}".*?top: \[[^\]]*\](?=.*?isJudge: true)'
            replacement = f'name: "{html_name}", song: "{html_name}", score: 0, isJudge: true, top: {top4}'
            
            # Более точный поиск для судей-участников
            if html_name in ["Отряд Котовскага", "Ивита Полонская", "Ze Gamer", "Павел Желибо", "Надежда Капустина", "Kazladur Brink", "Татьяна Руденко", "Екатерина Евстратова", "Илья Дорожкин", "Алексей Алмавем", "Оксана Лащилина", "Sashka Rheanomalia", "Евгений Александрович", "Анна Чулкова", "Hito Shniperson", "Алексей Леонтьев", "Максим Яшин", "Ольга Гавришина", "Артур Колесник", "Михаил Дмитриев", "Яан Лодди", "Бред Питт", "Ai Sound Architect Digital Composer", "Sergey Chayka", "Skart Ai Project", "Михаил Зиновьев", "Наталья Дьякова", "Дмитрий Люсков", "Ирина Воскобойникова", "Александр Сулимов", "iva Muzhskoi", "Амалия Жучок", "Андрей Воронин", "Папа Сэм", "Арон Авесин", "Константин Бондаренко (b'n'd)", "Granny Dances", "Елена Слободчикова", "Андрей Салов", "Денис Смирнов", "Николай Петров", "Руслан Назарович", "Валерий Востриков", "Кирилл Панов", "Владимир Морозов", "Николай Баркалов", "Sergey Chayka", "Skart Ai Project", "Михаил Зиновьев", "Дмитрий Люсков", "Амалия Жучок", "Наталья Дьякова", "Андрей Воронин", "Ирина Воскобойникова", "Kazladur Brink"]:
                # Для судей-участников ищем строку с их песней
                pattern = rf'name: "{re.escape(html_name)}".*?top: \[[^\]]*\]'
                replacement = f'name: "{html_name}", song: ".*?", score: .*?, isJudge: true, top: {top4}'
            else:
                # Для судей, которые только голосовали
                pattern = rf'name: "{re.escape(html_name)}".*?top: \[[^\]]*\]'
                replacement = f'name: "{html_name}", song: "", score: 0, isJudge: true, top: {top4}'
            
            html_content = re.sub(pattern, replacement, html_content, flags=re.DOTALL)
    
    # Записываем обновленный HTML файл
    with open('../index.html', 'w', encoding='utf-8') as file:
        file.write(html_content)
    
    print("HTML файл обновлен с правильными топ-4 для всех судей!")

if __name__ == "__main__":
    update_html_file() 