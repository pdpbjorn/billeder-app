<?php
require '/etc/nginx/site-auth/auth_config.php';

function fail(): void {
  http_response_code(401);
  exit;
}

$cookie = $_COOKIE[COOKIE_NAME] ?? '';
if (!$cookie) fail();

$parts = explode('.', $cookie, 2);
if (count($parts) !== 2) fail();

[$payloadB64, $sigHex] = $parts;

$payloadJson = base64_decode(strtr($payloadB64, '-_', '+/'), true);
if ($payloadJson === false) fail();

$payload = json_decode($payloadJson, true);
if (!is_array($payload)) fail();

$exp = $payload['exp'] ?? 0;
if (!is_int($exp) || time() > $exp) fail();

$expected = hash_hmac('sha256', $payloadB64, APP_SECRET);
if (!hash_equals($expected, $sigHex)) fail();

http_response_code(200);
exit;
