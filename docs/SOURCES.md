# Источники для автоматического поиска — Lead Hunter 0.2

## 2ГИС (приоритет 1)
- Официальный API: https://docs.2gis.com/api/search/places/reference/3.0/items
- Адаптер `src/providers/2gis.js`, GET `https://catalog.api.2gis.com/3.0/items`.
- Поиск: `q=ниша+город`, `type=branch`, `page`, `page_size`, `has_site`. Не более 12 запросов за задание.
- Ответ: `result.items[].id/name/address_name`. Поле `items.contact_groups` (сайты, телефоны, email) требует дополнительного доступа.
- Для хранения организаций в CRM нужен соответствующий договор. Без `DGIS_API_KEY` и `DGIS_STORAGE_ALLOWED=true` адаптер не активен. Флаг — заявление администратора, не подтверждение лицензии.
- Если нет доступа к `contact_groups`, результат может не содержать сайт или телефон. `has_site=false` означает «не указан в 2ГИС», а не «сайта нет вообще».
- Тарифы, ключи, условия: https://docs.2gis.com/en/platform-manager/subscription/pricing и https://law.2gis.ru/webapi-offer

## Яндекс Карты (приоритет 2)
- Официальное API Поиска по организациям: https://yandex.ru/maps-api/docs/geosearch-api/request.html
- Адаптер `src/providers/yandex.js`; GET `https://search-maps.yandex.ru/v1/` с `type=biz`, `text`, `results`, `skip`.
- Результат `features[].properties.CompanyMetaData` (название, ссылка, адрес, телефон, URL).
- Обычная лицензия Яндекс API Поиска организаций запрещает постоянное хранение результатов: https://yandex.com/dev/commercial/doc/ru/concepts/geosearch
- Поэтому адаптер по умолчанию неактивен; нужен ключ и особое подтверждённое право на такой тип использования.

## OpenStreetMap / Overpass (бесплатный пилот)
- `src/providers/osm.js` — работает без ключей при доступном Overpass endpoint.
- `.env.example` содержит публичный endpoint для небольшого ручного пробного поиска.
- При публичном Overpass максимум 50 записей и 3 ниши за запрос. Иногда сервис перегружен.
- OSM не является исчерпывающей базой компаний, покрытие ниш неполное.
- Данные по ODbL 1.0: https://www.openstreetmap.org/copyright
- Общий публичный сервер не предназначен для регулярного массового поиска: https://dev.overpass-api.de/overpass-doc/en/preface/commons.html

## Данные и безопасность
- Ключи в `.env`, только серверные запросы; не добавлять их во frontend.
- Не запускайте массовый параллельный поиск, соблюдайте лимиты провайдеров.
- Пустой URL в базе — неизвестный URL, а не доказательство, что сайта нет.
- Делайте адресный аудит только известных сайтов и соблюдайте законодательство о рекламе и данных.
- Устойчивость живого подключения карт требуется подтвердить после получения реальных ключей; тесты в архиве проверяют нормализацию ответов на локальных фикстурах.
