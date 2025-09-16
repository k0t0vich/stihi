#!/usr/bin/env python3
import csv

# Читаем исходный CSV файл
with open('1.csv', 'r', encoding='utf-8') as file:
    reader = csv.reader(file, delimiter=';')
    rows = list(reader)

# Получаем заголовки (имена судей)
judges = rows[0][1:]  # Пропускаем первую пустую колонку

# Получаем названия песен (первая колонка каждой строки)
songs = []
for row in rows[1:]:
    if row[0].strip():  # Если название песни не пустое
        songs.append(row[0].strip())

print(f"Найдено {len(judges)} судей и {len(songs)} песен")

# Создаем перевернутую таблицу
transposed_data = []

# Заголовок: пустая ячейка + названия песен
header = [''] + songs
transposed_data.append(header)

# Для каждого судьи создаем строку
for i, judge in enumerate(judges):
    judge_row = [judge]  # Первая колонка - имя судьи
    
    # Для каждой песни находим оценку этого судьи
    for song_index, song in enumerate(songs):
        # Находим строку с этой песней в исходном CSV
        original_row_index = None
        for j, row in enumerate(rows[1:], 1):
            if row[0].strip() == song:
                original_row_index = j
                break
        
        if original_row_index is not None and len(rows[original_row_index]) > i + 1:
            score = rows[original_row_index][i + 1].strip()
            judge_row.append(score if score else '')
        else:
            judge_row.append('')
    
    transposed_data.append(judge_row)

# Сохраняем перевернутую таблицу
with open('1_transposed.csv', 'w', encoding='utf-8', newline='') as file:
    writer = csv.writer(file, delimiter=';')
    writer.writerows(transposed_data)

print(f"Перевернутая таблица сохранена в 1_transposed.csv")
print(f"Теперь строки = судьи, столбцы = песни")

# Показываем пример первых нескольких строк
print("\nПример перевернутой таблицы:")
print("=" * 50)
for i, row in enumerate(transposed_data[:5]):  # Показываем первые 5 строк
    print(f"Строка {i}: {row[:5]}...")  # Показываем первые 5 колонок 