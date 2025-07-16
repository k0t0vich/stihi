function isArticleEditPage() {
  const url = window.location.href;
  console.log('Текущий URL:', url);
  const isEditPage = url.includes('vk.com/feed?z=article_edit');
  console.log('Это страница редактирования?', isEditPage);
  return isEditPage;
}

// Добавляем флаг для отслеживания состояния расширения
let isExtensionActive = false;

// Добавляем глобальную переменную для хранения перехваченных данных
let interceptedData = null;

// Обновляем обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('Получено сообщение:', request);
  console.log('Отправитель:', sender);
  
  try {
    if (!isArticleEditPage()) {
      console.log('Не страница редактирования статьи');
      sendResponse({ error: 'Необходимо открыть страницу редактирования статьи' });
      return true;
    }
    
    if (request.action === 'getSavedData') {
      console.log('Запрос на получение сохраненных данных');
      // Пробуем получить данные из localStorage
      const savedData = localStorage.getItem('article_data');
      if (savedData) {
        try {
          const data = JSON.parse(savedData);
          console.log('Отправка сохраненных данных:', data);
          sendResponse({ data });
        } catch (error) {
          console.error('Ошибка при парсинге данных:', error);
          sendResponse({ error: 'Ошибка при получении данных' });
        }
      } else {
        // Если нет сохраненных данных, собираем текущие
        const currentData = {
          article_id: new URLSearchParams(window.location.search).get('article_id') || '',
          article_owner_id: new URLSearchParams(window.location.search).get('owner_id') || '',
          uuid: document.querySelector('input[name="uuid"]')?.value || '',
          hash: document.querySelector('input[name="hash"]')?.value || '',
          cookies: getAllCookies(),
          headers: {},
          timestamp: Date.now()
        };
        console.log('Отправка текущих данных:', currentData);
        sendResponse({ data: currentData });
      }
      return true;
    }
    
    if (request.action === 'reloadAndIntercept') {
      console.log('=== Начало обработки reloadAndIntercept в content.js ===');
      try {
        console.log('1. Сохранение флага need_intercept...');
        localStorage.setItem('need_intercept', 'true');
        
        console.log('2. Очистка старых данных...');
        localStorage.removeItem('article_data');
        
        console.log('3. Отправка ответа в popup...');
        sendResponse({ success: true });
        
        console.log('4. Вызов window.location.reload()...');
        window.location.reload();
        
        console.log('5. Перезагрузка страницы инициирована');
      } catch (error) {
        console.error('=== ОШИБКА В content.js ===');
        console.error('Сообщение:', error.message);
        console.error('Стек:', error.stack);
        sendResponse({ error: 'Ошибка при перезагрузке страницы' });
      }
      return true;
    }
    
    if (request.action === 'activateExtension') {
      console.log('Активация расширения');
      // Не нужно ничего делать, т.к. попап уже отображается при загрузке страницы
      sendResponse({ success: true });
      return true;
    }
    
    if (request.action === 'insertArticle') {
      console.log('Начало сохранения статьи');
      const articleData = prepareArticleData(request.article);
      console.log('Подготовленные данные:', articleData);
      saveArticle(articleData);
    } else if (request.action === 'getArticleData') {
      console.log('Получение данных статьи');
      const articleData = getArticleData();
      console.log('Полученные данные:', articleData);
      sendResponse(articleData);
      return true;
    } else {
      console.error('Неизвестное действие:', request.action);
      sendResponse({ error: 'Неизвестное действие' });
      return true;
    }
  } catch (error) {
    console.error('Ошибка в обработчике сообщений:', error);
    console.error('Стек ошибки:', error.stack);
    sendResponse({ error: 'Внутренняя ошибка: ' + error.message });
    return true;
  }
});

