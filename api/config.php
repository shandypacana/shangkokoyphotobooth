<?php
// Shared by save.php and download.php: the first writable folder for temporary strips.
function upload_dirs() {
    return [dirname(__DIR__) . '/uploads', __DIR__ . '/uploads', rtrim(sys_get_temp_dir(), '/\\') . '/shangkoy_uploads'];
}
function upload_dir() {
    foreach (upload_dirs() as $d) {
        if ((is_dir($d) || @mkdir($d, 0755, true)) && is_writable($d)) return $d;
    }
    return '';
}
    