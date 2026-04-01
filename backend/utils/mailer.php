<?php
// Importiamo le classi di PHPMailer
use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\SMTP;
use PHPMailer\PHPMailer\Exception;

// Carichiamo PHPMailer tramite Composer
require_once __DIR__ . '/../vendor/autoload.php';

// Carichiamo le credenziali email
require_once __DIR__ . '/../config/mail.php';

// Funzione da richiamare in register.php e login.php
function sendTwoFactorCode($toEmail, $toName, $code) {
    $mail = new PHPMailer(true);

    /*try {
        // Configurazione server SMTP
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587; // Porta standard per Gmail

        // Mittente e destinatario
        $mail->setFrom(MAIL_FROM, MAIL_FROMNAME);
        $mail->addAddress($toEmail, $toName);

        // Contenuto email
        $mail->isHTML(true);
        $mail->Subject = 'Il tuo codice di verifica Lhikan';
        $mail->Body    = "
            <h2>Benvenuto su Lhikan!</h2>
            <p>Il tuo codice di verifica è:</p>
            <h1 style='letter-spacing: 4px;'>$code</h1>
            <p>Il codice scade tra 15 minuti.</p>
            <p>Se non hai richiesto questo codice, ignora questa email.</p>
        ";

        $mail->send();
        // Mail inviata
        return true;

    } catch (Exception $e) {
       // Aggiungiamo il log dell'errore temporaneamente per il debug
       return $e->getMessage();
    }
}
?>*/

    try {
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = 587;
        
        // Aggiungiamo debug SMTP temporaneo
        $mail->SMTPDebug  = 2;
        $mail->Debugoutput = function($str, $level) {
            error_log("SMTP: $str");
        };

        $mail->setFrom(MAIL_FROM, MAIL_FROMNAME);
        $mail->addAddress($toEmail, $toName);

        $mail->isHTML(true);
        $mail->Subject = 'Il tuo codice di verifica Lhikan';
        $mail->Body    = "
            <h2>Benvenuto su Lhikan!</h2>
            <p>Il tuo codice di verifica è:</p>
            <h1 style='letter-spacing: 4px;'>$code</h1>
            <p>Il codice scade tra 15 minuti.</p>
            <p>Se non hai richiesto questo codice, ignora questa email.</p>
        ";

        $mail->send();
        return true;

    } catch (Exception $e) {
        error_log('Mailer Error: ' . $e->getMessage());
        return false;
    }
}
?>