function prepareArticleData(blocks) {
  console.log('Подготовка данных статьи...');
  
  try {
    // Получаем необходимые параметры
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('article_id') || '';
    const ownerId = urlParams.get('owner_id') || '';
    const uuid = document.querySelector('input[name="uuid"]')?.value || '';
    const hash = document.querySelector('input[name="hash"]')?.value || '';
    
    // Форматируем блоки статьи
    const formattedBlocks = blocks.map(block => {
      return {
        type: block.type || 1,
        lines: block.lines || [{ text: block.text || '' }],
        children: block.children || []
      };
    });
    
    // Формируем данные для запроса
    const data = new URLSearchParams({
      'Article_text': JSON.stringify(formattedBlocks),
      '_smt': 'feed:10',
      'act': 'save',
      'al': '1',
      'article_id': articleId,
      'article_owner_id': ownerId,
      'chunks_count': '0',
      'cover_photo_id': '',
      'hash': hash,
      'is_published': '0',
      'name': 'Черновик',
      'uuid': uuid
    });
    
    console.log('Подготовленные данные:', data.toString());
    return data;
  } catch (error) {
    console.error('Ошибка при подготовке данных статьи:', error);
    throw error;
  }
}

// Функция для создания блока текста
function createTextBlock(text) {
  return {
    type: 1,
    lines: [{ text: text }],
    children: []
  };
}

// Функция для создания блока заголовка
function createTitleBlock(text) {
  return {
    type: 2,
    lines: [{ text: text }],
    children: []
  };
}

// Функция для создания блока подзаголовка
function createSubtitleBlock(text) {
  return {
    type: 3,
    lines: [{ text: text }],
    children: []
  };
}

// Функция для конвертации markdown в блоки статьи
function convertMarkdownToBlocks(markdown) {
  console.log('Конвертация markdown в блоки...');
  
  try {
    const blocks = [];
    const lines = markdown.split('\n');
    
    lines.forEach(line => {
      line = line.trim();
      if (!line) return;
      
      if (line.startsWith('# ')) {
        blocks.push(createTitleBlock(line.substring(2)));
      } else if (line.startsWith('## ')) {
        blocks.push(createSubtitleBlock(line.substring(3)));
      } else {
        blocks.push(createTextBlock(line));
      }
    });
    
    console.log('Созданные блоки:', blocks);
    return blocks;
  } catch (error) {
    console.error('Ошибка при конвертации markdown:', error);
    throw error;
  }
}

async function saveArticle(formData) {
  try {
    console.log('Начало сохранения статьи...');
    
    // Получаем необходимые параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('article_id') || '';
    const ownerId = urlParams.get('owner_id') || '';
    
    // Получаем uuid и hash из формы
    const uuid = document.querySelector('input[name="uuid"]')?.value || '';
    const hash = document.querySelector('input[name="hash"]')?.value || '';
    
    // Формируем данные для запроса
    const data = new URLSearchParams({
      'Article_text': formData.get('Article_text') || '[]',
      '_smt': 'feed:10',
      'act': 'save',
      'al': '1',
      'article_id': articleId,
      'article_owner_id': ownerId,
      'chunks_count': '0',
      'cover_photo_id': '',
      'hash': hash,
      'is_published': '0',
      'name': 'Черновик',
      'uuid': uuid
    });
    
    // Отправляем запрос через background script
    const response = await chrome.runtime.sendMessage({
      action: 'sendVKRequest',
      url: 'https://vk.com/al_articles.php?act=save',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'https://vk.com',
        'Referer': window.location.href
      },
      body: data.toString()
    });
    
    console.log('Ответ от сервера:', response);
    
    if (response.success) {
      console.log('Статья успешно сохранена');
    } else {
      console.error('Ошибка при сохранении статьи:', response.error);
    }
  } catch (error) {
    console.error('Ошибка при сохранении статьи:', error);
  }
}

