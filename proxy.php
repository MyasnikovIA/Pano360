<?php
// proxy.php - простой прокси для обхода CORS
header('Content-Type: image/jpeg');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: max-age=86400');

$url = isset($_GET['url']) ? $_GET['url'] : '';
if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
    http_response_code(400);
    exit('Invalid URL');
}

// Проверяем, что URL ведет на изображение
$allowed_domains = ['raw.githack.com', 'github.com', 'raw.githubusercontent.com'];
$parsed = parse_url($url);
if (!in_array($parsed['host'], $allowed_domains)) {
    http_response_code(403);
    exit('Domain not allowed');
}

// Загружаем и отдаем изображение
$image = @file_get_contents($url);
if ($image === false) {
    http_response_code(404);
    exit('Image not found');
}

echo $image;
?>