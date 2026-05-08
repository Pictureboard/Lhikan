<?php
use Firebase\JWT\JWT;
use Firebase\JWT\Key;

require_once __DIR__ . '/../vendor/autoload.php';
require_once __DIR__ . '/jwt.php';

function authenticate() {
    // Leggiamo l'header Authorization dalla richiesta
    $headers = getallheaders();

    if (empty($headers['Authorization'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Token mancante']);
        exit;
    }

    // Il token arriva nel formato "Bearer <token>"
    // Dobbiamo estrarre solo la parte del token
    $authHeader = $headers['Authorization'];
    $token      = str_replace('Bearer ', '', $authHeader);

    try {
        // Verifichiamo e decodifichiamo il token
        $decoded = JWT::decode($token, new Key(JWT_SECRET, 'HS256'));

        // Restituiamo i dati dell'utente contenuti nel token
        return [
            'userId'   => $decoded->userId,
            'userName' => $decoded->userName,
            'email'    => $decoded->email
        ];

    } catch (Exception $e) {
        // Token non valido o scaduto
        http_response_code(401);
        echo json_encode(['error' => 'Token non valido o scaduto']);
        exit;
    }
}
?>