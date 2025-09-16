import csv
import json

# Читаем CSV файл с голосованием
def read_voting_data():
    voting_data = {}
    with open('voting_table_songs_as_ids.csv', 'r', encoding='utf-8') as file:
        reader = csv.reader(file, delimiter=';')
        headers = next(reader)  # Первая строка - заголовки (id судей)
        
        # Обрабатываем каждую строку (песня)
        for row in reader:
            if len(row) > 1:
                song_id = row[0]  # ID песни
                scores = row[1:]  # Оценки от судей
                
                # Для каждого судьи (по колонкам)
                for i, score in enumerate(scores):
                    if score and score.strip() and score != '':  # Если есть оценка
                        try:
                            judge_id = headers[i] if i < len(headers) else str(i+1)
                            if judge_id not in voting_data:
                                voting_data[judge_id] = {}
                            voting_data[judge_id][song_id] = float(score.replace(',', '.'))
                        except ValueError:
                            # Пропускаем некорректные значения
                            continue
    
    return voting_data

# Находим топ-4 для каждого судьи
def find_top4_for_judges(voting_data):
    judge_top4 = {}
    
    for judge_id, scores in voting_data.items():
        # Сортируем песни по оценкам (убывание)
        sorted_songs = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        
        # Берем топ-4
        top4 = [int(song_id) for song_id, score in sorted_songs[:4]]
        judge_top4[judge_id] = top4
    
    return judge_top4

# Читаем данные участников из HTML
def read_participants_from_html():
    participants = []
    
    # Читаем HTML файл
    with open('../index.html', 'r', encoding='utf-8') as file:
        content = file.read()
    
    # Ищем секцию с participants
    start = content.find('participants: [')
    if start == -1:
        return participants
    
    # Извлекаем JSON-like данные
    start += len('participants: [')
    brace_count = 1
    end = start
    
    for i, char in enumerate(content[start:], start):
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
            if brace_count == 0:
                end = i + 1
                break
    
    participants_section = content[start:end]
    
    # Парсим участников (упрощенный парсинг)
    lines = participants_section.split('\n')
    current_participant = {}
    
    for line in lines:
        line = line.strip()
        if line.startswith('{'):
            current_participant = {}
        elif line.startswith('id:'):
            current_participant['id'] = int(line.split(':')[1].split(',')[0].strip())
        elif line.startswith('name:'):
            name = line.split('"')[1] if '"' in line else line.split(':')[1].split(',')[0].strip()
            current_participant['name'] = name
        elif line.startswith('isJudge:'):
            is_judge = 'true' in line.lower()
            current_participant['isJudge'] = is_judge
        elif line.startswith('}'):
            if current_participant:
                participants.append(current_participant)
    
    return participants

# Основная функция
def main():
    print("Анализируем данные голосования...")
    
    # Читаем данные голосования
    voting_data = read_voting_data()
    print(f"Найдено {len(voting_data)} судей с оценками")
    
    # Находим топ-4 для каждого судьи
    judge_top4 = find_top4_for_judges(voting_data)
    
    # Выводим результаты
    print("\nТоп-4 для каждого судьи:")
    for judge_id, top4 in judge_top4.items():
        print(f"Судья {judge_id}: {top4}")
    
    # Сохраняем результаты в JSON
    with open('judge_top4.json', 'w', encoding='utf-8') as file:
        json.dump(judge_top4, file, indent=2, ensure_ascii=False)
    
    print(f"\nРезультаты сохранены в judge_top4.json")

if __name__ == "__main__":
    main() 