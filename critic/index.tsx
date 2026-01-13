/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from '@google/genai';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// --- Safe Element Getter ---
function getEl<T extends HTMLElement>(id: string): T | null {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Element with ID '${id}' not found.`);
        return null;
    }
    return el as T;
}

// --- DOM Elements ---
// We use a lazy initialization or checks to prevent crashes if HTML structure changes
const fileInput = getEl<HTMLInputElement>('file-upload');
const fileNameSpan = getEl<HTMLSpanElement>('file-name');
const lyricsInput = getEl<HTMLTextAreaElement>('lyrics-input');
const trackNoteInput = getEl<HTMLTextAreaElement>('track-note');
const submitButton = getEl<HTMLButtonElement>('submit-button');
const loader = getEl<HTMLDivElement>('loader');
const resultText = getEl<HTMLDivElement>('result-text');
const modelSelector = getEl<HTMLSelectElement>('model-selector');
const toneSelector = getEl<HTMLSelectElement>('tone-selector');
const scoreSummaryContainer = getEl<HTMLElement>('score-summary-container');

const selectKeyBtn = getEl<HTMLButtonElement>('select-key-btn');
const keyStatus = getEl<HTMLSpanElement>('key-status');
const connectionHint = getEl<HTMLDivElement>('connection-hint');

// Player Elements
const audioPlayerContainer = getEl<HTMLDivElement>('audio-player-container');
const audioElement = getEl<HTMLAudioElement>('audio-element');
const playPauseBtn = getEl<HTMLButtonElement>('play-pause-btn');
const progressBar = getEl<HTMLDivElement>('progress-bar');
const progressContainer = document.querySelector('.progress-container') as HTMLDivElement;
const timeDisplay = getEl<HTMLSpanElement>('time-display');

// --- App State ---
let audioFile: File | null = null;
let currentCritiqueData: any = null;
let isPlaying = false;
let animationFrameId: number;

// --- API Key Management ---
async function checkKeyStatus() {
  const isAIStudio = !!(window as any).aistudio;
  
  if (!selectKeyBtn || !keyStatus || !submitButton) return;

  // 1. Check if we are in AI Studio environment
  if (isAIStudio) {
      selectKeyBtn.hidden = false;

      const hasKey = await (window as any).aistudio.hasSelectedApiKey();
      if (hasKey) {
        keyStatus.textContent = '● AI Studio';
        keyStatus.className = 'status-indicator key-status key-ok';
        keyStatus.title = "Ключ успешно подключен через AI Studio";
        if (connectionHint) connectionHint.hidden = true;
        
        submitButton.textContent = 'ЗАПУСТИТЬ АНАЛИЗ';
        updateSubmitButtonState();
        return;
      }
  } 
  
  // 2. Check if API Key is already provided via Environment
  if (process.env.API_KEY && process.env.API_KEY.length > 0) {
      keyStatus.textContent = '● Server';
      keyStatus.className = 'status-indicator key-status key-ok';
      keyStatus.title = "Используется системный ключ";
      if (connectionHint) connectionHint.hidden = true;
      submitButton.textContent = 'ЗАПУСТИТЬ АНАЛИЗ';
      
      if (!isAIStudio) {
        selectKeyBtn.hidden = true;
      }
      
      updateSubmitButtonState();
      return;
  }

  // 3. Not connected
  keyStatus.textContent = '○ Нет ключа';
  keyStatus.className = 'status-indicator key-status key-missing';
  if (connectionHint) connectionHint.hidden = false;
  // submitButton.textContent = 'Сначала подключите ключ';
  // submitButton.disabled = true;
  updateSubmitButtonState(); // Let the button state update handle disabled/enabled based on file too
  
  if (!isAIStudio) {
    selectKeyBtn.hidden = true;
  }
}

if (selectKeyBtn) {
    selectKeyBtn.addEventListener('click', async () => {
      if ((window as any).aistudio) {
          await (window as any).aistudio.openSelectKey();
          
          keyStatus!.textContent = '⟳ ...';
          
          setTimeout(() => {
              checkKeyStatus();
          }, 500);
      } else {
          alert("В этом режиме выбор ключа недоступен.");
      }
    });
}

// --- Audio Player Functions ---
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateProgress() {
  if (!audioElement || !progressBar || !timeDisplay) return;

  if (audioElement.duration) {
    const percent = (audioElement.currentTime / audioElement.duration) * 100;
    progressBar.style.width = `${percent}%`;
    timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(audioElement.duration)}`;
  }
  
  if (isPlaying) {
    animationFrameId = requestAnimationFrame(updateProgress);
  }
}

function togglePlayPause() {
  if (!audioElement || !playPauseBtn) return;

  if (audioElement.paused) {
    audioElement.play();
    isPlaying = true;
    playPauseBtn.textContent = '⏸';
    updateProgress();
  } else {
    audioElement.pause();
    isPlaying = false;
    playPauseBtn.textContent = '▶';
    cancelAnimationFrame(animationFrameId);
  }
}

function stopAudio() {
    if (!audioElement || !playPauseBtn) return;

    audioElement.pause();
    audioElement.currentTime = 0;
    isPlaying = false;
    playPauseBtn.textContent = '▶';
    cancelAnimationFrame(animationFrameId);
    updateProgress();
}

function setupAudioPlayer(file: File) {
  if (!audioElement || !audioPlayerContainer || !timeDisplay || !playPauseBtn) return;

  const url = URL.createObjectURL(file);
  audioElement.src = url;
  
  stopAudio();
  audioPlayerContainer.hidden = false;
  
  audioElement.onloadedmetadata = () => {
    timeDisplay.textContent = `0:00 / ${formatTime(audioElement.duration)}`;
  };
  
  audioElement.onended = () => {
      isPlaying = false;
      playPauseBtn.textContent = '▶';
      cancelAnimationFrame(animationFrameId);
  };
}

