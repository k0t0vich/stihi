document.getElementById('convert').addEventListener('click', async () => {
  try {
    console.log('Нажата кнопка конвертации');
    const markdown = document.getElementById('markdown').value;
    console.log('Введенный markdown:', markdown);
    
    if (!markdown.trim()) {
      throw new Error('Введите текст статьи');
    }

    const vkArticle = convertMarkdownToVK(markdown);
    console.log('Преобразованные блоки:', vkArticle);
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Текущая вкладка:', tab);
    
    if (!tab.url.includes('vk.com')) {
      throw new Error('Откройте редактор статей ВКонтакте');
    }

    chrome.tabs.sendMessage(tab.id, { 
      action: 'insertArticle', 
      article: vkArticle 
    });

    showNotification('Статья конвертирована и отправлена в редактор');
  } catch (error) {
    console.error('Ошибка при конвертации:', error);
    showNotification(error.message, 'error');
  }
});

function convertMarkdownToVK(markdown) {
  const lines = markdown.split('\n');
  const blocks = [];
  let currentBlock = null;
  
  for (let line of lines) {
    if (!line.trim()) {
      currentBlock = null;
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push({
        type: 2,
        lines: [{ text: line.substring(2).trim() }],
        children: []
      });
      currentBlock = null;
    } else if (line.startsWith('## ')) {
      blocks.push({
        type: 3,
        lines: [{ text: line.substring(3).trim() }],
        children: []
      });
      currentBlock = null;
    } else {
      if (currentBlock === null) {
        currentBlock = {
          type: 1,
          lines: [{ text: line.trim() }],
          children: []
        };
        blocks.push(currentBlock);
      } else {
        currentBlock.lines[0].text += ' ' + line.trim();
      }
    }
  }
  
  return blocks;
}

function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.textContent = message;
  notification.style.padding = '10px';
  notification.style.marginTop = '10px';
  notification.style.borderRadius = '4px';
  notification.style.backgroundColor = type === 'success' ? '#4CAF50' : '#f44336';
  notification.style.color = 'white';
  
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Сохраняем текст при закрытии popup
window.addEventListener('beforeunload', () => {
  const markdown = document.getElementById('markdown').value;
  localStorage.setItem('vkArticleMarkdown', markdown);
});