function getArticleData() {
  console.log('Начало получения данных статьи');
  
  try {
    // Проверяем наличие необходимых элементов
    const contentElement = document.querySelector('.article_ed_layer__content');
    if (!contentElement) {
      console.error('Не найден элемент .article_ed_layer__content');
      throw new Error('Не найден элемент контента статьи');
    }
    
    // Получаем заголовок статьи
    const titleElement = document.querySelector('.article_ed_layer__title');
    const title = titleElement?.textContent || '';
    console.log('Заголовок статьи:', title);
    
    // Получаем все блоки статьи
    const blocks = [];
    const articleBlocks = contentElement.querySelectorAll('.article_ed_block');
    console.log('Найдено блоков:', articleBlocks.length);
    
    if (articleBlocks.length === 0) {
      console.log('Статья пуста или блоки не найдены');
    }
    
    articleBlocks.forEach((block, index) => {
      console.log(`Обработка блока ${index}:`, block);
      const type = getBlockType(block);
      const textElement = block.querySelector('.article_ed_block__text');
      const text = textElement?.textContent || '';
      console.log(`Тип блока: ${type}, Текст: ${text}`);
      
      blocks.push({
        type: type,
        lines: [{ text: text }],
        children: []
      });
    });

    // Получаем дополнительные параметры
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('article_id') || '';
    const ownerId = urlParams.get('owner_id') || '';
    const uuid = document.querySelector('input[name="uuid"]')?.value || '';
    const hash = document.querySelector('input[name="hash"]')?.value || '';
    
    const data = {
      blocks: blocks,
      title: title,
      articleId: articleId,
      ownerId: ownerId,
      uuid: uuid,
      hash: hash,
      isPublished: document.querySelector('.article_ed_layer__publish')?.classList.contains('article_ed_layer__publish--active') || false
    };
    
    console.log('Итоговые данные:', data);
    return data;
  } catch (error) {
    console.error('Ошибка при получении данных статьи:', error);
    console.error('Стек ошибки:', error.stack);
    throw error;
  }
}

function getBlockType(block) {
  // Определяем тип блока по его классам
  if (block.classList.contains('article_ed_block--title')) return 2;
  if (block.classList.contains('article_ed_block--subtitle')) return 3;
  return 1; // обычный текст
}

// Функция для патчинга страницы редактирования
function patchEditPage() {
  console.log('Начало патчинга страницы редактирования');
  
  // Находим форму редактирования
  const form = document.querySelector('form[action="/al_articles.php"]');
  if (!form) {
    console.error('Форма редактирования не найдена');
    return;
  }
  
  // Сохраняем оригинальный обработчик отправки формы
  const originalSubmit = form.onsubmit;
  
  // Патчим обработчик отправки формы
  form.onsubmit = async function(e) {
    e.preventDefault();
    console.log('Перехват отправки формы');
    
    try {
      // Получаем необходимые параметры
      const urlParams = new URLSearchParams(window.location.search);
      const articleId = urlParams.get('article_id') || '';
      const ownerId = urlParams.get('owner_id') || '';
      const uuid = document.querySelector('input[name="uuid"]')?.value || '';
      const hash = document.querySelector('input[name="hash"]')?.value || '';
      
      // Собираем данные формы
      const formData = new FormData(form);
      const data = new URLSearchParams({
        'Article_text': formData.get('Article_text') || '[]',
        '_smt': 'feed:10',
        'act': 'save',
        'al': '1',
        'article_id': articleId,
        'article_owner_id': ownerId,
        'chunks_count': '0',
        'cover_photo_id': '',
        'hash': hash,
        'is_published': '0',
        'name': 'Черновик',
        'uuid': uuid
      });
      
      // Отправляем запрос через background script
      const response = await chrome.runtime.sendMessage({
        action: 'sendVKRequest',
        url: 'https://vk.com/al_articles.php?act=save',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
          'Origin': 'https://vk.com',
          'Referer': window.location.href
        },
        body: data.toString()
      });
      
      console.log('Ответ от сервера:', response);
      
      // Если есть оригинальный обработчик, вызываем его
      if (originalSubmit) {
        return originalSubmit.call(this, e);
      }
    } catch (error) {
      console.error('Ошибка при отправке формы:', error);
    }
  };
  
  // Патчим функцию сохранения черновика
  const saveDraftButton = document.querySelector('.article_ed_layer__save');
  if (saveDraftButton) {
    const originalClick = saveDraftButton.onclick;
    saveDraftButton.onclick = async function(e) {
      e.preventDefault();
      console.log('Перехват сохранения черновика');
      
      try {
        // Получаем необходимые параметры
        const urlParams = new URLSearchParams(window.location.search);
        const articleId = urlParams.get('article_id') || '';
        const ownerId = urlParams.get('owner_id') || '';
        const uuid = document.querySelector('input[name="uuid"]')?.value || '';
        const hash = document.querySelector('input[name="hash"]')?.value || '';
        
        // Собираем данные формы
        const formData = new FormData(form);
        const data = new URLSearchParams({
          'Article_text': formData.get('Article_text') || '[]',
          '_smt': 'feed:10',
          'act': 'save',
          'al': '1',
          'article_id': articleId,
          'article_owner_id': ownerId,
          'chunks_count': '0',
          'cover_photo_id': '',
          'hash': hash,
          'is_published': '0',
          'name': 'Черновик',
          'uuid': uuid
        });
        
        // Отправляем запрос через background script
        const response = await chrome.runtime.sendMessage({
          action: 'sendVKRequest',
          url: 'https://vk.com/al_articles.php?act=save',
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Origin': 'https://vk.com',
            'Referer': window.location.href
          },
          body: data.toString()
        });
        
        console.log('Ответ от сервера:', response);
        
        // Если есть оригинальный обработчик, вызываем его
        if (originalClick) {
          return originalClick.call(this, e);
        }
      } catch (error) {
        console.error('Ошибка при сохранении черновика:', error);
      }
    };
  }
  
  console.log('Патчинг страницы редактирования завершен');
}

