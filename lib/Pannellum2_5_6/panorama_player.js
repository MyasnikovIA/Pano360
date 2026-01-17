/**
 * Simplified Panorama Player
 * Direct Pannellum integration without complex proxy logic
 */

class PanoramaPlayer {
    constructor(canvasId = null, initialImage = null) {
        this.canvasId = canvasId || 'canvas';
        this.sceneMain = null;
        this.currentHotspots = [];

        // Простая инициализация
        this.init(initialImage);
    }

    init(initialImage) {
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

        // Получаем hotspots из URL параметра если есть
        let hotspotsFromUrl = [];
        const hotSpotsValue = params.get('hotSpots');
        if (hotSpotsValue) {
            try {
                hotspotsFromUrl = JSON.parse(decodeURIComponent(hotSpotsValue));
                console.log("Loaded hotspots from URL parameter:", hotspotsFromUrl.length);
            } catch (e) {
                console.error("Error parsing hotSpots URL parameter:", e);
            }
        }

        // Загружаем конфигурацию
        this.loadPanoramaWithHotspots(photoUrl, hotspotsFromUrl);
    }

    async loadPanoramaWithHotspots(imageUrl, hotspotsFromUrl = []) {
        try {
            let hotspotsFromJson = [];
            let cameraDirection = {};

            // Пробуем загрузить hotspots из JSON файла
            const jsonUrl = this.getJsonUrlFromImageUrl(imageUrl);
            if (jsonUrl) {
                try {
                    const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
                    hotspotsFromJson = jsonData.hotSpots || [];

                    // Получаем направление камеры из JSON
                    if (jsonData.pitchCam !== undefined && jsonData.yawCam !== undefined) {
                        cameraDirection = {
                            pitchCam: jsonData.pitchCam,
                            yawCam: jsonData.yawCam
                        };
                        console.log("Loaded camera direction from JSON:", cameraDirection);
                    }
                    console.log("Loaded hotspots from JSON:", hotspotsFromJson.length);
                } catch (jsonError) {
                    console.log("No JSON file found or error loading JSON:", jsonUrl, jsonError);
                }
            }

            // Объединяем hotspots из JSON и URL параметра
            let allHotspots = [...hotspotsFromJson, ...hotspotsFromUrl];

            // Убираем дубликаты по pitch/yaw
            allHotspots = this.removeDuplicateHotspots(allHotspots);

            // Сохраняем текущие hotspots
            this.currentHotspots = allHotspots;

            // Создаем конфигурацию для Pannellum
            const config = this.createConfigWithHotspots(imageUrl, allHotspots, cameraDirection);

            // Создаем viewer
            this.createViewer(config, cameraDirection);

        } catch (error) {
            console.error("Error loading panorama with hotspots:", error);
            // Fallback: создаем простую конфигурацию без hotspots
            const config = this.createSimpleConfig(imageUrl);
            this.createViewer(config);
        }
    }

    createConfigWithHotspots(imageUrl, hotspots, cameraDirection = {}) {
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
            "sceneFadeDuration": 1000,
            "hotSpots": []
        };

        // Добавляем hotspots если они есть
        if (hotspots && hotspots.length > 0) {
            config.hotSpots = this.formatHotSpots(hotspots);
        }

        // Устанавливаем начальное направление камеры
        if (cameraDirection.pitchCam !== undefined) {
            config.pitch = cameraDirection.pitchCam;
        }
        if (cameraDirection.yawCam !== undefined) {
            config.yaw = cameraDirection.yawCam;
        }

        // Добавляем обработчик клика по hotspot
        config.onClickHotSpot = (hotspot) => this.onClickHotSpot(hotspot);

