<?php
// get_files.php
header('Content-Type: application/json');
header("Access-Control-Allow-Origin: *");

// Корневой каталог проекта
$projectRoot = realpath('C:/AppServ/www/Pano360Git') . '/';

// Базовый каталог для изображений
$baseDir = $projectRoot . 'img/';

// Получаем запрошенную папку
$folder = isset($_POST['folder']) ? $_POST['folder'] : '';
if (isset($_GET['folder'])) {
    $folder = $_GET['folder'];
}

// Безопасность: проверяем путь
if (strpos($folder, '..') !== false) {
    echo json_encode(['success' => false, 'error' => 'Invalid folder path']);
    exit;
}

// Формируем полный путь к запрошенной папке
$requestedPath = $baseDir . $folder;

// Проверяем существование каталога
if (!is_dir($requestedPath)) {
    echo json_encode(['success' => false, 'error' => 'Folder not found: ' . $requestedPath]);
    exit;
}

// Поддерживаемые расширения изображений
$imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'JPG', 'JPEG', 'PNG', 'GIF'];

$files = [];

try {
    // Получаем список файлов и папок
    $items = scandir($requestedPath);
    
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        
        $fullPath = $requestedPath . '/' . $item;
        
        if (is_dir($fullPath)) {
            // Это папка
            $folderPath = ($folder ? $folder . '/' : '') . $item;
            $files[] = [
                'name' => $item,
                'path' => $folderPath,  // Путь относительно папки img
                'type' => 'folder',
                'size' => ''
            ];
        } else {
            // Это файл
            $extension = pathinfo($item, PATHINFO_EXTENSION);
            
            if (in_array(strtolower($extension), array_map('strtolower', $imageExtensions))) {
                // Это изображение
                $fileSize = filesize($fullPath);
                $sizeFormatted = formatFileSize($fileSize);
                
                // Формируем путь относительно корня проекта
                // Убираем полный путь до корня проекта
                $relativePath = str_replace($projectRoot, '', $fullPath);
                // Заменяем обратные слеши на прямые для веб-доступа
                $relativePath = str_replace('\\', '/', $relativePath);
                
                // Формируем путь относительно папки img (для навигации по папкам)
                $imgRelativePath = ($folder ? $folder . '/' : '') . $item;
                
                $files[] = [
                    'name' => $item,
                    'path' => $imgRelativePath,           // Относительно папки img (для навигации)
                    'web_path' => $relativePath,          // Относительно корня проекта (для веб-доступа)
                    'type' => 'image',
                    'size' => $sizeFormatted,
                    'full_path' => $fullPath,
                    'extension' => $extension
                ];
            }
        }
    }
    
    // Сортируем: сначала папки, затем файлы по алфавиту
    usort($files, function($a, $b) {
        if ($a['type'] === 'folder' && $b['type'] !== 'folder') {
            return -1;
        }
        if ($a['type'] !== 'folder' && $b['type'] === 'folder') {
            return 1;
        }
        return strcasecmp($a['name'], $b['name']);
    });
    
    echo json_encode([
        'success' => true,
        'files' => $files,
        'current_folder' => $folder,
        'project_root' => $projectRoot,
        'base_dir' => $baseDir
    ]);
    
} catch (Exception $e) {
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}

// Функция для форматирования размера файла
function formatFileSize($bytes) {
    if ($bytes >= 1073741824) {
        return number_format($bytes / 1073741824, 2) . ' GB';
    } elseif ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 1) . ' MB';
    } elseif ($bytes >= 1024) {
        return number_format($bytes / 1024, 0) . ' KB';
    } else {
        return $bytes . ' B';
    }
}
?>