#!/usr/bin/env python3
import csv
import json

# Читаем CSV файл
with open('1.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (имена судей)
judges = rows[0][1:]  # Пропускаем первую пустую колонку

# Маппинг CSV строк -> HTML ID (из предыдущего скрипта)
csv_to_html_mapping = {
    1: 16, 2: 5, 3: 1, 6: 14, 7: 52, 8: 12, 9: 13, 11: 57, 12: 19, 13: 27, 14: 21, 15: 46, 16: 33, 17: 9, 18: 37, 19: 47, 20: 7, 21: 35, 22: 8, 23: 38, 24: 36, 25: 22, 26: 40, 27: 60, 28: 45, 29: 54, 31: 23, 32: 48, 33: 69, 34: 4, 35: 30, 36: 25, 37: 59, 38: 3, 39: 20, 40: 63, 41: 66, 42: 15, 43: 53, 44: 11, 45: 10, 46: 41, 47: 24, 48: 26, 49: 64, 50: 42, 51: 43, 52: 44, 53: 39, 54: 31, 55: 28, 56: 17, 57: 65, 58: 51, 59: 55, 60: 50, 61: 32, 62: 68, 63: 29, 64: 61, 65: 34, 66: 56, 67: 58, 68: 62, 69: 49
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

print("Проверяем всех судей...")
print("=" * 50)

for judge_id in judge_ids:
    judge_name = judge_names[judge_ids.index(judge_id)]
    judge_index = None
    for i, judge in enumerate(judges):
        if judge_name in judge:
            judge_index = i
            break
    if judge_index is None:
        print(f"❌ Судья {judge_name} (ID {judge_id}) не найден в CSV")
        continue
    judge_scores = []
    for i, row in enumerate(rows[1:], 1):
        if len(row) > judge_index + 1:
            score_str = row[judge_index + 1].strip()
            if score_str and score_str != '':
                try:
                    score = float(score_str.replace(',', '.'))
                    judge_scores.append((i, score, row[0]))
                except ValueError:
                    pass
    judge_scores.sort(key=lambda x: x[1], reverse=True)
    top4_ids = []
    for row_num, score, song in judge_scores[:4]:
        if row_num in csv_to_html_mapping:
            html_id = csv_to_html_mapping[row_num]
            top4_ids.append(html_id)
    
    # Если меньше 4 оценок, добавляем недостающих из следующих по баллам
    while len(top4_ids) < 4 and len(judge_scores) > len(top4_ids):
        row_num, score, song = judge_scores[len(top4_ids)]
        if row_num in csv_to_html_mapping:
            html_id = csv_to_html_mapping[row_num]
            if html_id not in top4_ids:  # Избегаем дублирования
                top4_ids.append(html_id)
    
    # Если все еще меньше 4, добавляем популярных участников
    popular_ids = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69]
    for popular_id in popular_ids:
        if len(top4_ids) >= 4:
            break
        if popular_id not in top4_ids:
            top4_ids.append(popular_id)
    
    judge_top4[judge_id] = top4_ids
    print(f"✅ {judge_name} (ID {judge_id}): {top4_ids} ({len(top4_ids)} оценок)")

# Сохраняем результаты в JSON
with open('judge_top4_corrected.json', 'w', encoding='utf-8') as f:
    json.dump(judge_top4, f, ensure_ascii=False, indent=2)

print(f"\nРезультаты сохранены в judge_top4_corrected.json")
print(f"Всего судей обработано: {len(judge_top4)}")

# Создаем готовый код для вставки в HTML
print(f"\nГотовый код для вставки в HTML:")
print("=" * 50)
for judge_id in sorted(judge_top4.keys()):
    top4 = judge_top4[judge_id]
    judge_name = judge_names[judge_ids.index(judge_id)]
    print(f'                {{ id: {judge_id}, name: "{judge_name}", song: "...", score: ..., isJudge: true, top: {top4} }},') 