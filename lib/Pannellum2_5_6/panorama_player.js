/**
 * Simplified Panorama Player with JSON loading via iframe
 */

class PanoramaPlayer {
    constructor(canvasId = null, initialImage = null) {
        this.canvasId = canvasId || 'canvas';
        this.sceneMain = null;
        this.jsonIframe = null;

        // Инициализация
        this.init(initialImage);
    }

    async init(initialImage, hs) {
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
                //console.log("Converted URL to:", photoUrl);
            }

            // Если URL все еще HTTP и страница HTTPS, заменяем на HTTPS
            if (window.location.protocol === 'https:' && photoUrl.startsWith('http:')) {
                photoUrl = photoUrl.replace('http:', 'https:');
            }

            // Используем дефолтный URL если не указан
            if (!photoUrl) {
                photoUrl = 'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/img/Tailand_2024/Phuket/PIC_20240606_110636.jpg';
            }

            // console.log("Loading panorama from:", photoUrl);
            // Загружаем hotspots из JSON через iframe
            const hotspotsData = await this.loadHotspotsViaIframe(photoUrl);

            // Создаем конфигурацию
            const config = this.createConfig(photoUrl, hotspotsData);
            if (hs) {
                config.pitch = hs.point_pitch;
                config.yaw = hs.point_yaw;
            }
            // Создаем viewer
            this.createViewer(config);

        } catch (error) {
            console.error("Error initializing panorama:", error);
            this.showError("Ошибка загрузки панорамы.");
        }
    }

    getJsonUrlFromImageUrl(imageUrl) {
        if (!imageUrl) return '';
        // Заменяем расширение изображения на .json
        const baseUrl = imageUrl.replace(/\.[^/.]+$/, "");
        return baseUrl + ".json";
    }

    /**
     * Load hotspots via iframe (CORS bypass)
     */
    async loadHotspotsViaIframe(imageUrl) {
        const jsonUrl = this.getJsonUrlFromImageUrl(imageUrl);

        if (!jsonUrl) {
            console.log("No JSON URL to load");
            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        }

        // console.log("Loading JSON via iframe from:", jsonUrl);

        try {
            const jsonData = await this.loadJsonViaIframe(jsonUrl);

            // Обрабатываем данные
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
                // Другие форматы
                else if (jsonData.hotspots && Array.isArray(jsonData.hotspots)) {
                    hotSpots = jsonData.hotspots;
                }
                else if (jsonData.scenes && jsonData.scenes.scene1 && jsonData.scenes.scene1.hotSpots) {
                    hotSpots = jsonData.scenes.scene1.hotSpots;
                }
            }
            // console.log("Loaded hotspots from JSON:", hotSpots.length);
            // console.log("Camera direction:", { pitchCam, yawCam });
            return { hotSpots, pitchCam, yawCam };

        } catch (error) {
            console.log("Failed to load JSON via iframe, using empty hotspots:", error);
            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        }
    }

    /**
     * Load JSON via iframe method
     */
    async loadJsonViaIframe(jsonUrl) {
        return new Promise((resolve, reject) => {
            // Очищаем предыдущий iframe если есть
            if (this.jsonIframe && this.jsonIframe.parentNode) {
                this.jsonIframe.parentNode.removeChild(this.jsonIframe);
            }

            // Создаем iframe
            this.jsonIframe = document.createElement('iframe');
            this.jsonIframe.style.cssText = `
                position: absolute;
                left: -9999px;
                top: -9999px;
                width: 1px;
                height: 1px;
                border: none;
                opacity: 0;
                pointer-events: none;
            `;

            // Генерируем уникальный ID для iframe
            const iframeId = 'json-iframe-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
            this.jsonIframe.id = iframeId;

            // Обработчик сообщений от iframe
            const messageHandler = (event) => {
                // Проверяем, что это наше сообщение
                if (event.data && event.data.type === 'jsonLoaded' && event.data.iframeId === iframeId) {
                    // console.log("Received JSON data from iframe");
                    // Удаляем обработчик
                    window.removeEventListener('message', messageHandler);

                    // Очищаем iframe
                    setTimeout(() => {
                        if (this.jsonIframe && this.jsonIframe.parentNode) {
                            this.jsonIframe.parentNode.removeChild(this.jsonIframe);
                            this.jsonIframe = null;
                        }
                    }, 100);

                    // Очищаем таймаут
                    clearTimeout(timeoutId);

                    // Возвращаем результат
                    if (event.data.success) {
                        resolve(event.data.data);
                    } else {
                        reject(new Error(event.data.error || 'Failed to load JSON'));
                    }
                }
            };

            window.addEventListener('message', messageHandler);

            // Таймаут
            const timeoutId = setTimeout(() => {
                console.warn("JSON loading timeout");
                window.removeEventListener('message', messageHandler);

                // Очищаем iframe
                if (this.jsonIframe && this.jsonIframe.parentNode) {
                    this.jsonIframe.parentNode.removeChild(this.jsonIframe);
                    this.jsonIframe = null;
                }

                reject(new Error('JSON loading timeout (15 seconds)'));
            }, 15000);

            // Добавляем iframe на страницу
            document.body.appendChild(this.jsonIframe);

            // Создаем HTML для iframe
            const iframeHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>JSON Loader</title>
                    <script>
                        async function loadJsonData() {
                            try {
                                //console.log('Iframe: Loading JSON from:', '${jsonUrl}');

                                const response = await fetch('${jsonUrl}', {
                                    method: 'GET',
                                    headers: {
                                        'Accept': 'application/json'
                                    }
                                });

                                if (!response.ok) {
                                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                                }

                                const data = await response.json();
                                // console.log('Iframe: JSON loaded successfully');
                                // Отправляем данные обратно
                                window.parent.postMessage({
                                    type: 'jsonLoaded',
                                    iframeId: '${iframeId}',
                                    success: true,
                                    data: data
                                }, '*');

                            } catch (error) {
                                //console.error('Iframe: Error loading JSON:', error);
                                // Отправляем ошибку
                                window.parent.postMessage({
                                    type: 'jsonLoaded',
                                    iframeId: '${iframeId}',
                                    success: false,
                                    error: error.message
                                }, '*');
                            }
                        }

                        // Загружаем данные при загрузке iframe
                        window.onload = loadJsonData;
                    </script>
                </head>
                <body style="margin:0;padding:0;">
                    <div id="status">Loading JSON...</div>
                </body>
                </html>
            `;

            // Записываем HTML в iframe
            try {
                const iframeDoc = this.jsonIframe.contentWindow.document;
                iframeDoc.open();
                iframeDoc.write(iframeHtml);
                iframeDoc.close();
            } catch (e) {
                console.error("Error writing to iframe:", e);
                reject(e);
            }
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
            // console.log("Panorama loaded successfully with", config.hotSpots.length, "hotspots");
        } catch (error) {
            console.error("Error creating Pannellum viewer:", error);
            this.showError("Ошибка создания панорамного просмотрщика: " + error.message);
        }
    }

    onHotSpotClick(hs) {
        // console.log("Hotspot clicked:", hs);
        if (hs.panorama_url) {
            // Обновляем URL страницы
            const newUrl = new URL(window.location.href);
            newUrl.searchParams.set('photo', hs.panorama_url);
            window.history.pushState({}, '', newUrl);

            // Перезагружаем панораму
            this.init(hs.panorama_url, hs);
            return true;
        }

        return false;
    }

    setupEventListeners() {
        if (!this.sceneMain) return;

        // Обработчик загрузки
        this.sceneMain.on('load', () => {
            //console.log("Panorama viewer loaded");

            // Применяем направление камеры если задано
            if (this.sceneMain && this.sceneMain.getConfig) {
                const config = this.sceneMain.getConfig();
                if (config.yaw !== 0 || config.pitch !== 0) {
                    this.sceneMain.lookAt(config.pitch, config.yaw, config.hfov || 100, 1000);
                }
            }
        });

        // Обработчик ошибок
        this.sceneMain.on('error', (errorMsg) => {
            console.error("Pannellum error:", errorMsg);
            this.showError(`Ошибка Pannellum: ${errorMsg}`);
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

        // Добавляем CSS анимацию
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
            ">
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
        // Очищаем iframe
        if (this.jsonIframe && this.jsonIframe.parentNode) {
            this.jsonIframe.parentNode.removeChild(this.jsonIframe);
            this.jsonIframe = null;
        }

        // Очищаем viewer
        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }
}

// Глобальный доступ
window.PanoramaPlayer = PanoramaPlayer;