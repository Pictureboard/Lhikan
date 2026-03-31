<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

require_once '../config/db.php';

$data = json_decode(file_get_contents('php://input'), true);

// Controlliamo che i campi obbligatori siano presenti
if (empty($data['email']) || empty($data['code'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email = trim($data['email']);
$code  = trim($data['code']);

try {
    // Cerchiamo l'utente tramite email
    $stmt = $pdo->prepare('SELECT * FROM User WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Se l'utente non esiste
    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Utente non trovato']);
        exit;
    }

    // Controlliamo che il codice non sia scaduto
    if (new DateTime() > new DateTime($user['twoFactorExpire'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Codice scaduto, effettua di nuovo il login']);
        exit;
    }

    // Controlliamo che il codice sia corretto
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

    // Generiamo un token di sessione semplice
    $sessionToken = bin2hex(random_bytes(32));

    // TODO: salvare il token di sessione nel DB o in sessione PHP
    // Lo gestiamo al prossimo step

    http_response_code(200);
    echo json_encode([
        'message' => 'Verifica completata, accesso effettuato',
        'token'   => $sessionToken,
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