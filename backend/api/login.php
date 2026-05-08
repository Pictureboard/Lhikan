<?php
require_once '../config/cors.php';
header('Content-Type: application/json');

require_once '../config/db.php';
// Carichiamo il mailer
require_once '../utils/mailer.php';

$data = json_decode(file_get_contents('php://input'), true);

if (empty($data['email']) || empty($data['password'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email    = trim($data['email']);
$password = $data['password'];

try {
    $stmt = $pdo->prepare('SELECT * FROM User WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Credenziali non valide']);
        exit;
    }

    // Generiamo nuovo codice 2FA in entrambi i casi (verificato o no)
    $twoFactorCode   = strval(random_int(100000, 999999));
    $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $stmt = $pdo->prepare('
        UPDATE User 
        SET twoFactorCode = ?, twoFactorExpire = ? 
        WHERE userId = ?
    ');
    $stmt->execute([$twoFactorCode, $twoFactorExpire, $user['userId']]);

    // Inviamo il codice 2FA via email
    $mailSent = sendTwoFactorCode($email, $user['userName'], $twoFactorCode);

    if (!$mailSent) {
        http_response_code(500);
        echo json_encode(['error' => 'Invio email fallito, riprova']);
        exit;
    }

    // Rispondiamo con messaggio diverso in base allo stato di verifica
    if (!$user['isVerified']) {
        http_response_code(200);
        echo json_encode([
            'message'    => 'Account non verificato, ti abbiamo inviato un nuovo codice 2FA',
            'isVerified' => false
        ]);
        exit;
    }

    http_response_code(200);
    echo json_encode([
        'message'    => 'Codice 2FA inviato, controlla la tua email',
        'isVerified' => true
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>