<?php
// logout.php
require '/etc/nginx/site-auth/auth_config.php';

setcookie(COOKIE_NAME, '', [
  'expires'  => time() - 3600,
  'path'     => '/',
  'secure'   => true,   // keep true if site is HTTPS
  'httponly' => true,
  'samesite' => 'Lax',
]);

header('Location: /login.php');
exit;
