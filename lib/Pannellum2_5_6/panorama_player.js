/**
 * Simplified Panorama Player with JSON loading via multiple methods
 */

class PanoramaPlayer {
    constructor(canvasId = null, initialImage = null) {
        this.canvasId = canvasId || 'canvas';
        this.sceneMain = null;

        // Инициализация
        this.init(initialImage);
    }

    async init(initialImage) {
        try {
            // Получаем параметры из URL
            const params = new URLSearchParams(window.location.search);
            let photoUrl = params.get('photo') || initialImage;

            // Автоматически преобразуем smwrap.ru URLs в GitHub URLs
            if (photoUrl && photoUrl.includes('www.smwrap.ru')) {
                photoUrl = photoUrl.replace(
                    /https?:\/\/www\.smwrap\.ru\/Pano360Git\/(.+)/,
                    'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/$1'
                );
                console.log("Converted URL to:", photoUrl);
            }

            // Если URL все еще HTTP и страница HTTPS, заменяем на HTTPS
            if (window.location.protocol === 'https:' && photoUrl.startsWith('http:')) {
                photoUrl = photoUrl.replace('http:', 'https:');
            }

            // Используем дефолтный URL если не указан
            if (!photoUrl) {
                photoUrl = 'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/img/Tailand_2024/Phuket/PIC_20240606_110636.jpg';
            }

            console.log("Loading panorama from:", photoUrl);

            // Загружаем hotspots из JSON
            const hotspotsData = await this.loadPanoramaWithHotspots(photoUrl);

            // Создаем конфигурацию
            const config = this.createConfig(photoUrl, hotspotsData);

            // Создаем viewer
            this.createViewer(config);

        } catch (error) {
            console.error("Error initializing panorama:", error);
            this.showError("Ошибка загрузки панорамы.");
        }
    }

    async loadPanoramaWithHotspots(imageUrl) {
        try {
            // Получаем URL для JSON файла
            const jsonUrl = this.getJsonUrlFromImageUrl(imageUrl);

            if (!jsonUrl) {
                console.log("No JSON URL generated");
                return { hotSpots: [], pitchCam: 0, yawCam: 0 };
            }

            console.log("Loading JSON from:", jsonUrl);

            // Пробуем разные методы загрузки JSON
            let jsonData = null;

            // Метод 1: Прямая загрузка через fetch (если CORS разрешен)
            try {
                jsonData = await this.loadJsonViaFetch(jsonUrl);
                console.log("JSON loaded via fetch");
            } catch (fetchError) {
                console.log("Fetch failed, trying iframe method:", fetchError);

                // Метод 2: Загрузка через iframe
                try {
                    jsonData = await this.loadJsonViaIframe(jsonUrl);
                    console.log("JSON loaded via iframe");
                } catch (iframeError) {
                    console.log("Iframe failed, trying script tag method:", iframeError);

                    // Метод 3: Загрузка через script tag (JSONP)
                    try {
                        jsonData = await this.loadJsonViaScriptTag(jsonUrl);
                        console.log("JSON loaded via script tag");
                    } catch (scriptError) {
                        console.log("All JSON loading methods failed:", scriptError);
                        jsonData = { hotSpots: [], pitchCam: 0, yawCam: 0 };
                    }
                }
            }

            // Извлекаем данные
            let hotSpots = [];
            let pitchCam = 0;
            let yawCam = 0;

            if (jsonData) {
                // Новый формат
                if (jsonData.hotSpots && Array.isArray(jsonData.hotSpots)) {
                    hotSpots = jsonData.hotSpots;
                    pitchCam = jsonData.pitchCam || 0;
                    yawCam = jsonData.yawCam || 0;
                }
                // Старый формат для обратной совместимости
                else if (Array.isArray(jsonData)) {
                    hotSpots = jsonData;
                }
            }

            console.log("Loaded camera direction from JSON:", { pitchCam, yawCam });
            console.log("Loaded hotspots from JSON:", hotSpots.length);

            return { hotSpots, pitchCam, yawCam };

        } catch (error) {
            console.error("Error loading panorama with hotspots:", error);
            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        }
    }

