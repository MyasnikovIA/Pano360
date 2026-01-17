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

                // Автоматическое преобразование smwrap.ru URLs в GitHub URLs
                if (photoValue.includes('www.smwrap.ru/Pano360Git/')) {
                    photoValue = this.convertSmwrapToGitHubUrl(photoValue);
                    console.log("Converted to GitHub URL:", photoValue);
                }
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
     * Convert smwrap.ru URL to GitHub URL
     */
    convertSmwrapToGitHubUrl(url) {
        // Пример: http://www.smwrap.ru/Pano360Git/img/Tailand_2024/Phuket/PIC_20240606_110642.jpg
        // Преобразуем в: https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/img/Tailand_2024/Phuket/PIC_20240606_110642.jpg

        const patterns = [
            {
                from: /http:\/\/www\.smwrap\.ru\/Pano360Git\/(img\/.+)/,
                to: 'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/$1'
            },
            {
                from: /https:\/\/www\.smwrap\.ru\/Pano360Git\/(img\/.+)/,
                to: 'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/$1'
            }
        ];

        for (const pattern of patterns) {
            if (pattern.from.test(url)) {
                return url.replace(pattern.from, pattern.to);
            }
        }

        return url;
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
        console.log("Loading panorama from:", photoValue);

        try {
            // Проверяем доступность изображения
            const isAvailable = await this.checkImageAvailability(photoValue);

            if (!isAvailable) {
                // Пробуем альтернативные URLs
                const alternativeUrls = this.getAlternativeUrls(photoValue);
                let availableUrl = null;

                for (const altUrl of alternativeUrls) {
                    if (await this.checkImageAvailability(altUrl)) {
                        availableUrl = altUrl;
                        console.log("Using alternative URL:", altUrl);
                        break;
                    }
                }

                if (availableUrl) {
                    photoValue = availableUrl;
                } else {
                    throw new Error("Image not available from any source");
                }
            }

            const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);
            var cameraDirection = {};
            var hotspotsFromJson = [];

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
                    }
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

            await this.finalizeScene(photoValue, false, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);

        } catch(error) {
            console.error("Error loading panorama:", error);
            this.showErrorMessage(`Ошибка загрузки изображения. URL: ${photoValue}`);
        }
    }

    /**
     * Check if image is available
     */
    async checkImageAvailability(url) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = url;

            // Таймаут 5 секунд
            setTimeout(() => resolve(false), 5000);
        });
    }

    /**
     * Get alternative URLs for image
     */
    getAlternativeUrls(originalUrl) {
        const alternatives = [];

        // Если это smwrap.ru URL, добавляем GitHub альтернативу
        if (originalUrl.includes('www.smwrap.ru/Pano360Git/')) {
            const gitHubUrl = originalUrl.replace(
                /https?:\/\/www\.smwrap\.ru\/Pano360Git\//,
                'https://raw.githubusercontent.com/MyasnikovIA/Pano360/main/'
            );
            alternatives.push(gitHubUrl);
        }

        // Если это GitHub URL, добавляем githack альтернативу
        if (originalUrl.includes('raw.githubusercontent.com')) {
            const githackUrl = originalUrl.replace(
                'raw.githubusercontent.com',
                'raw.githack.com'
            );
            alternatives.push(githackUrl);
        }

        // Добавляем оригинальный URL с HTTPS
        if (originalUrl.startsWith('http:')) {
            alternatives.push(originalUrl.replace('http:', 'https:'));
        }

        return alternatives;
    }

    /**
     * Show error message to user
     */
    showErrorMessage(message) {
        // Удаляем старые сообщения
        const oldError = document.querySelector('.panorama-error');
        if (oldError) oldError.remove();

        // Создаем сообщение
        const errorDiv = document.createElement('div');
        errorDiv.className = 'panorama-error';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(255, 0, 0, 0.9);
            color: white;
            padding: 15px 30px;
            border-radius: 10px;
            z-index: 10000;
            font-family: Arial, sans-serif;
            text-align: center;
            max-width: 80%;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;

        errorDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">Ошибка загрузки панорамы</div>
            <div style="font-size: 14px;">${message}</div>
            <button onclick="this.parentElement.remove()" style="
                background: white;
                color: red;
                border: none;
                padding: 5px 15px;
                border-radius: 5px;
                margin-top: 10px;
                cursor: pointer;
            ">Закрыть</button>
        `;

        document.body.appendChild(errorDiv);
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
                console.log("Camera direction set from JSON");
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

        try {
            this.sceneMain = pannellum.viewer(this.canvasId, config);
            this.currentScene = sceneName;

            if (this.pendingCameraMove) {
                this.sceneMain.on('load', () => {
                    this.executePendingCameraMove();
                });
            }
        } catch (error) {
            console.error("Error creating Pannellum viewer:", error);
            this.showErrorMessage("Ошибка создания панорамного просмотрщика");
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
            // Автоматическое преобразование smwrap.ru URLs
            if (jsonUrl.includes('www.smwrap.ru/Pano360Git/')) {
                jsonUrl = this.convertSmwrapToGitHubUrl(jsonUrl);
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

        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }
    }
}