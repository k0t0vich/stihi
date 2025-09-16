import csv

def debug_otrad_votes():
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
    print(f"Полное имя: {judges[otrad_index]}")
    
    # Собираем все оценки Отряда Котовскага
    otrad_votes = []
    
    for row_idx, row in enumerate(rows[2:], start=1):  # id песен начинаются с 1
        song_id = row_idx
        song_name = row[0] if row[0] else f"Песня {song_id}"
        
        if otrad_index < len(row) - 2:  # Проверяем, что колонка существует
            score_str = row[otrad_index + 2]  # +2 потому что первые две колонки пустые
            
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
    debug_otrad_votes() 