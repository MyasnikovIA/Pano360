/**
 * Simplified Panorama Player
 * Direct Pannellum integration without complex proxy logic
 */

class PanoramaPlayer {
    constructor(canvasId = null, initialImage = null) {
        this.canvasId = canvasId || 'canvas';
        this.sceneMain = null;

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

        // Создаем простую конфигурацию для Pannellum
        const config = this.createSimpleConfig(photoUrl);

        // Создаем viewer
        this.createViewer(config);
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

        } catch (error) {
            console.error("Error creating Pannellum viewer:", error);
            this.showError("Ошибка загрузки панорамы. Проверьте URL изображения.");
        }
    }

    setupEventListeners() {
        if (!this.sceneMain) return;

        // Обработчик загрузки
        this.sceneMain.on('load', () => {
            console.log("Panorama loaded successfully");
        });

        // Обработчик ошибок
        this.sceneMain.on('error', (errorMsg) => {
            console.error("Pannellum error:", errorMsg);
            this.showError(`Ошибка: ${errorMsg}`);
        });
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