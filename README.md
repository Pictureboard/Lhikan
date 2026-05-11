# Lhikan
 
Progetto scolastico per il quinto anno — gioco di battaglia navale multiplayer in tempo reale con autenticazione 2FA via email.
 
## Tecnologie
 
| Layer | Tecnologia | Scopo |
|---|---|---|
| `backend/` | PHP + MySQL | Autenticazione, 2FA, API REST |
| `client/` | HTML + JS | Interfaccia utente |
| `server/` | Node.js + Socket.io | WebSocket, logica di gioco in tempo reale |
 
---
 
## Requisiti
 
- [XAMPP](https://www.apachefriends.org/) (Apache + MySQL + PHP)
- [Composer](https://getcomposer.org/) — gestore pacchetti PHP
- [Node.js](https://nodejs.org/) — runtime JavaScript
- Un account Gmail con [App Password](https://myaccount.google.com/apppasswords) attiva
---
 
## Setup
 
### 1. Clona la repository
 
```bash
git clone https://github.com/Pictureboard/Lhikan.git
```
 
Posiziona la cartella del progetto dentro `htdocs/` di XAMPP:
 
```
C:\xampp\htdocs\Lhikan\
```
 
### 2. Database
 
1. Avvia XAMPP e assicurati che Apache e MySQL siano attivi
2. Apri [phpMyAdmin](http://localhost/phpmyadmin)
3. Crea un nuovo database chiamato `Lhikan` con codifica `utf8mb4_unicode_ci`
4. Esegui lo schema SQL dalla sezione **SQL** di phpMyAdmin
### 3. Backend PHP
 
Installa le dipendenze con Composer dalla cartella `backend/`:
 
```bash
cd backend
composer install
```
 
Crea i file di configurazione sensibili (non sono su Git):
 
**`backend/config/db.php`**
```php
<?php
$host     = 'localhost';
$dbname   = 'Lhikan';
$username = 'root';
$password = '';
 
try {
    $pdo = new PDO(
        "mysql:host=$host;dbname=$dbname;charset=utf8mb4",
        $username,
        $password,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Connessione al database fallita']);
    exit;
}
?>
```
 
**`backend/config/mail.php`**
```php
<?php
define('MAIL_HOST',     'smtp.gmail.com');
define('MAIL_USERNAME', 'tuamail@gmail.com');
define('MAIL_PASSWORD', 'xxxx xxxx xxxx xxxx'); // App Password Gmail
define('MAIL_FROM',     'tuamail@gmail.com');
define('MAIL_FROMNAME', 'Lhikan');
?>
```
 
**`backend/config/jwt.php`**
```php
<?php
define('JWT_SECRET', 'la_tua_chiave_segreta_minimo_32_caratteri');
?>
```
 
> ⚠️ La chiave JWT deve essere **identica** a quella nel file `server/.env`
 
### 4. Server Node.js
 
Installa le dipendenze dalla cartella `server/`:
 
```bash
cd server
npm install
```
 
Crea il file `server/.env`:
 
```
JWT_SECRET=la_tua_chiave_segreta_minimo_32_caratteri
PORT=3000
```
 
> ⚠️ La chiave JWT deve essere **identica** a quella in `backend/config/jwt.php`
 
Avvia il server:
 
```bash
node src/index.js
```
 
---
 
## Avvio
 
1. Avvia **XAMPP** (Apache + MySQL)
2. Avvia il **server Node.js**:
```bash
cd server
node src/index.js
```
3. Apri il browser su:
```
http://localhost/Lhikan/client/src/register.html
```
 
---
 
## Struttura del progetto
 
```
Lhikan/
├── backend/
│   ├── config/
│   │   ├── auth.php         ← middleware verifica JWT
│   │   ├── cors.php         ← gestione CORS
│   │   ├── db.php           ← connessione database (non su Git)
│   │   ├── jwt.php          ← chiave segreta JWT (non su Git)
│   │   └── mail.php         ← credenziali email (non su Git)
│   ├── api/
│   │   ├── register.php     ← registrazione account
│   │   ├── login.php        ← login
│   │   ├── verify2fa.php    ← verifica codice 2FA
│   │   └── profile.php      ← profilo utente (protetto)
│   ├── utils/
│   │   └── mailer.php       ← invio email con PHPMailer
│   ├── composer.json
│   └── composer.lock
│
├── client/
│   └── src/
│       ├── register.html    ← pagina registrazione
│       ├── login.html       ← pagina login
│       ├── verify2fa.html   ← pagina verifica codice
│       ├── home.html        ← home (protetta)
│       └── game.html        ← gioco (protetto)
│
└── server/
    ├── src/
    │   ├── index.js         ← entry point server WebSocket
    │   ├── auth.js          ← verifica JWT lato Node
    │   └── gameLogic.js     ← logica di gioco (in sviluppo)
    ├── .env                 ← variabili d'ambiente (non su Git)
    ├── package.json
    └── package-lock.json
```
 
---
 
## Flusso di autenticazione
 
```
Registrazione:
register.html → register.php → crea utente → invia email con codice 2FA
→ verify2fa.html → verify2fa.php → account verificato → home.html
 
Login:
login.html → login.php → verifica credenziali → invia email con codice 2FA
→ verify2fa.html → verify2fa.php → genera JWT → home.html
```
 
Il token JWT viene salvato nel `localStorage` del browser e allegato ad ogni richiesta verso le API PHP protette e il server WebSocket.
 
---
 
## Gioco — Battaglia Navale
 
### Griglia
`20 colonne × 10 righe` per giocatore
 
### Navi
 
| Nome | Celle | HP | Quantità |
|---|---|---|---|
| Scout | 2 | 2 | 4 |
| Submarine | 3 | 3 | 2 |
| Battleship | 4 | 4 | 2 |
| Titan | 5 | 5 | 1 |
 
### Meccanica dadi
 
All'inizio di ogni turno il giocatore tira due dadi. Il risultato determina l'azione disponibile:
 
| Risultato | Azione |
|---|---|
| Doppio 6 | **MIRV** — colpisci 3 zone separate area 2×2 |
| Doppio 5 | **RADAR** — spia un'area 3×3 nemica per un turno |
| Doppio 4 / 3 / 2 | **MOVE** — sposta le tue navi (max 3 celle, devono essere intere) |
| Doppio 1 | **SHIELD** — proteggi un'area 3×3 per un turno (l'avversario non sa quale) |
| Somma > 10 | **Bomba a idrogeno** — danno ad area 3×3 |
| Somma > 8 | **Nuke** — danno ad area 2×2 |
| Somma > 6 | **Colpo triplo** — 3 celle singole separate |
| Somma > 4 | **Colpo doppio** — 2 celle singole separate |
| Somma 2–4 | **Colpo singolo** — 1 cella |
 
> Se si ottiene un doppio, si gioca solo l'abilità speciale del doppio — non anche quella della somma.
 
---
 
## File non su Git
 
Questi file contengono credenziali sensibili e vanno ricreati manualmente:
 
- `backend/config/db.php`
- `backend/config/mail.php`
- `backend/config/jwt.php`
- `server/.env`