// Функция для анализа страницы редактирования
function analyzeEditPage() {
  console.log('Начало анализа страницы редактирования');
  
  // Анализируем все скрипты на странице
  const scripts = document.querySelectorAll('script');
  console.log('Найдено скриптов:', scripts.length);
  
  scripts.forEach((script, index) => {
    console.log(`\nСкрипт ${index}:`);
    console.log('src:', script.src);
    console.log('type:', script.type);
    console.log('content:', script.textContent);
  });
  
  // Анализируем все формы
  const forms = document.querySelectorAll('form');
  console.log('\nНайдено форм:', forms.length);
  
  forms.forEach((form, index) => {
    console.log(`\nФорма ${index}:`);
    console.log('action:', form.action);
    console.log('method:', form.method);
    console.log('onsubmit:', form.onsubmit);
    
    // Анализируем поля формы
    const inputs = form.querySelectorAll('input, textarea, select');
    console.log('Поля формы:', inputs.length);
    inputs.forEach(input => {
      console.log('-', input.name, ':', input.type, ':', input.value);
    });
  });
  
  // Анализируем все обработчики событий
  const elements = document.querySelectorAll('*');
  console.log('\nАнализ обработчиков событий:');
  
  elements.forEach(element => {
    const events = getEventListeners(element);
    if (events && Object.keys(events).length > 0) {
      console.log(`\nЭлемент ${element.tagName} (${element.className}):`);
      Object.entries(events).forEach(([event, listeners]) => {
        console.log(`- ${event}:`, listeners.length, 'обработчиков');
      });
    }
  });
  
  console.log('\nАнализ страницы завершен');
}

// Функция для получения обработчиков событий элемента
function getEventListeners(element) {
  const events = {};
  
  // Получаем все обработчики событий
  const eventTypes = ['click', 'submit', 'change', 'input', 'keyup', 'keydown', 'mouseup', 'mousedown'];
  
  eventTypes.forEach(eventType => {
    const listeners = element[`on${eventType}`];
    if (listeners) {
      events[eventType] = [listeners];
    }
  });
  
  return events;
}

// Функция для открытия редактора
async function openEditor() {
  try {
    console.log('Открытие редактора...');
    
    // Получаем необходимые параметры из URL
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('article_id') || '';
    const ownerId = urlParams.get('owner_article_id') || '';
    
    // Отправляем запрос через background script
    const response = await chrome.runtime.sendMessage({
      action: 'sendVKRequest',
      url: 'https://vk.com/al_articles.php?act=open_editor',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'chrome-extension://nffkgbcbgfejolldjeklmncdgbghffja',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Storage-Access': 'active'
      },
      body: new URLSearchParams({
        'act': 'open_editor',
        'al': '1',
        'article_id': articleId,
        'article_owner_id': ownerId,
        'from_post_convert': '0',
        'post_data_medias': ''
      }).toString()
    });
    
    console.log('Ответ от сервера:', response);
    
    if (response.success) {
      // Если редактор успешно открыт, начинаем анализ страницы
      analyzeEditPage();
    }
  } catch (error) {
    console.error('Ошибка при открытии редактора:', error);
  }
}

