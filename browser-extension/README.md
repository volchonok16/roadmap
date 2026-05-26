# Расширение TFS Roadmap Bridge

Читает cookie уже открытой сессии `tfs.t2.ru` (включая **HttpOnly**, которые недоступны странице Roadmap на localhost) и передаёт их backend.

## Установка (Chrome / Edge)

1. Откройте `chrome://extensions`
2. Включите **Режим разработчика**
3. **Загрузить распакованное** → выберите папку `browser-extension`
4. Откройте Roadmap: http://localhost:5173
5. Убедитесь, что в соседней вкладке вы уже вошли в TFS
6. Нажмите иконку расширения → **Подключить к Roadmap**
