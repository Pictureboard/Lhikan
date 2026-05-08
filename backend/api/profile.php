<?php
require_once '../config/cors.php';
header('Content-Type: application/json');

require_once '../config/db.php';
require_once '../config/auth.php';

// Verifichiamo il token — se non valido auth.php blocca tutto da sola
$currentUser = authenticate();

try {
    // Prendiamo i dati dell'utente dal DB tramite userId ricavato dal token
    $stmt = $pdo->prepare('
        SELECT u.userId, u.userName, u.email, u.timeStampCreation,
               s.gamesPlayed, s.gamesWon, s.gamesLost, s.lastPlayed
        FROM User u
        JOIN UserStatistics s ON u.userId = s.userId
        WHERE u.userId = ?
    ');
    $stmt->execute([$currentUser['userId']]);
    $profile = $stmt->fetch();

    if (!$profile) {
        http_response_code(404);
        echo json_encode(['error' => 'Utente non trovato']);
        exit;
    }

    http_response_code(200);
    echo json_encode(['profile' => $profile]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Errore interno del server']);
    exit;
}
?>