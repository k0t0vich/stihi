// Обработка выбора файла
document.addEventListener('DOMContentLoaded', function() {
    // Элементы интерфейса
    const csvFileInput = document.getElementById('csvFileInput');
    const useFileUploadBtn = document.getElementById('useFileUpload');
    const topMSlider = document.getElementById('topMSlider');
    const topMValue = document.getElementById('topMValue');
    
    // Отображаем значение слайдера и обновляем глобальную переменную
    topMSlider.addEventListener('input', function() {
        topMValue.textContent = this.value;
        currentCutoffValue = parseInt(this.value); // Обновляем глобальную переменную
        
        // Автоматически пересчитываем и отображаем результаты
        if (originalData && originalData.length > 0) {
            calculateAndDisplayAllResults(currentCutoffValue);
        }
    });
    
    // Автоматически обрабатываем встроенные данные при загрузке страницы
    const embeddedDataElement = document.getElementById('embeddedCsvData');
    
    if (embeddedDataElement && embeddedDataElement.textContent) {
        // Читаем встроенные CSV данные
        const csvText = embeddedDataElement.textContent;
        
        // Если путь вместо данных, просто используем его как имя файла при отображении ошибки
        if (csvText.startsWith('./') || csvText.startsWith('../') || csvText.startsWith('/')) {
            showError(`Приложение работает локально и не может загрузить файл по пути: ${csvText}. Используйте кнопку "Загрузить свой файл" или вставьте CSV данные непосредственно в элемент embeddedCsvData.`);
        } else {
            try {
                processCSVData(csvText);
                document.getElementById('results').style.display = 'block';
                
                // Скрываем сообщение об ошибке, если оно было показано
                const errorContainer = document.getElementById('error-container');
                if (errorContainer) {
                    errorContainer.style.display = 'none';
                }
            } catch (error) {
                console.error('Ошибка при обработке встроенных CSV данных:', error);
                showError(`Ошибка при обработке встроенных CSV данных: ${error.message}`);
            }
        }
    } else {
        showError('Не найдены встроенные данные CSV. Используйте кнопку "Загрузить свой файл".');
    }
    
    // Кнопка "Загрузить свой файл"
    useFileUploadBtn.addEventListener('click', function() {
        csvFileInput.click();
    });
    
    // Обработка выбора файла
    csvFileInput.addEventListener('change', handleFileSelect);
});

// Показать сообщение об ошибке
function showError(message) {
    const errorContainer = document.getElementById('error-container');
    
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
    } else {
        console.error('Контейнер для отображения ошибок не найден');
        alert(message);
    }
}

// Глобальные переменные для хранения данных и результатов
let csvData = [];
let originalData = [];
let resultData = [];
let currentMValue = 0.5; // Значение по умолчанию для параметра M
let currentCutoffValue = 15;
let excludedJudge = "";
let selectedJudge = null;

// Функция для обработки изменения значения M на слайдере
function handleMChange(mValue) {
    currentMValue = parseFloat(mValue);
    document.getElementById('mValue').textContent = currentMValue.toFixed(2);
    
    if (originalData.length > 0) {
        // Пересчитываем рейтинги с новым значением M
        resultData = calculateWeightedBordaScores(originalData, currentMValue);
        displayResults(resultData, currentCutoffValue);
    }
}

// Функция для получения уникальных участников из данных
function getUniqueParticipants(data) {
    console.log("Получение уникальных участников, тип данных:", typeof data, "Массив?:", Array.isArray(data));
    
    // Если данные уже в формате массива объектов с полем id или name
    if (Array.isArray(data) && data.length > 0) {
        console.log("Первый элемент данных:", data[0]);
        
        if (data[0].id || data[0].name) {
            const result = data.map(p => p.id || p.name);
            console.log("Извлечено участников (вариант 1):", result.length);
            return result;
        }
        
        // Проверяем наличие поля participant
        if (data[0].participant) {
            const uniqueParticipants = [...new Set(data.map(item => 
                typeof item.participant === 'string' ? item.participant : 
                (item.participant && item.participant.name ? item.participant.name : null)
            ).filter(Boolean))];
            console.log("Извлечено участников (вариант 2):", uniqueParticipants.length);
            return uniqueParticipants;
        }
    }
    
    // Если данные в формате, возвращаемом parseCSV
    if (data && data.participants && Array.isArray(data.participants)) {
        const result = data.participants.map(p => p.name);
        console.log("Извлечено участников (вариант 3):", result.length);
        return result;
    }
    
    console.warn("Не удалось извлечь участников из данных");
    return [];
}

// Функция для получения уникальных судей из данных
function getUniqueJudges(data) {
    console.log("Получение уникальных судей, тип данных:", typeof data, "Массив?:", Array.isArray(data));
    
    // Если данные в формате, возвращаемом parseCSV
    if (data && data.judgeNames && Array.isArray(data.judgeNames)) {
        console.log("Извлечено судей (вариант 1):", data.judgeNames.length);
        return data.judgeNames;
    }
    
    // Если данные в формате массива объектов с полем judge
    if (Array.isArray(data) && data.length > 0) {
        console.log("Первый элемент данных:", data[0]);
        
        if (data[0].judge) {
            const judges = new Set();
            data.forEach(item => {
                if (item.judge) judges.add(item.judge);
            });
            const result = Array.from(judges);
            console.log("Извлечено судей (вариант 2):", result.length);
            return result;
        }
    }
    
    console.warn("Не удалось извлечь судей из данных");
    return [];
}

// Функция для расчета взвешенных баллов Борда с учетом параметра M
function calculateWeightedBordaScores(data, mValue) {
    console.log("Начало расчета взвешенных баллов с M =", mValue);
    
    try {
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.error("Неверные входные данные:", data);
            return [];
        }
        
        const participants = getUniqueParticipants(data);
        console.log("Уникальные участники:", participants);
        
        const judges = getUniqueJudges(data);
        console.log("Уникальные судьи:", judges);
        
        if (participants.length === 0 || judges.length === 0) {
            console.error("Нет участников или судей для расчета");
            return [];
        }
        
        // Создаем объект для хранения баллов Борда и оценок для каждого участника
        const scores = {};
        participants.forEach(participant => {
            scores[participant] = {
                bordaScore: 0,
                ratingScore: 0,
                totalScore: 0,
                judgesVoted: 0
            };
        });
        
        // Для каждого судьи
        judges.forEach(judge => {
            // Проверяем, является ли судья также участником
            const isJudgeParticipant = participants.includes(judge);
            
            // Получаем все оценки от этого судьи (только положительные)
            const judgeScores = data.filter(item => item.judge === judge && item.score > 0);
            console.log(`Судья ${judge}, количество оценок:`, judgeScores.length);
            
            // Группируем участников по оценкам для корректного расчета баллов Борда
            const scoreGroups = {};
            judgeScores.forEach(item => {
                if (!item || !item.participant) return;
                
                // Не учитываем голоса судей за себя
                if (isJudgeParticipant && item.participant === judge) return;
                
                const score = parseFloat(item.score);
                if (!scoreGroups[score]) {
                    scoreGroups[score] = [];
                }
                scoreGroups[score].push({
                    participant: item.participant,
                    score: score
                });
            });
            
            // Сортируем оценки по убыванию
            const sortedScores = Object.keys(scoreGroups).map(parseFloat).sort((a, b) => b - a);
            
            // Максимальное количество баллов Борда (равно общему количеству участников)
            const maxBordaPoints = judgeScores.length;
            
            // Присваиваем баллы Борда
            let position = 1;
            sortedScores.forEach(scoreValue => {
                const items = scoreGroups[scoreValue];
                const itemCount = items.length;
                
                // Рассчитываем баллы для группы с одинаковыми оценками
                // Участники с одинаковыми оценками получают среднее значение баллов
                // Для N участников в группе, начиная с позиции position, баллы:
                // maxBordaPoints - position + 1, maxBordaPoints - position, ..., maxBordaPoints - position - N + 2
                const startPoints = maxBordaPoints - position + 1;
                const endPoints = startPoints - itemCount + 1;
                // Если endPoints <= 0, значит для некоторых участников не хватило бы баллов
                // В этом случае мы просто используем все положительные баллы
                const realEndPoints = Math.max(1, endPoints);
                const totalPoints = itemCount * (startPoints + realEndPoints) / 2;
                const averagePoints = totalPoints / itemCount;
                
                items.forEach(item => {
                    if (!scores[item.participant]) {
                        console.warn(`Не найден участник "${item.participant}" в списке. Доступные участники:`, Object.keys(scores));
                        return;
                    }
                    
                    scores[item.participant].bordaScore += averagePoints;
                    scores[item.participant].ratingScore += item.score;
                    scores[item.participant].judgesVoted++;
                });
                
                position += itemCount;
            });
        });
        
        // Нормализуем и комбинируем баллы Борда и оценки с использованием параметра M
        // Находим максимальные значения для нормализации
        let maxBorda = 0;
        let maxRating = 0;
        
        Object.values(scores).forEach(score => {
            if (score.bordaScore > maxBorda) maxBorda = score.bordaScore;
            if (score.ratingScore > maxRating) maxRating = score.ratingScore;
        });
        
        console.log("Максимальные значения для нормализации - Борда:", maxBorda, "Оценки:", maxRating);
        
        // Рассчитываем общий балл с учетом веса M
        const result = [];
        participants.forEach(participant => {
            const score = scores[participant];
            
            // Нормализуем баллы (от 0 до 1)
            const normalizedBorda = maxBorda > 0 ? score.bordaScore / maxBorda : 0;
            const normalizedRating = maxRating > 0 ? score.ratingScore / maxRating : 0;
            
            // Комбинируем баллы с учетом веса M
            // M балансирует между оценками (M=0) и баллами Борда (M=1)
            score.totalScore = (mValue * normalizedBorda) + ((1 - mValue) * normalizedRating);
            
            result.push({
                participant: participant,
                totalScore: score.totalScore,
                bordaScore: score.bordaScore,
                ratingScore: score.ratingScore,
                averageRating: score.judgesVoted > 0 ? score.ratingScore / score.judgesVoted : 0
            });
        });
        
        // Сортируем результат по убыванию общего балла
        result.sort((a, b) => b.totalScore - a.totalScore);
        
        console.log("Расчет завершен, количество результатов:", result.length);
        return result;
    } catch (error) {
        console.error("Ошибка в calculateWeightedBordaScores:", error);
        console.log("Стек вызовов:", error.stack);
        return [];
    }
}