// Получаем данные при открытии popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('Popup загружен, получение данных...');
    
    // Восстанавливаем сохраненный текст
    const savedMarkdown = localStorage.getItem('vkArticleMarkdown');
    if (savedMarkdown) {
      document.getElementById('markdown').value = savedMarkdown;
      console.log('Восстановлен сохраненный текст');
    }
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('Текущая вкладка:', tab);
    
    if (!tab.url.includes('vk.com')) {
      showNotification('Откройте страницу ВКонтакте', 'error');
      return;
    }

    // Проверяем, загружен ли content script
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      console.log('Content script загружен');
    } catch (scriptError) {
      console.error('Ошибка загрузки content script:', scriptError);
      showNotification('Ошибка инициализации расширения', 'error');
      return;
    }

    // Запрашиваем перехваченные данные
    const savedData = await chrome.tabs.sendMessage(tab.id, { action: 'getSavedData' });
    console.log('Получены сохраненные данные:', savedData);
    
    if (savedData && savedData.data) {
      // Создаем или находим контейнер для данных
      let dataContainer = document.getElementById('intercepted-data');
      if (!dataContainer) {
        dataContainer = document.createElement('div');
        dataContainer.id = 'intercepted-data';
        dataContainer.style.cssText = `
          margin-bottom: 15px;
          padding: 10px;
          background: #f5f6f7;
          border-radius: 4px;
          font-size: 13px;
        `;
        document.getElementById('markdown').parentElement.insertBefore(dataContainer, document.getElementById('markdown'));
      }
      
      // Форматируем данные для отображения
      const formattedData = {
        'ID статьи': savedData.data.article_id || 'Не получен',
        'ID владельца': savedData.data.article_owner_id || 'Не получен',
        'UUID': savedData.data.uuid || 'Не получен',
        'Hash': savedData.data.hash || 'Не получен',
        'Куки': savedData.data.cookies ? Object.keys(savedData.data.cookies).length + ' куков' : 'Не получены',
        'Заголовки': savedData.data.headers ? Object.keys(savedData.data.headers).length + ' заголовков' : 'Не получены',
        'Время перехвата': new Date(savedData.data.timestamp).toLocaleString()
      };
      
      // Создаем HTML для отображения данных
      let html = `
        <div style="margin-bottom: 10px; font-weight: 500;">Перехваченные данные:</div>
      `;
      
      Object.entries(formattedData).forEach(([key, value]) => {
        html += `<div style="margin-bottom: 3px;"><span style="color: #818c99;">${key}:</span> ${value}</div>`;
      });
      
      // Добавляем кнопку для показа деталей
      html += `
        <div style="margin-top: 10px;">
          <button onclick="toggleDetails(this)" style="width: 100%; padding: 7px; background: #e5ebf1; color: #55677d; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Показать детали</button>
          <pre style="display: none; margin-top: 10px; white-space: pre-wrap; background: #fafbfc; padding: 10px; border-radius: 4px; color: #2e2e2e; font-size: 12px;">${JSON.stringify(savedData.data, null, 2)}</pre>
        </div>
        <div style="margin-top: 10px;">
          <button onclick="reloadAndIntercept()" style="width: 100%; padding: 8px; background: #5181b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
            Перезагрузить страницу и перехватить данные
          </button>
        </div>
      `;
      
      dataContainer.innerHTML = html;
      
      // Добавляем функции в глобальную область
      window.toggleDetails = function(button) {
        const pre = button.nextElementSibling;
        pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
        button.textContent = pre.style.display === 'none' ? 'Показать детали' : 'Скрыть детали';
      };
      
      window.reloadAndIntercept = async function() {
        try {
          console.log('Начало перезагрузки страницы...');
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          
          if (!tab) {
            console.error('Не удалось получить текущую вкладку');
            return;
          }
          
          // Отправляем сообщение в content script
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'reloadAndIntercept' });
          console.log('Ответ от content script:', response);
          
          if (response && response.success) {
            showNotification('Страница будет перезагружена для перехвата данных');
          } else {
            showNotification('Ошибка при перезагрузке страницы', 'error');
          }
        } catch (error) {
          console.error('Ошибка при перезагрузке страницы:', error);
          showNotification('Ошибка при перезагрузке страницы', 'error');
        }
      };
    }
  } catch (error) {
    console.error('Общая ошибка:', error);
    console.error('Стек ошибки:', error.stack);
    showNotification('Ошибка при получении данных статьи', 'error');
  }
});

function convertVKToMarkdown(blocks) {
  return blocks.map(block => {
    switch (block.type) {
      case 2: // Заголовок
        return `# ${block.lines[0].text}`;
      case 3: // Подзаголовок
        return `## ${block.lines[0].text}`;
      default: // Обычный текст
        return block.lines[0].text;
    }
  }).join('\n\n');
}

// Добавляем функцию для отображения отладочной информации
function showDebugInfo(message) {
  let debugContainer = document.getElementById('debug-info');
  if (!debugContainer) {
    debugContainer = document.createElement('div');
    debugContainer.id = 'debug-info';
    debugContainer.style.cssText = `
      margin-top: 15px;
      padding: 10px;
      background: #f5f6f7;
      border-radius: 4px;
      font-size: 12px;
      font-family: monospace;
      max-height: 200px;
      overflow-y: auto;
      white-space: pre-wrap;
    `;
    document.body.appendChild(debugContainer);
  }
  
  const timestamp = new Date().toLocaleTimeString();
  const debugMessage = `[${timestamp}] ${message}\n`;
  debugContainer.textContent += debugMessage;
  debugContainer.scrollTop = debugContainer.scrollHeight;
}