if (playPauseBtn) playPauseBtn.addEventListener('click', togglePlayPause);

if (progressContainer) {
    progressContainer.addEventListener('click', (e) => {
      if (!audioElement || !progressBar || !timeDisplay) return;

      const width = progressContainer.clientWidth;
      const clickX = e.offsetX;
      const duration = audioElement.duration;
      
      if (duration) {
          audioElement.currentTime = (clickX / width) * duration;
          if (!isPlaying) {
              const percent = (audioElement.currentTime / duration) * 100;
              progressBar.style.width = `${percent}%`;
              timeDisplay.textContent = `${formatTime(audioElement.currentTime)} / ${formatTime(duration)}`;
          }
      }
    });
}

// --- Gemini AI Setup ---

const SUNO_TAGS_REFERENCE = `
**Suno AI Tag Dictionary**

**1. Header Meta-Data Tags (Global Song Settings):**
Use these at the very beginning of the prompt to define the overall sound.
*   [style]: Genre, era, specific sub-genres (e.g., [style: 90s Alternative Rock, Grunge]).
*   [vocal]: Gender, voice texture, delivery style (e.g., [vocal: Raspy Male Voice, Emotional, Strained]).
*   [instrumentation]: List of key instruments (e.g., [instrumentation: Acoustic Guitar, Cello, Brush Drums]).
*   [mood]: Emotional atmosphere (e.g., [mood: Melancholic, Intimate]).
*   [tempo]: BPM and Groove description (e.g., [tempo: 92 BPM | groove: Slow, deliberate]).
*   [mix]: Production qualities, acoustic space (e.g., [mix: Live Unplugged Session, Room Reverb]).

**2. Structural Meta-Tags (Place at start of section):**
[Intro], [Verse], [Pre-Chorus], [Chorus], [Bridge], [Outro], [Hook], [Break], [Interlude], [Solo], [Instrumental Break], [Drop], [Build], [Ending].

**3. Vocal Tags (Voice & Delivery):**
*   **Gender:** [Male Vocal], [Female Vocal].
*   **Style:** [Raspy], [Whisper], [Belting], [Ethereal], [Guttural], [Screaming], [Rap], [Spoken Word], [Choral], [Gregorian Chant], [Pop Vocals], [Opera], [Autotune].
*   **Arrangement:** [Stacked Harmonies], [Backing Vocals], [Duet], [A Cappella], [Group Vocals].

**4. Instrumental Tags:**
*   **Guitar:** [Acoustic Guitar], [Electric Guitar], [Distorted Guitar], [Clean Guitar], [Fingerstyle], [Power Chords], [Guitar Solo].
*   **Bass:** [Bass Guitar], [Upright Bass], [Synth Bass], [808 Bass], [Slap Bass].
*   **Drums:** [Acoustic Drums], [Electronic Drums], [Drum Machine], [Heavy Drums], [Blast Beats], [Percussion].
*   **Keys/Synth:** [Piano], [Grand Piano], [Synthesizer], [Pad], [Arpeggio], [Strings], [Violin], [Cello], [Orchestra].

**5. Mood & Production Tags:**
*   **Atmosphere:** [Dark], [Bright], [Melancholic], [Uplifting], [Epic], [Cinematic], [Eerie], [Dreamy], [Nostalgic], [Aggressive], [Relaxing].
*   **Production:** [Lo-fi], [Hi-Fi], [Reverb], [Delay], [Distortion], [Tape Saturation], [Vinyl Crackle], [Minimal], [Wall of Sound], [Wide Stereo].
*   **Tempo/Rhythm:** [Fast], [Slow], [Mid-tempo], [Double Time], [Half Time], [Syncopated], [Groovy].

**Usage Rule:** Combine tags using pipes or commas, e.g., \`[Verse 1 | Raspy Male Vocal | Acoustic Guitar]\`.
`;

