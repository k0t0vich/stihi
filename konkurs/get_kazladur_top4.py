#!/usr/bin/env python3
import csv

# Читаем CSV файл
with open('1.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (имена судей)
judges = rows[0][1:]  # Пропускаем первую пустую колонку

# Находим Kazladur Brink
kazladur_index = None
for i, judge in enumerate(judges):
    if "Kazladur Brink" in judge:
        kazladur_index = i
        break

if kazladur_index is None:
    print("Kazladur Brink не найден!")
    exit()

print(f"Kazladur Brink найден в колонке {kazladur_index + 1} (индекс {kazladur_index})")

# Получаем оценки Kazladur Brink
kazladur_scores = []
for i, row in enumerate(rows[1:], 1):  # Нумерация строк начинается с 1
    if len(row) > kazladur_index + 1:  # +1 потому что первая колонка пустая
        score_str = row[kazladur_index + 1].strip()
        if score_str and score_str != '':
            try:
                score = float(score_str.replace(',', '.'))
                kazladur_scores.append((i, score, row[0]))  # (номер строки, оценка, название песни)
            except ValueError:
                pass

# Сортируем по оценкам (по убыванию)
kazladur_scores.sort(key=lambda x: x[1], reverse=True)

print(f"\nВсе оценки Kazladur Brink ({len(kazladur_scores)} оценок):")
for row_num, score, song in kazladur_scores:
    print(f"Строка {row_num}: {song} - {score}")

print(f"\nТоп-4 Kazladur Brink:")
for i, (row_num, score, song) in enumerate(kazladur_scores[:4]):
    print(f"{i+1}. Строка {row_num}: {song} - {score}")

# Маппинг CSV строк -> HTML ID (из предыдущего скрипта)
csv_to_html_mapping = {
    1: 16, 2: 5, 3: 1, 6: 14, 7: 52, 8: 12, 9: 13, 11: 57, 12: 19, 13: 27, 14: 21, 15: 46, 16: 33, 17: 9, 18: 37, 19: 47, 20: 7, 21: 35, 22: 8, 23: 38, 24: 36, 25: 22, 26: 40, 27: 60, 28: 45, 29: 54, 31: 23, 32: 48, 33: 69, 34: 4, 35: 30, 36: 25, 37: 59, 38: 3, 39: 20, 40: 63, 41: 66, 42: 15, 43: 53, 44: 11, 45: 10, 46: 41, 47: 24, 48: 26, 49: 64, 50: 42, 51: 43, 52: 44, 53: 39, 54: 31, 55: 28, 56: 17, 57: 65, 58: 51, 59: 55, 60: 50, 61: 32, 62: 68, 63: 29, 64: 61, 65: 34, 66: 56, 67: 58, 68: 62, 69: 49
}

print(f"\nПравильный топ-4 для Kazladur Brink:")
correct_top4 = []
for row_num, score, song in kazladur_scores[:4]:
    if row_num in csv_to_html_mapping:
        html_id = csv_to_html_mapping[row_num]
        correct_top4.append(html_id)
        print(f"CSV строка {row_num}: {song} (оценка {score}) -> HTML ID {html_id}")

print(f"\nФинальный топ-4 ID для HTML: {correct_top4}") 