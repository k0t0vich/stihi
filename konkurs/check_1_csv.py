import csv

def check_1_csv():
    # Читаем CSV файл
    with open('1.csv', 'r', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=';')
        rows = list(reader)
    
    # Получаем заголовки (имена судей)
    judges = rows[0][1:]  # Пропускаем первую пустую колонку
    
    # Находим индекс Отряда Котовскага
    otrad_index = None
    for i, judge in enumerate(judges):
        if "Отряд Котовскага" in judge:
            otrad_index = i
            break
    
    print(f"Отряд Котовскага найден в колонке {otrad_index + 1} (индекс {otrad_index})")
    print(f"Полное имя: {judges[otrad_index]}")
    
    # Ищем конкретные песни, которые вы упомянули
    target_songs = [
        "Гречка - наше всё - PoulSoul",
        "Цвет ночи - NadinKa", 
        "Чезабретта - Наташка Дьякова & SAI",
        "Notice.me - Kazladur"
    ]
    
    print("\nПоиск конкретных песен:")
    for song_name in target_songs:
        for row_idx, row in enumerate(rows[1:], start=1):
            if song_name in row[0]:
                score_str = row[otrad_index + 1] if otrad_index < len(row) - 1 else "нет данных"
                print(f"ID {row_idx}: {row[0]}")
                print(f"  Оценка Отряда Котовскага: {score_str}")
                break
        else:
            print(f"Песня '{song_name}' не найдена")
    
    # Собираем все оценки Отряда Котовскага
    otrad_votes = []
    
    for row_idx, row in enumerate(rows[1:], start=1):  # id песен начинаются с 1
        song_id = row_idx
        song_name = row[0] if row[0] else f"Песня {song_id}"
        
        if otrad_index < len(row) - 1:  # Проверяем, что колонка существует
            score_str = row[otrad_index + 1]  # +1 потому что первая колонка пустая
            
            if score_str and score_str.strip():
                try:
                    score = float(score_str.replace(',', '.'))
                    otrad_votes.append((song_id, song_name, score))
                except ValueError:
                    continue
    
    # Сортируем по убыванию оценок
    otrad_votes.sort(key=lambda x: x[2], reverse=True)
    
    print(f"\nВсе оценки Отряда Котовскага ({len(otrad_votes)} оценок):")
    for song_id, song_name, score in otrad_votes:
        print(f"ID {song_id}: {song_name} - {score}")
    
    print(f"\nТоп-4 Отряда Котовскага:")
    for i, (song_id, song_name, score) in enumerate(otrad_votes[:4]):
        print(f"{i+1}. ID {song_id}: {song_name} - {score}")
    
    return otrad_votes

if __name__ == "__main__":
    check_1_csv() 