const responseSchema = {
    type: Type.OBJECT,
    properties: {
        technicalReport: {
            type: Type.OBJECT,
            properties: {
                structureAndComposition: {
                    type: Type.OBJECT,
                    properties: {
                        structureMap: { type: Type.STRING, description: "Полная карта трека для Suno. ОБЯЗАТЕЛЬНО должна начинаться с блока мета-данных ([style], [vocal]...), за которым следует таймлайн структуры ([Intro], [Verse]...). Используй тег [chords: ...] для указания аккордов в секциях." },
                        standardCompliance: { type: Type.STRING, description: "Соответствие стандарту" },
                        introDuration: { type: Type.STRING, description: "Длительность интро" },
                        outroDuration: { type: Type.STRING, description: "Длительность аутро" },
                        endingType: { type: Type.STRING, description: "Тип окончания" }
                    },
                    required: ["structureMap", "standardCompliance", "introDuration", "outroDuration", "endingType"]
                },
                sunoStylePrompt: {
                    type: Type.OBJECT,
                    properties: {
                         styleDescription: { type: Type.STRING, description: "Подробное описание стиля на английском (до 1000 символов) для генерации в Suno." },
                         classification: { type: Type.STRING, description: "Жанровая классификация (основной и вторичные)" },
                         genreMarkers: { type: Type.STRING, description: "Жанровые маркеры" },
                         modernityScore: { type: Type.STRING, description: "Оценка современности" },
                         similarTracks: { type: Type.STRING, description: "Список из 3-4 групп и песен. Если песня на русском — обязательно включи русские аналоги (по тексту/вайбу) и иностранные (по музыке/стилю)." }
                    },
                    required: ["styleDescription", "classification", "genreMarkers", "modernityScore", "similarTracks"]
                },
                harmonyAndMelody: {
                     type: Type.OBJECT,
                     properties: {
                         key: { type: Type.STRING, description: "Тональность" },
                         harmonyComplexity: { type: Type.STRING, description: "Сложность гармонии" },
                         vocalRange: { type: Type.STRING, description: "Вокальный диапазон" },
                         melodicProgressions: { type: Type.STRING, description: "Основные мелодические ходы (описание)" },
                         chords: { type: Type.STRING, description: "Аккордовые последовательности для основных частей (Intro, Verse, Chorus). Пример: Verse: Am-F-C-G" }
                     },
                     required: ["key", "harmonyComplexity", "vocalRange", "melodicProgressions", "chords"]
                },
                rhythmAndGroove: {
                    type: Type.OBJECT,
                     properties: {
                         bpm: { type: Type.STRING, description: "Темп (BPM)" },
                         rhythmicBasis: { type: Type.STRING, description: "Ритмическая основа" },
                         syncopationLevel: { type: Type.STRING, description: "Уровень синкопирования" }
                     },
                     required: ["bpm", "rhythmicBasis", "syncopationLevel"]
                },
                textAndVocals: {
                    type: Type.OBJECT,
                     properties: {
                         rhymeScheme: { type: Type.STRING, description: "Схема рифмовки" },
                         lexicalDiversity: { type: Type.STRING, description: "Лексическое разнообразие" },
                         dynamicRange: { type: Type.STRING, description: "Динамический диапазон вокала" }
                     },
                     required: ["rhymeScheme", "lexicalDiversity", "dynamicRange"]
                },
                summaryAnalysis: {
                    type: Type.OBJECT,
                     properties: {
                         knownTrack: { type: Type.STRING, description: "Заполняй ТОЛЬКО если это 100% кавер или оригинал известного хита. Формат: 'Распознан хит: [Название - Исполнитель]'. Если это просто похожая песня или авторская работа - пиши СТРОГО 'Оригинальная композиция'." },
                         genreCompliance: { type: Type.STRING, description: "Соответствие жанру и уникальность" },
                         compositionSummary: { type: Type.STRING, description: "Резюме по композиции" },
                         textMelodySummary: { type: Type.STRING, description: "Резюме по тексту и мелодике" }
                     },
                     required: ["knownTrack", "genreCompliance", "compositionSummary", "textMelodySummary"]
                },
                tags: {
                    type: Type.STRING,
                    description: "Список из 3-5 тегов на английском. Сначала ОБЩИЕ жанры, затем СПЕЦИФИЧЕСКИЕ поджанры (например: Electronic, Breakbeat, Big Beat)."
                }
            },
            required: ["structureAndComposition", "sunoStylePrompt", "harmonyAndMelody", "rhythmAndGroove", "textAndVocals", "summaryAnalysis", "tags"]
        },
        poeticAnalysis: {
            type: Type.STRING,
            description: "Развернутая комплексная рецензия (текст + музыка) в формате Markdown. ОБЯЗАТЕЛЬНО следуй структуре: 1. Детальный разбор по критериям (Тема, Образы, Ритмика, Рифмовка, Хуковость, Мелодия, Аранжировка, Вокал, Микс, Композиция) - каждый пункт с оценкой X/10 и комментарием. 2. Анализ настроения. 3. Что понравилось. 4. Критика. 5. Вердикт. 6. Итоговая таблица баллов (Текст X/50 + Музыка Y/50 = Z/100)."
        }
    },
    required: ["technicalReport", "poeticAnalysis"]
};