// Функция для обработки CSV данных
function processCSVData(csvText) {
    try {
        console.log("Начало обработки CSV данных");
        const parsedData = parseCSV(csvText);
        
        if (!parsedData) {
            throw new Error("Не удалось обработать данные CSV");
        }
        
        // Добавляем свойство records, если его нет, используя flatData
        if (!parsedData.records) {
            parsedData.records = parsedData.toFlatArray ? parsedData.toFlatArray() : [];
            console.log("Создание массива records из toFlatArray:", parsedData.records.length);
        }
        
        if (parsedData.records.length === 0) {
            throw new Error("Не удалось получить записи из CSV");
        }
        
        originalData = parsedData.records;
        console.log("Извлечено записей из CSV:", originalData.length);
        
        // Обновляем слайдер на основе количества участников
        updateCutoffSlider(parsedData);
        
        // Отображаем информацию о структуре CSV
        displayCsvInfo(parsedData.headers, parsedData.participants, parsedData.judgeNames);
        
        // Находим оптимальное значение отсечения для отображения примерно 10 участников
        currentCutoffValue = findOptimalCutoffValue(originalData, 10);
        
        // Обновляем значение на слайдере
        const topMSlider = document.getElementById('topMSlider');
        const topMValue = document.getElementById('topMValue');
        if (topMSlider && topMValue) {
            topMSlider.value = currentCutoffValue;
            topMValue.textContent = currentCutoffValue;
        }
        
        // Рассчитываем и отображаем результаты
        calculateAndDisplayAllResults(currentCutoffValue);
        
        return true;
    } catch (error) {
        console.error("Ошибка при обработке CSV:", error);
        console.log("Стек ошибки:", error.stack);
        showError(`Ошибка при обработке CSV: ${error.message}`);
        return false;
    }
}

// Функция для обновления слайдера отсечения на основе данных
function updateCutoffSlider(data) {
    const topMSlider = document.getElementById('topMSlider');
    if (!topMSlider) return;
    
    // Получаем количество участников
    const participantCount = data.participants.length;
    console.log("Количество участников для настройки слайдера:", participantCount);
    
    // Обновляем максимальное значение слайдера (не меньше 15)
    const maxValue = Math.max(15, participantCount);
    topMSlider.max = maxValue;
    
    // Если текущее значение больше максимального, корректируем его
    if (parseInt(topMSlider.value) > maxValue) {
        topMSlider.value = maxValue;
        document.getElementById('topMValue').textContent = maxValue;
    }
    
    console.log("Обновлен слайдер отсечения: min=1, max=" + maxValue + ", value=" + topMSlider.value);
}

// Вывод информации о структуре CSV-файла
function displayCsvInfo(headers, participants, judgeNames) {
    const infoContainer = document.createElement('div');
    infoContainer.className = 'csv-info';
    infoContainer.style.margin = '20px 0';
    infoContainer.style.padding = '15px';
    infoContainer.style.backgroundColor = '#f5f5f5';
    infoContainer.style.border = '1px solid #ddd';
    infoContainer.style.borderRadius = '5px';
    
    // Подсчитываем количество оценок от каждого судьи
    const judgeStats = {};
    judgeNames.forEach(judgeName => {
        judgeStats[judgeName] = {
            count: 0,
            min: Number.MAX_VALUE,
            max: Number.MIN_VALUE,
            sum: 0
        };
    });
    
    // Подсчитываем статистику по оценкам судей
    participants.forEach(participant => {
        for (const judgeName in participant.scores) {
            const score = participant.scores[judgeName];
            judgeStats[judgeName].count++;
            judgeStats[judgeName].min = Math.min(judgeStats[judgeName].min, score);
            judgeStats[judgeName].max = Math.max(judgeStats[judgeName].max, score);
            judgeStats[judgeName].sum += score;
        }
    });
    
    // Формируем информацию о каждом судье
    let judgeInfo = '';
    judgeNames.forEach(judgeName => {
        const stats = judgeStats[judgeName];
        const avg = stats.count > 0 ? (stats.sum / stats.count).toFixed(2) : 'Н/Д';
        judgeInfo += `
            <tr>
                <td>${judgeName}</td>
                <td>${stats.count}</td>
                <td>${stats.count > 0 ? stats.min.toFixed(1) : 'Н/Д'}</td>
                <td>${stats.count > 0 ? stats.max.toFixed(1) : 'Н/Д'}</td>
                <td>${avg}</td>
            </tr>
        `;
    });
    
    let html = `
        <h3>Информация о структуре CSV-файла</h3>
        <p><strong>Количество столбцов:</strong> ${headers.length}</p>
        <p><strong>Количество строк (участников):</strong> ${participants.length}</p>
        <p><strong>Количество судей:</strong> ${judgeNames.length}</p>
        
        <h4>Информация о судьях:</h4>
        <table class="csv-info-table" style="width: 100%; border-collapse: collapse; margin-top: 10px;">
            <thead>
                <tr>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Судья</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Кол-во оценок</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Мин. оценка</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Макс. оценка</th>
                    <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Средняя оценка</th>
                </tr>
            </thead>
            <tbody>
                ${judgeInfo}
            </tbody>
        </table>
    `;
    
    infoContainer.innerHTML = html;
    
    // Добавляем перед контейнером результатов
    const resultsContainer = document.getElementById('results');
    if (resultsContainer) {
        // Очищаем предыдущую информацию
        const existingInfo = resultsContainer.querySelector('.csv-info');
        if (existingInfo) {
            existingInfo.remove();
        }
        resultsContainer.prepend(infoContainer);
    }
}

