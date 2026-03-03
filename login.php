<?php
// login.php
require '/etc/nginx/site-auth/auth_config.php';

$error = '';

/**
 * Optional: randomized fullscreen background image for the login UI.
 * Put images in:  <webroot>/login-backgrounds/
 * URL path:       /login-backgrounds/<file>
 */
$backgroundImage = '/login-bg.jpg';
$bgDir = __DIR__ . '/loginimages';
$bgUrlBase = '/loginimages';
if (is_dir($bgDir)) {
  $files = @scandir($bgDir);
  if (is_array($files)) {
    $images = array_values(array_filter($files, fn($f) => preg_match('/\.(jpg|jpeg|png|webp)$/i', $f)));
    if (count($images) > 0) {
      $backgroundImage = $bgUrlBase . '/' . $images[array_rand($images)];
    }
  }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  $pw = $_POST['password'] ?? '';

  if (hash_equals(APP_PASSWORD, $pw)) {
    $payload = ['exp' => time() + COOKIE_TTL];
    $payloadB64 = rtrim(strtr(base64_encode(json_encode($payload)), '+/', '-_'), '=');
    $sigHex = hash_hmac('sha256', $payloadB64, APP_SECRET);
    $value = $payloadB64 . '.' . $sigHex;

    setcookie(COOKIE_NAME, $value, [
      'expires'  => $payload['exp'],
      'path'     => '/',
      'secure'   => true,   // keep true if site is HTTPS
      'httponly' => true,
      'samesite' => 'Lax',
    ]);

    header('Location: /');
    exit;
  } else {
    $error = 'Wrong password';
  }
}
?>
<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta charset="utf-8">
  <title>Login</title>

  <style>
    :root {
      --card-bg: rgba(15, 18, 22, 0.35);
      --card-border: rgba(255, 255, 255, 0.18);
      --text: rgba(255,255,255,0.92);
      --muted: rgba(255,255,255,0.72);
    }
    html, body { height: 100%; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      color: var(--text);
      overflow: hidden;
    }
    .bg {
      position: fixed;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(0,0,0,0.35), rgba(0,0,0,0.55)),
        url("<?= htmlspecialchars($backgroundImage) ?>") center/cover no-repeat;
      transform: scale(1.02);
      filter: saturate(1.05) contrast(1.03);
    }
    .bg::after {
      content: "";
      position: absolute;
      inset: 0;
      background: radial-gradient(circle at 50% 40%, rgba(0,0,0,0.0), rgba(0,0,0,0.55));
      pointer-events: none;
    }
    .wrap {
      position: relative;
      z-index: 2;
      height: 100%;
      display: grid;
      place-items: center;
      padding: 24px;
    }
    .card {
      width: min(520px, 92vw);
      border-radius: 20px;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      box-shadow:
        0 20px 60px rgba(0,0,0,0.55),
        0 2px 0 rgba(255,255,255,0.06) inset;
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 22px 22px 18px;
    }
    .title { margin: 0 0 6px 0; font-size: 22px; letter-spacing: 0.2px; }
    .subtitle { margin: 0 0 16px 0; color: var(--muted); font-size: 14px; }
    .field {
      width: 100%;
      box-sizing: border-box;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.16);
      padding: 14px 14px;
      font-size: 18px;
      color: rgba(255,255,255,0.92);
      background: rgba(0,0,0,0.35);
      box-shadow:
        inset 0 2px 6px rgba(0,0,0,0.65),
        inset 0 -1px 0 rgba(255,255,255,0.08),
        0 1px 0 rgba(255,255,255,0.06);
      outline: none;
    }
    .field::placeholder { color: rgba(255,255,255,0.5); }
    .field:focus {
      border-color: rgba(255,255,255,0.30);
      box-shadow:
        inset 0 2px 6px rgba(0,0,0,0.65),
        inset 0 -1px 0 rgba(255,255,255,0.10),
        0 0 0 3px rgba(255,255,255,0.14);
    }
    .btn {
      width: 100%;
      margin-top: 12px;
      padding: 12px 14px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,0.20);
      background: rgba(255,255,255,0.12);
      color: rgba(255,255,255,0.92);
      font-size: 16px;
      cursor: pointer;
      box-shadow:
        0 10px 26px rgba(0,0,0,0.35),
        inset 0 1px 0 rgba(255,255,255,0.10);
    }
    .btn:active {
      transform: translateY(1px);
      box-shadow:
        0 6px 18px rgba(0,0,0,0.32),
        inset 0 1px 0 rgba(255,255,255,0.10);
    }
    .err {
      margin-top: 12px;
      color: #ffd2d2;
      background: rgba(176, 0, 32, 0.25);
      border: 1px solid rgba(255, 120, 140, 0.35);
      padding: 10px 12px;
      border-radius: 12px;
      font-size: 14px;
    }
    .hint {
      margin-top: 10px;
      color: rgba(255,255,255,0.55);
      font-size: 12px;
      text-align: center;
    }
  </style>
</head>

<body>
  <div class="bg" aria-hidden="true"></div>

  <div class="wrap">
    <div class="card">
      <h2 class="title">Enter password</h2>
      <p class="subtitle">Family photos</p>

      <form method="post">
        <input class="field" type="password" name="password" autofocus placeholder="Password" />
        <button class="btn" type="submit">Login</button>
      </form>

      <?php if ($error): ?>
        <div class="err"><?= htmlspecialchars($error) ?></div>
      <?php endif; ?>

      <div class="hint">Tip: on TV, use the remote OK button to submit</div>
    </div>
  </div>
</body>
</html>