function getFullSystemInstruction(tone: string) {
    let roleDescription = "";
    let toneDescription = "";
    let scoreGuidelines = "";

    switch (tone) {
        case 'praise':
            roleDescription = "Роль: Восторженный фанат и добрый музыкальный критик. Ты ищешь бриллианты даже в куче угля.";
            toneDescription = "Тон: Позитивный, вдохновляющий, с ЮМОРОМ. Используй яркие метафоры, хвали за любые удачные моменты. Минусы подавай очень мягко, как 'зоны роста'. Шути по-доброму.";
            scoreGuidelines = `
            РУКОВОДСТВО ПО ОЦЕНКЕ (ДЛЯ КАЖДОГО ПУНКТА ИЗ 10 БАЛЛОВ):
            *   **10/10**: Хорошо / Отлично. (Если нравится — ставь максимум).
            *   **8-9/10**: Есть мелкие недочеты, но в целом круто.
            *   **6-7/10**: Слабовато, но мы хвалим за попытку.
            *   **5/10**: Ну, могло быть и лучше (это минимум, ниже не ставь).
            `;
            break;
        case 'roast':
            roleDescription = "Роль: Токсичный, саркастичный критик-сноб (в духе злобных комментаторов YouTube или BadComedian).";
            toneDescription = "Тон: Едкий, ироничный, беспощадный. Используй черный ЮМОР и сарказм. Высмеивай клише, плохие рифмы и скучную музыку. Не стесняйся в выражениях (но без мата). Критика должна быть уничижительной.";
            scoreGuidelines = `
            РУКОВОДСТВО ПО ОЦЕНКЕ (ДЛЯ КАЖДОГО ПУНКТА ИЗ 10 БАЛЛОВ):
            *   **0-2/10**: Плохо / Ужасно / Кровь из ушей. (Базовая оценка для шлака).
            *   **3-4/10**: Скучно / Банально / "Нормально" (для серости).
            *   **5-7/10**: Неожиданно неплохо (для реально достойных моментов).
            *   **8+/10**: Шедевр (ставь только если это уровень Queen или Pink Floyd).
            `;
            break;
        case 'neutral':
        default:
            roleDescription = "Роль: Строгий музыкальный продюсер и арт-директор топ-лейбла. Ты ищешь уникальное звучание и 'бриллианты', отсеивая проходной материал.";
            toneDescription = `Тон: Сухой, профессиональный, требовательный. Твоя цель — не хвалить, а выявлять недостатки по фактам, чтобы автор мог расти.
            ГЛАВНЫЕ ПРИНЦИПЫ:
            1. БОРЬБА С СЕРОСТЬЮ: Мы ищем идеал. Обычный, 'нормальный' трек — это не успех, это посредственность.
            2. КЛИШЕ И ЖАНРОВОСТЬ: Если трек просто 'хорошо попадает в жанр', но не предлагает ничего нового (звучит шаблонно) — это МАКСИМУМ 4 балла из 10 по параметру. Стандартная 'жвачка' не должна получать высокие баллы.
            3. ОШИБКИ: Любая ошибка (в ритме, рифме, сведении, логике) автоматически опускает оценку НИЖЕ 5 баллов из 10.
            4. ХВАЛИ ТОЛЬКО УНИКАЛЬНОЕ: Высокие баллы (8+) давай только за свежие идеи, необычные ходы и безупречное качество.`;
            scoreGuidelines = `
            РУКОВОДСТВО ПО ОЦЕНКЕ ОТДЕЛЬНЫХ КРИТЕРИЕВ (Тема, Рифма, Мелодия и т.д.) ИЗ 10 БАЛЛОВ:
            (Применяй эту шкалу к каждому из 10 пунктов отдельно!)
            *   **9-10/10**: Исключительный шедевр, новое слово в музыке. Без ошибок.
            *   **7-8/10**: Профессионально, качественно И оригинально.
            *   **6/10**: Крепкая работа, качественно, но не хватает "изюминки".
            *   **5/10**: Технически верно, но СКУЧНО / "Просто норм". (Потолок для "обычного" трека).
            *   **4/10**: ШАБЛОН / КЛИШЕ. Звучит чисто, но вторично и предсказуемо.
            *   **2-3/10**: Есть явные ошибки, технический брак или слабый текст.
            *   **0-1/10**: Невозможно слушать.
            `;
            break;
    }

    return `
Ты выполняешь две параллельные задачи:

**ЗАДАЧА 1: ТЕХНИЧЕСКИЙ АНАЛИЗ (Поле \`technicalReport\`)**
Роль: \`AI Music Technical Analyst\`.
Цель: Провести объективный технический и структурный анализ трека.
Важно: В ЭТОЙ части ЗАПРЕЩЕНО давать субъективные оценки ("хорошо", "плохо"). Только факты.

    1.  **Структура и Композиция (Suno Reverse Engineering)**:
        Вместо простого текста, восстанови структуру трека в формате профессионального промпта для Suno AI (на английском языке).
        Ты ДОЛЖЕН использовать теги из предоставленного справочника **Suno AI Tag Dictionary**.
        
        **REFERENCE DICTIONARY:**
        ${SUNO_TAGS_REFERENCE}
        
        **Формат вывода (строго соблюдай этот шаблон):**
        Ты обязан включить ОБЕ части в поле \`structureMap\`: сначала мета-данные, затем таймлайн.
        
        **ЧАСТЬ 1: HEADER META-DATA (Вставь это в самом начале):**
        [style: Detailed style description with era and references]
        [vocal: Detailed vocal description with gender, tone, and delivery]
        [instrumentation: Detailed list of instruments]
        [mood: Mood descriptors]
        [tempo: BPM | groove: Groove description | energy: Energy level]
        [mix: Mixing and production details]
        
        **ЧАСТЬ 2: TIMELINE (Detailed Tags):**
        Используй формат: \`[Section Type | Style/Voice Tags | Chords: ... | Duration]\`
        ВАЖНО:
        1. Каждый тег секции пиши с новой строки.
        2. Текст песни (если есть) пиши СТРОГО с новой строки после тега. ВСТАВЛЯЙ ВЕСЬ РАСПОЗНАННЫЙ ТЕКСТ (не сокращай, не используй многоточия, пиши полный текст куплета/припева).
        3. Между окончанием текста одной секции и началом следующего тега делай пустую строку (отступ).
        4. Если можешь определить аккорды, добавляй их в тег секции (например, \`| Chords: Am - G - F\`). Если не уверен — пропусти.
        
        *Пример полного ответа:*
        [style: 1990s Acoustic Rock / Alternative Rock]
        [vocal: Male voice like Kurt Cobain — strained, raw, emotional]
        [instrumentation: Acoustic-electric guitar, acoustic bass, stripped-down drum kit]
        [mood: Intimate, melancholic, somber]
        [tempo: 92 BPM | groove: Slow, deliberate | energy: Subdued]
        [mix: Simulates a live, intimate studio session]
        
        [Intro | Acoustic Guitar fingerpicking, lo-fi texture | Chords: Em - G - A - C | 0:00-0:15]
        
        [Verse 1 | Raspy male vocal, intimate delivery | Chords: Em - G - A - C | 0:15-0:45]
        I walked down the lonely road
        And saw the shadow of my soul
        
        [Pre-Chorus | Building energy, rising synth | Chords: C - D - Em | 0:45-1:00]
        
        [Chorus | Anthemic, stacked harmonies, heavy drums | Chords: G - D - Am - C | 1:00-1:30]
        We are the champions
        My friends
        
        [Outro | Fading feedback | 2:50-3:00]
        
        Описывай инструменты, звучание и стилистику каждого куска.
        ВСЕ ОСТАЛЬНЫЕ ЧАСТИ ОТЧЕТА (кроме тегов и промптов Suno) ДОЛЖНЫ БЫТЬ НА РУССКОМ ЯЗЫКЕ.


2.  **Suno Style Prompt (English)**:
    Create a detailed, narrative style description for Suno AI (max 1000 chars, ideal ~800).
    Combine genre, voice, instrumentation, mood, rhythm, and production details into a cohesive paragraph.
    
    *Important:* Do not use generic style names only. Be specific with subgenres (e.g., instead of "Electronic", use "Big Beat, UK Garage, 90s Jungle").
    
    *Focus heavily on vocal description:* Gender, tone (raspy, clear, belting), delivery style, and emotional intent.
    *Include:* Instrumentation details (playing style), tempo/BPM, key/mood, and mixing characteristics.
    
    *Reference Guide:*
    ${SUNO_TAGS_REFERENCE}
    
    *Example:*
    "A melancholic folk ballad in a minor key, featuring a female vocalist with a clear, expressive voice. The instrumentation includes an acoustic guitar playing arpeggiated chords, a cello providing a rich, sustained counter-melody, and a subtle, almost imperceptible percussion track that emphasizes the downbeats. The tempo is slow, around 60-70 BPM. The production is clean, with the vocals prominent in the mix, and the instruments providing a warm, supportive bed. There is a slight reverb on the vocals, adding to the emotional depth. The chord progression is primarily i-VI-VII-III in a minor key, creating a sense of longing and sadness."

    **Дополнительно для JSON:**
    *   **Similar Tracks**: Укажи 3-4 конкретные группы и песни (Референсы). ВАЖНО: Если анализируемая песня на русском языке, ОБЯЗАТЕЛЬНО приведи примеры русскоязычных исполнителей (схожесть по тексту, вайбу, культурному коду), а также иностранных (схожесть по музыке, аранжировке, стилю).

3.  **Гармония и Мелодия**:
    *   Тональность, сложность гармонии, вокальный диапазон.
    *   **Melodic Progressions**: Опиши основные мелодические ходы.
    *   **Chords**: Выпиши аккордовые последовательности для основных частей (Intro, Verse, Chorus, Bridge). Используй стандартную нотацию (Am, G7, Cmaj7 и т.д.).

4.  **Ритм и Грув**: BPM, ритмическая основа, синкопирование. (На русском)
5.  **Текст и Вокал (Технически)**: Схема рифмовки, лексическое разнообразие, динамический диапазон. Удели внимание разнообразности припевов и куплетов, распиши схемы - хорей, анапест, смешанное.. (На русском)
6.  **Сводный Технический Анализ**: Резюме по жанру, композиции и просодии. (На русском)
    *   **Распознавание хита**: Заполняй поле knownTrack ТОЛЬКО если ты уверен, что это кавер или оригинал известного хита. Если песня просто *похожа* по стилю или напоминает что-то — пиши "Оригинальная композиция", а похожесть опиши в поле similarTracks. Не путай вдохновение с кавером!
7.  **Теги**: 3-5 тегов на английском. Сначала ОБЩИЕ жанры, затем СПЕЦИФИЧЕСКИЕ поджанры (например: Electronic, Breakbeat, Big Beat).

**ЗАДАЧА 2: КОМПЛЕКСНАЯ РЕЦЕНЗИЯ (Поле \`poeticAnalysis\`)**
*** ТЕКУЩИЙ РЕЖИМ: ${tone.toUpperCase()} (Следуй инструкциям ниже!) ***
${roleDescription}
${toneDescription}
${scoreGuidelines}

Задача: Написать полноценную рецензию, оценив текст (50 баллов) и, если есть аудио, музыку (50 баллов). Итого: 100 баллов.

   **Формат вывода:**
   Структура отзыва (обязательно используй абзацы и все пункты рецензии :
   **ЧАСТЬ 1: ЛИТЕРАТУРНАЯ ОЦЕНКА (Макс. 50 баллов)**

   ОЦЕНКИ должны соответсвовать тону -  оценка считается по ${scoreGuidelines}, по каждому пункту.

1.  **Тема и Концепция**
    *   Анализ: Есть ли в тексте идея? Помогает ли она посылу песни?
    *   Оценка (из 10):
2.  **Образы и метафоры**
    *   Анализ: Красивые ли художественные образы? Или стандартные клише? *Обрати внимание: нет ли ощущения "нейротекста" (бессмысленный пафос, "лабиринты души", "неоновые огни" без контекста)? Но будь осторожен с вердиктом, обвиняй в ИИ только при явных признаках.*
    *   Оценка (из 10):
3.  **Ритмика и метрика**
    *   Анализ: Есть ли ритмические казусы? Насколько текст ложится на ритм? ВЫдержаны ли размеры или гуляют от строчки к строчке. Насколько куплеты ровные. Плохо когда ритм не выдеражн, нет како-то рисунка. Но не обязательно должно быть квадратно. Хорошо когда куплеты в одном ритме а припев в другом, Плохо года каждая строчка разного размера, для ржпа могут быть исключения, но слушатель должен всё таки не путаться в тексте и ловить какой-то , хзоть и слодный рисунок. если каша - то снижаем баллы.
    *   Оценка (из 10):
4.  **Рифмовка**
    *   Анализ: Качество рифм. Рифмы должны быть красивыми, нестандартными, не предсказуемыми. Рифмы должны быть связаны с темой песни. Рифмы должны быть связаны с текстом песни. Рифмы должны быть связаны с мелодией песни. Рифмы должны быть связаны с аранжировкой песни. Рифмы должны быть связаны с исполнением песни. Рифмы должны быть связаны с миксом песни. Рифмы должны быть связаны с композицией песни.
    *   Оценка (из 10):
5.  **Хуковость**
    *   Анализ: Формирует ли текст правильные мысли у слушателя? Звучит ли он по-человечески? Есть ли в тексте "крючки" — цепляющие моменты, которые остаются в памяти? Выражен ли припев, достаточно ли он цеплят (если в рамках жанра)
    *   *ДЕТЕКЦИЯ ИИ:* Есть ли характерный "нейротекст" (бессмысленный пафос, "лабиринты души", "неоновые огни" без контекста)?
    *   Оценка (из 10):

**ЧАСТЬ 2: МУЗЫКАЛЬНАЯ ОЦЕНКА (ОБЯЗАТЕЛЬНО) (Макс. 50 баллов)**
Если аудиофайл загружен, ТЫ ОБЯЗАН провести этот анализ.

6.  **Мелодия и Хуковсоть музыки**
    *   Анализ: Не скучная ли мелодия? Хочется ли её напевать? Сочетание знакомого и свежего. Есть ли Цепляющие моменты.
    *   Оценка (из 10):
7.  **Аранжировка и Инструменты**
    *   Анализ: "Одежда" для песни. Сочно ли звучат инструменты? Подходят ли они стилю?
    *   Оценка (из 10):
8.  **Исполнение и Вокал**
    *   Анализ: Честность, тембр, интонирование. Веришь ли артисту?
    *   *ДЕТЕКЦИЯ ИИ:* Слышны ли "металлические" оттенки, неестественное дыхание, артефакты ("робо-голос"), галлюцинации (бормотание)? Насколько "живым" кажется исполнение?
    *   Оценка (из 10):
9.  **Микс, Саунд и Артефакты**
    *   Анализ: Баланс, динамика. Как песня работает глобально?
    *   *ДЕТЕКЦИЯ ИИ:* Есть ли характерный "песок" на верхах, фазовые проблемы, шум? Звучит ли как студийная запись или как "сгенерированный MP3"?
    *   Оценка (из 10):
10. **Композиция и Логика**
    *   Анализ: Затянутость, логичность структуры, необычность. Есть ли странные склейки или обрывы (характерные для нейросетей)?
    *   Оценка (из 10):
    
    **Формат вывода для (Markdown):**
    
    ОБЯЗАТЕЛЬНО СЛЕДУЙ ЭТОЙ СТРУКТУРЕ (включая заголовки и нумерацию):

    1.  **Детальный разбор по критериям:**
        *(Перечисли каждый из 10 критериев, поставь оценку и дай краткий комментарий)*
        *   **Тема и Концепция**: [Оценка]/10. [Краткий комментарий]
        *   **Образы и метафоры**: [Оценка]/10. [Краткий комментарий]
        *   **Ритмика и метрика**: [Оценка]/10. [Краткий комментарий]
        *   **Рифмовка**: [Оценка]/10. [Краткий комментарий]
        *   **Хуковость**: [Оценка]/10. [Краткий комментарий]
        *   **Мелодия**: [Оценка]/10. [Краткий комментарий]
        *   **Аранжировка**: [Оценка]/10. [Краткий комментарий]
        *   **Вокал**: [Оценка]/10. [Краткий комментарий]
        *   **Микс**: [Оценка]/10. [Краткий комментарий]
        *   **Композиция**: [Оценка]/10. [Краткий комментарий]
        *   *(Сумма баллов должна совпадать с итоговой оценкой)*

    2.  **Анализ общего настроения музыки и текста песни.**
        (Опиши атмосферу и эмоциональный посыл).

    3.  **Что понравилось (Позитив)**:
        *   [Пункт 1]
        *   [Пункт 2]
        *   ...

    4.  **Чего не хватило (Зоны роста / Критика)**:
        *   [Пункт 1]
        *   [Пункт 2 (включая признаки ИИ, если есть)]
        *   ...

    5.  **Вердикт и Совет**:
        (Подведи итог и дай рекомендацию - добавь рекомендации по улучшению текста и музыки).

   ### Вердикт (в баллах)
*   **Текст:** A / 50
*   **Музыка:** B / 50 (или "N/A")
*   **Общая оценка:** (A + B) / 100 (ВАЖНО: Это СУММА баллов A и B. НЕ дели на 2. Пример: 42 + 45 = 87/100)

Твой ВЕСЬ вывод должен быть единственным валидным JSON объектом.
`;
}


