import csv
import json

def update_top4_from_csv():
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
    
    # Выводим результаты
    print("Топ-4 для каждого судьи:")
    for judge_name, top4 in judge_top4.items():
        print(f"{judge_name}: {top4}")
    
    return judge_top4

if __name__ == "__main__":
    update_top4_from_csv() 