        return config;
    }

    createSimpleConfig(imageUrl) {
        return {
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
            "maxHfov": 120
        };
    }

    createViewer(config, cameraDirection = {}) {
        try {
            // Очищаем предыдущий viewer если есть
            if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
                this.sceneMain.destroy();
            }

            // Создаем новый viewer
            this.sceneMain = pannellum.viewer(this.canvasId, config);

            // Если есть направление камеры из JSON, устанавливаем его через колбэк onLoad
            if (cameraDirection && (cameraDirection.pitchCam !== undefined || cameraDirection.yawCam !== undefined)) {
                if (this.sceneMain) {
                    this.sceneMain.on('load', () => {
                        const targetPitch = cameraDirection.pitchCam || config.pitch || 0;
                        const targetYaw = cameraDirection.yawCam || config.yaw || 0;
                        this.sceneMain.lookAt(targetPitch, targetYaw, this.sceneMain.getHfov(), 1000);
                        console.log("Camera direction set from JSON: Pitch=" + targetPitch + ", Yaw=" + targetYaw);
                    });
                }
            }

            // Добавляем обработчики событий
            this.setupEventListeners();

        } catch (error) {
            console.error("Error creating Pannellum viewer:", error);
            this.showError("Ошибка загрузки панорамы. Проверьте URL изображения.");
        }
    }

    setupEventListeners() {
        if (!this.sceneMain) return;

        // Обработчик загрузки
        this.sceneMain.on('load', () => {
            console.log("Panorama loaded successfully with", this.currentHotspots.length, "hotspots");
        });

        // Обработчик ошибок
        this.sceneMain.on('error', (errorMsg) => {
            console.error("Pannellum error:", errorMsg);
            this.showError(`Ошибка: ${errorMsg}`);
        });
    }

    // Методы для работы с hotspots (аналогично panorama_edit.js)

    /**
     * Загрузка hotspots из JSON файла
     */
    async loadHotSpotsFromJson(jsonUrl) {
        // Если JSON URL пустой, не пытаемся загружать
        if (!jsonUrl) {
            throw new Error("No JSON URL provided");
        }

        try {
            const response = await fetch(jsonUrl, {
                method: 'GET',
                mode: 'cors',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log("Loaded JSON data from:", jsonUrl);

            // Проверяем новый формат
            if (data && data.hotSpots && Array.isArray(data.hotSpots)) {
                return data;
            }
            // Проверяем старый формат для обратной совместимости
            else if (Array.isArray(data)) {
                return { hotSpots: data, pitchCam: 0, yawCam: 0 };
            } else if (data.hotspots && Array.isArray(data.hotspots)) {
                return { hotSpots: data.hotspots, pitchCam: 0, yawCam: 0 };
            } else if (data.scenes && data.scenes.scene1 && data.scenes.scene1.hotSpots) {
                return { hotSpots: data.scenes.scene1.hotSpots, pitchCam: 0, yawCam: 0 };
            }

            console.log("No valid hotspots found in JSON, returning empty object");
            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        } catch (error) {
            console.log("Error loading JSON hotspots from:", jsonUrl, error);
            // Возвращаем пустой результат вместо выброса ошибки
            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        }
    }

    /**
     * Получить URL JSON файла на основе URL изображения
     */
    getJsonUrlFromImageUrl(imageUrl) {
        return imageUrl ? imageUrl.replace(/\.[^/.]+$/, "") + ".json" : '';
    }

    /**
     * Форматирование hotspots для Pannellum
     */
    formatHotSpots(hotspots) {
        return hotspots.map(hotspot => ({
            pitch: hotspot.pitch,
            yaw: hotspot.yaw,
            type: hotspot.type || "scene",
            text: hotspot.text || "Переход",
            sceneId: "scene1",
            panorama_url: hotspot.panorama_url,
            point_pitch: hotspot.targetPitch || 0,
            point_yaw: hotspot.targetYaw || 0,
            customScale: hotspot.customScale || undefined
        }));
    }

    /**
     * Удаление дубликатов hotspots
     */
    removeDuplicateHotspots(hotspots) {
        const uniqueHotspots = [];
        const seen = {};

        hotspots.forEach(item => {
            const key = item.pitch + '|' + item.yaw + '|' + (item.panorama_url || '');
            if (!seen[key]) {
                seen[key] = true;
                uniqueHotspots.push(item);
            }
        });

        return uniqueHotspots;
    }

    /**
     * Обработчик клика по hotspot
     */
    onClickHotSpot(hotspot) {
        console.log("Переход к другой сцене через hotspot:", hotspot);

        if (hotspot.panorama_url) {
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hotspot.panorama_url);

            // Сохраняем hotspots для новой сцены если они есть в hotspot
            if (hotspot.hotSpots) {
                currentUrl.searchParams.set('hotSpots', encodeURIComponent(JSON.stringify(hotspot.hotSpots)));
            }

            window.history.pushState({}, '', currentUrl);

            // Перезагружаем панораму с новым URL
            this.init(hotspot.panorama_url);
            return true;
        }

        return false;
    }

    showError(message) {
        // Создаем простое сообщение об ошибке
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 30px;
            border-radius: 10px;
            text-align: center;
            z-index: 10000;
            max-width: 90%;
            font-family: Arial, sans-serif;
        `;

        errorDiv.innerHTML = `
            <h3 style="color: #ff6b6b; margin-top: 0;">⚠️ Ошибка</h3>
            <p>${message}</p>
            <p style="font-size: 14px; margin-top: 20px; color: #ccc;">
                Попробуйте:<br>
                1. Использовать HTTPS URL<br>
                2. Загрузить изображение на GitHub<br>
                3. Проверить доступность изображения
            </p>
            <button onclick="location.reload()" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                margin-top: 20px;
                cursor: pointer;
            ">Обновить страницу</button>
        `;

        document.body.appendChild(errorDiv);
    }

    destroy() {
        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }
}