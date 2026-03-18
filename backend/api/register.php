<?php
// Permette richieste da qualsiasi origine (necessario per fetch API dal client)
header('Access-Control-Allow-Origin: *');
// Indichiamo che la risposta sarà in formato JSON
header('Content-Type: application/json');

// Connessione al database
require_once '../config/db.php';

// Leggiamo il body della richiesta HTTP (ci aspettiamo un JSON dal client)
$data = json_decode(file_get_contents('php://input'), true);

// Controlliamo che i campi obbligatori siano presenti
if (empty($data['email']) || empty($data['password']) || empty($data['userName'])) {
    http_response_code(400);
    echo json_encode(['error' => 'Campi obbligatori mancanti']);
    exit;
}

$email    = trim($data['email']);
$password = $data['password'];
$userName = trim($data['userName']);

// Validiamo il formato dell'email
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['error' => 'Email non valida']);
    exit;
}

// Validiamo la lunghezza minima della password
if (strlen($password) < 8) {
    http_response_code(400);
    echo json_encode(['error' => 'La password deve essere di almeno 8 caratteri']);
    exit;
}

try {
    // Controlliamo se email o username sono già in uso
    $stmt = $pdo->prepare('SELECT userId FROM User WHERE email = ? OR userName = ?');
    $stmt->execute([$email, $userName]);

    if ($stmt->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => 'Email o username già in uso']);
        exit;
    }

    // Hash della password (mai salvare password in chiaro nel DB!)
    $hashedPassword = password_hash($password, PASSWORD_BCRYPT);

    // Generiamo il codice 2FA (6 cifre)
    $twoFactorCode   = strval(random_int(100000, 999999));
    // Il codice scade dopo 15 minuti
    $twoFactorExpire = date('Y-m-d H:i:s', strtotime('+15 minutes'));

    // Inseriamo il nuovo utente nel database (placeholder ? per i dati con execute)
    $stmt = $pdo->prepare('
        INSERT INTO User (email, password, userName, twoFactorCode, twoFactorExpire)
        VALUES (?, ?, ?, ?, ?)
    ');
    $stmt->execute([$email, $hashedPassword, $userName, $twoFactorCode, $twoFactorExpire]);

    // Recuperiamo l'id dell'utente appena creato
    $userId = $pdo->lastInsertId();

    // Creiamo il record delle statistiche per il nuovo utente
    $stmt = $pdo->prepare('INSERT INTO UserStatistics (userId) VALUES (?)');
    $stmt->execute([$userId]);

    // TODO: inviare email con $twoFactorCode tramite mailer.php

    http_response_code(201);
    echo json_encode(['message' => 'Registrazione avvenuta, controlla la tua email per il codice 2FA']);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>