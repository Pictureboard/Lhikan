<?php
// Permette richieste da qualsiasi origine
header('Access-Control-Allow-Origin: *');
// Indichiamo che la risposta sarà in formato JSON
header('Content-Type: application/json');

// Connessione al database
require_once '../config/db.php';

// Leggiamo il body della richiesta HTTP
$data = json_decode(file_get_contents('php://input'), true);

// Controlliamo che i campi obbligatori siano presenti
if (empty($data['email']) || empty($data['password'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email    = trim($data['email']);
$password = $data['password'];

try {
    // Cerchiamo l'utente nel database tramite email
    $stmt = $pdo->prepare('SELECT * FROM User WHERE email = ?');
    $stmt->execute([$email]);
    $user = $stmt->fetch();

    // Se l'utente non esiste o la password è sbagliata, rispondiamo con lo stesso errore
    // (non diciamo quale dei due è sbagliato, per sicurezza)
    if (!$user || !password_verify($password, $user['password'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Credenziali non valide']);
        exit;
    }

    // Controlliamo se l'utente ha verificato il suo account tramite 2FA
    if (!$user['isVerified']) {
        // Generiamo un nuovo codice 2FA e aggiorniamo la scadenza
        $twoFactorCode   = strval(random_int(100000, 999999));
        $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

        $stmt = $pdo->prepare('
            UPDATE User 
            SET twoFactorCode = ?, twoFactorExpire = ? 
            WHERE userId = ?
        ');
        $stmt->execute([$twoFactorCode, $twoFactorExpire, $user['userId']]);

        // TODO: inviare email con $twoFactorCode tramite mailer.php

        http_response_code(403);
        echo json_encode(['error' => 'Account non verificato, ti abbiamo inviato un nuovo codice 2FA']);
        exit;
    }

    // Generiamo un nuovo codice 2FA per il login
    $twoFactorCode   = strval(random_int(100000, 999999));
    $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    $stmt = $pdo->prepare('
        UPDATE User 
        SET twoFactorCode = ?, twoFactorExpire = ? 
        WHERE userId = ?
    ');
    $stmt->execute([$twoFactorCode, $twoFactorExpire, $user['userId']]);

    // TODO: inviare email con $twoFactorCode tramite mailer.php

    http_response_code(200);
    echo json_encode(['message' => 'Codice 2FA inviato, controlla la tua email']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>