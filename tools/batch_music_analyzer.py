import os
import time
import argparse
import glob
import json
import re
from pathlib import Path
import google.generativeai as genai
from typing import List, Dict
from mutagen.easyid3 import EasyID3
from mutagen.id3 import ID3NoHeaderError


# Настройка API (замените на свой ключ или используйте переменную окружения)
API_KEY = os.getenv("GOOGLE_API_KEY")

if not API_KEY:
    print("WARNING: GOOGLE_API_KEY environment variable not set.")
    print("Please set it export GOOGLE_API_KEY='your_key' or add it to the script.")

class GeminiWorker:
    """Агент-исполнитель (Worker), работающий с Gemini API"""
    def __init__(self, model_name="gemini-1.5-pro-latest"):
        if API_KEY:
            genai.configure(api_key=API_KEY)
        self.model = genai.GenerativeModel(model_name)

    def upload_audio(self, file_path: str):
        """Загружает аудиофайл и ждет завершения обработки"""
        print(f"📤 Загрузка файла: {file_path}...")
        audio_file = genai.upload_file(path=file_path)
        
        print(f"⏳ Ожидание обработки аудио (обычно 5-10 сек)...")
        while audio_file.state.name == "PROCESSING":
            time.sleep(2)
            audio_file = genai.get_file(audio_file.name)
        
        if audio_file.state.name == "FAILED":
            raise ValueError(f"Audio processing failed for {file_path}")
            
        print(f"✅ Файл готов: {audio_file.name}")
        return audio_file

    def analyze_track(self, audio_file, system_prompt: str) -> str:
        """Анализирует трек используя системный промпт"""
        print("🧠 Агент начинает анализ трека...")
        
        # Модифицируем промпт, чтобы запросить JSON в конце
        json_instruction = """
        
        IMPORTANT: At the very end of your response, provide a JSON block strictly in the following format containing the genre information. Do not wrap it in markdown code blocks like ```json ... ```, just the raw JSON string starting with { and ending with }.
        
        {
            "primary_genre": "Main Genre",
            "secondary_genres": ["Subgenre 1", "Subgenre 2"]
        }
        """
        
        full_prompt = system_prompt + json_instruction
        
        response = self.model.generate_content(
            [full_prompt, audio_file],
            request_options={"timeout": 600} # Увеличенный таймаут для аудио
        )
        return response.text

    def summarize_album(self, analyses: List[str]) -> str:
        """Создает общее резюме на основе анализов отдельных треков"""
        summary_prompt = "Ты — музыкальный продюсер. Проанализируй эти отчеты по трекам и напиши общее резюме альбома/подборки. Выдели общие паттерны, сильные и слабые стороны."
        combined_text = summary_prompt + "\n\n" + "\n---\n".join(analyses)
        
        print("🎓 Агент-директор формирует итоговый отчет...")
        response = self.model.generate_content(combined_text)
        return response.text

class AnalysisOrchestrator:
    """Оркестратор (Manager Agent), управляющий процессом"""
    def __init__(self, prompt_path: str, input_dir: str, output_dir: str):
        self.worker = GeminiWorker()
        self.input_dir = Path(input_dir)
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        # Чтение системного промпта
        with open(prompt_path, 'r', encoding='utf-8') as f:
            self.system_prompt = f.read()

    def extract_json_tags(self, text: str) -> Dict:
        """Извлекает JSON с тегами из ответа"""
        try:
            # Ищем JSON блок в конце (от последней { до последней })
            start_index = text.rfind('{')
            end_index = text.rfind('}')
            
            if start_index != -1 and end_index != -1:
                json_str = text[start_index : end_index + 1]
                data = json.loads(json_str)
                return data
            return None
        except Exception as e:
            print(f"⚠️ Не удалось извлечь JSON теги: {e}")
            return None

    def update_mp3_tags(self, file_path: Path, tags: Dict):
        """Обновляет ID3 теги файла"""
        if not tags:
            return

        try:
            try:
                audio = EasyID3(file_path)
            except ID3NoHeaderError:
                audio = EasyID3()
                audio.save(file_path)
                audio = EasyID3(file_path)

            primary = tags.get("primary_genre", "Unknown")
            secondaries = tags.get("secondary_genres", [])
            
            # Формируем строку жанров
            if secondaries:
                genre_str = f"{primary} / {' / '.join(secondaries)}"
            else:
                genre_str = primary
                
            audio["genre"] = genre_str
            audio.save()
            print(f"🏷️ Теги обновлены: Genre = {genre_str}")
            
        except Exception as e:
            print(f"❌ Ошибка обновления тегов для {file_path.name}: {e}")

    def run(self):
        mp3_files = list(self.input_dir.glob("*.mp3"))
        if not mp3_files:
            print(f"❌ MP3 файлы не найдены в {self.input_dir}")
            return

        print(f"🎯 Найдено файлов: {len(mp3_files)}")
        all_analyses = []

        for mp3_path in mp3_files:
            try:
                print(f"\n--- Обработка {mp3_path.name} ---")
                
                # 1. Вызов агента для анализа
                audio_ref = self.worker.upload_audio(str(mp3_path))
                analysis_text = self.worker.analyze_track(audio_ref, self.system_prompt)
                
                # 2. Сохранение результата
                output_file = self.output_dir / f"{mp3_path.stem}_analysis.md"
                with open(output_file, "w", encoding="utf-8") as f:
                    f.write(analysis_text)
                
                all_analyses.append(f"Трек: {mp3_path.name}\n{analysis_text}")
                print(f"💾 Результат сохранен: {output_file}")

                # 3. Обновление метатегов
                tags = self.extract_json_tags(analysis_text)
                if tags:
                    self.update_mp3_tags(mp3_path, tags)
                
                # Очистка (удаление файла с серверов Google, чтобы не забивать квоту)
                audio_ref.delete()
                
            except Exception as e:
                print(f"❌ Ошибка при обработке {mp3_path.name}: {e}")

        # 3. Финальное резюме (Агент вызывает Агента)
        if all_analyses:
            print("\n📊 Генерация сводного отчета по всем трекам...")
            album_summary = self.worker.summarize_album(all_analyses)
            with open(self.output_dir / "FULL_ALBUM_SUMMARY.md", "w", encoding="utf-8") as f:
                f.write(album_summary)
            print(f"🏆 Сводный отчет готов: {self.output_dir / 'FULL_ALBUM_SUMMARY.md'}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Music Analysis Agent")
    parser.add_argument("--dir", type=str, required=True, help="Папка с MP3 файлами")
    parser.add_argument("--prompt", type=str, default="prompts/ai_music_analyzer_prompt.md", help="Путь к файлу промпта")
    
    args = parser.parse_args()
    
    orchestrator = AnalysisOrchestrator(
        prompt_path=args.prompt,
        input_dir=args.dir,
        output_dir=os.path.join(args.dir, "analysis_results")
    )
    orchestrator.run()