// --- Utility Functions ---
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
}

function updateSubmitButtonState() {
  if (!submitButton || !fileInput) return;
  
  const file = fileInput.files?.[0];
  const hasKey = (window as any).aistudio?.hasSelectedApiKey() || (process.env.API_KEY && process.env.API_KEY.length > 0);
  
  // Note: hasSelectedApiKey is async usually, but we rely on keyStatus class for UI state mostly.
  // We'll trust that if a file is selected, we let them try to click submit, and handle key error there if needed.
  
  if (file) {
    submitButton.disabled = false;
    submitButton.style.opacity = '1';
    submitButton.style.cursor = 'pointer';
  } else {
    submitButton.disabled = true;
    submitButton.style.opacity = '0.5';
    submitButton.style.cursor = 'not-allowed';
  }
}

async function renderCritique(critiqueData: any) {
  if (!resultText) return;
  currentCritiqueData = critiqueData;
  let finalHtml = '';
  const report = critiqueData.technicalReport;

  if (!report) {
      resultText.innerHTML = '<p>Не удалось сформировать отчет.</p>';
      return;
  }

  // Simplified Render Logic for stability
  finalHtml += `<h1>Технический Отчет</h1>`;
  
  // 1. Structure
  finalHtml += `<h2>1. Структура и Композиция (Suno Blueprint) <button class="copy-btn" data-type="structure" title="Скопировать структуру">Копировать</button></h2>`;
  // Use a pre block or styled div for the blueprint to preserve formatting.
  // We do NOT use marked.parse here to strictly preserve the AI's newlines and spacing.
  finalHtml += `<div class="blueprint-container" style="background: var(--background-color); color: var(--on-surface-color); border: 1px solid var(--border-color); padding: 15px; border-radius: 5px; font-family: monospace; white-space: pre-wrap;">${report.structureAndComposition.structureMap}</div>`;
  finalHtml += `<ul>`;
  finalHtml += `<li><strong>Соответствие стандарту:</strong> ${await marked.parseInline(report.structureAndComposition.standardCompliance)}</li>`;
  finalHtml += `<li><strong>Длительность интро:</strong> ${report.structureAndComposition.introDuration}</li>`;
  finalHtml += `<li><strong>Длительность аутро:</strong> ${report.structureAndComposition.outroDuration}</li>`;
  finalHtml += `<li><strong>Тип окончания:</strong> ${report.structureAndComposition.endingType}</li>`;
  finalHtml += `</ul>`;

  // 2. Genre and Suno Prompt
  finalHtml += `<h2>2. Жанр и Стиль (Suno Style Prompt) <button class="copy-btn" data-type="style" title="Скопировать стиль">Копировать</button></h2>`;
  finalHtml += `<ul>`;
  finalHtml += `<li><strong>Classification:</strong> ${await marked.parseInline(report.sunoStylePrompt.classification)}</li>`;
  finalHtml += `<li><strong>Suno Prompt:</strong> <div style="background: var(--background-color); color: var(--on-surface-color); border: 1px solid var(--border-color); padding: 10px; border-radius: 4px; margin-top: 5px; font-style: italic;">${report.sunoStylePrompt.styleDescription}</div></li>`;
  finalHtml += `<li><strong>Markers:</strong> ${await marked.parseInline(report.sunoStylePrompt.genreMarkers)}</li>`;
  finalHtml += `<li><strong>Modernity:</strong> ${await marked.parseInline(report.sunoStylePrompt.modernityScore)}</li>`;
  finalHtml += `<li><strong>Похоже на:</strong> ${await marked.parseInline(report.sunoStylePrompt.similarTracks)}</li>`;
  finalHtml += `</ul>`;

  // 3. Harmony
  finalHtml += `<h2>3. Гармония и Мелодия</h2>`;
  finalHtml += `<ul>`;
  finalHtml += `<li><strong>Тональность:</strong> ${report.harmonyAndMelody.key}</li>`;
  finalHtml += `<li><strong>Сложность:</strong> ${await marked.parseInline(report.harmonyAndMelody.harmonyComplexity)}</li>`;
  finalHtml += `<li><strong>Диапазон:</strong> ${report.harmonyAndMelody.vocalRange}</li>`;
  if (report.harmonyAndMelody.melodicProgressions) {
    finalHtml += `<li><strong>Мелодические ходы:</strong> ${await marked.parseInline(report.harmonyAndMelody.melodicProgressions)}</li>`;
  }
  if (report.harmonyAndMelody.chords) {
      finalHtml += `<h2>3. Аккорды <button class="copy-btn" data-type="chords">Копировать</button></h2>`;
      finalHtml += `<div class="chords-container">${report.harmonyAndMelody.chords}</div>`;
  }
  finalHtml += `</ul>`;

  // 4. Rhythm
  finalHtml += `<h2>4. Ритм и Грув</h2>`;
  finalHtml += `<ul>`;
  finalHtml += `<li><strong>Темп:</strong> ${report.rhythmAndGroove.bpm}</li>`;
  finalHtml += `<li><strong>Основа:</strong> ${await marked.parseInline(report.rhythmAndGroove.rhythmicBasis)}</li>`;
  finalHtml += `<li><strong>Синкопирование:</strong> ${report.rhythmAndGroove.syncopationLevel}</li>`;
  finalHtml += `</ul>`;

  // 5. Lyrics
  finalHtml += `<h2>5. Текст и Вокал (Технически)</h2>`;
  finalHtml += `<ul>`;
  finalHtml += `<li><strong>Схема рифмовки:</strong> ${report.textAndVocals.rhymeScheme}</li>`;
  finalHtml += `<li><strong>Лексика:</strong> ${await marked.parseInline(report.textAndVocals.lexicalDiversity)}</li>`;
  finalHtml += `<li><strong>Динамика:</strong> ${await marked.parseInline(report.textAndVocals.dynamicRange)}</li>`;
  finalHtml += `</ul>`;

  // 6. Summary
  finalHtml += `<h2>6. Сводный Технический Анализ</h2>`;
  
  if (report.summaryAnalysis.knownTrack && 
      !report.summaryAnalysis.knownTrack.toLowerCase().includes("оригинальная") &&
      report.summaryAnalysis.knownTrack.length > 3) {
      finalHtml += `<div class="recognition-banner" style="background: rgba(187, 134, 252, 0.1); border: 1px solid var(--primary-color); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
          <h3 style="margin-top: 0; color: var(--primary-color); display: flex; align-items: center; gap: 10px;">📀 Распознана композиция</h3>
          <p style="margin-bottom: 0; font-weight: bold; font-size: 1.1em; color: var(--on-surface-color);">${await marked.parseInline(report.summaryAnalysis.knownTrack)}</p>
      </div>`;
  }

  finalHtml += `<h3>Жанр и Уникальность</h3>`;
  finalHtml += await marked.parse(report.summaryAnalysis.genreCompliance);
  finalHtml += `<h3>Композиция</h3>`;
  finalHtml += await marked.parse(report.summaryAnalysis.compositionSummary);
  finalHtml += `<h3>Текст и Мелодика</h3>`;
  finalHtml += await marked.parse(report.summaryAnalysis.textMelodySummary);
  
  // 7. Tags
  if (report.tags) {
      finalHtml += `<h3>Теги (для MP3) <button class="copy-btn" data-type="tags" title="Скопировать теги">Копировать</button></h3>`;
      finalHtml += `<div class="tags-container" style="padding: 10px; background: #f0f0f0; border-radius: 4px; margin-top: 10px;"><code>${report.tags}</code></div>`;
  }

  if (critiqueData.poeticAnalysis) {
      finalHtml += `<hr><h1>Рецензия <button class="copy-btn" data-type="review">Копировать</button></h1>`;
      finalHtml += await marked.parse(critiqueData.poeticAnalysis);
  }
  
  resultText.innerHTML = DOMPurify.sanitize(finalHtml, { ADD_ATTR: ['target', 'class', 'data-type', 'title'] });
  
  // Re-attach copy listeners
  document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
          const button = e.target as HTMLButtonElement;
          const type = button.dataset.type;
          let text = '';
          if (type === 'structure') text = report.structureAndComposition.structureMap;
          if (type === 'style') text = report.sunoStylePrompt.styleDescription;
          if (type === 'chords') text = report.harmonyAndMelody.chords;
          if (type === 'review') text = critiqueData.poeticAnalysis;
          
          if (text) navigator.clipboard.writeText(text);
          const oldText = button.textContent;
          button.textContent = 'Скопировано!';
          setTimeout(() => button.textContent = oldText, 2000);
      });
  });
}