// Обновляем обработчик сообщений
function interceptRequest() {
  console.log('Настройка перехвата запроса...');
  
  // Создаем прокси для XMLHttpRequest
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new originalXHR();
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const originalSetRequestHeader = xhr.setRequestHeader;
    
    xhr.open = function(method, url) {
      console.log('Перехвачен запрос:', method, url);
      
      // Сохраняем оригинальные заголовки
      const originalHeaders = {};
      xhr.setRequestHeader = function(header, value) {
        originalHeaders[header.toLowerCase()] = value;
        return originalSetRequestHeader.apply(this, arguments);
      };
      
      // Перехватываем запрос сохранения статьи
      if (url.includes('al_articles.php?act=save')) {
        console.log('Найден запрос сохранения статьи');
        
        this.addEventListener('load', function() {
          try {
            const response = JSON.parse(this.responseText);
            console.log('Ответ от сервера:', response);
            
            // Получаем данные из запроса
            const formData = new URLSearchParams(this._requestData);
            const articleId = formData.get('article_id') || '';
            const ownerId = formData.get('article_owner_id') || '';
            const uuid = formData.get('uuid') || '';
            const hash = formData.get('hash') || '';
            
            // Сохраняем перехваченные данные
            interceptedData = {
              article_id: articleId,
              article_owner_id: ownerId,
              uuid: uuid,
              hash: hash,
              cookies: getAllCookies(),
              headers: originalHeaders,
              timestamp: Date.now()
            };
            
            console.log('Перехваченные данные:', interceptedData);
            
            // Сохраняем данные в localStorage
            localStorage.setItem('article_data', JSON.stringify(interceptedData));
            
            // Отправляем данные в попап
            displayInterceptedData(interceptedData);
          } catch (error) {
            console.error('Ошибка при обработке ответа:', error);
          }
        });
      }
      
      return originalOpen.apply(this, arguments);
    };
    
    xhr.send = function(data) {
      console.log('Отправляемые данные:', data);
      this._requestData = data; // Сохраняем данные запроса
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  };
  
  console.log('Перехват запроса настроен');
}

// Функция для получения всех куков
function getAllCookies() {
  const cookies = {};
  document.cookie.split(';').forEach(cookie => {
    const [name, value] = cookie.trim().split('=');
    cookies[name] = value;
  });
  return cookies;
}

// Функция для форматирования куков в строку
function formatCookies(cookies) {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

// Обновляем функцию sendVKRequests
async function sendVKRequests() {
  try {
    console.log('Отправка запросов к API ВКонтакте...');
    
    // Получаем все куки
    const cookies = getAllCookies();
    console.log('Полученные куки:', cookies);
    
    // Создаем и отправляем запрос через background script
    const response = await chrome.runtime.sendMessage({
      action: 'sendVKRequest',
      url: 'https://vk.com/al_articles.php?act=open_editor',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Origin': 'chrome-extension://nffkgbcbgfejolldjeklmncdgbghffja',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Storage-Access': 'active',
        'Cookie': formatCookies(cookies)
      },
      body: new URLSearchParams({
        'act': 'open_editor',
        'al': '1',
        'article_id': '',
        'article_owner_id': '',
        'from_post_convert': '0',
        'post_data_medias': ''
      }).toString()
    });
    
    console.log('Ответ от сервера:', response);
    
    if (response.success) {
      const interceptedData = {
        article_id: response.payload?.article_id || '',
        article_owner_id: response.payload?.article_owner_id || '',
        uuid: document.querySelector('input[name="uuid"]')?.value || '',
        hash: document.querySelector('input[name="hash"]')?.value || '',
        cookies: cookies,
        headers: response.headers || {},
        timestamp: Date.now()
      };
      
      displayInterceptedData(interceptedData);
      patchEditPage();
    } else {
      console.error('Ошибка при отправке запроса:', response.error);
    }
  } catch (error) {
    console.error('Ошибка при отправке запросов к API ВКонтакте:', error);
  }
}

