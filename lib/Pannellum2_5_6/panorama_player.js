/**
 * Panorama Player - Main application controller
 * @module PanoramaPlayer
 */

class PanoramaPlayer {
    constructor() {
        this.sceneMain = null;
        this.currentScene = null;
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
     * Load the initial panorama scene based on URL parameters
     */
    async loadInitialScene() {
        await this.setSelectPanorama();
    }

    /**
     * Set and display panorama based on parameters or hotspots
     * @param {Object|null} hotSpot - Hotspot object if triggered from click
     */
    async setSelectPanorama(hotSpot = null) {
        const params = new URLSearchParams(window.location.search);
        const infoValue = params.get('info');
        let photoValue = params.get('photo');
        let hotSpots = params.get('hotSpots');

        // Normalize paths
        photoValue = this.normalizePath(photoValue);
        hotSpots = this.normalizePath(hotSpots);

        const canvas = document.getElementById('canvas');
        if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
        }

        const jsonConfig = this.createBaseJsonConfig();

        // Handle different image loading scenarios
        if (photoValue) {
            await this.loadPhotoPanorama(photoValue, hotSpot, jsonConfig);
        } else if (infoValue) {
            this.loadInfoPanorama(infoValue, hotSpot, jsonConfig);
        } else {
            await this.loadDefaultPanorama(jsonConfig);
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
     * Load panorama from photo parameter
     */
    async loadPhotoPanorama(photoValue, hotSpot, jsonConfig) {
        const imageUrl = photoValue;
        const isExternal = this.isExternalUrl(photoValue);
        const jsonUrl = this.getJsonUrlFromImageUrl(photoValue);

        try {
            const jsonData = await this.loadHotSpotsFromJson(jsonUrl);
            const hotspotsFromJson = jsonData.hotSpots || [];
            const cameraDirection = this.getCameraDirection(hotSpot, jsonData);

            await this.finalizeScene(imageUrl, isExternal, hotspotsFromJson, cameraDirection, hotSpot, jsonConfig);
        } catch (error) {
            console.warn("No JSON file found or error loading:", jsonUrl, error);
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
            scene.pitch = cameraDirection.pitchCam ?? -24.41;
            scene.yaw = cameraDirection.yawCam ?? -6.77;

            this.createPannellumViewer(jsonConfig, 'default');
        } catch (error) {
            console.warn("No JSON file found for default image:", jsonUrl, error);

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
    async finalizeScene(imageUrl, isExternal, hotspotsData, cameraDirection, hotSpot, jsonConfig) {
        const scene = jsonConfig.scenes.scene1;
        scene.panorama = imageUrl;
        scene.crossOrigin = isExternal ? undefined : "use-credentials";

        // Set camera direction from hotspot or JSON
        if (hotSpot?.point_pitch !== undefined) {
            scene.pitch = hotSpot.point_pitch;
        } else if (cameraDirection?.pitchCam !== undefined) {
            scene.pitch = cameraDirection.pitchCam;
        }

        if (hotSpot?.point_yaw !== undefined) {
            scene.yaw = hotSpot.point_yaw;
        } else if (cameraDirection?.yawCam !== undefined) {
            scene.yaw = cameraDirection.yawCam;
        }

        scene.hotSpots = this.formatHotSpots(hotspotsData);

        this.createPannellumViewer(jsonConfig, imageUrl);

        // Smooth camera movement if direction is specified
        if (cameraDirection && (cameraDirection.pitchCam !== undefined || cameraDirection.yawCam !== undefined)) {
            this.smoothLookAt(cameraDirection);
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
     * Smooth camera movement to target direction
     */
    smoothLookAt(cameraDirection) {
        setTimeout(() => {
            if (this.sceneMain) {
                const targetPitch = cameraDirection.pitchCam || 0;
                const targetYaw = cameraDirection.yawCam || 0;
                const currentHfov = this.sceneMain.getHfov();

                this.sceneMain.lookAt(targetPitch, targetYaw, currentHfov, 1000);
                console.log("Camera direction set: Pitch=" + targetPitch + ", Yaw=" + targetYaw);
            }
        }, 1000);
    }

    /**
     * Handle hotspot click
     */
    onClickHotSpot(hotspot) {
        console.log("Переход к другой сцене:", hotspot);

        if (hotspot.panorama_url) {
            // Update URL with new panorama
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('photo', hotspot.panorama_url);
            window.history.pushState({}, '', currentUrl);

            // Trigger panorama load with hotspot camera direction
            hotspot.pitch = hotspot.point_pitch;
            hotspot.yaw = hotspot.point_yaw;
            this.setSelectPanorama(hotspot);
            return true;
        }

        // Legacy JSON configuration handling
        const jsonName = hotspot.panorama_url?.split('/')[4];
        if (jsonName) {
            const name = jsonName.split('.')[0];
            const currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('info', name);
            window.history.pushState({}, '', currentUrl);

            const jsonData = this.getJsonUrlData(hotspot.panorama_url);
            jsonData.onClickHotSpot = this.onClickHotSpot.bind(this);
            jsonData.pitch = hotspot.point_pitch;
            jsonData.yaw = hotspot.point_yaw;

            this.createPannellumViewer(jsonData, name);
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

            // Handle different JSON formats
            if (data?.hotSpots && Array.isArray(data.hotSpots)) {
                return data;
            } else if (Array.isArray(data)) {
                return { hotSpots: data, pitchCam: 0, yawCam: 0 };
            } else if (data?.hotspots && Array.isArray(data.hotspots)) {
                return { hotSpots: data.hotspots, pitchCam: 0, yawCam: 0 };
            } else if (data?.scenes?.scene1?.hotSpots) {
                return { hotSpots: data.scenes.scene1.hotSpots, pitchCam: 0, yawCam: 0 };
            }

            return { hotSpots: [], pitchCam: 0, yawCam: 0 };
        } catch (error) {
            console.warn("Error loading JSON hotspots:", jsonUrl, error);
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

// Initialize panorama player when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.panoramaPlayer = new PanoramaPlayer();
});