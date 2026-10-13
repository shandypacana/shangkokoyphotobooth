<?php
// Receives a photo strip (PNG data URL) and uploads it to a free public temporary host
// (tmpfiles.org, about 1 hour) so any phone can open the link. If that fails, it keeps a local copy.
ini_set('display_errors', '0');                       // never print PHP warnings into the JSON reply
header('Content-Type: application/json');
require __DIR__ . '/config.php';
$dir = upload_dir();
if (!$dir) { http_response_code(500); echo json_encode(['ok' => false, 'error' => 'No writable uploads folder. Give PHP write access to the site folder.']); exit; }

foreach (glob($dir . '/strip_*.*') ?: [] as $f) {            // delete local copies older than 1 hour
    if (filemtime($f) < time() - 3600) @unlink($f);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['ok' => false, 'error' => 'POST only']); exit; }
$body = json_decode(file_get_contents('php://input'), true);
$img = $body['image'] ?? '';
if (!preg_match('#^data:image/(png|jpeg);base64,#', $img, $mt)) { http_response_code(400); echo json_encode(['ok' => false, 'error' => 'Invalid image']); exit; }
$bin = base64_decode(substr($img, strpos($img, ',') + 1), true);
$isPng = $bin !== false && substr($bin, 0, 8) === "\x89PNG\r\n\x1a\n";
$isJpg = $bin !== false && substr($bin, 0, 3) === "\xFF\xD8\xFF";
if ($bin === false || strlen($bin) > 10 * 1024 * 1024 || !($isPng || $isJpg)) {
    http_response_code(400); echo json_encode(['ok' => false, 'error' => 'Bad or too large file']); exit;
}
$ext = $isPng ? 'png' : 'jpg'; $mime = $isPng ? 'image/png' : 'image/jpeg';
$name = 'strip_' . bin2hex(random_bytes(8)) . '.' . $ext;
$path = "$dir/$name";
if (@file_put_contents($path, $bin) === false) { http_response_code(500); echo json_encode(['ok' => false, 'error' => 'Could not write the file']); exit; }

$why = '';
// Try the public host first (tmpfiles.org, files are removed after about 1 hour)
if (function_exists('curl_init')) {
    for ($try = 1; $try <= 2; $try++) {                 // two attempts, slow connections sometimes time out once
        $ch = curl_init('https://tmpfiles.org/api/v1/upload');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => ['file' => new CURLFile($path, $mime, 'shangkoy-photobooth-strip.' . $ext)],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT => 40,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,     // IPv6 often hangs on home networks / XAMPP
            CURLOPT_USERAGENT => 'ShangkoyPhotobooth/1.0',
        ]);
        $out = curl_exec($ch);
        $cerr = curl_error($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        $url = json_decode((string) $out, true)['data']['url'] ?? '';
        if ($url && preg_match('#^https?://tmpfiles\.org/#', $url)) {
            $url = preg_replace('#^https?://tmpfiles\.org/#', 'https://tmpfiles.org/dl/', $url, 1);   // direct file link, over https
            @unlink($path);
            echo json_encode(['ok' => true, 'url' => $url]);
            exit;
        }
        $why = $cerr ?: 'tmpfiles.org answered HTTP ' . $code;
    }
} else {
    $why = 'cURL is not enabled in PHP';
}
// Fallback: local link (only reachable if the site itself is public)
echo json_encode(['ok' => true, 'file' => $name, 'why' => $why]);