/**
 * Panorama Player - Main application controller
 * @module PanoramaPlayer
 */

/// Initialize panorama player when DOM is ready
/// document.addEventListener('DOMContentLoaded', () => {
/// 1.Без параметров (поведение как раньше)
///     window.panoramaPlayer = new PanoramaPlayer();
/// 2.Только с указанием ID canvas
///     window.panoramaPlayer = new PanoramaPlayer('my-panorama-canvas');
/// 3.С указанием и ID canvas и начальной фотографии
///     window.panoramaPlayer = new PanoramaPlayer('my-panorama-canvas', 'img/my-panorama.jpg');
/// 4.Только с начальной фотографией (canvas будет искаться с ID 'canvas')
///     window.panoramaPlayer = new PanoramaPlayer(null, 'img/my-panorama.jpg');
/// });

class PanoramaPlayer {
    constructor(canvasId = null, initialImage = null) {
        this.canvasId = canvasId || 'canvas';
        this.initialImage = initialImage;
        this.sceneMain = null;
        this.currentScene = null;
        this.isLoading = false;
        this.pendingCameraMove = null;
        this.blobUrls = [];
        this.loadingIframe = null;
        this.init();
    }

    /**
     * Initialize the panorama player
     */
    init() {
        this.setupEventListeners();
        this.loadInitialScene();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            document.addEventListener('contextmenu', (e) => e.preventDefault());
        });

        window.addEventListener('popstate', () => this.loadInitialScene());
    }

    /**
     * Load the initial panorama scene based on URL parameters or constructor parameters
     */
    async loadInitialScene() {
        await this.setSelectPanorama();
    }

    /**
     * Set and display panorama based on parameters or hotspots
     * @param {Object|null} hotSpot - Hotspot object if triggered from click
     */
    async setSelectPanorama(hotSpot) {
        if (this.isLoading) return;

        this.isLoading = true;
        try {
            let params = new URLSearchParams(document.location.search);
            let infoValue = params.get('info');
            let photoValue = params.get('photo');

            // Если photo передан через параметры URL, используем его
            // Иначе используем initialImage из конструктора
            if (!photoValue && this.initialImage) {
                photoValue = this.initialImage;
            }

            // Нормализация путей (замена обратных слешей)
            if (photoValue) {
                photoValue = this.normalizePath(photoValue);
            }

            let hotSpots = params.get('hotSpots');
            if (hotSpots) {
                hotSpots = this.normalizePath(hotSpots);
            }

            // Настройка canvas с учетом переданного ID
            let canvas = document.getElementById(this.canvasId);
            if (!canvas) {
                console.error(`Canvas element with id "${this.canvasId}" not found. Using default "canvas" id.`);
                canvas = document.getElementById('canvas');
                if (!canvas) {
                    console.error('Default canvas element not found either.');
                    return;
                }
            }
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            // Базовый JSON конфиг
            let jsonObj = this.createBaseJsonConfig();

            // Загрузка в зависимости от параметров
            if (photoValue) {
                await this.loadPhotoPanorama(photoValue, hotSpot, jsonObj);
            } else if (infoValue) {
                this.loadInfoPanorama(infoValue, hotSpot, jsonObj);
            } else {
                await this.loadDefaultPanorama(jsonObj);
            }
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Create base JSON configuration for Pannellum
     * @returns {Object} Base configuration object
     */
    createBaseJsonConfig() {
        return {
            hotSpotDebug: false,
            hotPointDebug: false,
            sceneFadeDuration: 1000,
            onClickHotSpot: this.onClickHotSpot.bind(this),
            default: {
                firstScene: "scene1"
            },
            scenes: {
                scene1: {
                    title: "",
                    crossOrigin: "anonymous",
                    autoLoad: true,
                    yaw: 0,
                    pitch: 0,
                    hotSpots: []
                }
            }
        };
    }

    /**
     * Load panorama from photo parameter (универсальный метод для всех типов URL)
     */
    async loadPhotoPanorama(photoValue, hotSpot, jsonConfig) {
        const imageUrl = photoValue;
        const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);
        var cameraDirection = {};
        var hotspotsFromJson = [];

        console.log("Loading panorama from:", imageUrl);

        try {
            // Пробуем загрузить JSON с хотспотами (если есть)
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

            if (hotSpot) {
                cameraDirection = {
                    pitchCam: hotSpot.point_pitch,
                    yawCam: hotSpot.point_yaw
                };
            }
            const loadedImageUrl = await this.loadImageViaIframe(imageUrl);
            await this.finalizeScene(loadedImageUrl, false, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
        } catch(error) {
            console.error("Error loading panorama:", error);

            // Fallback: пробуем загрузить напрямую
            try {
                await this.finalizeScene(imageUrl, false, [], {}, hotSpot, jsonConfig);
            } catch (finalError) {
                console.error("Final fallback also failed:", finalError);
                throw error;
            }
        }
    }

    /**
     * Загрузка изображения через фоновый iframe
     */
    async loadImageViaIframe(imageUrl) {
        return new Promise((resolve, reject) => {
            console.log("Loading image via iframe:", imageUrl);
             debugger
            // Очищаем предыдущий iframe если есть
            if (this.loadingIframe && this.loadingIframe.parentNode) {
                this.loadingIframe.parentNode.removeChild(this.loadingIframe);
            }

            // Создаем невидимый iframe для загрузки изображения
            this.loadingIframe = document.createElement('iframe');
            this.loadingIframe.style.display = 'none';
            this.loadingIframe.style.width = '0';
            this.loadingIframe.style.height = '0';
            this.loadingIframe.style.border = '0';
            this.loadingIframe.style.position = 'absolute';
            this.loadingIframe.style.left = '-9999px';
            this.loadingIframe.style.top = '-9999px';

            // Устанавливаем URL для iframe
            // Создаем HTML страницу, которая загрузит изображение
            const iframeHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { margin: 0; padding: 0; }
                        img { max-width: 100%; height: auto; }
                    </style>
                    <script>
                        window.onload = function() {
                            try {
                                // Пытаемся загрузить изображение
                                var img = document.getElementById('panorama-img');
                                if (img.complete) {
                                    window.parent.postMessage({
                                        type: 'panoramaImageLoaded',
                                        success: true,
                                        src: '${imageUrl.replace(/'/g, "\\'")}'
                                    }, '*');
                                } else {
                                    img.onload = function() {
                                        window.parent.postMessage({
                                            type: 'panoramaImageLoaded',
                                            success: true,
                                            src: '${imageUrl.replace(/'/g, "\\'")}'
                                        }, '*');
                                    };
                                    img.onerror = function() {
                                        window.parent.postMessage({
                                            type: 'panoramaImageLoaded',
                                            success: false,
                                            src: '${imageUrl.replace(/'/g, "\\'")}',
                                            error: 'Failed to load image'
                                        }, '*');
                                    };
                                }
                            } catch(e) {
                                window.parent.postMessage({
                                    type: 'panoramaImageLoaded',
                                    success: false,
                                    src: '${imageUrl.replace(/'/g, "\\'")}',
                                    error: e.message
                                }, '*');
                            }
                        };
                    </script>
                </head>
                <body>
                    <img id="panorama-img" src="${imageUrl}" alt="Panorama" crossorigin="anonymous" />
                </body>
                </html>
            `;

            // Обработчик сообщений от iframe
            const messageHandler = (event) => {
                debugger
                if (event.data && event.data.type === 'panoramaImageLoaded') {
                    // Удаляем обработчик
                    window.removeEventListener('message', messageHandler);

                    // Удаляем iframe
                    setTimeout(() => {
                        if (this.loadingIframe && this.loadingIframe.parentNode) {
                            this.loadingIframe.parentNode.removeChild(this.loadingIframe);
                            this.loadingIframe = null;
                        }
                    }, 100);

                    if (event.data.success) {
                        console.log("Image loaded successfully via iframe:", imageUrl);
                        resolve(imageUrl); // Возвращаем оригинальный URL
                    } else {
                        console.error("Failed to load image via iframe:", event.data.error);
                        reject(new Error(`Failed to load image via iframe: ${event.data.error || 'Unknown error'}`));
                    }
                }
            };

            // Добавляем обработчик сообщений
            window.addEventListener('message', messageHandler);

            // Таймаут для безопасности
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', messageHandler);
                if (this.loadingIframe && this.loadingIframe.parentNode) {
                    this.loadingIframe.parentNode.removeChild(this.loadingIframe);
                    this.loadingIframe = null;
                }
                reject(new Error('Image loading timeout via iframe'));
            }, 30000); // 30 секунд таймаут

            // Записываем HTML в iframe и добавляем в документ
            document.body.appendChild(this.loadingIframe);
            this.loadingIframe.contentWindow.document.open();
            this.loadingIframe.contentWindow.document.write(iframeHtml);
            this.loadingIframe.contentWindow.document.close();

            // Очищаем таймаут при успешной загрузке
            const cleanupHandler = (e) => {
                if (e.data && e.data.type === 'panoramaImageLoaded') {
                    clearTimeout(timeoutId);
                    window.removeEventListener('message', cleanupHandler);
                }
            };
            window.addEventListener('message', cleanupHandler);
        });
    }

    /**
     * Check if URL is a local resource (localhost, file://, etc.)
     */
    isLocalResource(url) {
        try {
            const urlObj = new URL(url, window.location.href);

            // Проверяем протокол
            if (urlObj.protocol === 'file:') {
                return true;
            }

            // Проверяем локальные хосты
            const localHostnames = [
                'localhost',
                '127.0.0.1',
                '0.0.0.0',
                '::1',
                '[::1]'
            ];

            if (localHostnames.includes(urlObj.hostname.toLowerCase())) {
                return true;
            }

            // Проверяем приватные сети
            const ipParts = urlObj.hostname.split('.').map(Number);
            if (ipParts.length === 4 && !isNaN(ipParts[0])) {
                // 10.0.0.0/8
                if (ipParts[0] === 10) return true;
                // 172.16.0.0/12
                if (ipParts[0] === 172 && ipParts[1] >= 16 && ipParts[1] <= 31) return true;
                // 192.168.0.0/16
                if (ipParts[0] === 192 && ipParts[1] === 168) return true;
            }

            return false;
        } catch (e) {
            // Если URL не парсится, считаем его не локальным
            return false;
        }
    }

    /**
     * Get proxied URL for local resources
     */
    async getProxiedImageUrl(imageUrl) {
        const urlObj = new URL(imageUrl, window.location.href);

        console.warn("Local resource access may be blocked by browser. Consider moving resources to the same domain or using a proxy server.");

        // Возвращаем оригинальный URL - в некоторых случаях может работать
        // если пользователь отключил CORS или использует специальный браузер
        return imageUrl;
    }

    /**
     * Load panorama from info parameter (legacy format)
     */
    loadInfoPanorama(infoValue, hotSpot, jsonConfig) {
        const oldJsonData = this.getJsonUrlData(`/Example/pano360/point_info/${infoValue}`);
        Object.assign(jsonConfig, oldJsonData);

        // Apply hotspot camera direction if available
        if (hotSpot) {
            if (hotSpot.point_pitch !== undefined && jsonConfig.scenes?.scene1) {
                jsonConfig.scenes.scene1.pitch = hotSpot.point_pitch;
            }
            if (hotSpot.point_yaw !== undefined && jsonConfig.scenes?.scene1) {
                jsonConfig.scenes.scene1.yaw = hotSpot.point_yaw;
            }
        }

        this.createPannellumViewer(jsonConfig, infoValue);
    }

    /**
     * Load default panorama when no parameters are provided
     */
    async loadDefaultPanorama(jsonConfig) {
        const defaultImage = 'img/04.01.2026/DSCN0021.JPG';
        const jsonUrl = this.getJsonUrlFromImageUrl(defaultImage);

        try {
            const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
            const hotspotsFromJson = jsonData.hotSpots || [];
            const cameraDirection = this.getCameraDirection(null, jsonData);

            // Configure default scene
            const scene = jsonConfig.scenes.scene1;
            scene.title = "Default Panorama";
            scene.panorama = defaultImage;
            scene.hotSpots = this.formatHotSpots(hotspotsFromJson);

            // Set camera direction
            if (cameraDirection.pitchCam !== undefined) {
                scene.pitch = cameraDirection.pitchCam;
            }
            if (cameraDirection.yawCam !== undefined) {
                scene.yaw = cameraDirection.yawCam;
            } else {
                scene.yaw = -6.77;
                scene.pitch = -24.41;
            }

            this.createPannellumViewer(jsonConfig, 'default');
        } catch (error) {
            console.log("No JSON file found for default image:", jsonUrl, error);

            // Fallback configuration
            const scene = jsonConfig.scenes.scene1;
            scene.title = "Default Panorama";
            scene.panorama = defaultImage;
            scene.yaw = -6.77;
            scene.pitch = -24.41;

            this.createPannellumViewer(jsonConfig, 'default');
        }
    }

    /**
     * Finalize and display the panorama scene
     */
    async finalizeScene(imageUrl, isBlobUrl, hotspotsData, cameraDirection, hotSpot, jsonConfig) {
        const scene = jsonConfig.scenes.scene1;
        scene.panorama = imageUrl;

        // Настраиваем crossOrigin в зависимости от типа URL
        if (isBlobUrl) {
            scene.crossOrigin = undefined;
        } else if (this.isExternalUrl(imageUrl)) {
            scene.crossOrigin = "anonymous";
        } else {
            scene.crossOrigin = "use-credentials";
        }

        // Set camera direction from hotspot or JSON
        if (hotSpot && hotSpot.point_pitch !== undefined) {
            scene.pitch = hotSpot.point_pitch;
        } else if (cameraDirection && cameraDirection.pitchCam !== undefined) {
            scene.pitch = cameraDirection.pitchCam;
        }

        if (hotSpot && hotSpot.point_yaw !== undefined) {
            scene.yaw = hotSpot.point_yaw;
        } else if (cameraDirection && cameraDirection.yawCam !== undefined) {
            scene.yaw = cameraDirection.yawCam;
        }

        scene.hotSpots = hotspotsData.map(function(hotspot) {
            return {
                pitch: hotspot.pitch,
                yaw: hotspot.yaw,
                type: hotspot.type || "scene",
                text: hotspot.text || "Переход",
                sceneId: "scene1",
                panorama_url: hotspot.panorama_url,
                point_pitch: hotspot.targetPitch || 0,
                point_yaw: hotspot.targetYaw || 0
            };
        });

        this.createPannellumViewer(jsonConfig, imageUrl);

        // Smooth camera movement if direction is specified
        if (cameraDirection && (cameraDirection.pitchCam !== undefined || cameraDirection.yawCam !== undefined)) {
            this.pendingCameraMove = {
                pitch: cameraDirection.pitchCam || scene.pitch,
                yaw: cameraDirection.yawCam || scene.yaw
            };

            this.sceneMain.on('load', () => {
                this.executePendingCameraMove();
            });
        }
    }

    /**
     * Execute pending camera movement after scene is loaded
     */
    executePendingCameraMove() {
        if (this.pendingCameraMove && this.sceneMain) {
            const targetPitch = this.pendingCameraMove.pitch;
            const targetYaw = this.pendingCameraMove.yaw;

            this.sceneMain.lookAt(targetPitch, targetYaw, this.sceneMain.getHfov(), 1000, () => {
                console.log("Camera direction set from JSON: Pitch=" + targetPitch + ", Yaw=" + targetYaw);
                this.pendingCameraMove = null;
            });
        }
    }

    /**
     * Format hotspot data for Pannellum
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
            point_yaw: hotspot.targetYaw || 0
        }));
    }

    /**
     * Get camera direction from hotspot or JSON data
     */
    getCameraDirection(hotSpot, jsonData) {
        if (hotSpot) {
            return {
                pitchCam: hotSpot.point_pitch,
                yawCam: hotSpot.point_yaw
            };
        }

        if (jsonData?.pitchCam !== undefined && jsonData?.yawCam !== undefined) {
            return {
                pitchCam: jsonData.pitchCam,
                yawCam: jsonData.yawCam
            };
        }

        return {};
    }

    /**
     * Create Pannellum viewer instance with dynamic canvas ID
     */
    createPannellumViewer(config, sceneName) {
        // Очищаем предыдущие blob URL
        this.cleanupBlobUrls();

        // Clean up previous viewer
        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }

        this.sceneMain = pannellum.viewer(this.canvasId, config);
        this.currentScene = sceneName;

        // Если есть ожидающее перемещение камеры, настраиваем его выполнение после загрузки
        if (this.pendingCameraMove) {
            this.sceneMain.on('load', () => {
                this.executePendingCameraMove();
            });
        }
    }

    /**
     * Очистка blob URL
     */
    cleanupBlobUrls() {
        this.blobUrls.forEach(url => {
            try {
                URL.revokeObjectURL(url);
            } catch (e) {
                console.warn("Error revoking blob URL:", e);
            }
        });
        this.blobUrls = [];
    }

    /**
     * Handle hotspot click
     */
    onClickHotSpot(hs) {
        console.log("Переход к другой сцене:", hs);

        // Проверяем, есть ли URL для загрузки новой сцены
        if (hs.panorama_url) {
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hs.panorama_url);

            window.history.pushState({}, '', currentUrl);

            this.setSelectPanorama(hs);
            return true;
        }

        // Старая логика для JSON конфигураций
        const jsonName = hs.panorama_url?.split('/')[4];
        if (jsonName) {
            const name = jsonName.split('.')[0];
            let currentUrl = new URL(window.location.href);
            if (!currentUrl.searchParams.get('info')) {
                currentUrl.searchParams.append('info', hs.panorama_url.split('/')[4]);
            } else {
                currentUrl.searchParams.set('info', hs.panorama_url.split('/')[4]);
            }

            window.history.pushState({}, '', currentUrl);

            let jsonObj = this.getJsonUrlData(hs.panorama_url);
            jsonObj.onClickHotSpot = this.onClickHotSpot.bind(this);

            jsonObj.pitch = hs.point_pitch;
            jsonObj.yaw = hs.point_yaw;

            this.createPannellumViewer(jsonObj, name);
            return true;
        }

        return false;
    }

    /**
     * Utility methods
     */

    normalizePath(path) {
        return path ? path.replace(/\\/g, '/') : path;
    }

    isExternalUrl(url) {
        try {
            const urlObj = new URL(url, window.location.href);
            return urlObj.origin !== window.location.origin;
        } catch (e) {
            // Если URL не парсится, считаем его внутренним
            return false;
        }
    }

    getJsonUrlFromImageUrl(imageUrl) {
        return imageUrl ? imageUrl.replace(/\.[^/.]+$/, "") + ".json" : '';
    }

    /**
     * Load hotspots from JSON file
     */
    async loadHotSpotsFromJson(jsonUrl) {
        // Если JSON URL пустой, не пытаемся загружать
        if (!jsonUrl) {
            throw new Error("No JSON URL provided");
        }

        try {
            // Для локальных ресурсов JSON может быть недоступен из-за CORS
            // Просто возвращаем пустой результат
            if (this.isLocalResource(jsonUrl)) {
                console.warn("Local JSON resource may be blocked by CORS:", jsonUrl);
                return { hotSpots: [], pitchCam: 0, yawCam: 0 };
            }

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
     * Get JSON data via XHR (legacy support)
     */
    getJsonUrlData(url, data) {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, false);
        xhr.send(data);

        if (xhr.status !== 200) {
            console.error(`${xhr.status}: ${xhr.statusText} (${url})`);
            return { error: `${xhr.status} : ${xhr.statusText}` };
        }

        return JSON.parse(xhr.response);
    }

    /**
     * Destructor для очистки ресурсов
     */
    destroy() {
        this.cleanupBlobUrls();

        // Очищаем iframe если есть
        if (this.loadingIframe && this.loadingIframe.parentNode) {
            this.loadingIframe.parentNode.removeChild(this.loadingIframe);
            this.loadingIframe = null;
        }

        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }
}