    getJsonUrlFromImageUrl(imageUrl) {
        if (!imageUrl) return '';

        // Заменяем расширение изображения на .json
        const baseUrl = imageUrl.replace(/\.[^/.]+$/, "");
        return baseUrl + ".json";
    }

    async loadJsonViaFetch(jsonUrl) {
        return new Promise((resolve, reject) => {
            fetch(jsonUrl, {
                method: 'GET',
                mode: 'cors',
                credentials: 'omit', // Важно: не использовать 'include'
                headers: {
                    'Accept': 'application/json'
                }
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => resolve(data))
            .catch(error => reject(error));
        });
    }

    async loadJsonViaIframe(jsonUrl) {
        return new Promise((resolve, reject) => {
            // Создаем временный iframe
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.style.position = 'absolute';
            iframe.style.left = '-9999px';
            iframe.style.top = '-9999px';

            // Обработчик сообщений от iframe
            const messageHandler = (event) => {
                if (event.data && event.data.type === 'jsonLoaded') {
                    window.removeEventListener('message', messageHandler);

                    // Удаляем iframe
                    setTimeout(() => {
                        if (iframe.parentNode) {
                            iframe.parentNode.removeChild(iframe);
                        }
                    }, 100);

                    if (event.data.success) {
                        resolve(event.data.data);
                    } else {
                        reject(new Error(event.data.error || 'Failed to load JSON via iframe'));
                    }
                }
            };

            window.addEventListener('message', messageHandler);

            // Таймаут
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                if (iframe.parentNode) {
                    iframe.parentNode.removeChild(iframe);
                }
                reject(new Error('JSON loading timeout via iframe'));
            }, 10000);

            // Создаем HTML для iframe
            const iframeHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <script>
                        window.onload = function() {
                            try {
                                // Пытаемся загрузить JSON
                                fetch('${jsonUrl}', {
                                    method: 'GET',
                                    credentials: 'omit'
                                })
                                .then(response => {
                                    if (!response.ok) {
                                        throw new Error('HTTP ' + response.status);
                                    }
                                    return response.json();
                                })
                                .then(data => {
                                    window.parent.postMessage({
                                        type: 'jsonLoaded',
                                        success: true,
                                        data: data
                                    }, '*');
                                })
                                .catch(error => {
                                    window.parent.postMessage({
                                        type: 'jsonLoaded',
                                        success: false,
                                        error: error.message
                                    }, '*');
                                });
                            } catch(e) {
                                window.parent.postMessage({
                                    type: 'jsonLoaded',
                                    success: false,
                                    error: e.message
                                }, '*');
                            }
                        };
                    </script>
                </head>
                <body></body>
                </html>
            `;

            // Добавляем iframe на страницу
            document.body.appendChild(iframe);

            // Записываем HTML в iframe
            iframe.contentWindow.document.open();
            iframe.contentWindow.document.write(iframeHtml);
            iframe.contentWindow.document.close();

            // Очистка таймаута
            const cleanupHandler = (e) => {
                if (e.data && e.data.type === 'jsonLoaded') {
                    clearTimeout(timeoutId);
                    window.removeEventListener('message', cleanupHandler);
                }
            };
            window.addEventListener('message', cleanupHandler);
        });
    }

    async loadJsonViaScriptTag(jsonUrl) {
        return new Promise((resolve, reject) => {
            // Создаем callback функцию
            const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2);

            window[callbackName] = (data) => {
                // Удаляем script тег
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }

                // Удаляем callback
                delete window[callbackName];

                resolve(data);
            };

            // Создаем script тег
            const script = document.createElement('script');
            script.src = jsonUrl + (jsonUrl.includes('?') ? '&' : '?') + 'callback=' + callbackName;
            script.onerror = () => {
                // Удаляем script тег
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }

                // Удаляем callback
                delete window[callbackName];

                reject(new Error('Failed to load JSON via script tag'));
            };

            // Таймаут
            const timeoutId = setTimeout(() => {
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                delete window[callbackName];
                reject(new Error('JSON loading timeout via script tag'));
            }, 10000);

            // Добавляем script на страницу
            document.head.appendChild(script);

            // Очистка таймаута
            script.onload = () => {
                clearTimeout(timeoutId);
            };
        });
    }

    createConfig(imageUrl, hotspotsData) {
        const config = {
            "type": "equirectangular",
            "panorama": imageUrl,
            "autoLoad": true,
            "showControls": true,
            "hotSpotDebug": false,
            "compass": false,
            "mouseZoom": true,
            "draggable": true,
            "showFullscreenCtrl": true,
            "crossOrigin": "anonymous",
            "hfov": 100,
            "minHfov": 50,
            "maxHfov": 120,
            "yaw": hotspotsData.yawCam || 0,
            "pitch": hotspotsData.pitchCam || 0,
            "hotSpots": []
        };

        // Добавляем hotspots если они есть
        if (hotspotsData.hotSpots && hotspotsData.hotSpots.length > 0) {
            config.hotSpots = hotspotsData.hotSpots.map(hotspot => ({
                pitch: hotspot.pitch || 0,
                yaw: hotspot.yaw || 0,
                type: hotspot.type || "scene",
                text: hotspot.text || "Переход",
                sceneId: "scene1",
                panorama_url: hotspot.panorama_url || "",
                point_pitch: hotspot.targetPitch || hotspot.point_pitch || 0,
                point_yaw: hotspot.targetYaw || hotspot.point_yaw || 0
            }));
        }

        // Добавляем обработчик кликов по hotspots
        config.onClickHotSpot = (hs) => {
            this.onHotSpotClick(hs);
            return true;
        };

        return config;
    }

    createViewer(config) {
        try {
            // Очищаем предыдущий viewer если есть
            if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
                this.sceneMain.destroy();
            }

            // Создаем новый viewer
            this.sceneMain = pannellum.viewer(this.canvasId, config);

            // Добавляем обработчики событий
            this.setupEventListeners();

            console.log("Panorama loaded successfully with", config.hotSpots.length, "hotspots");

        } catch (error) {
            console.error("Error creating Pannellum viewer:", error);
            this.showError("Ошибка загрузки панорамы.");
        }
    }

    onHotSpotClick(hs) {
        console.log("Hotspot clicked:", hs);

        if (hs.panorama_url) {
            // Обновляем URL страницы
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('photo', hs.panorama_url);
            window.history.pushState({}, '', newUrl);

            // Перезагружаем панораму
            this.init(hs.panorama_url);
            return true;
        }

        return false;
    }

    setupEventListeners() {
        if (!this.sceneMain) return;

        // Обработчик загрузки
        this.sceneMain.on('load', () => {
            console.log("Panorama viewer loaded");
        });

        // Обработчик ошибок
        this.sceneMain.on('error', (errorMsg) => {
            console.error("Pannellum error:", errorMsg);
            this.showError(`Ошибка Pannellum: ${errorMsg}`);
        });

        // Обработчик изменения сцены
        this.sceneMain.on('scenechange', (sceneId) => {
            console.log("Scene changed to:", sceneId);
        });
    }

    showError(message) {
        // Удаляем старые сообщения об ошибках
        const oldErrors = document.querySelectorAll('.panorama-error');
        oldErrors.forEach(error => error.remove());

        // Создаем новое сообщение
        const errorDiv = document.createElement('div');
        errorDiv.className = 'panorama-error';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(220, 53, 69, 0.95);
            color: white;
            padding: 15px 25px;
            border-radius: 8px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            text-align: center;
            max-width: 90%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            animation: fadeIn 0.3s ease-in;
        `;

        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translate(-50%, -20px); }
                to { opacity: 1; transform: translate(-50%, 0); }
            }
        `;
        document.head.appendChild(style);

        errorDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px; font-size: 16px;">
                <span style="margin-right: 8px;">⚠️</span>Ошибка
            </div>
            <div style="font-size: 14px; margin-bottom: 10px;">${message}</div>
            <button onclick="this.parentElement.remove()" style="
                background: white;
                color: #dc3545;
                border: none;
                padding: 5px 15px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.2s;
            " onmouseover="this.style.background='#f8f9fa'" onmouseout="this.style.background='white'">
                Закрыть
            </button>
        `;

        document.body.appendChild(errorDiv);

        // Автоматически скрываем через 10 секунд
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.remove();
            }
        }, 10000);
    }

    destroy() {
        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }
}

// Добавляем глобальные методы для отладки
window.PanoramaPlayer = PanoramaPlayer;