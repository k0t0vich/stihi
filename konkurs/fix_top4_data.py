#!/usr/bin/env python3
import json
import re

# Загружаем правильные данные топ-4
with open('judge_top4.json', 'r', encoding='utf-8') as f:
    judge_top4 = json.load(f)

# Читаем HTML файл
with open('../top.html', 'r', encoding='utf-8') as f:
    html_content = f.read()

# Функция для обновления данных участников
def update_participant_data(html_content):
    # Находим начало массива participants
    start_pattern = r'participants: \['
    start_match = re.search(start_pattern, html_content)
    if not start_match:
        print("Не найден массив participants")
        return html_content
    
    start_pos = start_match.end()
    
    # Находим конец массива participants
    end_pattern = r'\],\s*totalJudges:'
    end_match = re.search(end_pattern, html_content[start_pos:])
    if not end_match:
        print("Не найден конец массива participants")
        return html_content
    
    end_pos = start_pos + end_match.start()
    
    # Извлекаем текущие данные участников
    participants_section = html_content[start_pos:end_pos]
    
    # Обновляем данные для каждого судьи
    updated_section = participants_section
    
    # Проходим по всем судьям в judge_top4
    for judge_id, top_ids in judge_top4.items():
        if judge_id == "":  # Пропускаем пустой ключ
            continue
            
        # Ищем строку с данным судьей
        judge_pattern = rf'id: {judge_id}, name: "[^"]+", song: "[^"]*", score: [\d.]+(?:, isJudge: true, top: \[[^\]]+\])?'
        
        def replace_judge_data(match):
            judge_line = match.group(0)
            
            # Извлекаем имя и другие данные
            name_match = re.search(r'name: "([^"]+)"', judge_line)
            song_match = re.search(r'song: "([^"]*)"', judge_line)
            score_match = re.search(r'score: ([\d.]+)', judge_line)
            
            if name_match and song_match and score_match:
                name = name_match.group(1)
                song = song_match.group(1)
                score = score_match.group(1)
                
                # Формируем новую строку с правильными топ-4
                new_line = f'{{ id: {judge_id}, name: "{name}", song: "{song}", score: {score}, isJudge: true, top: {top_ids} }}'
                return new_line
            
            return judge_line
        
        updated_section = re.sub(judge_pattern, replace_judge_data, updated_section)
    
    # Заменяем секцию в HTML
    new_html = html_content[:start_pos] + updated_section + html_content[end_pos:]
    
    return new_html

# Обновляем данные
updated_html = update_participant_data(html_content)

# Сохраняем обновленный файл
with open('../top.html', 'w', encoding='utf-8') as f:
    f.write(updated_html)

print("Данные топ-4 успешно обновлены в top.html") 