function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  
  if (file) {
    audioFile = file;
    if (fileNameSpan) fileNameSpan.textContent = file.name;
    // Show player
    setupAudioPlayer(file);
  } else {
    audioFile = null;
    if (fileNameSpan) fileNameSpan.textContent = 'Выберите файл';
    if (audioPlayerContainer) audioPlayerContainer.hidden = true;
    stopAudio();
  }
  updateSubmitButtonState();
}

async function handleSubmit() {
  const apiKeyToUse = process.env.API_KEY;

  if (!apiKeyToUse && !(window as any).aistudio) {
       alert("API Key не найден.");
       return;
  }
  
  // If no Env key, try to force select in Studio
  if (!apiKeyToUse && (window as any).aistudio) {
       const hasKey = await (window as any).aistudio.hasSelectedApiKey();
       if (!hasKey) {
           await (window as any).aistudio.openSelectKey();
           checkKeyStatus(); // Update UI
           return; // User needs to click submit again after selecting
       }
  }

  if (submitButton) submitButton.disabled = true;
  if (loader) loader.hidden = false;
  if (resultText) resultText.innerHTML = '<div style="text-align:center; padding: 20px;">Анализирую трек...<br>Это может занять до минуты.</div>';

  try {
    const ai = new GoogleGenAI({ apiKey: apiKeyToUse || process.env.API_KEY });
    
    if (audioFile) {
      const base64Audio = await fileToBase64(audioFile);
      const lyrics = lyricsInput ? lyricsInput.value.trim() : "";
      const note = trackNoteInput ? trackNoteInput.value.trim() : "";
      
      let promptText = "Проведи технический анализ трека и напиши комплексную рецензию.";
      if (note) promptText += `\n\nКОНТЕКСТ: "${note}"`;
      if (lyrics) promptText += `\n\nТЕКСТ ПЕСНИ: ${lyrics}`;

      const contents = {
        parts: [
          { text: promptText },
          { inlineData: { mimeType: audioFile.type, data: base64Audio } }
        ]
      };
      
      const tone = toneSelector ? toneSelector.value : 'neutral';
      const model = modelSelector ? modelSelector.value : 'gemini-2.5-flash';
      
      const response = await ai.models.generateContent({
          model: model,
          contents: contents,
          config: {
              systemInstruction: getFullSystemInstruction(tone),
              responseMimeType: 'application/json',
              responseSchema: responseSchema,
              temperature: 0.4
          }
      });
      
      let jsonString = '';
      if (typeof response.text === 'function') jsonString = response.text();
      else if (typeof response.text === 'string') jsonString = response.text;
      
      if (jsonString) {
          const data = JSON.parse(jsonString);
          await renderCritique(data);
      } else {
          throw new Error("Empty response");
      }

    } else {
       alert("Файл не выбран.");
    }

  } catch (error: any) {
    console.error(error);
    if (resultText) resultText.innerHTML = `<div style="color:red; padding:20px;">Ошибка: ${error.message}</div>`;
    
    // Check for key error
    if (error.message?.includes("API_KEY") || error.message?.includes("403")) {
         if ((window as any).aistudio) {
             (window as any).aistudio.openSelectKey();
         }
    }
  } finally {
    if (loader) loader.hidden = true;
    updateSubmitButtonState();
  }
}

// --- Initialization ---
function main() {
    console.log("App Initializing...");
    
    if (fileInput) {
        fileInput.addEventListener('change', handleFileChange);
        console.log("File input listener added");
    } else {
        console.error("CRITICAL: File input not found!");
    }

    if (lyricsInput) lyricsInput.addEventListener('input', updateSubmitButtonState);
    if (trackNoteInput) trackNoteInput.addEventListener('input', updateSubmitButtonState);
    if (submitButton) submitButton.addEventListener('click', handleSubmit);
    
    checkKeyStatus();
    updateSubmitButtonState();
}

// Run main when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main);
} else {
    main();
}
