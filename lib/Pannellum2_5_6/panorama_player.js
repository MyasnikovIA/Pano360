/**
 * Panorama Player - Main application controller
 * @module PanoramaPlayer
 */

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

        // Более надежные proxy
        this.corsProxyUrls = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy/?quest=',
            'https://proxy.cors.sh/'
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
     */
    async setSelectPanorama(hotSpot) {
        if (this.isLoading) return;

        this.isLoading = true;
        try {
            let params = new URLSearchParams(document.location.search);
            let infoValue = params.get('info');
            let photoValue = params.get('photo');

            if (!photoValue && this.initialImage) {
                photoValue = this.initialImage;
            }

            // Нормализация путей
            if (photoValue) {
                photoValue = this.normalizePath(photoValue);
            }

            // Автоматическое исправление HTTP на HTTPS если страница HTTPS
            if (photoValue && window.location.protocol === 'https:' && photoValue.startsWith('http:')) {
                photoValue = photoValue.replace('http:', 'https:');
                console.log("Auto-corrected HTTP to HTTPS:", photoValue);
            }

            let hotSpots = params.get('hotSpots');
            if (hotSpots) {
                hotSpots = this.normalizePath(hotSpots);
            }

            // Настройка canvas
            let canvas = document.getElementById(this.canvasId);
            if (!canvas) {
                console.error(`Canvas element with id "${this.canvasId}" not found.`);
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
     * Load panorama from photo parameter
     */
    async loadPhotoPanorama(photoValue, hotSpot, jsonConfig) {
        let imageUrl = photoValue;

        // Автоматическое исправление HTTP на HTTPS если страница HTTPS
        if (window.location.protocol === 'https:' && imageUrl.startsWith('http:')) {
            imageUrl = imageUrl.replace('http:', 'https:');
        }

        const jsonUrl = this.getJsonUrlFromImageUrl(imageUrl);
        var cameraDirection = {};
        var hotspotsFromJson = [];

        console.log("Loading panorama from:", imageUrl);

        try {
            // Пробуем загрузить JSON с хотспотами
            if (jsonUrl) {
                try {
                    const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
                    hotspotsFromJson = jsonData.hotSpots || [];

                    if (jsonData.pitchCam !== undefined && jsonData.yawCam !== undefined) {
                        cameraDirection = {
                            pitchCam: jsonData.pitchCam,
                            yawCam: jsonData.yawCam
                        };
                        console.log("Loaded camera direction from JSON:", cameraDirection);
                    }
                    console.log("Loaded hotspots from JSON:", hotspotsFromJson.length);
                } catch (jsonError) {
                    console.log("No JSON file found:", jsonUrl, jsonError);
                }
            }

            if (hotSpot) {
                cameraDirection = {
                    pitchCam: hotSpot.point_pitch,
                    yawCam: hotSpot.point_yaw
                };
            }

            // Если URL начинается с HTTP, используем специальный метод загрузки
            if (imageUrl.startsWith('http:')) {
                console.warn("HTTP URL detected, will try special loading method");
                const loadedImageUrl = await this.loadHttpImage(imageUrl);
                await this.finalizeScene(loadedImageUrl, true, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
            } else {
                // Для HTTPS используем обычную загрузку
                await this.finalizeScene(imageUrl, false, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
            }
        } catch(error) {
            console.error("Error loading panorama:", error);
            this.showErrorMessage(`Не удалось загрузить изображение. Проверьте URL: ${photoValue}`);
        }
    }

    /**
     * Загрузка HTTP изображений на HTTPS странице
     */
    async loadHttpImage(imageUrl) {
        // Если страница HTTPS, а изображение HTTP - используем специальный подход
        if (window.location.protocol === 'https:' && imageUrl.startsWith('http:')) {
            console.log("Trying to load HTTP image on HTTPS page");

            // Вариант 1: Пробуем заменить на HTTPS
            const httpsUrl = imageUrl.replace('http:', 'https:');
            try {
                const response = await fetch(httpsUrl, { method: 'HEAD' });
                if (response.ok) {
                    console.log("HTTPS version available");
                    return httpsUrl;
                }
            } catch (e) {
                console.log("HTTPS version not available");
            }

            // Вариант 2: Используем серверный прокси
            try {
                // Используем простой proxy сервер
                const proxyUrl = 'https://images.weserv.nl/?url=' + encodeURIComponent(imageUrl.replace('http://', ''));
                const test = await fetch(proxyUrl, { method: 'HEAD' });
                if (test.ok) {
                    console.log("Using images.weserv.nl proxy");
                    return proxyUrl;
                }
            } catch (e) {
                console.log("images.weserv.nl proxy failed");
            }

            // Вариант 3: Используем другой proxy
            try {
                const proxyUrl = 'https://cors.connexao.com/' + encodeURIComponent(imageUrl);
                const test = await fetch(proxyUrl, { method: 'HEAD' });
                if (test.ok) {
                    console.log("Using cors.connexao.com proxy");
                    return proxyUrl;
                }
            } catch (e) {
                console.log("cors.connexao.com proxy failed");
            }

            throw new Error("Cannot load HTTP image on HTTPS page");
        }

        return imageUrl;
    }

    /**
     * Show error message to user
     */
    showErrorMessage(message) {
        // Удаляем старые сообщения об ошибках
        const oldError = document.querySelector('.panorama-error-container');
        if (oldError) oldError.remove();

        // Создаем новое сообщение
        const errorContainer = document.createElement('div');
        errorContainer.className = 'panorama-error-container';
        errorContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 30px;
            border-radius: 15px;
            z-index: 10000;
            max-width: 90%;
            text-align: center;
            font-family: Arial, sans-serif;
            box-shadow: 0 0 20px rgba(0,0,0,0.5);
        `;

        errorContainer.innerHTML = `
            <h3 style="margin-top:0; color: #ff6b6b;">⚠️ Ошибка загрузки</h3>
            <p style="margin: 15px 0; line-height: 1.5;">${message}</p>
            <p style="font-size: 14px; color: #aaa; margin: 10px 0;">
                Попробуйте:<br>
                1. Использовать HTTPS URL<br>
                2. Загрузить изображение на GitHub<br>
                3. Исправить URL вручную
            </p>
            <button onclick="this.parentElement.remove(); location.reload();" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
                margin-top: 15px;
                font-size: 16px;
            ">Повторить</button>
        `;

        document.body.appendChild(errorContainer);
    }

    /**
     * Load panorama from info parameter (legacy format)
     */
    loadInfoPanorama(infoValue, hotSpot, jsonConfig) {
        const oldJsonData = this.getJsonUrlData(`/Example/pano360/point_info/${infoValue}`);
        Object.assign(jsonConfig, oldJsonData);

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

            const scene = jsonConfig.scenes.scene1;
            scene.title = "Default Panorama";
            scene.panorama = defaultImage;
            scene.hotSpots = this.formatHotSpots(hotspotsFromJson);

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

        // Настраиваем crossOrigin
        if (isBlobUrl) {
            scene.crossOrigin = undefined;
        } else if (this.isExternalUrl(imageUrl)) {
            scene.crossOrigin = "anonymous";
        } else {
            scene.crossOrigin = "use-credentials";
        }

        // Set camera direction
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

        if (hs.panorama_url) {
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hs.panorama_url);

            window.history.pushState({}, '', currentUrl);

            this.setSelectPanorama(hs);
            return true;
        }

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
        if (!jsonUrl) {
            throw new Error("No JSON URL provided");
        }

        try {
            // Автоматическое исправление HTTP на HTTPS
            if (window.location.protocol === 'https:' && jsonUrl.startsWith('http:')) {
                jsonUrl = jsonUrl.replace('http:', 'https:');
            }

            const response = await fetch(jsonUrl, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log("Loaded JSON data from:", jsonUrl);

            if (data && data.hotSpots && Array.isArray(data.hotSpots)) {
                return data;
            }
            else if (Array.isArray(data)) {
                return { hotSpots: data, pitchCam: 0, yawCam: 0 };
            } else if (data.hotspots && Array.isArray(data.hotspots)) {
                return { hotSpots: data.hotspots, pitchCam: 0, yawCam: 0 };
            } else if (data.scenes && data.scenes.scene1 && data.scenes.scene1.hotSpots) {
                return { hotSpots: data.scenes.scene1.hotSpots, pitchCam: 0, yawCam: 0 };
            }

            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        } catch (error) {
            console.log("Error loading JSON hotspots from:", jsonUrl, error);
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

        if (this.loadingIframe && this.loadingIframe.parentNode) {
            this.loadingIframe.parentNode.removeChild(this.loadingIframe);
            this.loadingIframe = null;
        }

        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }

    /**
     * Проверка доступности HTTPS версии
     */
    async checkHttpsAvailable(url) {
        if (!url.startsWith('http:')) return false;

        const httpsUrl = url.replace('http:', 'https:');
        try {
            const response = await fetch(httpsUrl, { method: 'HEAD' });
            return response.ok;
        } catch (e) {
            return false;
        }
    }
}