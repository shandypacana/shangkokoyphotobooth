<?php
// Fallback download link for a saved strip (used only when the public host could not be reached).
require __DIR__ . '/config.php';
$f = $_GET['f'] ?? '';
if (!preg_match('/^strip_[a-f0-9]{16}\.(png|jpg)$/', $f)) { http_response_code(400); exit('Bad file'); }
foreach (upload_dirs() as $d) {
    $path = $d . '/' . $f;
    if (is_file($path) && filemtime($path) > time() - 3600) {
        $isPng = substr($f, -4) === '.png';
        header('Content-Type: ' . ($isPng ? 'image/png' : 'image/jpeg'));
        header('Content-Disposition: attachment; filename="shangkoy-photobooth-strip.' . ($isPng ? 'png' : 'jpg') . '"');
        header('Content-Length: ' . filesize($path));
        readfile($path);
        exit;
    }
}
http_response_code(404);
exit('This link has expired.');