// Парсинг данных CSV с поддержкой русских символов и специальных форматов
function parseCSV(csvText) {
    console.log("Начало парсинга CSV");
    
    if (!csvText || typeof csvText !== 'string') {
        console.error("CSV-текст пустой или не строка");
        return null;
    }
    
    try {
        // Разбиваем на строки, учитывая возможные переносы внутри кавычек
        const lines = [];
        let inQuotes = false;
        let currentLine = '';
        
        for (let i = 0; i < csvText.length; i++) {
            const char = csvText[i];
            const nextChar = (i < csvText.length - 1) ? csvText[i + 1] : '';
            
            if (char === '"') {
                inQuotes = !inQuotes;
                currentLine += char;
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                // Конец строки вне кавычек
                if (char === '\r' && nextChar === '\n') {
                    // Пропускаем \r в паре \r\n
                    continue;
                }
                if (currentLine.trim()) {
                    lines.push(currentLine);
                }
                currentLine = '';
            } else {
                currentLine += char;
            }
        }
        
        // Добавляем последнюю строку
        if (currentLine.trim()) {
            lines.push(currentLine);
        }
        
        console.log(`Количество строк в CSV: ${lines.length}`);
        
        if (lines.length < 2) {
            console.error("Недостаточно строк в CSV");
            return null;
        }
        
        // Парсим заголовки
        const headerLine = lines[0];
        const headers = parseCSVLine(headerLine);
        console.log("Заголовки CSV:", headers);
        
        // Индексы судей (начиная с 3-го столбца)
        const judgeIndices = {};
        const judgeNames = [];
        
        for (let i = 2; i < headers.length; i++) {
            let judgeName = headers[i].replace(/^"|"$/g, '').trim();
            if (judgeName) {
                judgeIndices[judgeName] = i;
                judgeNames.push(judgeName);
            }
        }
        
        console.log("Индексы судей:", judgeIndices);
        console.log("Имена судей:", judgeNames);
        
        // Парсим данные участников
        const participants = [];
        const flatData = []; // Плоский формат для расчетов
        
        for (let i = 1; i < lines.length; i++) {
            try {
                const line = parseCSVLine(lines[i]);
                
                // ID и имя участника
                const id = line[0] ? line[0].trim() : '';
                const name = line[1] ? line[1].replace(/^"|"$/g, '').trim() : '';
                
                if (!id || !name) {
                    console.warn(`Пропускаем строку ${i+1} без ID или имени`);
                    continue;
                }
                
                // Собираем оценки от судей
                const scores = {};
                
                for (const judgeName in judgeIndices) {
                    const index = judgeIndices[judgeName];
                    if (index < line.length) {
                        let score = line[index] ? line[index].trim().replace(',', '.') : '';
                        if (score) {
                            try {
                                score = parseFloat(score);
                                if (!isNaN(score)) {
                                    scores[judgeName] = score;
                                    
                                    // Добавляем в плоский массив
                                    flatData.push({
                                        participant: name,
                                        judge: judgeName,
                                        score: score
                                    });
                                }
                            } catch (e) {
                                console.warn(`Некорректная оценка от судьи ${judgeName} для участника ${name}: ${line[index]}`);
                            }
                        }
                    }
                }
                
                participants.push({
                    id: id,
                    name: name,
                    scores: scores
                });
                
            } catch (error) {
                console.error(`Ошибка при обработке строки ${i+1}:`, error);
                console.log("Содержимое строки:", lines[i]);
            }
        }
        
        console.log("Обработано участников:", participants.length);
        console.log("Создано записей для расчета:", flatData.length);
        
        // Возвращаем данные в двух форматах
        return {
            headers: headers,
            participants: participants,
            judgeNames: judgeNames,
            
            // Метод для получения данных в плоском формате
            toFlatArray: function() {
                return flatData;
            }
        };
    } catch (error) {
        console.error("Критическая ошибка в parseCSV:", error);
        console.log("Стек ошибки:", error.stack);
        return null;
    }
}

// Парсинг одной строки CSV с учетом кавычек и русских символов
function parseCSVLine(line) {
    if (!line || typeof line !== 'string') {
        console.warn("parseCSVLine: Получена пустая или неверная строка", line);
        return [];
    }
    
    const result = [];
    let current = '';
    let inQuotes = false;
    
    try {
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"') {
                // Проверяем на экранированные кавычки ""
                if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // Пропускаем следующую кавычку
                } else {
                    inQuotes = !inQuotes;
                }
            } else if (char === ',' && !inQuotes) {
                // Запятая вне кавычек - разделитель полей
                result.push(current);
                current = '';
            } else {
                // Любой другой символ
                current += char;
            }
        }
        
        // Добавляем последнее поле
        result.push(current);
        
        return result;
    } catch (error) {
        console.error("Ошибка в parseCSVLine:", error);
        console.log("Строка, вызвавшая ошибку:", line);
        console.log("Текущее состояние результата:", result);
        return [];
    }
}

