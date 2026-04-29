<?php
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

require_once '../config/db.php';
require_once '../utils/mailer.php';

$data = json_decode(file_get_contents('php://input'), true);

if (empty($data['email']) || empty($data['password']) || empty($data['userName'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email    = trim($data['email']);
$password = $data['password'];
$userName = trim($data['userName']);

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email non valida']);
    exit;
}

if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'La password deve essere di almeno 8 caratteri']);
    exit;
}

try {
    // Cerchiamo se esiste già un utente con quella email o username
    $stmt = $pdo->prepare('SELECT userId, isVerified, twoFactorExpire FROM User WHERE email = ? OR userName = ?');
    $stmt->execute([$email, $userName]);
    $existingUser = $stmt->fetch();

    if ($existingUser) {
        // Se l'utente esiste ed è verificato, blocchiamo
        if ($existingUser['isVerified']) {
            http_response_code(409);
            echo json_encode(['error' => 'Email o username già in uso']);
            exit;
        }

        // Se l'utente esiste ma NON è verificato, controlliamo se il codice è scaduto
        if (new DateTime() < new DateTime($existingUser['twoFactorExpire'])) {
            // Il codice non è ancora scaduto, l'utente deve ancora verificarsi
            http_response_code(409);
            echo json_encode(['error' => 'Account già registrato, controlla la tua email per il codice di verifica']);
            exit;
        }

        // Utente non verificato e codice scaduto → sovrascriviamo
        $hashedPassword  = password_hash($password, PASSWORD_BCRYPT);
        $twoFactorCode   = strval(random_int(100000, 999999));
        $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        $stmt = $pdo->prepare('
            UPDATE User 
            SET email = ?, password = ?, userName = ?, 
                twoFactorCode = ?, twoFactorExpire = ?, isVerified = FALSE
            WHERE userId = ?
        ');
        $stmt->execute([$email, $hashedPassword, $userName, $twoFactorCode, $twoFactorExpire, $existingUser['userId']]);
        $userId = $existingUser['userId'];

    } else {
        // Utente nuovo → lo inseriamo
        $hashedPassword  = password_hash($password, PASSWORD_BCRYPT);
        $twoFactorCode   = strval(random_int(100000, 999999));
        $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        $stmt = $pdo->prepare('
            INSERT INTO User (email, password, userName, twoFactorCode, twoFactorExpire)
            VALUES (?, ?, ?, ?, ?)
        ');
        $stmt->execute([$email, $hashedPassword, $userName, $twoFactorCode, $twoFactorExpire]);
        $userId = $pdo->lastInsertId();

        // Creiamo il record statistiche solo per utenti nuovi
        $stmt = $pdo->prepare('INSERT INTO UserStatistics (userId) VALUES (?)');
        $stmt->execute([$userId]);
    }

    // Inviamo il codice 2FA via email
    $mailSent = sendTwoFactorCode($email, $userName, $twoFactorCode);

    if ($mailSent !== true) {
        // Email fallita → eliminiamo o ripristiniamo l'utente
        if (!$existingUser) {
            // Era un utente nuovo, lo eliminiamo
            $stmt = $pdo->prepare('DELETE FROM User WHERE userId = ?');
            $stmt->execute([$userId]);
        } else {
            // Era una sovrascrittura, rimettiamo isVerified = FALSE e azzeriamo il codice
            $stmt = $pdo->prepare('UPDATE User SET twoFactorCode = NULL, twoFactorExpire = NULL WHERE userId = ?');
            $stmt->execute([$userId]);
        }

        http_response_code(500);
        echo json_encode(['error' => 'Invio email fallito: ' . $mailSent]);
        exit;
    }

    http_response_code(201);
    echo json_encode(['message' => 'Registrazione avvenuta, controlla la tua email per il codice 2FA']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>