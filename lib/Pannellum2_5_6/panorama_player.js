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

        // CORS proxy настройки
        this.useCorsProxy = true;
        this.corsProxyUrls = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://cors-anywhere.herokuapp.com/'
        ];
        this.allowedDomains = [
            'githubusercontent.com',
            'github.com',
            'raw.githack.com',
            'pannellum.org'
        ];

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
        // Автоматически применяем CORS proxy если нужно
        let imageUrl = await this.getProxiedImageUrl(photoValue);
        const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);
        var cameraDirection = {};
        var hotspotsFromJson = [];

        console.log("Loading panorama from:", imageUrl);
        console.log("Original URL was:", photoValue);
        console.log("Using CORS proxy:", imageUrl !== photoValue);

        try {
            // Пробуем загрузить JSON с хотспотами (если есть)
            if (jsonUrl) {
                try {
                    // Для JSON тоже может понадобиться proxy
                    const proxiedJsonUrl = await this.getProxiedUrlForJson(jsonUrl);
                    const jsonData = await this.loadHotSpotsFromJson(proxiedJsonUrl);
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

            const loadedImageUrl = await this.loadImageSafe(imageUrl);
            await this.finalizeScene(loadedImageUrl, loadedImageUrl.startsWith('blob:'), hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
        } catch(error) {
            console.error("Error loading panorama:", error);

            // Fallback: пробуем загрузить напрямую
            try {
                await this.finalizeScene(imageUrl, false, [], {}, hotSpot, jsonConfig);
            } catch (finalError) {
                console.error("Final fallback also failed:", finalError);
                // Показываем сообщение об ошибке пользователю
                this.showErrorMessage(`Не удалось загрузить изображение: ${photoValue}. Возможно, сервер не поддерживает CORS.`);
                throw error;
            }
        }
    }

    /**
     * Безопасная загрузка изображения с несколькими попытками
     */
    async loadImageSafe(imageUrl) {
        // Если это blob URL или data URL, используем как есть
        if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
            return imageUrl;
        }

        try {
            // Пробуем загрузить через fetch для проверки доступности
            const response = await fetch(imageUrl, {
                mode: 'cors',
                credentials: 'omit',
                headers: {
                    'Accept': 'image/*'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Если загрузка успешна, используем оригинальный URL
            return imageUrl;
        } catch (error) {
            console.warn("Direct fetch failed, trying blob conversion:", error);

            // Пробуем загрузить как blob и конвертировать в blob URL
            try {
                const blobResponse = await fetch(imageUrl, {
                    mode: 'cors',
                    credentials: 'omit'
                });

                if (!blobResponse.ok) {
                    throw new Error(`HTTP ${blobResponse.status}`);
                }

                const blob = await blobResponse.blob();
                const blobUrl = URL.createObjectURL(blob);
                this.blobUrls.push(blobUrl);

                console.log("Image loaded as blob, converted to blob URL");
                return blobUrl;
            } catch (blobError) {
                console.error("Blob conversion also failed:", blobError);
                throw blobError;
            }
        }
    }

    /**
     * Get proxied URL for images that need CORS proxy
     */
    async getProxiedImageUrl(originalUrl) {
        // Если proxy отключен, возвращаем оригинальный URL
        if (!this.useCorsProxy) {
            return originalUrl;
        }

        // Проверяем, нужен ли proxy для этого URL
        if (!this.shouldUseProxy(originalUrl)) {
            return originalUrl;
        }

        // Пробуем разные proxy серверы
        for (const proxy of this.corsProxyUrls) {
            try {
                const proxiedUrl = proxy + encodeURIComponent(originalUrl);

                // Быстрая проверка доступности proxy
                const test = await fetch(proxiedUrl, {
                    method: 'HEAD',
                    mode: 'cors'
                });

                if (test.ok) {
                    console.log(`Using proxy: ${proxy}`);
                    return proxiedUrl;
                }
            } catch (error) {
                console.warn(`Proxy ${proxy} failed:`, error);
                continue;
            }
        }

        console.warn("All proxies failed, using original URL (may fail due to CORS)");
        return originalUrl;
    }

    /**
     * Get proxied URL for JSON files
     */
    async getProxiedUrlForJson(originalUrl) {
        // Для JSON используем более простой подход
        if (!this.shouldUseProxy(originalUrl)) {
            return originalUrl;
        }

        // Используем первый рабочий proxy для JSON
        const proxy = this.corsProxyUrls[0];
        return proxy + encodeURIComponent(originalUrl);
    }

    /**
     * Check if URL needs CORS proxy
     */
    shouldUseProxy(url) {
        // Не используем proxy для:
        // 1. Blob URLs
        // 2. Data URLs
        // 3. Локальных ресурсов
        // 4. Домены из белого списка (которые поддерживают CORS)
        if (url.startsWith('blob:') ||
            url.startsWith('data:') ||
            this.isLocalResource(url)) {
            return false;
        }

        // Проверяем домены из белого списка
        for (const domain of this.allowedDomains) {
            if (url.includes(domain)) {
                return false;
            }
        }

        // Проверяем, тот же ли это origin
        try {
            const urlObj = new URL(url, window.location.href);
            if (urlObj.origin === window.location.origin) {
                return false;
            }
        } catch (e) {
            // Если не парсится, считаем что нужен proxy
            return true;
        }

        // Для всех остальных внешних URL используем proxy
        return true;
    }

    /**
     * Show error message to user
     */
    showErrorMessage(message) {
        // Находим или создаем контейнер для сообщений об ошибках
        let errorContainer = document.querySelector('.panorama-error-container');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'panorama-error-container';
            errorContainer.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.8);
                color: white;
                padding: 20px;
                border-radius: 10px;
                z-index: 10000;
                max-width: 80%;
                text-align: center;
            `;
            document.body.appendChild(errorContainer);
        }

        errorContainer.innerHTML = `
            <h3 style="margin-top:0;">Ошибка загрузки</h3>
            <p>${message}</p>
            <button onclick="this.parentElement.remove()" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 10px;
            ">OK</button>
        `;
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

            // Используем proxy если нужно
            const finalUrl = await this.getProxiedUrlForJson(jsonUrl);

            const response = await fetch(finalUrl, {
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

    /**
     * Включить/отключить CORS proxy
     */
    setUseCorsProxy(useProxy) {
        this.useCorsProxy = useProxy;
    }

    /**
     * Добавить домен в белый список (не использовать proxy для него)
     */
    addAllowedDomain(domain) {
        if (!this.allowedDomains.includes(domain)) {
            this.allowedDomains.push(domain);
        }
    }

    /**
     * Установить список CORS proxy URL
     */
    setCorsProxyUrls(urls) {
        this.corsProxyUrls = urls;
    }
}