// Функция для отображения результатов
function displayResults(results, cutoffValue, excludedJudge) {
    const resultsContainer = document.getElementById('results-container');
    if (!resultsContainer) return;
    
    // Очищаем текущие результаты
    resultsContainer.innerHTML = '';
    
    // Добавляем заголовок с информацией о параметрах
    const titleEl = document.createElement('h3');
    if (excludedJudge) {
        titleEl.textContent = `Результаты (отсечение: ${cutoffValue}%, без судьи: ${excludedJudge})`;
    } else {
        titleEl.textContent = `Результаты (отсечение: ${cutoffValue}%)`;
    }
    resultsContainer.appendChild(titleEl);

    // Создаем таблицу для результатов
    const table = document.createElement('table');
    table.className = 'results-table';
    
    // Создаем заголовок таблицы
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Колонки таблицы
    const columns = ['№', 'Участник', 'Баллы'];
    columns.forEach(columnName => {
        const th = document.createElement('th');
        th.textContent = columnName;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Создаем тело таблицы
    const tbody = document.createElement('tbody');
    
    // Добавляем строки с результатами
    results.forEach((result, index) => {
        const row = document.createElement('tr');
        
        // Колонка с номером
        const rankCell = document.createElement('td');
        rankCell.textContent = index + 1;
        row.appendChild(rankCell);
        
        // Колонка с именем участника
        const nameCell = document.createElement('td');
        nameCell.textContent = result.participant;
        row.appendChild(nameCell);
        
        // Колонка с баллами
        const scoreCell = document.createElement('td');
        // Используем totalScore если он есть, иначе bordaScore
        scoreCell.textContent = result.totalScore !== undefined ? result.totalScore : result.bordaScore;
        row.appendChild(scoreCell);
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    resultsContainer.appendChild(table);
    
    // Показываем контейнер с результатами
    resultsContainer.style.display = 'block';
}

// Функция для отображения рейтингов от каждого судьи
function displayJudgeRankings(data, cutoffValue) {
    const judgesRankingsContainer = document.getElementById('judges-rankings');
    judgesRankingsContainer.innerHTML = '';
    
    const judges = getUniqueJudges(data);
    
    // Для каждого судьи
    judges.forEach(judge => {
        // Получаем все оценки от этого судьи (только положительные оценки)
        const judgeScores = data.filter(item => item.judge === judge && item.score > 0);
        
        // Если от судьи нет оценок, пропускаем
        if (judgeScores.length === 0) return;
        
        // Сначала рассчитаем баллы Борда для этого судьи в отдельности
        const participants = getUniqueParticipants(data);
        
        // Создаем объект для хранения оценок судьи и баллов Борда для каждого участника
        const scores = {};
        participants.forEach(participant => {
            scores[participant] = {
                bordaScore: 0,
                judgeScore: 0
            };
        });
        
        // Проверяем, является ли судья также участником
        const isJudgeParticipant = participants.includes(judge);
        
        // Сохраняем все оценки судьи (для всех участников)
        judgeScores.forEach(item => {
            if (!item || !item.participant) return;
            
            // Не учитываем голоса судей за себя
            if (isJudgeParticipant && item.participant === judge) return;
            
            if (scores[item.participant]) {
                scores[item.participant].judgeScore = parseFloat(item.score);
            }
        });
        
        // Сортируем по убыванию оценки для отсечения
        const sortedJudgeScores = [...judgeScores].sort((a, b) => b.score - a.score);
        
        // Применяем отсечение - учитываем только топ-N оценок от судьи
        const effectiveCutoff = Math.min(cutoffValue, sortedJudgeScores.length);
        const cutoffScores = sortedJudgeScores.slice(0, effectiveCutoff);
        
        // Группируем участников по оценкам для корректного расчета баллов Борда
        const scoreGroups = {};
        cutoffScores.forEach(item => {
            if (!item || !item.participant) return;
            
            // Не учитываем голоса судей за себя
            if (isJudgeParticipant && item.participant === judge) return;
            
            const score = parseFloat(item.score);
            if (!scoreGroups[score]) {
                scoreGroups[score] = [];
            }
            scoreGroups[score].push(item.participant);
        });
        
        // Сортируем оценки по убыванию
        const sortedScores = Object.keys(scoreGroups).map(parseFloat).sort((a, b) => b - a);
        
        // Максимальное количество баллов Борда (равно количеству участников после отсечения)
        const maxBordaPoints = effectiveCutoff;
        
        // Присваиваем баллы Борда
        let position = 1;
        sortedScores.forEach(score => {
            const participantsForScore = scoreGroups[score];
            const participantCount = participantsForScore.length;
            
            // Расчет баллов Борда для данной группы
            let totalPoints = 0;
            for (let i = 0; i < participantCount; i++) {
                const points = maxBordaPoints - (position + i - 1);
                totalPoints += Math.max(0, points);
            }
            
            // Средние баллы для участника в этой группе
            const averagePoints = participantCount > 0 ? totalPoints / participantCount : 0;
            
            participantsForScore.forEach(participant => {
                if (scores[participant]) {
                    scores[participant].bordaScore = averagePoints;
                }
            });
            
            position += participantCount;
        });
        
        // Создаем блок для отображения рейтинга этого судьи
        const judgeRankingDiv = document.createElement('div');
        judgeRankingDiv.className = 'judge-ranking';
        judgeRankingDiv.innerHTML = `<h3>Рейтинг судьи: ${judge}</h3>`;
        
        // Создаем таблицу
        const table = document.createElement('table');
        table.className = 'judge-table';
        
        // Заголовок таблицы
        const thead = document.createElement('thead');
        thead.innerHTML = `
            <tr>
                <th>Место</th>
                <th>Участник</th>
                <th>Оценка судьи</th>
                <th>Баллы Борда</th>
            </tr>
        `;
        table.appendChild(thead);
        
        // Тело таблицы
        const tbody = document.createElement('tbody');
        
        // Собираем результаты для всех участников, у которых есть оценка судьи
        const judgeResults = [];
        participants.forEach(participant => {
            // Добавляем только тех участников, у которых есть оценка судьи И положительные баллы Борда
            if (scores[participant] && scores[participant].judgeScore > 0 && scores[participant].bordaScore > 0) {
                judgeResults.push({
                    participant: participant,
                    judgeScore: scores[participant].judgeScore,
                    bordaScore: scores[participant].bordaScore
                });
            }
        });
        
        // Сортируем по баллам Борда, затем по оценке судьи
        judgeResults.sort((a, b) => {
            if (b.bordaScore !== a.bordaScore) {
                return b.bordaScore - a.bordaScore;
            }
            return b.judgeScore - a.judgeScore;
        });
        
        // Добавляем позицию и учитываем одинаковые баллы
        let currentRank = 1;
        let currentScore = null;
        let sameRankCount = 0;
        
        judgeResults.forEach((result, index) => {
            // Определяем реальное место
            if (index === 0) {
                currentScore = result.bordaScore;
            } else if (result.bordaScore !== currentScore) {
                currentRank += sameRankCount + 1;
                sameRankCount = 0;
                currentScore = result.bordaScore;
            } else {
                sameRankCount++;
            }
            
            const row = document.createElement('tr');
            
            // Добавляем класс для топ-3 мест
            if (currentRank <= 3) {
                row.className = 'judge-top-3';
                row.setAttribute('data-rank', currentRank);
            }
            
            row.innerHTML = `
                <td>${currentRank}</td>
                <td>${result.participant}</td>
                <td>${result.judgeScore.toFixed(1)}</td>
                <td>${result.bordaScore.toFixed(2)}</td>
            `;
            
            tbody.appendChild(row);
        });
        
        table.appendChild(tbody);
        judgeRankingDiv.appendChild(table);
        judgesRankingsContainer.appendChild(judgeRankingDiv);
    });
}

// Функция для расчета баллов Борда с отсечением
function calculateBordaScoresWithCutoff(data, cutoffValue) {
    console.log("Начало расчета баллов Борда с отсечением =", cutoffValue);
    
    try {
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.error("Неверные входные данные:", data);
            return [];
        }
        
        // Проверка и нормализация значения отсечения
        const validCutoffValue = parseInt(cutoffValue) || 15;
        if (validCutoffValue <= 0) {
            console.warn("Некорректное значение отсечения, используется значение по умолчанию (15)");
            cutoffValue = 15;
        } else {
            cutoffValue = validCutoffValue;
        }
        console.log("Используемое значение отсечения:", cutoffValue);
        
        const participants = getUniqueParticipants(data);
        console.log("Уникальные участники:", participants);
        
        const judges = getUniqueJudges(data);
        console.log("Уникальные судьи:", judges);
        
        if (participants.length === 0 || judges.length === 0) {
            console.error("Нет участников или судей для расчета");
            return [];
        }
        
        // Создаем объект для хранения баллов Борда для каждого участника
        const scores = {};
        participants.forEach(participant => {
            scores[participant] = {
                bordaScore: 0,
                judgesVoted: 0
            };
        });
        
        // Для каждого судьи
        judges.forEach(judge => {
            // Проверяем, является ли судья также участником
            const isJudgeParticipant = participants.includes(judge);
            
            // Получаем все оценки от этого судьи (только положительные оценки)
            const judgeScores = data.filter(item => item.judge === judge && item.score > 0);
            console.log(`Судья ${judge}, количество оценок:`, judgeScores.length);
            
            // Сортируем по убыванию оценки
            judgeScores.sort((a, b) => b.score - a.score);
            
            // Применяем отсечение - учитываем только топ-N оценок от судьи
            const effectiveCutoff = Math.min(cutoffValue, judgeScores.length);
            const cutoffScores = judgeScores.slice(0, effectiveCutoff);
            
            console.log(`Судья ${judge}, применено отсечение:`, effectiveCutoff, "из", judgeScores.length);
            
            // Группируем участников по оценкам для корректного расчета баллов Борда
            const scoreGroups = {};
            cutoffScores.forEach(item => {
                if (!item || !item.participant) return;
                
                // Не учитываем голоса судей за себя
                if (isJudgeParticipant && item.participant === judge) return;
                
                const score = parseFloat(item.score);
                if (!scoreGroups[score]) {
                    scoreGroups[score] = [];
                }
                scoreGroups[score].push(item.participant);
            });
            
            // Сортируем оценки по убыванию
            const sortedScores = Object.keys(scoreGroups).map(parseFloat).sort((a, b) => b - a);
            
            // Максимальное количество баллов Борда (равно количеству участников после отсечения)
            const maxBordaPoints = effectiveCutoff;
            
            // Присваиваем баллы Борда
            let position = 1;
            sortedScores.forEach(score => {
                const participants = scoreGroups[score];
                const participantCount = participants.length;
                
                // Расчет баллов Борда для данной группы
                // При одинаковых оценках баллы усредняются
                // Например, если 3 участника занимают места 2, 3 и 4, то каждый получает (M-1 + M-2 + M-3)/3 баллов
                // Где M - максимальное количество баллов (равно количеству участников после отсечения)
                
                // Суммируем баллы для всех мест в группе
                let totalPoints = 0;
                for (let i = 0; i < participantCount; i++) {
                    // Баллы за каждое место = maxBordaPoints - (место - 1)
                    // Место = position + i
                    const points = maxBordaPoints - (position + i - 1);
                    // Для защиты от отрицательных значений (если группа большая)
                    totalPoints += Math.max(0, points);
                }
                
                // Средние баллы для участника в этой группе
                const averagePoints = participantCount > 0 ? totalPoints / participantCount : 0;
                
                participants.forEach(participant => {
                    if (!scores[participant]) {
                        console.warn(`Не найден участник "${participant}" в списке. Доступные участники:`, Object.keys(scores).length);
                        return;
                    }
                    
                    scores[participant].bordaScore += averagePoints;
                    scores[participant].judgesVoted++;
                });
                
                position += participantCount;
            });
        });
        
        // Формируем результаты
        const result = [];
        participants.forEach(participant => {
            const score = scores[participant];
            
            result.push({
                participant: participant,
                bordaScore: score.bordaScore,
                judgesVoted: score.judgesVoted
            });
        });
        
        // Сортируем результат по убыванию баллов Борда
        result.sort((a, b) => b.bordaScore - a.bordaScore);
        
        console.log("Расчет завершен, количество результатов:", result.length);
        return result;
    } catch (error) {
        console.error("Ошибка в calculateBordaScoresWithCutoff:", error);
        console.log("Стек ошибки:", error.stack);
        return [];
    }
}

// Функция для расчета баллов Борда без учета определенного судьи
function calculateBordaScoresWithoutJudge(data, cutoffValue, excludeJudge) {
    console.log(`Начало расчета баллов Борда с отсечением = ${cutoffValue}, исключая судью: ${excludeJudge}`);
    
    try {
        if (!data || !Array.isArray(data) || data.length === 0) {
            console.error("Неверные входные данные:", data);
            return [];
        }
        
        // Проверка и нормализация значения отсечения
        const validCutoffValue = parseInt(cutoffValue) || 15;
        if (validCutoffValue <= 0) {
            console.warn("Некорректное значение отсечения, используется значение по умолчанию (15)");
            cutoffValue = 15;
        } else {
            cutoffValue = validCutoffValue;
        }
        console.log("Используемое значение отсечения:", cutoffValue);
        
        // Проверяем валидность исключаемого судьи
        if (!excludeJudge) {
            console.warn("Не указан судья для исключения, будут учтены все судьи");
        }
        
        const participants = getUniqueParticipants(data);
        console.log("Уникальные участники:", participants);
        
        // Фильтруем судей, исключая указанного
        const allJudges = getUniqueJudges(data);
        const judges = excludeJudge ? allJudges.filter(judge => judge !== excludeJudge) : allJudges;
        console.log("Уникальные судьи после фильтрации:", judges);
        
        if (participants.length === 0 || judges.length === 0) {
            console.error("Нет участников или судей для расчета");
            return [];
        }
        
        // Создаем объект для хранения баллов Борда для каждого участника
        const scores = {};
        participants.forEach(participant => {
            scores[participant] = {
                bordaScore: 0,
                judgesVoted: 0
            };
        });
        
        // Для каждого судьи
        judges.forEach(judge => {
            // Проверяем, является ли судья также участником
            const isJudgeParticipant = participants.includes(judge);
            
            // Получаем все оценки от этого судьи (только положительные оценки)
            const judgeScores = data.filter(item => item.judge === judge && item.score > 0);
            console.log(`Судья ${judge}, количество оценок:`, judgeScores.length);
            
            // Сортируем по убыванию оценки
            judgeScores.sort((a, b) => b.score - a.score);
            
            // Применяем отсечение - учитываем только топ-N оценок от судьи
            const effectiveCutoff = Math.min(cutoffValue, judgeScores.length);
            const cutoffScores = judgeScores.slice(0, effectiveCutoff);
            
            console.log(`Судья ${judge}, применено отсечение:`, effectiveCutoff, "из", judgeScores.length);
            
            // Группируем участников по оценкам для корректного расчета баллов Борда
            const scoreGroups = {};
            cutoffScores.forEach(item => {
                if (!item || !item.participant) return;
                
                // Не учитываем голоса судей за себя
                if (isJudgeParticipant && item.participant === judge) return;
                
                const score = parseFloat(item.score);
                if (!scoreGroups[score]) {
                    scoreGroups[score] = [];
                }
                scoreGroups[score].push(item.participant);
            });
            
            // Сортируем оценки по убыванию
            const sortedScores = Object.keys(scoreGroups).map(parseFloat).sort((a, b) => b - a);
            
            // Максимальное количество баллов Борда (равно количеству участников после отсечения)
            const maxBordaPoints = effectiveCutoff;
            
            // Присваиваем баллы Борда
            let position = 1;
            sortedScores.forEach(score => {
                const participants = scoreGroups[score];
                const participantCount = participants.length;
                
                // Расчет баллов Борда для данной группы
                // При одинаковых оценках баллы усредняются
                // Например, если 3 участника занимают места 2, 3 и 4, то каждый получает (M-1 + M-2 + M-3)/3 баллов
                // Где M - максимальное количество баллов (равно количеству участников после отсечения)
                
                // Суммируем баллы для всех мест в группе
                let totalPoints = 0;
                for (let i = 0; i < participantCount; i++) {
                    // Баллы за каждое место = maxBordaPoints - (место - 1)
                    // Место = position + i
                    const points = maxBordaPoints - (position + i - 1);
                    // Для защиты от отрицательных значений (если группа большая)
                    totalPoints += Math.max(0, points);
                }
                
                // Средние баллы для участника в этой группе
                const averagePoints = participantCount > 0 ? totalPoints / participantCount : 0;
                
                participants.forEach(participant => {
                    if (!scores[participant]) {
                        console.warn(`Не найден участник "${participant}" в списке. Доступные участники:`, Object.keys(scores).length);
                        return;
                    }
                    
                    scores[participant].bordaScore += averagePoints;
                    scores[participant].judgesVoted++;
                });
                
                position += participantCount;
            });
        });
        
        // Формируем результаты
        const result = [];
        participants.forEach(participant => {
            const score = scores[participant];
            
            result.push({
                participant: participant,
                bordaScore: score.bordaScore,
                judgesVoted: score.judgesVoted
            });
        });
        
        // Сортируем результат по убыванию баллов Борда
        result.sort((a, b) => b.bordaScore - a.bordaScore);
        
        console.log("Расчет завершен, количество результатов:", result.length);
        return result;
    } catch (error) {
        console.error("Ошибка в calculateBordaScoresWithoutJudge:", error);
        console.log("Стек ошибки:", error.stack);
        return [];
    }
}

// Добавляем новую функцию для расчета баллов без учета определенного судьи
function calculateBordaScoresWithoutJudge(data, cutoffValue, excludedJudge) {
    console.log(`Расчет баллов без учета судьи: ${excludedJudge}, с отсечением: ${cutoffValue}`);
    
    if (!data || data.length === 0) {
        console.error('Нет данных для расчета');
        return [];
    }

    // Получаем список участников и судей
    const participants = getUniqueParticipants(data);
    const judges = getUniqueJudges(data).filter(judge => judge !== excludedJudge);
    
    console.log(`Количество участников: ${participants.length}`);
    console.log(`Количество судей (без исключенного): ${judges.length}`);

    // Подготовка результатов
    const results = participants.map(participant => {
        return {
            participant: participant,
            totalScore: 0,
            fromJudges: {}
        };
    });

    // Для каждого судьи обрабатываем оценки
    judges.forEach(judge => {
        // Получение оценок данного судьи (только положительные оценки)
        const judgeScores = data.filter(entry => 
            entry.judge === judge && 
            entry.participant !== judge &&
            entry.score > 0
        );

        // Сортировка оценок по убыванию
        judgeScores.sort((a, b) => parseFloat(b.score) - parseFloat(a.score));
        
        // Применение отсечения
        let validScores = judgeScores;
        if (cutoffValue > 0 && cutoffValue < 100) {
            const threshold = Math.min(cutoffValue, judgeScores.length);
            validScores = judgeScores.slice(0, threshold);
            console.log(`Судья ${judge}: отсечение ${cutoffValue}, учитываем ${validScores.length} из ${judgeScores.length} оценок`);
        }

        // Группируем участников по оценкам для корректного расчета баллов Борда
        const scoreGroups = {};
        validScores.forEach(item => {
            if (!item || !item.participant) return;
            
            const score = parseFloat(item.score);
            if (!scoreGroups[score]) {
                scoreGroups[score] = [];
            }
            scoreGroups[score].push(item.participant);
        });
        
        // Сортируем оценки по убыванию
        const sortedScores = Object.keys(scoreGroups).map(parseFloat).sort((a, b) => b - a);
        
        // Максимальное количество баллов Борда (равно количеству участников после отсечения)
        const maxBordaPoints = validScores.length;
        
        // Присваиваем баллы Борда
        let position = 1;
        sortedScores.forEach(score => {
            const participants = scoreGroups[score];
            const participantCount = participants.length;
            
            // Рассчитываем баллы для группы с одинаковыми оценками
            // При одинаковых оценках баллы усредняются
            // Например, если 3 участника занимают места 2, 3 и 4, то каждый получает (M-1 + M-2 + M-3)/3 баллов
            // Где M - максимальное количество баллов (равно количеству участников после отсечения)
            
            // Суммируем баллы для всех мест в группе
            let totalPoints = 0;
            for (let i = 0; i < participantCount; i++) {
                // Баллы за каждое место = maxBordaPoints - (место - 1)
                // Место = position + i
                const points = maxBordaPoints - (position + i - 1);
                // Для защиты от отрицательных значений (если группа большая)
                totalPoints += Math.max(0, points);
            }
            
            // Средние баллы для участника в этой группе
            const averagePoints = participantCount > 0 ? totalPoints / participantCount : 0;
            
            participants.forEach(participant => {
                // Находим участника в результатах
                const resultEntry = results.find(r => r.participant === participant);
                if (resultEntry) {
                    resultEntry.totalScore += averagePoints;
                    resultEntry.fromJudges[judge] = averagePoints;
                }
            });
            
            position += participantCount;
        });
    });

    // Сортировка результатов по убыванию суммы баллов
    results.sort((a, b) => b.totalScore - a.totalScore);
    
    // Преобразуем формат для совместимости
    const compatResults = results.map(item => {
        return {
            participant: item.participant,
            bordaScore: item.totalScore,
            judgesVoted: Object.keys(item.fromJudges).length
        };
    });
    
    console.log(`Расчет завершен, ${compatResults.length} участников получили баллы`);
    return compatResults;
}

// Добавление выбора судьи для исключения
function populateJudgeSelect(data) {
    const judgeSelect = document.getElementById('judge-select');
    if (!judgeSelect) return;
    
    // Очистка списка
    judgeSelect.innerHTML = '<option value="">Не исключать судью</option>';
    
    // Получение списка судей
    const judges = getUniqueJudges(data);
    
    // Добавление судей в список
    judges.forEach(judge => {
        const option = document.createElement('option');
        option.value = judge;
        option.textContent = judge;
        judgeSelect.appendChild(option);
    });
    
    // Показать элемент выбора судьи
    document.getElementById('judge-select-container').style.display = 'block';
}

// Обновление обработчика файла
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) {
        console.error('Файл не выбран');
        return;
    }

    const reader = new FileReader();
    
    reader.onload = function(e) {
        const csvText = e.target.result;
        console.log('Файл CSV загружен, размер:', csvText.length, 'байт');
        
        try {
            // Обрабатываем CSV данные
            processCSVData(csvText);
            const resultsContainer = document.getElementById('results');
            if (resultsContainer) {
                resultsContainer.style.display = 'block';
            }
            
            // Скрываем сообщение об ошибке, если оно было показано
            const errorContainer = document.getElementById('error-container');
            if (errorContainer) {
                errorContainer.style.display = 'none';
            }
        } catch (error) {
            console.error('Ошибка при обработке файла:', error);
            showError('Произошла ошибка при обработке файла: ' + error.message);
        }
    };
    
    reader.onerror = function() {
        console.error('Ошибка чтения файла');
        showError('Произошла ошибка при чтении файла.');
    };
    
    reader.readAsText(file);
}

// Функция для пересчета и отображения результатов
function calculateAndDisplayResults(cutoffValue) {
    const excludedJudge = document.getElementById('judge-select').value;
    
    if (excludedJudge) {
        // Если выбран судья для исключения
        resultData = calculateBordaScoresWithoutJudge(originalData, cutoffValue, excludedJudge);
    } else {
        // Стандартный расчет с отсечением
        resultData = calculateBordaScoresWithCutoff(originalData, cutoffValue);
    }
    
    displayResults(resultData, cutoffValue, excludedJudge);
}

// Функция для заполнения выпадающего списка судей
function populateJudgeSelect(data) {
    const judgeSelect = document.getElementById('judge-select');
    if (!judgeSelect) {
        console.error('Элемент выбора судьи не найден');
        return;
    }
    
    // Очищаем существующие опции
    judgeSelect.innerHTML = '';
    
    // Добавляем опцию "Все судьи"
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Учитывать всех судей';
    judgeSelect.appendChild(defaultOption);
    
    // Получаем уникальных судей
    const uniqueJudges = getUniqueJudges(data);
    console.log('Уникальные судьи для выпадающего списка:', uniqueJudges);
    
    // Добавляем каждого судью как опцию
    uniqueJudges.forEach(judge => {
        const option = document.createElement('option');
        option.value = judge;
        option.textContent = judge;
        judgeSelect.appendChild(option);
    });
    
    // Инициализируем контейнер для выбора судьи, если он еще не отображается
    const judgeSelectContainer = document.getElementById('judge-select-container');
    if (judgeSelectContainer) {
        judgeSelectContainer.style.display = 'block';
    }
    
    // Добавляем обработчик события для выбора судьи
    judgeSelect.addEventListener('change', handleJudgeChange);
}

// Обработчик изменения выбранного судьи
function handleJudgeChange(event) {
    selectedJudge = event.target.value;
    console.log('Выбран судья для исключения:', selectedJudge || 'Все судьи учитываются');
    
    if (originalData && originalData.length > 0) {
        if (selectedJudge) {
            // Если выбран судья для исключения, используем функцию без этого судьи
            resultData = calculateBordaScoresWithoutJudge(originalData, currentCutoffValue, selectedJudge);
        } else {
            // Если "Все судьи", используем обычную функцию с отсечением
            resultData = calculateBordaScoresWithCutoff(originalData, currentCutoffValue);
        }
        
        // Отображаем обновленные результаты
        displayResults(resultData, currentCutoffValue, selectedJudge);
    }
}

// Новая функция для расчета и отображения всех результатов
function calculateAndDisplayAllResults(cutoffValue) {
    if (!originalData || originalData.length === 0) {
        console.error('Нет данных для расчета');
        return;
    }
    
    console.log('Расчет всех результатов с отсечением:', cutoffValue);
    
    // 1. Рассчитываем результаты с учетом всех судей
    const allJudgesResults = calculateBordaScoresWithCutoff(originalData, cutoffValue);
    
    // Отображаем результаты со всеми судьями
    displayResultsInContainer(allJudgesResults, 'results-all-container', `Результаты с учетом всех судей (отсечение: ${cutoffValue})`);
    
    // 2. Получаем список судей
    const judges = getUniqueJudges(originalData);
    
    // Создаем контейнер для результатов с исключением судей
    const excludedJudgeContainer = document.getElementById('judge-excluded-results');
    excludedJudgeContainer.innerHTML = '';
    
    // 3. Для каждого судьи рассчитываем результаты без его учета
    judges.forEach(judge => {
        const resultsWithoutJudge = calculateBordaScoresWithoutJudge(originalData, cutoffValue, judge);
        
        // Создаем отдельный блок для результатов без этого судьи
        const judgeResultBlock = document.createElement('div');
        judgeResultBlock.className = 'judge-excluded-block';
        judgeResultBlock.style.marginBottom = '30px';
        
        // Заголовок блока
        const blockHeader = document.createElement('h3');
        blockHeader.textContent = `Без судьи: ${judge} (отсечение: ${cutoffValue})`;
        judgeResultBlock.appendChild(blockHeader);
        
        // Добавляем таблицу с результатами
        const table = createResultsTable(resultsWithoutJudge);
        judgeResultBlock.appendChild(table);
        
        // Добавляем в контейнер для результатов без судей
        excludedJudgeContainer.appendChild(judgeResultBlock);
    });
    
    // 4. Отображаем рейтинги от каждого судьи
    displayJudgeRankings(originalData, cutoffValue);
}

// Вспомогательная функция для отображения результатов в указанном контейнере
function displayResultsInContainer(results, containerId, title) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = '';
    
    // Заголовок
    const headerEl = document.createElement('h3');
    headerEl.textContent = title;
    container.appendChild(headerEl);
    
    // Таблица с результатами
    const table = createResultsTable(results);
    container.appendChild(table);
}