// Обновляем функцию reloadAndIntercept
window.reloadAndIntercept = async function() {
  try {
    showDebugInfo('=== Начало процесса перезагрузки ===');
    showDebugInfo('1. Получение текущей вкладки...');
    
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab) {
      showDebugInfo('ОШИБКА: Не удалось получить текущую вкладку');
      return;
    }
    
    showDebugInfo(`2. Текущая вкладка получена: ID=${tab.id}, URL=${tab.url}`);
    showDebugInfo('3. Отправка сообщения в content script...');
    
    // Отправляем сообщение в content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'reloadAndIntercept' });
    showDebugInfo(`4. Ответ от content script: ${JSON.stringify(response, null, 2)}`);
    
    if (response && response.success) {
      showDebugInfo('5. Сообщение успешно отправлено, ожидание перезагрузки...');
      // Добавляем небольшую задержку перед закрытием попапа
      setTimeout(() => {
        showDebugInfo('6. Закрытие попапа...');
        window.close();
      }, 1000);
    } else {
      showDebugInfo('ОШИБКА: Не получен успешный ответ от content script');
    }
  } catch (error) {
    showDebugInfo('=== ОШИБКА ===');
    showDebugInfo(`Сообщение: ${error.message}`);
    showDebugInfo(`Стек: ${error.stack}`);
  }
};

// Обновляем обработчик сообщений
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  showDebugInfo(`Получено сообщение: ${JSON.stringify(request, null, 2)}`);
  
  if (request.action === 'updatePopupData') {
    showDebugInfo(`Обновление данных попапа: ${JSON.stringify(request.data, null, 2)}`);
    
    // Создаем или находим контейнер для данных
    let dataContainer = document.getElementById('intercepted-data');
    if (!dataContainer) {
      dataContainer = document.createElement('div');
      dataContainer.id = 'intercepted-data';
      dataContainer.style.cssText = `
        margin-bottom: 15px;
        padding: 10px;
        background: #f5f6f7;
        border-radius: 4px;
        font-size: 13px;
      `;
      document.getElementById('markdown').parentElement.insertBefore(dataContainer, document.getElementById('markdown'));
    }
    
    // Форматируем данные для отображения
    const formattedData = {
      'ID статьи': request.data.article_id || 'Не получен',
      'ID владельца': request.data.article_owner_id || 'Не получен',
      'UUID': request.data.uuid || 'Не получен',
      'Hash': request.data.hash || 'Не получен',
      'Куки': request.data.cookies ? Object.keys(request.data.cookies).length + ' куков' : 'Не получены',
      'Заголовки': request.data.headers ? Object.keys(request.data.headers).length + ' заголовков' : 'Не получены',
      'Время перехвата': new Date(request.data.timestamp).toLocaleString()
    };
    
    // Создаем HTML для отображения данных
    let html = `
      <div style="margin-bottom: 10px; font-weight: 500;">Перехваченные данные:</div>
    `;
    
    Object.entries(formattedData).forEach(([key, value]) => {
      html += `<div style="margin-bottom: 3px;"><span style="color: #818c99;">${key}:</span> ${value}</div>`;
    });
    
    // Добавляем кнопку для показа деталей
    html += `
      <div style="margin-top: 10px;">
        <button onclick="toggleDetails(this)" style="width: 100%; padding: 7px; background: #e5ebf1; color: #55677d; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">Показать детали</button>
        <pre style="display: none; margin-top: 10px; white-space: pre-wrap; background: #fafbfc; padding: 10px; border-radius: 4px; color: #2e2e2e; font-size: 12px;">${JSON.stringify(request.data, null, 2)}</pre>
      </div>
      <div style="margin-top: 10px;">
        <button onclick="reloadAndIntercept()" style="width: 100%; padding: 8px; background: #5181b8; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
          Перезагрузить страницу и перехватить данные
        </button>
      </div>
    `;
    
    dataContainer.innerHTML = html;
    
    // Добавляем функции в глобальную область
    window.toggleDetails = function(button) {
      const pre = button.nextElementSibling;
      pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
      button.textContent = pre.style.display === 'none' ? 'Показать детали' : 'Скрыть детали';
    };
    
    window.reloadAndIntercept = async function() {
      try {
        console.log('Начало перезагрузки страницы...');
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab) {
          console.error('Не удалось получить текущую вкладку');
          return;
        }
        
        // Отправляем сообщение в content script
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'reloadAndIntercept' });
        console.log('Ответ от content script:', response);
        
        if (response && response.success) {
          showNotification('Страница будет перезагружена для перехвата данных');
        } else {
          showNotification('Ошибка при перезагрузке страницы', 'error');
        }
      } catch (error) {
        console.error('Ошибка при перезагрузке страницы:', error);
        showNotification('Ошибка при перезагрузке страницы', 'error');
      }
    };
  }
}); 