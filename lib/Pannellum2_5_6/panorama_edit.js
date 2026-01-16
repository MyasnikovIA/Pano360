/**
 * Panorama Editor - Main application controller for editing panoramas
 * @module PanoramaEditor
 */



// // Initialize panorama editor when DOM is ready
// document.addEventListener('DOMContentLoaded', () => {
//     window.panoramaEditor = new PanoramaEditor();
// });


class PanoramaEditor {
    constructor() {
        this.sceneMain = null;
        this.currentScene = null;
        this.currentHotspots = [];
        this.currentCoords = null;
        this.selectedPreviewCoords = null;
        this.previewIframe = null;
        this.messageHandlerBound = false;
        this.isInIframe = window.self !== window.top;
        this.isLoading = false;
        this.init();
    }

    /**
     * Initialize the panorama editor
     */
    init() {
        this.setupEventListeners();
        this.loadInitialScene();
        this.initModalHandlers();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            if (!this.isInIframe) {
                document.addEventListener('contextmenu', (e) => e.preventDefault());
            }
        });

        window.addEventListener('popstate', () => this.loadInitialScene());
        
        // Обработчик сообщений от родительской страницы
        window.addEventListener('message', (event) => this.handleParentMessage(event));
    }

    /**
     * Load the initial panorama scene
     */
    loadInitialScene() {
        this.setSelectPanorama();
    }

    /**
     * Set and display panorama based on parameters
     * @param {Object|null} hotSpot - Hotspot object if triggered from click
     */
    async setSelectPanorama(hotSpot = null) {
        if (this.isLoading) return;

        this.isLoading = true;
        try {
            let params = new URLSearchParams(document.location.search);
            let infoValue = params.get('info');
            let photoValue = params.get('photo');
            let hotSpotsValue = params.get('hotSpots');

            // Нормализация путей
            if (photoValue) {
                photoValue = this.normalizePath(photoValue);
            }
            if (hotSpotsValue) {
                hotSpotsValue = this.normalizePath(hotSpotsValue);
            }

            // Настройка canvas
            let canvas = document.getElementById('canvas');
            canvas.style.width = '100%';
            canvas.style.height = '100%';

            // Базовый JSON конфиг
            let jsonObj = this.createBaseJsonConfig();

            // Загрузка в зависимости от параметров
            if (photoValue) {
                await this.loadPhotoPanorama(photoValue, hotSpot, hotSpotsValue, jsonObj);
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
            hotPointDebug: !this.isInIframe,
            sceneFadeDuration: this.isInIframe ? 500 : 1000,
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
     * Load panorama from photo parameter
     */
    async loadPhotoPanorama(photoValue, hotSpot, hotSpotsValue, jsonConfig) {
        const imageUrl = photoValue;
        const isExternal = this.isExternalUrl(photoValue);
        const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);
        let cameraDirection = {};

        try {
            // Пробуем загрузить JSON с хотспотами
            const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
            const hotspotsFromJson = jsonData.hotSpots || [];
            
            if (jsonData.pitchCam !== undefined && jsonData.yawCam !== undefined) {
                cameraDirection = {
                    pitchCam: jsonData.pitchCam,
                    yawCam: jsonData.yawCam
                };
                console.log("Loaded camera direction from JSON:", cameraDirection);
            }
            
            console.log("Loaded hotspots from JSON:", hotspotsFromJson.length);
            
            // Финализируем сцену
            await this.finalizeScene(imageUrl, isExternal, hotspotsFromJson, cameraDirection, hotSpot, hotSpotsValue, jsonConfig);
        } catch(error) {
            console.log("No JSON file found or error loading:", jsonUrl, error);
            // Загружаем сцену без данных из JSON
            await this.finalizeScene(imageUrl, isExternal, [], {}, hotSpot, hotSpotsValue, jsonConfig);
        }
    }

    /**
     * Load panorama from info parameter (legacy format)
     */
    loadInfoPanorama(infoValue, hotSpot, jsonConfig) {
        const oldJsonData = this.getJsonUrlData('/Example/pano360/point_info/' + infoValue);
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

        // Add event handlers
        this.addEventHandlersToConfig(jsonConfig);

        this.createPannellumViewer(jsonConfig, infoValue);
        
        // Обновляем список hotspots после загрузки
        if (this.sceneMain) {
            this.sceneMain.on('load', () => {
                this.loadHotspotsList();
            });
        }
    }

    /**
     * Load default panorama when no parameters are provided
     */
    async loadDefaultPanorama(jsonConfig) {
        const defaultImage = 'img/04.01.2026/DSCN0021.JPG';
        const jsonUrl = this.getJsonUrlFromImageUrl(defaultImage);
        const isExternal = this.isExternalUrl(defaultImage);

        try {
            const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
            const hotspotsFromJson = jsonData.hotSpots || [];
            let cameraDirection = {};

            if (jsonData.pitchCam !== undefined && jsonData.yawCam !== undefined) {
                cameraDirection = {
                    pitchCam: jsonData.pitchCam,
                    yawCam: jsonData.yawCam
                };
                console.log("Loaded camera direction from JSON for default image:", cameraDirection);
                jsonConfig.scenes.scene1.pitch = cameraDirection.pitchCam;
                jsonConfig.scenes.scene1.yaw = cameraDirection.yawCam;
            }

            console.log("Loaded hotspots from JSON for default image:", hotspotsFromJson.length);

            // Configure default scene
            const scene = jsonConfig.scenes.scene1;
            scene.title = "Default Panorama";
            scene.panorama = defaultImage;
            scene.crossOrigin = isExternal ? undefined : "use-credentials";
            
            // Преобразуем hotspots в формат Pannellum
            scene.hotSpots = this.formatHotSpots(hotspotsFromJson);

            // Сохраняем текущие hotspots для редактора
            this.currentHotspots = hotspotsFromJson;

            // Устанавливаем направление камеры по умолчанию, если не загружено из JSON
            if (jsonData.pitchCam === undefined) {
                scene.pitch = -24.41;
            }
            if (jsonData.yawCam === undefined) {
                scene.yaw = -6.77;
            }

            this.createPannellumViewer(jsonConfig, 'default');

            // Обновляем список hotspots через колбэк onLoad
            if (this.sceneMain) {
                this.sceneMain.on('load', () => {
                    this.loadHotspotsList();
                });
            }
        } catch (error) {
            console.log("No JSON file found for default image:", jsonUrl, error);

            // Fallback configuration
            const scene = jsonConfig.scenes.scene1;
            scene.title = "Default Panorama";
            scene.panorama = defaultImage;
            scene.crossOrigin = isExternal ? undefined : "use-credentials";
            scene.yaw = -6.77;
            scene.pitch = -24.41;

            this.createPannellumViewer(jsonConfig, 'default');

            // Обновляем список hotspots через колбэк onLoad
            if (this.sceneMain) {
                this.sceneMain.on('load', () => {
                    this.currentHotspots = [];
                    this.loadHotspotsList();
                });
            }
        }
    }

    /**
     * Finalize and display the panorama scene
     */
    async finalizeScene(imageUrl, isExternal, hotspotsData, cameraDirection, hotSpot, hotSpotsValue, jsonConfig) {
        const scene = jsonConfig.scenes.scene1;
        scene.panorama = imageUrl;
        scene.crossOrigin = isExternal ? undefined : "use-credentials";

        // Устанавливаем направление камеры из hotSpot или из JSON
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

        // Если есть hotspots в URL параметре, парсим их
        let hotspotsArray = [];
        if (hotSpotsValue) {
            try {
                hotspotsArray = JSON.parse(decodeURIComponent(hotSpotsValue));
            } catch (e) {
                console.error("Error parsing hotSpots URL parameter:", e);
            }
        }

        // Объединяем hotspots из JSON и URL параметра
        let allHotSpots = [];
        if (Array.isArray(hotspotsData)) {
            allHotSpots = allHotSpots.concat(hotspotsData);
        }
        if (Array.isArray(hotspotsArray)) {
            allHotSpots = allHotSpots.concat(hotspotsArray);
        }

        // Убираем дубликаты по pitch/yaw
        let uniqueHotspots = this.removeDuplicateHotspots(allHotSpots);

        // Преобразуем hotspots в формат Pannellum
        scene.hotSpots = this.formatHotSpots(uniqueHotspots);

        // Сохраняем текущие hotspots для редактора
        this.currentHotspots = uniqueHotspots;

        // Add event handlers
        this.addEventHandlersToConfig(jsonConfig);

        this.createPannellumViewer(jsonConfig, imageUrl);

        // Если есть направление камеры из JSON, устанавливаем его через колбэк onLoad
        if (cameraDirection && (cameraDirection.pitchCam !== undefined || cameraDirection.yawCam !== undefined)) {
            if (this.sceneMain) {
                this.sceneMain.on('load', () => {
                    const targetPitch = cameraDirection.pitchCam || scene.pitch;
                    const targetYaw = cameraDirection.yawCam || scene.yaw;
                    this.sceneMain.lookAt(targetPitch, targetYaw, this.sceneMain.getHfov(), 1000);
                    console.log("Camera direction set from JSON: Pitch=" + targetPitch + ", Yaw=" + targetYaw);

                    // Обновляем список hotspots в интерфейсе после загрузки
                    this.loadHotspotsList();
                });
            }
        } else {
            // Если нет направления камеры, обновляем список hotspots после небольшой задержки
            if (this.sceneMain) {
                this.sceneMain.on('load', () => {
                    setTimeout(() => {
                        this.loadHotspotsList();
                    }, 100);
                });
            }
        }

        // Также добавляем обработчик на случай, если сцена уже загружена
        if (this.sceneMain && this.sceneMain.isLoaded()) {
            if (cameraDirection && (cameraDirection.pitchCam !== undefined || cameraDirection.yawCam !== undefined)) {
                const targetPitch = cameraDirection.pitchCam || scene.pitch;
                const targetYaw = cameraDirection.yawCam || scene.yaw;
                this.sceneMain.lookAt(targetPitch, targetYaw, this.sceneMain.getHfov(), 1000);
                console.log("Camera direction set from JSON (already loaded): Pitch=" + targetPitch + ", Yaw=" + targetYaw);
            }

            // Обновляем список hotspots
            setTimeout(() => {
                this.loadHotspotsList();
            }, 100);
        }
    }

    /**
     * Add event handlers to configuration
     */
    addEventHandlersToConfig(config) {
        config.onClickHotSpot = (hs) => this.onClickHotSpot(hs);
        config.onDblClick = this.isInIframe ? null : (coords, screenCoords, event) => this.onDblClick(coords, screenCoords, event);
        config.onClick = (hs) => this.onClick(hs);

        if (!this.isInIframe) {
            config.onContextMenuHotSpot = (coords, screenCoords, event, hotSpot) => 
                this.onContextMenuHotSpot(coords, screenCoords, event, hotSpot);
            config.onContextMenu = (coords, screenCoords, event) => 
                this.onContextMenu(coords, screenCoords, event);
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
            point_yaw: hotspot.targetYaw || 0,
            customScale: hotspot.customScale || undefined
        }));
    }

    /**
     * Remove duplicate hotspots
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
     * Create Pannellum viewer instance
     */
    createPannellumViewer(config, sceneName) {
        // Clean up previous viewer
        if (this.sceneMain && typeof this.sceneMain.destroy === 'function') {
            this.sceneMain.destroy();
        }

        this.sceneMain = pannellum.viewer('canvas', config);
        this.currentScene = sceneName;
    }

    /**
     * Event handlers
     */

    onDblClick(coords, screenCoords, event) {
        if (this.isInIframe) return;

        console.log("Double click on scene:", {
            coords: coords,
            screenCoords: screenCoords,
            event: event
        });

        if (coords) {
            this.openHotSpotModal(coords);
        }
    }

    onClick(hs) {
        console.log("onClick", arguments[0]);
    }

    onClickHotSpot(hs) {
        console.log("Переход к другой сцене:", hs);
        
        if (this.sceneMain) {
            this.copyToClipboardLegacy(this.sceneMain.getConfig().panorama, null);
        }
        
        if (hs.panorama_url) {
            let currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hs.panorama_url);
            window.history.pushState({}, '', currentUrl);
            hs.pitch = hs.point_pitch;
            hs.yaw = hs.point_yaw;
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
            jsonObj.onClickHotSpot = (hs) => this.onClickHotSpot(hs);

            jsonObj.pitch = hs.point_pitch;
            jsonObj.yaw = hs.point_yaw;
            
            if (this.sceneMain && typeof this.sceneMain.destroy !== 'undefined') {
                this.sceneMain.destroy();
            }
            
            this.sceneMain = pannellum.viewer('canvas', jsonObj);
            this.currentScene = name;
            return true;
        }
        
        return false;
    }

    onContextMenuHotSpot(coords, screenCoords, event, hotSpot) {
        if (this.isInIframe) return;

        console.log("Right click on HotSpot:", {
            coords: coords,
            screenCoords: screenCoords,
            hotSpot: hotSpot,
            event: event
        });

        alert(`HotSpot context menu:\n` +
            `Yaw: ${coords.yaw.toFixed(2)}°\n` +
            `Pitch: ${coords.pitch.toFixed(2)}°\n` +
            `Screen: (${screenCoords.x}, ${screenCoords.y})\n` +
            `HotSpot text: ${hotSpot.text || 'No text'}`);

        this.showCustomContextMenu(screenCoords.x, screenCoords.y, {
            type: 'hotspot',
            data: hotSpot,
            coords: coords
        });
    }

    onContextMenu(coords, screenCoords, event) {
        if (this.isInIframe) return;

        console.log("Right click on scene:", {
            coords: coords,
            screenCoords: screenCoords,
            event: event
        });

        this.showCustomContextMenu(screenCoords.x, screenCoords.y, {
            type: 'scene',
            data: coords,
            screenCoords: screenCoords
        });
    }

    /**
     * Hotspot management
     */

    openHotSpotModal(coords) {
        if (this.isInIframe) return;

        this.currentCoords = coords;
        this.selectedPreviewCoords = null;

        const modal = document.getElementById('hotspotModal');
        modal.style.display = 'flex';

        document.getElementById('hotspotName').value = '';
        document.getElementById('hotspotUrl').value = this.sceneMain ? this.sceneMain.getConfig().panorama : '';
        document.getElementById('hotspotType').value = 'scene';
        document.getElementById('hotspotText').value = '';
        document.getElementById('selectedCoordinates').textContent = 'Не выбрано';
        document.getElementById('previewContainer').style.display = 'none';
        document.getElementById('importSuccess').style.display = 'none';

        // Очищаем iframe контейнер
        const iframeContainer = document.getElementById('previewIframeContainer');
        iframeContainer.innerHTML = '';

        this.loadHotspotsList();
    }

    closeModal() {
        const modal = document.getElementById('hotspotModal');
        modal.style.display = 'none';

        if (this.previewIframe) {
            this.previewIframe.remove();
            this.previewIframe = null;
        }

        // Удаляем обработчик сообщений при закрытии модального окна
        if (this.messageHandlerBound) {
            window.removeEventListener('message', this.handlePreviewMessage.bind(this));
            this.messageHandlerBound = false;
        }
    }

    loadPreview() {
        if (this.isInIframe) return;

        const url = document.getElementById('hotspotUrl').value.trim();
        if (!url) {
            alert('Введите URL панорамы');
            return;
        }

        // Показать контейнер предпросмотра
        document.getElementById('previewContainer').style.display = 'block';
        document.getElementById('selectedCoordinates').innerHTML = '<em>Загрузка предпросмотра...</em>';

        // Создать iframe с viewer_preview.html
        const iframeContainer = document.getElementById('previewIframeContainer');
        iframeContainer.innerHTML = '';

        // Создаем iframe с правильными размерами
        this.previewIframe = document.createElement('iframe');
        this.previewIframe.id = 'previewIframe';
        this.previewIframe.src = 'viewer_preview.html?photo=' + encodeURIComponent(url);
        this.previewIframe.style.width = '100%';
        this.previewIframe.style.height = '100%';
        this.previewIframe.style.border = 'none';

        iframeContainer.appendChild(this.previewIframe);

        // Добавить обработчик сообщений от iframe (только один раз)
        if (!this.messageHandlerBound) {
            window.addEventListener('message', this.handlePreviewMessage.bind(this));
            this.messageHandlerBound = true;
        }
    }

    handlePreviewMessage(event) {
        // Проверяем, что сообщение от нашего iframe предпросмотра
        const iframe = document.getElementById('previewIframe');
        if (!iframe || event.source !== iframe.contentWindow) return;

        if (event.data && event.data.type === 'hotspot_preview_coords') {
            // Сохраняем выбранные координаты
            this.selectedPreviewCoords = {
                click: event.data.clickCoords,
                view: event.data.viewCoords
            };

            // Обновляем отображение координат
            const coordsText = `
                <div style="margin-bottom: 8px;">
                    <strong>Координаты клика:</strong><br>
                    Yaw: <code>${this.selectedPreviewCoords.click.yaw.toFixed(2)}°</code>,
                    Pitch: <code>${this.selectedPreviewCoords.click.pitch.toFixed(2)}°</code>
                </div>
                <div>
                    <strong>Направление камеры:</strong><br>
                    Yaw: <code>${this.selectedPreviewCoords.view.yaw.toFixed(2)}°</code>,
                    Pitch: <code>${this.selectedPreviewCoords.view.pitch.toFixed(2)}°</code>
                </div>
                <div style="margin-top: 8px; color: #4CAF50;">
                    <strong>✓ Координаты выбраны успешно!</strong>
                </div>
            `;

            document.getElementById('selectedCoordinates').innerHTML = coordsText;
        }
    }

    saveHotspot() {
        if (this.isInIframe) return;

        const name = document.getElementById('hotspotName').value.trim();
        const url = document.getElementById('hotspotUrl').value.trim();
        const type = document.getElementById('hotspotType').value;
        const text = document.getElementById('hotspotText').value.trim();

        if (!url) {
            alert('URL панорамы обязателен для заполнения');
            return;
        }

        // Проверяем, что координаты выбраны
        if (!this.selectedPreviewCoords) {
            if (!confirm('Координаты направления камеры не выбраны. Использовать значение по умолчанию (0,0)?')) {
                return;
            }
            this.selectedPreviewCoords = {
                view: { pitch: 0, yaw: 0 }
            };
        }

        const hotspot = {
            id: Date.now(),
            name: name || 'Без имени',
            type: type,
            text: text || 'Точка перехода',
            pitch: this.currentCoords.pitch,
            yaw: this.currentCoords.yaw,
            targetPitch: this.selectedPreviewCoords ? this.selectedPreviewCoords.view.pitch : 0,
            targetYaw: this.selectedPreviewCoords ? this.selectedPreviewCoords.view.yaw : 0,
            panorama_url: url,
            createdAt: new Date().toISOString()
        };

        this.currentHotspots.push(hotspot);
        this.loadHotspotsList();
        this.updateSceneWithHotspots();
    }

    updateSceneWithHotspots() {
        if (!this.sceneMain) return;

        // Преобразуем hotspots в формат Pannellum
        const pannellumHotspots = this.currentHotspots.map(hotspot => ({
            pitch: hotspot.pitch,
            yaw: hotspot.yaw,
            type: hotspot.type || "scene",
            text: hotspot.text || "Переход",
            sceneId: "scene1",
            panorama_url: hotspot.panorama_url,
            point_pitch: hotspot.targetPitch || 0,
            point_yaw: hotspot.targetYaw || 0
        }));

        this.sceneMain.removeHotSpot('all');
        pannellumHotspots.forEach(hotspot => {
            this.sceneMain.addHotSpot(hotspot, "scene1");
        });

        console.log("Scene updated with " + this.currentHotspots.length + " hotspots.");
    }

    loadHotspotsList() {
        const container = document.getElementById('hotspotsContainer');
        container.innerHTML = '';

        if (this.currentHotspots.length === 0) {
            container.innerHTML = '<p style="color: #666; font-style: italic;">Нет созданных точек</p>';
            return;
        }

        this.currentHotspots.forEach((hotspot, index) => {
            const item = document.createElement('div');
            item.className = 'hotspot-item';
            item.innerHTML = `
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold; margin-bottom: 4px;">${hotspot.name}</div>
                    <div style="font-size: 12px; color: #555; margin-bottom: 2px;">
                        <strong>Координаты:</strong> Yaw ${hotspot.yaw.toFixed(2)}, Pitch ${hotspot.pitch.toFixed(2)}
                    </div>
                    <div style="font-size: 12px; color: #555; margin-bottom: 2px;">
                        <strong>Направление:</strong> Yaw ${hotspot.targetYaw.toFixed(2)}, Pitch ${hotspot.targetPitch.toFixed(2)}
                    </div>
                    <div style="font-size: 11px; color: #777; margin-top: 4px;">
                        URL: ${hotspot.panorama_url.substring(0, 40)}${hotspot.panorama_url.length > 40 ? '...' : ''}
                    </div>
                </div>
                <div class="hotspot-actions">
                    <button onclick="panoramaEditor.editHotspot(${index})" class="btn" style="background: #ffc107; color: black;">✏️</button>
                    <button onclick="panoramaEditor.deleteHotspot(${index})" class="btn" style="background: #dc3545; color: white;">🗑️</button>
                </div>
            `;
            container.appendChild(item);
        });
    }

    editHotspot(index) {
        if (this.isInIframe) return;

        const hotspot = this.currentHotspots[index];

        document.getElementById('hotspotName').value = hotspot.name;
        document.getElementById('hotspotUrl').value = hotspot.panorama_url;
        document.getElementById('hotspotText').value = hotspot.text;
        document.getElementById('hotspotType').value = hotspot.type || 'scene';

        this.currentCoords = {
            pitch: hotspot.pitch,
            yaw: hotspot.yaw
        };

        // Если есть координаты предпросмотра
        if (hotspot.targetPitch !== undefined && hotspot.targetYaw !== undefined) {
            this.selectedPreviewCoords = {
                view: {
                    pitch: hotspot.targetPitch,
                    yaw: hotspot.targetYaw
                }
            };
            const coordsText = `
                <div style="margin-bottom: 8px;">
                    <strong>Направление камеры:</strong><br>
                    Yaw: <code>${this.selectedPreviewCoords.view.yaw.toFixed(2)}°</code>,
                    Pitch: <code>${this.selectedPreviewCoords.view.pitch.toFixed(2)}°</code>
                </div>
                <div style="color: #666; font-size: 12px;">
                    (загружено из сохранённой точки)
                </div>
            `;
            document.getElementById('selectedCoordinates').innerHTML = coordsText;
        }

        this.currentHotspots.splice(index, 1);
        this.loadHotspotsList();
    }

    deleteHotspot(index) {
        if (this.isInIframe) return;

        if (confirm('Удалить эту точку?')) {
            this.currentHotspots.splice(index, 1);
            this.loadHotspotsList();
            this.updateSceneWithHotspots();
        }
    }

    exportToJson() {
        if (this.isInIframe) return;
        
        if (this.currentHotspots.length === 0) {
            alert('Нет точек для экспорта');
            return;
        }

        // Получаем URL текущей сцены
        let cameraPitch = 0;
        let cameraYaw = 0;
        
        if (this.sceneMain && typeof this.sceneMain.getPitch === 'function' && typeof this.sceneMain.getYaw === 'function') {
            try {
                cameraPitch = this.sceneMain.getPitch();
                cameraYaw = this.sceneMain.getYaw();
                console.log("Current camera direction: Pitch=" + cameraPitch + ", Yaw=" + cameraYaw);
            } catch (e) {
                console.error('Ошибка при получении направления камеры:', e);
            }
        }
        
        const jsonData = {
            pitchCam: parseFloat(cameraPitch.toFixed(12)),
            yawCam: parseFloat(cameraYaw.toFixed(12)),
            hotSpots: this.currentHotspots.map(hotspot => ({
                id: hotspot.id || Date.now(),
                name: hotspot.name || 'Без имени',
                type: hotspot.type || "scene",
                text: hotspot.text || "Переход",
                pitch: parseFloat(hotspot.pitch.toFixed(12)),
                yaw: parseFloat(hotspot.yaw.toFixed(12)),
                targetPitch: parseFloat((hotspot.targetPitch || 0).toFixed(12)),
                targetYaw: parseFloat((hotspot.targetYaw || 0).toFixed(12)),
                panorama_url: hotspot.panorama_url,
                createdAt: hotspot.createdAt || new Date().toISOString()
            }))
        };

        const jsonString = JSON.stringify(jsonData, null, 2);
        this.downloadJsonFile(jsonString, this.getExportFileName());
    }

    importJson() {
        if (this.isInIframe) return;
        document.getElementById('jsonFileInput').click();
    }

    handleJsonFileSelect(event) {
        if (this.isInIframe) return;

        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                let hotspotsArray = [];
                let cameraPitch = 0;
                let cameraYaw = 0;

                console.log("Importing JSON data:", importedData);

                // Проверяем правильный формат
                if (importedData && importedData.hotSpots && Array.isArray(importedData.hotSpots)) {
                    hotspotsArray = importedData.hotSpots;
                    if (importedData.pitchCam !== undefined) {
                        cameraPitch = importedData.pitchCam;
                    }
                    if (importedData.yawCam !== undefined) {
                        cameraYaw = importedData.yawCam;
                    }
                }
                // Проверяем старый формат для обратной совместимости
                else if (Array.isArray(importedData)) {
                    hotspotsArray = importedData;
                } else if (importedData.hotspots && Array.isArray(importedData.hotspots)) {
                    hotspotsArray = importedData.hotspots;
                } else {
                    throw new Error('Некорректный формат JSON файла. Ожидается объект с полем hotSpots');
                }

                // Проверяем структуру точек
                if (hotspotsArray.length > 0) {
                    const firstHotspot = hotspotsArray[0];
                    if (firstHotspot.pitch === undefined || firstHotspot.yaw === undefined || !firstHotspot.panorama_url) {
                        throw new Error('Некорректная структура точек в JSON файле');
                    }
                }

                // Объединяем с существующими точками (исключая дубликаты по ID)
                const existingIds = this.currentHotspots.map(h => h.id);
                const newHotspots = hotspotsArray.filter(h => !existingIds.includes(h.id));

                // Обрабатываем точки без ID
                newHotspots.forEach(hotspot => {
                    if (!hotspot.id) {
                        hotspot.id = Date.now() + Math.floor(Math.random() * 1000);
                    }
                    if (!hotspot.createdAt) {
                        hotspot.createdAt = new Date().toISOString();
                    }
                });

                this.currentHotspots = this.currentHotspots.concat(newHotspots);
                this.loadHotspotsList();
                this.updateSceneWithHotspots();

                // Устанавливаем направление камеры если оно было в JSON
                if (cameraPitch !== 0 || cameraYaw !== 0) {
                    if (this.sceneMain) {
                        this.sceneMain.lookAt(cameraPitch, cameraYaw, this.sceneMain.getHfov(), 1000);
                    }
                }

                // Показываем сообщение об успехе
                const successDiv = document.getElementById('importSuccess');
                successDiv.innerHTML = `
                    <strong>✓ Импорт успешно завершен!</strong><br>
                    Загружено ${newHotspots.length} новых точек (всего: ${this.currentHotspots.length})
                    ${cameraPitch !== 0 || cameraYaw !== 0 ?
                    '<br>Направление камеры: Pitch=' + cameraPitch.toFixed(2) + '°, Yaw=' + cameraYaw.toFixed(2) + '°' :
                    ''}
                `;
                successDiv.style.display = 'block';

                // Автоматически скрываем сообщение через 5 секунд
                setTimeout(() => {
                    successDiv.style.display = 'none';
                }, 5000);

                console.log('Импортировано точек:', newHotspots.length, 'Camera:', cameraPitch, cameraYaw);

            } catch (error) {
                alert('Ошибка при чтении JSON файла: ' + error.message);
                console.error('Import error:', error);
            }
        };

        reader.onerror = () => {
            alert('Ошибка при чтении файла');
        };

        reader.readAsText(file);

        // Сбрасываем input для возможности повторного выбора того же файла
        event.target.value = '';
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
     * Load hotspots from JSON file
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
            throw error;
        }
    }

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

    showCustomContextMenu(x, y, data) {
        if (this.isInIframe) return;

        const oldMenu = document.getElementById('custom-context-menu');
        if (oldMenu) {
            oldMenu.remove();
        }

        const menu = document.createElement('div');
        menu.id = 'custom-context-menu';
        menu.style.position = 'absolute';
        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.background = 'white';
        menu.style.border = '1px solid #ccc';
        menu.style.boxShadow = '2px 2px 5px rgba(0,0,0,0.2)';
        menu.style.zIndex = '10000';
        menu.style.padding = '5px 0';
        menu.style.minWidth = '150px';

        if (data.type === 'hotspot') {
            menu.innerHTML = `
                <div class="menu-item" onclick="panoramaEditor.handleHotSpotAction('edit', ${JSON.stringify(data.data).replace(/"/g, '&quot;')})" style="padding: 5px 10px; cursor: pointer;">Edit HotSpot</div>
                <div class="menu-item" onclick="panoramaEditor.handleHotSpotAction('delete', ${JSON.stringify(data.data).replace(/"/g, '&quot;')})" style="padding: 5px 10px; cursor: pointer;">Delete HotSpot</div>
                <hr style="margin: 5px 0;">
                <div class="menu-item" onclick="panoramaEditor.copyCoords(${JSON.stringify(data.coords)})" style="padding: 5px 10px; cursor: pointer;">Copy Coordinates</div>
            `;
        } else {
            menu.innerHTML = `
                <div class="menu-item" onclick='panoramaEditor.addHotSpotAt(${JSON.stringify(data.data)})' style="padding: 5px 10px; cursor: pointer;">Add HotSpot Here</div>
                <div class="menu-item" onclick='panoramaEditor.copyCoords(${JSON.stringify(data.data)})' style="padding: 5px 10px; cursor: pointer;">Copy Coordinates</div>
                <hr style="margin: 5px 0;">
                <div class="menu-item" onclick='panoramaEditor.centerView(${JSON.stringify(data.data)})' style="padding: 5px 10px; cursor: pointer;">Center View Here</div>
            `;
        }

        document.body.appendChild(menu);

        requestAnimationFrame(() => {
            document.addEventListener('click', function closeMenu(e) {
                if (!menu.contains(e.target)) {
                    menu.remove();
                    document.removeEventListener('click', closeMenu);
                }
            });
        });
    }

    handleHotSpotAction(action, hotSpot) {
        if (this.isInIframe) return;
        console.log(action + ' HotSpot:', hotSpot);
        alert(action + ' HotSpot: ' + (hotSpot.text || hotSpot.type));
    }

    copyCoords(coords) {
        if (this.isInIframe) return;
        const text = `Yaw: ${coords.yaw.toFixed(2)}, Pitch: ${coords.pitch.toFixed(2)}`;
        navigator.clipboard.writeText(text).then(() => {
            console.log('Coordinates copied to clipboard:', text);
            alert('Coordinates copied: ' + text);
        });
    }

    addHotSpotAt(coords) {
        if (this.isInIframe) return;
        console.log('Add HotSpot at:', coords);
        alert('Add HotSpot at: Yaw=' + coords.yaw.toFixed(2) + ', Pitch=' + coords.pitch.toFixed(2));
    }

    centerView(coords) {
        if (this.sceneMain) {
            this.sceneMain.lookAt(coords.pitch, coords.yaw, this.sceneMain.getHfov(), 500);
        }
    }

    getExportFileName() {
        let panoramaUrl = '';

        // Получаем URL текущей панорамы из конфигурации sceneMain
        if (this.sceneMain && typeof this.sceneMain.getConfig === 'function') {
            try {
                const config = this.sceneMain.getConfig();
                if (config && config.scenes && config.scenes.scene1 && config.scenes.scene1.panorama) {
                    panoramaUrl = config.scenes.scene1.panorama;
                } else if (config && config.panorama) {
                    panoramaUrl = config.panorama;
                }
            } catch (e) {
                console.error('Ошибка при получении конфигурации:', e);
            }
        }
        
        let fileName = '';
        if (panoramaUrl) {
            // Получаем последнюю часть URL (имя файла)
            const urlParts = panoramaUrl.split('/');
            fileName = urlParts[urlParts.length - 1];
            fileName = fileName.split('?')[0];
        }
        
        if (!fileName) {
            return 'hotspots_export.json';
        }
        
        const baseName = fileName.replace(/\.[^/.]+$/, "");
        return baseName + ".json";
    }

    downloadJsonFile(jsonData, fileName) {
        const blob = new Blob([jsonData], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    initModalHandlers() {
        // Кнопка предпросмотра
        document.getElementById('previewButton').addEventListener('click', () => this.loadPreview());
        document.getElementById('previewClsUrl').addEventListener('click', () => {
            document.getElementById('hotspotUrl').value = '';
        });

        // Кнопка сохранения
        document.getElementById('saveHotspotButton').addEventListener('click', () => this.saveHotspot());

        // Кнопка экспорта
        document.getElementById('exportJsonButton').addEventListener('click', () => this.exportToJson());

        // Кнопка импорта
        document.getElementById('importJsonButton').addEventListener('click', () => this.importJson());

        // Кнопка отмены
        document.getElementById('cancelButton').addEventListener('click', () => this.closeModal());

        // Кнопка закрытия модального окна
        document.querySelector('.close').addEventListener('click', () => this.closeModal());

        // Обработчик выбора файла для импорта
        document.getElementById('jsonFileInput').addEventListener('change', (e) => this.handleJsonFileSelect(e));

        // Закрытие модального окна при клике вне его
        document.getElementById('hotspotModal').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) {
                this.closeModal();
            }
        });
    }

    handleParentMessage(event) {
        if (event.data && event.data.type === 'pannellum_control') {
            switch(event.data.action) {
                case 'loadScene':
                    if (event.data.photo) {
                        let currentUrl = new URL(window.location.href);
                        currentUrl.searchParams.set('photo', event.data.photo);
                        if (event.data.hotSpots) {
                            currentUrl.searchParams.set('hotSpots', encodeURIComponent(JSON.stringify(event.data.hotSpots)));
                        }
                        window.history.pushState({}, '', currentUrl);
                        this.setSelectPanorama(event.data.hotSpot || null);
                    }
                    break;
                case 'getState':
                    // Отправляем состояние обратно родителю
                    try {
                        window.parent.postMessage({
                            type: 'pannellum_state',
                            currentScene: this.currentScene,
                            isLoaded: this.sceneMain ? this.sceneMain.isLoaded() : false,
                            hotspotsCount: this.currentHotspots.length
                        }, '*');
                    } catch(e) {
                        console.log('Cannot post message to parent');
                    }
                    break;
            }
        }
    }

    copyToClipboardLegacy(text, callback) {
        const textArea = document.createElement('textarea');
        textArea.value = text;

        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);

        textArea.focus();
        textArea.select();

        try {
            const successful = document.execCommand('copy');
            const msg = successful ? 'успешно' : 'не удалось';
            console.log(`Копирование ${msg}`);

            if (callback) {
                callback(successful ? null : new Error('Копирование не удалось'));
            }
        } catch (err) {
            console.error('Ошибка при копировании:', err);
            if (callback) {
                callback(err);
            }
        } finally {
            document.body.removeChild(textArea);
        }
    }
}