// Вспомогательная функция для создания таблицы с результатами
function createResultsTable(results) {
    const table = document.createElement('table');
    table.className = 'results-table';
    
    // Заголовок таблицы
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    ['№', 'Участник', 'Баллы', 'График'].forEach(columnName => {
        const th = document.createElement('th');
        th.textContent = columnName;
        headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Тело таблицы
    const tbody = document.createElement('tbody');
    
    // Фильтрация участников с нулевыми баллами
    const filteredResults = results.filter(result => {
        const score = result.totalScore !== undefined ? result.totalScore : result.bordaScore;
        return score > 0;
    });
    
    // Добавляем атрибут реального места (для учета равных баллов)
    let currentRank = 1;
    let currentScore = null;
    let sameRankCount = 0;
    
    filteredResults.forEach((result, index) => {
        const score = result.totalScore !== undefined ? result.totalScore : result.bordaScore;
        
        // Определяем реальное место
        if (index === 0) {
            currentScore = score;
        } else if (score !== currentScore) {
            currentRank += sameRankCount + 1;
            sameRankCount = 0;
            currentScore = score;
        } else {
            sameRankCount++;
        }
        
        const row = document.createElement('tr');
        // Добавляем класс top-3 и атрибут data-rank для определения цвета
        if (currentRank <= 3) {
            row.className = 'top-3';
            row.setAttribute('data-rank', currentRank);
        }
        
        // Номер
        const rankCell = document.createElement('td');
        rankCell.textContent = currentRank;
        row.appendChild(rankCell);
        
        // Участник
        const nameCell = document.createElement('td');
        nameCell.textContent = result.participant;
        row.appendChild(nameCell);
        
        // Баллы
        const scoreCell = document.createElement('td');
        // Форматируем дробные числа до 2 знаков после запятой
        scoreCell.textContent = typeof score === 'number' ? score.toFixed(2) : score;
        row.appendChild(scoreCell);
        
        // Кнопка графика
        const chartCell = document.createElement('td');
        const chartBtn = document.createElement('button');
        chartBtn.className = 'chart-btn';
        chartBtn.textContent = 'Показать график';
        chartBtn.onclick = function() {
            showParticipantChart(result.participant);
        };
        chartCell.appendChild(chartBtn);
        row.appendChild(chartCell);
        
        tbody.appendChild(row);
    });
    
    table.appendChild(tbody);
    return table;
}

// Функция для определения оптимального значения отсечения,
// чтобы в финальной таблице было около 10 строк с ненулевыми баллами
function findOptimalCutoffValue(data, targetRowCount = 10) {
    console.log(`Поиск оптимального значения отсечения для ${targetRowCount} строк в таблице`);
    
    // Определяем максимально возможное значение M (количество участников)
    const participants = getUniqueParticipants(data);
    const maxPossibleM = participants.length;
    
    // Начинаем с M = 10
    let currentCutoff = 10;
    let previousCutoff = currentCutoff;
    
    // Сначала проверяем начальное значение M = 10
    let results = calculateBordaScoresWithCutoff(data, currentCutoff);
    let rowCount = results.filter(result => result.bordaScore > 0).length;
    
    console.log(`Начальное значение отсечения: ${currentCutoff}, строк: ${rowCount}`);
    
    // Если количество строк уже меньше целевого, увеличиваем M до получения хотя бы targetRowCount строк
    if (rowCount < targetRowCount) {
        while (rowCount < targetRowCount && currentCutoff < maxPossibleM) {
            previousCutoff = currentCutoff;
            currentCutoff += 1;
            results = calculateBordaScoresWithCutoff(data, currentCutoff);
            rowCount = results.filter(result => result.bordaScore > 0).length;
            console.log(`Увеличение отсечения: ${currentCutoff}, строк: ${rowCount}`);
        }
    } 
    // Иначе уменьшаем M, пока количество строк не станет меньше целевого
    else {
        while (rowCount >= targetRowCount && currentCutoff > 1) {  // Не меньше 1
            previousCutoff = currentCutoff;
            currentCutoff -= 1;
            results = calculateBordaScoresWithCutoff(data, currentCutoff);
            rowCount = results.filter(result => result.bordaScore > 0).length;
            console.log(`Уменьшение отсечения: ${currentCutoff}, строк: ${rowCount}`);
        }
        
        // Когда стало меньше targetRowCount, возвращаем предыдущее значение
        if (rowCount < targetRowCount) {
            currentCutoff = previousCutoff;
            console.log(`Выбрано предыдущее значение отсечения: ${currentCutoff}`);
        }
    }
    
    // Финальная проверка результатов
    results = calculateBordaScoresWithCutoff(data, currentCutoff);
    rowCount = results.filter(result => result.bordaScore > 0).length;
    
    console.log(`Оптимальное значение отсечения: ${currentCutoff}, дает ${rowCount} строк`);
    return currentCutoff;
}

// Функция для расчета места участника в зависимости от значения M (отсечения)
function calculateParticipantRankByM(participantName, minM = 1, maxM = 50) {
    console.log(`Расчет графика для участника: ${participantName}, диапазон M: ${minM}-${maxM}`);
    
    if (!originalData || originalData.length === 0) {
        console.error('Нет данных для расчета');
        return [];
    }
    
    const chartData = [];
    
    // Для каждого значения M от minM до maxM
    for (let m = minM; m <= maxM; m++) {
        // Рассчитываем баллы для всех участников с текущим M
        const results = calculateBordaScoresWithCutoff(originalData, m);
        
        // Фильтруем только участников с ненулевыми баллами
        const filteredResults = results.filter(result => result.bordaScore > 0);
        
        // Находим место участника
        let rank = 0;
        let found = false;
        for (let i = 0; i < filteredResults.length; i++) {
            if (filteredResults[i].participant === participantName) {
                found = true;
                // Учитываем участников с одинаковым баллом
                rank = i + 1;
                // Проверяем, есть ли участники с тем же баллом выше
                let sameScoreCount = 0;
                for (let j = i - 1; j >= 0; j--) {
                    if (filteredResults[j].bordaScore === filteredResults[i].bordaScore) {
                        sameScoreCount++;
                    } else {
                        break;
                    }
                }
                rank = rank - sameScoreCount;
                break;
            }
        }
        
        // Если участник не найден (баллы = 0), сохраняем это как null
        // null означает, что участник не попал в рейтинг при данном M
        if (!found) {
            chartData.push({ m: m, rank: null, outOfRank: true });
        } else {
            chartData.push({ m: m, rank: rank, outOfRank: false });
        }
    }
    
    console.log(`Рассчитано точек для графика: ${chartData.length}`);
    return chartData;
}

// Функция для показа модального окна с графиком участника
function showParticipantChart(participantName) {
    console.log(`Показ графика для участника: ${participantName}`);
    
    // Обновляем заголовок модального окна
    const modalTitle = document.getElementById('modalTitle');
    modalTitle.textContent = `График места для участника: ${participantName}`;
    
    // Рассчитываем данные для графика
    // Используем диапазон M от 1 до количества участников
    const participants = getUniqueParticipants(originalData);
    const maxM = participants.length; // Максимум = количество участников
    const chartData = calculateParticipantRankByM(participantName, 1, maxM);
    
    // Отображаем модальное окно
    const modal = document.getElementById('chartModal');
    modal.style.display = 'block';
    
    // Рисуем график
    drawChart(chartData, participantName);
}

// Функция для отрисовки графика на canvas
function drawChart(chartData, participantName) {
    const canvas = document.getElementById('chartCanvas');
    const ctx = canvas.getContext('2d');
    
    // Адаптивный размер canvas в зависимости от ширины экрана
    const isMobile = window.innerWidth <= 768;
    const isSmallMobile = window.innerWidth <= 480;
    
    if (isSmallMobile) {
        canvas.width = window.innerWidth - 40; // Оставляем небольшие отступы
        canvas.height = 400;
    } else if (isMobile) {
        canvas.width = window.innerWidth - 60;
        canvas.height = 450;
    } else {
        canvas.width = 900;
        canvas.height = 550;
    }
    
    // Очищаем canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Параметры графика с адаптивными отступами
    const padding = isMobile ? 40 : 60;
    const chartWidth = canvas.width - 2 * padding;
    const chartHeight = canvas.height - 2 * padding;
    
    // Адаптивные размеры шрифтов
    const fontSize = {
        title: isMobile ? 16 : 20,
        axis: isMobile ? 11 : 14,
        labels: isMobile ? 10 : 12,
        legend: isMobile ? 9 : 11
    };
    
    // Находим диапазон данных
    const validData = chartData.filter(d => d.rank !== null);
    if (validData.length === 0) {
        ctx.font = `${fontSize.title}px Arial`;
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.fillText('Нет данных для отображения', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const minM = Math.min(...chartData.map(d => d.m));
    const maxM = Math.max(...chartData.map(d => d.m));
    const minRank = 1; // Всегда начинаем с 1-го места
    // maxRank = общее количество участников (максимально возможное место)
    const participants = getUniqueParticipants(originalData);
    const maxRank = participants.length;
    
    // Масштабирование
    const scaleX = chartWidth / (maxM - minM);
    const scaleY = chartHeight / (maxRank - minRank);
    
    // Функция для преобразования координат
    const getX = (m) => padding + (m - minM) * scaleX;
    // Инвертированная ось Y: 1 место вверху, максимальное место внизу
    const getY = (rank) => padding + (rank - minRank) * scaleY;
    
    // Рисуем оси
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath();
    // Ось Y
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    // Ось X
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();
    
    // Подписи осей
    ctx.font = `${fontSize.axis}px Arial`;
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    
    // Подпись оси X
    ctx.fillText('M (топ-отсечение)', canvas.width / 2, canvas.height - 10);
    
    // Подпись оси Y
    ctx.save();
    ctx.translate(15, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Место', 0, 0);
    ctx.restore();
    
    // Разметка оси X - адаптивный шаг
    ctx.font = `${fontSize.labels}px Arial`;
    ctx.textAlign = 'center';
    const rangeX = maxM - minM;
    let stepX;
    // Определяем удобный шаг в зависимости от диапазона
    if (rangeX <= 20) {
        stepX = Math.max(1, Math.ceil(rangeX / 10));
    } else if (rangeX <= 50) {
        stepX = 5;
    } else if (rangeX <= 100) {
        stepX = 10;
    } else {
        stepX = 20;
    }
    
    for (let m = minM; m <= maxM; m += stepX) {
        const x = getX(m);
        ctx.fillText(m, x, canvas.height - padding + 20);
        // Маленькая черточка на оси
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - padding);
        ctx.lineTo(x, canvas.height - padding + 5);
        ctx.stroke();
    }
    // Добавляем последнее значение, если оно не попало
    if ((maxM - minM) % stepX !== 0) {
        const x = getX(maxM);
        ctx.fillText(maxM, x, canvas.height - padding + 20);
        ctx.beginPath();
        ctx.moveTo(x, canvas.height - padding);
        ctx.lineTo(x, canvas.height - padding + 5);
        ctx.stroke();
    }
    
    // Разметка оси Y (места идут сверху вниз, 1 - лучше) - адаптивный шаг
    ctx.textAlign = 'right';
    const rangeY = maxRank - minRank;
    let stepY;
    // Определяем удобный шаг в зависимости от диапазона
    if (rangeY <= 20) {
        stepY = Math.max(1, Math.ceil(rangeY / 10));
    } else if (rangeY <= 50) {
        stepY = 5;
    } else if (rangeY <= 100) {
        stepY = 10;
    } else {
        stepY = 20;
    }
    
    for (let rank = minRank; rank <= maxRank; rank += stepY) {
        const y = getY(rank);
        ctx.fillText(rank, padding - 10, y + 5);
        // Маленькая черточка на оси
        ctx.beginPath();
        ctx.moveTo(padding - 5, y);
        ctx.lineTo(padding, y);
        ctx.stroke();
    }
    // Добавляем последнее значение, если оно не попало
    if ((maxRank - minRank) % stepY !== 0) {
        const y = getY(maxRank);
        ctx.fillText(maxRank, padding - 10, y + 5);
        ctx.beginPath();
        ctx.moveTo(padding - 5, y);
        ctx.lineTo(padding, y);
        ctx.stroke();
    }
    
    // Рисуем серую зону для периодов без данных (вне рейтинга)
    ctx.fillStyle = 'rgba(200, 200, 200, 0.2)';
    
    for (let i = 0; i < chartData.length; i++) {
        const point = chartData[i];
        
        if (point.rank === null) {
            // Находим начало и конец непрерывной серой зоны
            let startM = point.m;
            let endM = point.m;
            
            // Ищем конец зоны
            while (i < chartData.length && chartData[i].rank === null) {
                endM = chartData[i].m;
                i++;
            }
            i--; // Откатываем на один шаг назад
            
            // Рисуем серый прямоугольник
            const startX = getX(startM);
            const endX = i + 1 < chartData.length ? getX(chartData[i + 1].m) : getX(endM);
            ctx.fillRect(startX, padding, endX - startX, chartHeight);
        }
    }
    
    // Рисуем линию графика
    ctx.strokeStyle = '#2196F3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    let firstPoint = true;
    chartData.forEach(point => {
        if (point.rank !== null) {
            const x = getX(point.m);
            const y = getY(point.rank);
            
            if (firstPoint) {
                ctx.moveTo(x, y);
                firstPoint = false;
            } else {
                ctx.lineTo(x, y);
            }
        } else {
            // Разрыв линии при отсутствии данных
            firstPoint = true;
        }
    });
    ctx.stroke();
    
    // Рисуем точки
    ctx.fillStyle = '#2196F3';
    chartData.forEach(point => {
        if (point.rank !== null) {
            const x = getX(point.m);
            const y = getY(point.rank);
            
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    });
    
    // Отмечаем текущее значение M - берем напрямую из слайдера
    const topMSlider = document.getElementById('topMSlider');
    const currentM = topMSlider ? parseInt(topMSlider.value) : currentCutoffValue;
    console.log('Текущее значение M для отметки на графике:', currentM);
    
    if (currentM >= minM && currentM <= maxM) {
        const currentData = chartData.find(d => d.m === currentM);
        if (currentData && currentData.rank !== null) {
            const x = getX(currentM);
            const y = getY(currentData.rank);
            
            // Вертикальная линия
            ctx.strokeStyle = '#FF5722';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, canvas.height - padding);
            ctx.lineTo(x, padding);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Точка
            ctx.fillStyle = '#FF5722';
            ctx.beginPath();
            ctx.arc(x, y, 6, 0, 2 * Math.PI);
            ctx.fill();
            
            // Подпись
            ctx.font = `bold ${fontSize.labels}px Arial`;
            ctx.fillStyle = '#FF5722';
            ctx.textAlign = 'center';
            ctx.fillText(`M=${currentM}, Место=${currentData.rank}`, x, y - 15);
        } else if (currentData && currentData.rank === null) {
            // Участник вне рейтинга при текущем M
            const x = getX(currentM);
            
            // Вертикальная линия
            ctx.strokeStyle = '#FF5722';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(x, canvas.height - padding);
            ctx.lineTo(x, padding);
            ctx.stroke();
            ctx.setLineDash([]);
            
            // Подпись внизу
            ctx.font = `bold ${fontSize.labels}px Arial`;
            ctx.fillStyle = '#FF5722';
            ctx.textAlign = 'center';
            ctx.fillText(`M=${currentM}: вне рейтинга`, x, canvas.height - padding + 40);
        }
    }
    
    // Добавляем легенду в верхней части графика
    // Находим минимальное значение M, при котором участник попадает в рейтинг
    const firstRankedPoint = chartData.find(d => d.rank !== null);
    const minMInRank = firstRankedPoint ? firstRankedPoint.m : null;
    
    ctx.font = `${fontSize.legend}px Arial`;
    ctx.fillStyle = '#666';
    ctx.textAlign = 'left';
    
    // Серая зона (квадратик) - размещаем в верхнем левом углу
    const legendY = 15;
    ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
    ctx.fillRect(padding, legendY, 15, 15);
    
    // Текст легенды
    ctx.fillStyle = '#666';
    if (minMInRank !== null) {
        ctx.fillText(`Участник вне рейтинга (появляется в рейтинге при M ≥ ${minMInRank})`, padding + 20, legendY + 11);
    } else {
        ctx.fillText('Участник вне рейтинга (не попадает в рейтинг ни при каком M)', padding + 20, legendY + 11);
    }
}

// Обработчик закрытия модального окна
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('chartModal');
    const closeBtn = document.querySelector('.close');
    
    // Закрытие по клику на крестик
    if (closeBtn) {
        closeBtn.onclick = function() {
            modal.style.display = 'none';
        };
    }
    
    // Закрытие по клику вне окна
    window.onclick = function(event) {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}); 