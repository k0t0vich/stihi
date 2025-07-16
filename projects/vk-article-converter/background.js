chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'sendVKRequest') {
    const { url, method, headers, body } = request;
    
    fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      body: body,
      credentials: 'include'
    })
    .then(response => response.json())
    .then(data => sendResponse({ success: true, data }))
    .catch(error => sendResponse({ success: false, error: error.message }));
    
    return true; // Важно для асинхронного ответа
  }

  if (request.action === 'reloadTab') {
    console.log('Перезагрузка вкладки:', sender.tab.id);
    if (sender.tab && sender.tab.id) {
      chrome.tabs.reload(sender.tab.id);
      sendResponse({ success: true });
    } else {
      console.error('Не удалось получить ID вкладки');
      sendResponse({ error: 'Не удалось получить ID вкладки' });
    }
    return true;
  }
}); 