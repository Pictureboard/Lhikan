<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

require_once '../config/db.php';
require_once '../config/jwt.php';

// Importiamo la libreria JWT
use Firebase\JWT\JWT;

require_once __DIR__ . '/../vendor/autoload.php';

$data = json_decode(file_get_contents('php://input'), true);

if (empty($data['email']) || empty($data['code'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email = trim($data['email']);
$code  = trim($data['code']);

try {
    $stmt = $pdo->prepare('SELECT * FROM User WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Utente non trovato']);
        exit;
    }

    if (new DateTime() > new DateTime($user['twoFactorExpire'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Codice scaduto, effettua di nuovo il login']);
        exit;
    }

    if ($code !== $user['twoFactorCode']) {
        http_response_code(401);
        echo json_encode(['error' => 'Codice non valido']);
        exit;
    }

    // Codice corretto → puliamo il codice 2FA dal DB e verifichiamo l'account
    $stmt = $pdo->prepare('
        UPDATE User 
        SET twoFactorCode = NULL, twoFactorExpire = NULL, isVerified = TRUE
        WHERE userId = ?
    ');
    $stmt->execute([$user['userId']]);

    // Generiamo il token JWT
    $payload = [
        'userId'   => $user['userId'],
        'userName' => $user['userName'],
        'email'    => $user['email'],
        'iat'      => time(),                // issued at - quando è stato generato
        'exp'      => time() + (60 * 60 * 24) // scade dopo 24 ore
    ];

    $token = JWT::encode($payload, JWT_SECRET, 'HS256');

    http_response_code(200);
    echo json_encode([
        'message' => 'Verifica completata, accesso effettuato',
        'token'   => $token,
        'user'    => [
            'userId'   => $user['userId'],
            'userName' => $user['userName'],
            'email'    => $user['email']
        ]
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>