// Вспомогательные функции
function getAccessToken() {
  // Получаем токен из куки
  const match = document.cookie.match(/remixsid=([^;]+)/);
  return match ? match[1] : '';
}

function generateKey() {
  // Генерируем случайный ключ для запросов
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Обновляем код, который выполняется при загрузке страницы
if (isArticleEditPage()) {
  console.log('Страница редактирования статьи загружена');
  
  // Проверяем, нужно ли перехватить данные
  const needIntercept = localStorage.getItem('need_intercept') === 'true';
  if (needIntercept) {
    console.log('Требуется перехват данных');
    localStorage.removeItem('need_intercept');
    
    // Добавляем небольшую задержку перед перехватом
    setTimeout(() => {
      interceptRequest();
      // Отправляем запрос для получения данных
      sendVKRequests();
    }, 1000);
  }
  
  // Пробуем восстановить данные из localStorage
  const savedData = localStorage.getItem('article_data');
  if (savedData) {
    try {
      interceptedData = JSON.parse(savedData);
      console.log('Восстановлены сохраненные данные:', interceptedData);
    } catch (error) {
      console.error('Ошибка при восстановлении данных:', error);
    }
  }

  // Отображаем данные сразу при загрузке
  let currentData = interceptedData;
  if (!currentData) {
    console.log('Собираем текущие данные со страницы');
    currentData = {
      article_id: new URLSearchParams(window.location.search).get('article_id') || '',
      article_owner_id: new URLSearchParams(window.location.search).get('owner_id') || '',
      uuid: document.querySelector('input[name="uuid"]')?.value || '',
      hash: document.querySelector('input[name="hash"]')?.value || '',
      cookies: getAllCookies(),
      headers: {},
      timestamp: Date.now()
    };
  }
  displayInterceptedData(currentData);
}

// Функция для обновления заголовка статьи
function updateArticleTitle(title) {
  console.log('Обновление заголовка статьи:', title);
  
  try {
    const titleElement = document.querySelector('.article_ed_layer__title');
    if (!titleElement) {
      console.error('Не найден элемент заголовка');
      throw new Error('Не найден элемент заголовка');
    }
    
    // Обновляем текст заголовка
    titleElement.textContent = title;
    
    // Создаем событие input для обновления состояния формы
    const inputEvent = new Event('input', {
      bubbles: true,
      cancelable: true
    });
    titleElement.dispatchEvent(inputEvent);
    
    console.log('Заголовок успешно обновлен');
  } catch (error) {
    console.error('Ошибка при обновлении заголовка:', error);
    throw error;
  }
}

// Функция для обновления состояния публикации
function updatePublishState(isPublished) {
  console.log('Обновление состояния публикации:', isPublished);
  
  try {
    const publishButton = document.querySelector('.article_ed_layer__publish');
    if (!publishButton) {
      console.error('Не найдена кнопка публикации');
      throw new Error('Не найдена кнопка публикации');
    }
    
    // Обновляем состояние кнопки
    if (isPublished) {
      publishButton.classList.add('article_ed_layer__publish--active');
    } else {
      publishButton.classList.remove('article_ed_layer__publish--active');
    }
    
    // Создаем событие click для обновления состояния
    const clickEvent = new Event('click', {
      bubbles: true,
      cancelable: true
    });
    publishButton.dispatchEvent(clickEvent);
    
    console.log('Состояние публикации успешно обновлено');
  } catch (error) {
    console.error('Ошибка при обновлении состояния публикации:', error);
    throw error;
  }
}

// Функция для отображения перехваченных данных
function displayInterceptedData(data) {
  console.log('Отправка перехваченных данных в попап:', data);
  
  try {
    // Отправляем данные в попап
    chrome.runtime.sendMessage({
      action: 'updatePopupData',
      data: data
    });
  } catch (error) {
    console.error('Ошибка при отправке данных в попап:', error);
  }
} 