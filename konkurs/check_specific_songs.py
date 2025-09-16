import csv

def check_specific_songs():
    # Читаем CSV файл
    with open('Таблица-Tаблица 1.csv', 'r', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=';')
        rows = list(reader)
    
    # Получаем заголовки (имена судей)
    judges = rows[1][1:58]  # Пропускаем первые две пустые колонки
    
    # Находим индекс Отряда Котовскага
    otrad_index = None
    for i, judge in enumerate(judges):
        if "Константин Бондаренко (Отряд Котовскага)" in judge:
            otrad_index = i
            break
    
    print(f"Отряд Котовскага найден в колонке {otrad_index + 1} (индекс {otrad_index})")
    
    # Ищем конкретные песни, которые вы упомянули
    target_songs = [
        "Гречка - наше всё - PoulSoul",
        "Цвет ночи - NadinKa", 
        "Чезабретта - Наташка Дьякова & SAI",
        "Notice.me - Kazladur"
    ]
    
    print("\nПоиск конкретных песен:")
    for song_name in target_songs:
        for row_idx, row in enumerate(rows[2:], start=1):
            if song_name in row[0]:
                score_str = row[otrad_index + 2] if otrad_index < len(row) - 2 else "нет данных"
                print(f"ID {row_idx}: {row[0]}")
                print(f"  Оценка Отряда Котовскага: {score_str}")
                break
        else:
            print(f"Песня '{song_name}' не найдена")
    
    # Также проверим все строки с оценками Отряда Котовскага
    print(f"\nВсе оценки Отряда Котовскага (сырые данные):")
    for row_idx, row in enumerate(rows[2:], start=1):
        if otrad_index < len(row) - 2:
            score_str = row[otrad_index + 2]
            if score_str and score_str.strip():
                print(f"ID {row_idx}: {row[0]} - {score_str}")

if __name__ == "__main__":
    check_specific_songs() 