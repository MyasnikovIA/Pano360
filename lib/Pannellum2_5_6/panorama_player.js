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
                    crossOrigin: "use-credentials",
                    autoLoad: true,
                    yaw: 0,
                    pitch: 0,
                    hotSpots: []
                }
            }
        };
    }

    /**
     * Load panorama from photo parameter (поддерживает внешние и локальные ресурсы)
     */
    async loadPhotoPanorama(photoValue, hotSpot, jsonConfig) {
        const imageUrl = photoValue;
        const isExternal = this.isExternalUrl(photoValue);
        const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);
        var cameraDirection = {};
        try {
            // Пробуем загрузить JSON с хотспотами (работает и для внешних ресурсов)
            const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
            const hotspotsFromJson = jsonData.hotSpots || [];
            // Получаем направление камеры из JSON
            if (jsonData.pitchCam !== undefined && jsonData.yawCam !== undefined) {
                cameraDirection = {
                    pitchCam: jsonData.pitchCam,
                    yawCam: jsonData.yawCam
                };
                console.log("Loaded camera direction from JSON:", cameraDirection);
            }
            console.log("Loaded hotspots from JSON:", hotspotsFromJson.length);
            if (hotSpot) {
                cameraDirection = {
                    pitchCam: hotSpot.point_pitch,
                    yawCam: hotSpot.point_yaw
                };
            }
            // Финализируем сцену
            await this.finalizeScene(imageUrl, isExternal, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
        } catch(error) {
            console.log("No JSON file found or error loading:", jsonUrl, error);
            // Загружаем сцену без данных из JSON
            await this.finalizeScene(imageUrl, isExternal, [], {}, hotSpot, jsonConfig);
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
     * Finalize and display the panorama scene (поддерживает внешние ресурсы)
     */
    async finalizeScene(imageUrl, isExternal, hotspotsData, cameraDirection, hotSpot, jsonConfig) {
        const scene = jsonConfig.scenes.scene1;
        scene.panorama = imageUrl;

        // Ключевой момент: для внешних URL устанавливаем crossOrigin в undefined,
        // для локальных используем "use-credentials"
        scene.crossOrigin = isExternal ? undefined : "use-credentials";

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
            // Сохраняем информацию о перемещении камеры
            this.pendingCameraMove = {
                pitch: cameraDirection.pitchCam || scene.pitch,
                yaw: cameraDirection.yawCam || scene.yaw
            };

            // Используем событие load для запуска анимации
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

            // Выполняем анимацию камеры
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
     * Handle hotspot click (поддерживает переходы на внешние ресурсы)
     */
    onClickHotSpot(hs) {
        console.log("Переход к другой сцене:", hs);

        // Проверяем, есть ли URL для загрузки новой сцены
        if (hs.panorama_url) {
            // Обновляем URL страницы с новыми параметрами
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hs.panorama_url);

            window.history.pushState({}, '', currentUrl);

            // Загружаем новую сцену (внешнюю или локальную)
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

            // Для старых JSON конфигураций
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
        return /^https?:\/\//i.test(url);
    }

    getJsonUrlFromImageUrl(imageUrl) {
        return imageUrl ? imageUrl.replace(/\.[^/.]+$/, "") + ".json" : '';
    }

    /**
     * Load hotspots from JSON file (работает для внешних и локальных ресурсов)
     */
    async loadHotSpotsFromJson(jsonUrl) {
        try {
            const response = await fetch(jsonUrl, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                },
                cache: 'force-cache'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            console.log("Loaded JSON data from:", jsonUrl);

            // Проверяем новый формат
            if (data && data.hotSpots && Array.isArray(data.hotSpots)) {
                return data; // Возвращаем весь объект JSON
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
            throw error;
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
}

