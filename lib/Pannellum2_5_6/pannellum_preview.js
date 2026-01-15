var sceneMain = null;
var currentScene = null;
var selectedCoords = null;
var isInitialized = false;

// Инициализация
document.addEventListener('DOMContentLoaded', function() {
    requestAnimationFrame(function() {
        loadInitialScene();
    });
});

function loadInitialScene() {
    setSelectPanorama();
    isInitialized = true;
}

function setSelectPanorama() {
    let params = new URLSearchParams(document.location.search);
    let photoValue = params.get('photo');
    let canvas = document.getElementById('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';

    if (photoValue) {
        var imageUrl = photoValue;
        var isExternal = /^https?:\/\//i.test(photoValue);

        let jsonObj = {
            "hotSpotDebug": false,
            "hotPointDebug": false,
            "sceneFadeDuration": 500,
            "default": {
                "firstScene": "scene1"
            },
            "scenes": {
                "scene1": {
                    "title": "Предпросмотр",
                    "panorama": imageUrl,
                    // Ключевое изменение: для внешних URL устанавливаем crossOrigin в undefined
                    "crossOrigin": isExternal ? undefined : "use-credentials",
                    "autoLoad": true,
                    "yaw": 0,
                    "pitch": 0,
                    "hotSpots": []
                }
            }
        };

        // Обработчик двойного клика на сцене
        jsonObj.onDblClick = function(coords, screenCoords, event) {
            console.log("Double click on preview scene:", {
                coords: coords,
                screenCoords: screenCoords,
                event: event
            });

            // Фиксируем координаты
            if (sceneMain && coords) {
                // Получаем текущее направление взгляда камеры
                var viewCoords = {
                    yaw: sceneMain.getYaw(),
                    pitch: sceneMain.getPitch()
                };

                // Сохраняем выбранные координаты
                selectedCoords = {
                    click: {
                        yaw: coords.yaw,
                        pitch: coords.pitch
                    },
                    view: viewCoords
                };

                // Показываем информацию о выбранных координатах
                showSelectedCoords();

                // Отправляем координаты в родительское окно
                sendCoordsToParent();

                // Подсвечиваем блок информации с помощью requestAnimationFrame
                var infoDiv = document.getElementById('coordsInfo');
                infoDiv.classList.add('highlight');

                // Используем requestAnimationFrame для анимации
                var startTime = null;
                function animateHighlight(timestamp) {
                    if (!startTime) startTime = timestamp;
                    var elapsed = timestamp - startTime;

                    if (elapsed < 2000) {
                        requestAnimationFrame(animateHighlight);
                    } else {
                        infoDiv.classList.remove('highlight');
                    }
                }

                requestAnimationFrame(animateHighlight);
            }
        };

        // Обработчик простого клика для показа информации
        jsonObj.onClick = function(coords, screenCoords, event) {
            if (sceneMain && coords) {
                var viewCoords = {
                    yaw: sceneMain.getYaw(),
                    pitch: sceneMain.getPitch()
                };

                var coordsText = `
                        <strong>Текущий клик:</strong><br>
                        Yaw: ${coords.yaw.toFixed(2)}°,
                        Pitch: ${coords.pitch.toFixed(2)}°<br><br>
                        <strong>Направление камеры:</strong><br>
                        Yaw: ${viewCoords.yaw.toFixed(2)}°,
                        Pitch: ${viewCoords.pitch.toFixed(2)}°
                    `;

                document.getElementById('coordsText').innerHTML = coordsText;
                document.getElementById('coordsInfo').style.display = 'block';
            }
        };

        // Убираем контекстное меню для предпросмотра
        jsonObj.onContextMenuHotSpot = null;
        jsonObj.onContextMenu = null;

        if (sceneMain && typeof sceneMain['destroy'] !== 'undefined') {
            sceneMain.destroy();
        }

        sceneMain = pannellum.viewer('canvas', jsonObj);
        currentScene = photoValue;

        // Показываем информационный блок после загрузки сцены
        if (sceneMain) {
            sceneMain.on('load', function() {
                // Используем requestAnimationFrame для отображения блока
                requestAnimationFrame(function() {
                    document.getElementById('coordsInfo').style.display = 'block';
                });
            });
        }
    }
    // Если нет параметров, загружаем изображение по умолчанию
    else {
        var defaultImage = 'img/04.01.2026/DSCN0021.JPG';
        var isExternalDefault = /^https?:\/\//i.test(defaultImage);

        let jsonObj = {
            "hotSpotDebug": false,
            "hotPointDebug": false,
            "sceneFadeDuration": 500,
            "default": {
                "firstScene": "scene1"
            },
            "scenes": {
                "scene1": {
                    "title": "Default Panorama",
                    "panorama": defaultImage,
                    // Для изображения по умолчанию тоже проверяем внешний URL
                    "crossOrigin": isExternalDefault ? undefined : "use-credentials",
                    "autoLoad": true,
                    "yaw": 0,
                    "pitch": 0,
                    "hotSpots": []
                }
            }
        };

        jsonObj.onDblClick = function(coords, screenCoords, event) {
            console.log("Double click on default scene:", coords);
            if (sceneMain && coords) {
                var viewCoords = {
                    yaw: sceneMain.getYaw(),
                    pitch: sceneMain.getPitch()
                };

                selectedCoords = {
                    click: {
                        yaw: coords.yaw,
                        pitch: coords.pitch
                    },
                    view: viewCoords
                };

                showSelectedCoords();
                sendCoordsToParent();

                var infoDiv = document.getElementById('coordsInfo');
                infoDiv.classList.add('highlight');

                // Анимация подсветки с requestAnimationFrame
                var startTime = null;
                function animateHighlight(timestamp) {
                    if (!startTime) startTime = timestamp;
                    var elapsed = timestamp - startTime;

                    if (elapsed < 2000) {
                        requestAnimationFrame(animateHighlight);
                    } else {
                        infoDiv.classList.remove('highlight');
                    }
                }

                requestAnimationFrame(animateHighlight);
            }
        };

        jsonObj.onClick = function(coords, screenCoords, event) {
            if (sceneMain && coords) {
                var viewCoords = {
                    yaw: sceneMain.getYaw(),
                    pitch: sceneMain.getPitch()
                };

                var coordsText = `
                        <strong>Текущий клик:</strong><br>
                        Yaw: ${coords.yaw.toFixed(2)}°,
                        Pitch: ${coords.pitch.toFixed(2)}°<br><br>
                        <strong>Направление камеры:</strong><br>
                        Yaw: ${viewCoords.yaw.toFixed(2)}°,
                        Pitch: ${viewCoords.pitch.toFixed(2)}°
                    `;

                document.getElementById('coordsText').innerHTML = coordsText;
                document.getElementById('coordsInfo').style.display = 'block';
            }
        };

        if (sceneMain && typeof sceneMain['destroy'] !== 'undefined') {
            sceneMain.destroy();
        }

        sceneMain = pannellum.viewer('canvas', jsonObj);
        currentScene = 'default';

        // Показываем информационный блок после загрузки сцены
        if (sceneMain) {
            sceneMain.on('load', function() {
                requestAnimationFrame(function() {
                    document.getElementById('coordsInfo').style.display = 'block';
                });
            });
        }
    }
}

// Функция для отображения выбранных координат
function showSelectedCoords() {
    if (!selectedCoords) return;

    var coordsText = `
            <strong>Координаты клика:</strong><br>
            Yaw: ${selectedCoords.click.yaw.toFixed(2)}°,
            Pitch: ${selectedCoords.click.pitch.toFixed(2)}°<br><br>
            <strong>Направление камеры:</strong><br>
            Yaw: ${selectedCoords.view.yaw.toFixed(2)}°,
            Pitch: ${selectedCoords.view.pitch.toFixed(2)}°<br><br>
            <em style="color: #4CAF50;">✓ Точка выбрана</em>
        `;

    document.getElementById('coordsText').innerHTML = coordsText;
    document.getElementById('coordsInfo').style.display = 'block';
}

// Функция отправки координат в родительское окно
function sendCoordsToParent() {
    if (!selectedCoords) return;

    try {
        if (window.parent && window !== window.parent) {
            // Используем requestAnimationFrame для отправки сообщения
            requestAnimationFrame(function() {
                window.parent.postMessage({
                    type: 'hotspot_preview_coords',
                    clickCoords: selectedCoords.click,
                    viewCoords: selectedCoords.view,
                    timestamp: new Date().toISOString()
                }, '*');

                console.log('Координаты отправлены в родительское окно:', selectedCoords);
            });
        }
    } catch(e) {
        console.error('Ошибка отправки координат:', e);
    }
}

// Глобальная функция для получения координат (если нужно)
window.getSelectedCoords = function() {
    return selectedCoords;
};

// Обработчик сообщений от родительского окна
window.addEventListener('message', function(event) {
    console.log('Message from parent:', event.data);
});

// Устаревшие функции (оставляем для совместимости)
function onClickHotSpot(hs) {
    // Не используется в предпросмотре
    return false;
}

function getJsonUrlData(url, data) {
    return {'error': 'Not implemented in preview'};
}

function onContextMenuHotSpot() {
    // Отключено
}

function onContextMenu() {
    // Отключено
}