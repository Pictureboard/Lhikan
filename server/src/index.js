require('dotenv').config();

const http    = require('http');
const { Server } = require('socket.io');
const { verifyToken } = require('./auth');

const { handleAttack, handleAbility, handleMove } = require('./gameLogic');

const PORT = process.env.PORT || 3000;

const httpServer = http.createServer();
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
    },
    transports: ['websocket', 'polling']
});

// Map per tracciare userId connessi (evita connessioni multiple)
const connectedUsers = new Map(); // userId -> socketId

// Oggetto per gestire le stanze
const roomsData = {};

// --------------------------------
// MIDDLEWARE JWT
// Viene eseguito ad ogni nuova connessione prima di io.on('connection')
// --------------------------------
io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
        return next(new Error('Token mancante'));
    }

    const user = verifyToken(token);
    if (!user) {
        return next(new Error('Token non valido'));
    }

    // Salviamo i dati dell'utente nel socket
    socket.user = user;
    next();
});

// --------------------------------
// CONNESSIONE
// --------------------------------
io.on('connection', (socket) => {
    const userId   = socket.user.userId;
    const userName = socket.user.userName;

    console.log(`Utente connesso: ${userName} (${socket.id})`);

    // Controlla se questo userId è già connesso
    if (connectedUsers.has(userId)) {
        console.log(`⚠️ ${userName} già connesso, rifiuto connessione`);
        socket.emit('userAlreadyConnected');
        socket.disconnect();
        return;
    }

    connectedUsers.set(userId, socket.id);
    sendRoomList();

    // --------------------------------
    // FUNZIONE: TROVA STANZA UTENTE
    // --------------------------------
    function findRoomByUser(userId) {
        return Object.entries(roomsData).find(([name, room]) =>
            room.players.includes(userId)
        );
    }

    // --------------------------------
    // CREA STANZA
    // --------------------------------
    socket.on('createRoom', (roomId) => {
        const existing = findRoomByUser(userId);
        if (existing) {
            socket.emit('roomError', 'Sei già in una stanza.');
            return;
        }

        if (roomsData[roomId]) {
            socket.emit('roomError', 'La stanza esiste già.');
            return;
        }

        // Valida il nome della stanza
        const validRoomId = /^[a-zA-Z0-9_\-]+$/.test(roomId);
        if (!roomId || !validRoomId) {
            socket.emit('roomError', 'Nome stanza non valido.');
            return;
        }

        roomsData[roomId] = {
            players: [userId],
            playersData: {
                [userId]: {
                    userName:   userName,
                    ready:      false,
                    board:      createEmptyBoard(),  // griglia 20x10
                    ships:      {},                  // navi piazzate
                    shieldZone: null,                // area shield attiva
                }
            },
            nReady:      0,
            state:       'waiting',   // waiting | placement | playing | ended
            currentTurn: null,
            dice:        [0, 0],
        };

        socket.join(roomId);
        socket.currentRoom = roomId;

        console.log(`👍 ${userName} ha creato la stanza ${roomId}`);
        socket.emit('roomCreated', roomId);
        sendRoomList();
        sendRoomUpdate(roomId);
    });

    // --------------------------------
    // JOIN STANZA
    // --------------------------------
    socket.on('joinRoom', (roomId) => {
        const room = roomsData[roomId];

        if (!room) {
            socket.emit('roomError', 'La stanza non esiste.');
            return;
        }

        const existing = findRoomByUser(userId);
        if (existing) {
            socket.emit('roomError', 'Sei già in una stanza.');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('roomError', 'La stanza è piena.');
            return;
        }

        if (room.players.includes(userId)) {
            socket.emit('roomError', 'Sei già in questa stanza.');
            return;
        }

        room.players.push(userId);
        room.playersData[userId] = {
            userName:   userName,
            ready:      false,
            board:      createEmptyBoard(),
            ships:      {},
            shieldZone: null,
        };

        socket.join(roomId);
        socket.currentRoom = roomId;

        console.log(`➡️ ${userName} è entrato nella stanza ${roomId}`);
        socket.emit('roomJoined', roomId);
        sendRoomList();
        sendRoomUpdate(roomId);
    });

    // --------------------------------
    // USCITA STANZA
    // --------------------------------
    socket.on('leaveRoom', () => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }
        const [roomId] = existing;
        leaveRoom(socket, roomId);
        socket.emit('roomLeft');
    });

    // --------------------------------
    // GIOCATORE PRONTO
    // --------------------------------
    socket.on('playerReady', () => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }

        const [roomId, room] = existing;
        room.playersData[userId].ready = true;
        room.nReady += 1;

        console.log(`⚡ ${userName} è pronto nella stanza ${roomId} (${room.nReady}/2)`);
        sendRoomUpdate(roomId);

        if (room.nReady === 2) {
            startPlacement(roomId);
        }
    });

    // --------------------------------
    // GIOCATORE NON PRONTO
    // --------------------------------
    socket.on('playerNotReady', () => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }

        const [roomId, room] = existing;

        // Può togliere il ready solo se la partita non è ancora iniziata
        if (room.state !== 'waiting') {
            socket.emit('roomError', 'La partita è già iniziata.');
            return;
        }

        room.playersData[userId].ready = false;
        room.nReady -= 1;

        console.log(`⚡ ${userName} non è più pronto nella stanza ${roomId} (${room.nReady}/2)`);
        sendRoomUpdate(roomId);
    });

    // --------------------------------
    // PIAZZAMENTO NAVI
    // Riceve le navi piazzate dal client e le salva nel DB della stanza
    // ships = { scout1: { cells: [[row,col],[row,col]], hp: 2 }, ... }
    // --------------------------------
    socket.on('placeShips', (ships) => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }

        const [roomId, room] = existing;

        if (room.state !== 'placement') {
            socket.emit('roomError', 'Non sei nella fase di piazzamento.');
            return;
        }

        // TODO: validazione navi (celle valide, no sovrapposizioni ecc.)

        // Salviamo le navi e aggiorniamo la board
        room.playersData[userId].ships = ships;

        // Aggiorniamo la board con le posizioni delle navi
        for (const [shipId, ship] of Object.entries(ships)) {
            for (const [row, col] of ship.cells) {
                room.playersData[userId].board[row][col] = { shipId, hp: ship.hp };
            }
        }

        room.playersData[userId].shipsPlaced = true;

        console.log(`🚢 ${userName} ha piazzato le navi nella stanza ${roomId}`);
        socket.emit('shipsPlaced');

        // Controlla se entrambi hanno piazzato le navi
        const allPlaced = room.players.every(p => room.playersData[p].shipsPlaced);
        if (allPlaced) {
            startGame(roomId);
        }
    });

    // --------------------------------
    // TIRO DADI
    // --------------------------------
    socket.on('rollDice', () => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }
    
        const [roomId, room] = existing;
    
        // Validazioni
        if (room.state !== 'playing') {
            socket.emit('roomError', 'La partita non è in corso.');
            return;
        }
        if (room.currentTurn !== userId) {
            socket.emit('roomError', 'Non è il tuo turno.');
            return;
        }
        if (room.diceRolled) {
            socket.emit('roomError', 'Hai già tirato i dadi questo turno.');
            return;
        }
    
        const die1 = Math.floor(Math.random() * 6) + 1;
        const die2 = Math.floor(Math.random() * 6) + 1;
        const sum  = die1 + die2;
    
        room.dice = [die1, die2];
    
        let action;
        if (die1 === die2) {
            switch (die1) {
                case 6: action = 'MIRV';   break;
                case 5: action = 'RADAR';  break;
                case 4:
                case 3:
                case 2: action = 'MOVE';   break;
                case 1: action = 'SHIELD'; break;
            }
        } else if (sum > 10) {
            action = 'HYDROGEN_BOMB';
        } else if (sum > 8) {
            action = 'NUKE';
        } else if (sum > 6) {
            action = 'TRIPLE_SHOT';
        } else if (sum > 4) {
            action = 'DOUBLE_SHOT';
        } else {
            action = 'SINGLE_SHOT';
        }
    
        // Salviamo tutto sul server
        room.currentAction = action;
        room.diceRolled    = true;
    
        switch (action) {
            case 'SINGLE_SHOT':   room.attacksLeft = 1; break;
            case 'DOUBLE_SHOT':   room.attacksLeft = 2; break;
            case 'TRIPLE_SHOT':   room.attacksLeft = 3; break;
            case 'NUKE':          room.attacksLeft = 1; break;
            case 'HYDROGEN_BOMB': room.attacksLeft = 1; break;
            case 'MIRV':          room.attacksLeft = 3; break;
            case 'RADAR':         room.attacksLeft = 1; break;
            case 'SHIELD':        room.attacksLeft = 1; break;
            case 'MOVE':          room.attacksLeft = 0; break;
        }
    
        console.log(`🎲 ${userName} ha tirato ${die1}+${die2}=${sum} → ${action}`);
    
        io.to(roomId).emit('diceResult', {
            player: userId,
            dice:   [die1, die2],
            sum,
            action
        });
    });

    // --------------------------------
    // ATTACCO
    // --------------------------------
    socket.on('attack', (data) => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }
        const [roomId, room] = existing;
        handleAttack(io, socket, room, roomId, userId, data);
    });

    // --------------------------------
    // ABILITÀ SPECIALI (RADAR, SHIELD, MIRV)
    // --------------------------------
    socket.on('useAbility', (data) => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }
        const [roomId, room] = existing;
        handleAbility(io, socket, room, roomId, userId, data);
    });

    // --------------------------------
    // MOVE
    // --------------------------------
    socket.on('moveShip', (data) => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }
        const [roomId, room] = existing;
        handleMove(io, socket, room, roomId, userId, data);
    });

    // --------------------------------
    // ABBANDONA PARTITA
    // --------------------------------
    socket.on('leaveGame', () => {
        const existing = findRoomByUser(userId);
        if (!existing) {
            socket.emit('roomError', 'Non sei in nessuna stanza.');
            return;
        }

        const [roomId, room] = existing;
        const otherPlayer = room.players.find(p => p !== userId);

        io.to(roomId).emit('gameOver', { winner: otherPlayer });
        console.log(`🏆 ${otherPlayer} ha vinto perché ${userName} ha abbandonato`);

        leaveRoom(socket, roomId);
        socket.emit('roomLeft');
    });

    // --------------------------------
    // DISCONNESSIONE
    // --------------------------------
    socket.on('disconnect', () => {
        console.log(`Utente disconnesso: ${userName}`);
        connectedUsers.delete(userId);

        const existing = findRoomByUser(userId);
        if (existing) {
            const [roomId, room] = existing;

            if (room.state === 'playing') {
                const otherPlayer = room.players.find(p => p !== userId);
                io.to(roomId).emit('gameOver', { winner: otherPlayer });
                console.log(`🏆 ${otherPlayer} ha vinto perché ${userName} si è disconnesso`);
            }

            leaveRoom(socket, roomId);
        }
    });

    // --------------------------------
    // FUNZIONE: RIMOZIONE UTENTE
    // --------------------------------
    function leaveRoom(socket, roomId) {
        const room = roomsData[roomId];
        if (!room) return;

        room.players = room.players.filter(p => p !== userId);

        if (room.playersData[userId] !== undefined) {
            if (room.playersData[userId].ready) {
                room.nReady -= 1;
            }
            delete room.playersData[userId];
        }

        socket.leave(roomId);
        socket.currentRoom = null;

        if (room.players.length === 0) {
            console.log(`🗑️ Eliminata stanza vuota: ${roomId}`);
            delete roomsData[roomId];
        }

        sendRoomList();
        if (roomsData[roomId]) sendRoomUpdate(roomId);
    }

    // --------------------------------
    // BROADCAST LISTA STANZE
    // --------------------------------
    function sendRoomList() {
        const list = Object.entries(roomsData).map(([name, room]) => ({
            name,
            size: room.players.length,
        }));
        io.emit('roomList', list);
    }

    // --------------------------------
    // AGGIORNAMENTO STANZA
    // --------------------------------
    function sendRoomUpdate(roomId) {
        const room = roomsData[roomId];
        if (!room) return;

        io.to(roomId).emit('roomUpdate', {
            players: room.players.map(p => room.playersData[p].userName),
            nReady:  room.nReady,
            state:   room.state,
        });
    }

    // --------------------------------
    // START PLACEMENT
    // Entrambi pronti → fase piazzamento navi
    // --------------------------------
    function startPlacement(roomId) {
        const room = roomsData[roomId];
        if (!room) return;

        room.state  = 'placement';
        room.nReady = 0;

        for (const p of room.players) {
            room.playersData[p].ready = false;
        }

        console.log(`🚢 Stanza ${roomId} in fase di piazzamento navi`);
        io.to(roomId).emit('startPlacement', {
            message: 'Piazza le tue navi!',
            ships: {
                scout:      { count: 4, size: 2, hp: 2 },
                submarine:  { count: 2, size: 3, hp: 3 },
                battleship: { count: 2, size: 4, hp: 4 },
                titan:      { count: 1, size: 5, hp: 5 },
            },
            gridSize: { rows: 10, cols: 20 }
        });
    }

    // --------------------------------
    // START GAME
    // Entrambi hanno piazzato → si inizia
    // --------------------------------
    function startGame(roomId) {
        const room = roomsData[roomId];
        if (!room) return;
    
        room.state         = 'playing';
        room.currentAction = null;
        room.attacksLeft   = 0;
        room.diceRolled    = false;
        // Tiene traccia delle celle già colpite per ogni giocatore
        // { userId: Set di stringhe "row-col" }
        room.hitCells      = {};
        room.players.forEach(p => room.hitCells[p] = new Set());
    
        const startingPlayer = room.players[Math.floor(Math.random() * 2)];
        room.currentTurn = startingPlayer;
    
        console.log(`🎮 Partita iniziata nella stanza ${roomId}, inizia ${room.playersData[startingPlayer].userName}`);
    
        io.to(roomId).emit('gameStart', {
            message:         'La partita è iniziata!',
            currentTurn:     startingPlayer,
            currentTurnName: room.playersData[startingPlayer].userName
        });
    }
});

// --------------------------------
// FUNZIONE: CREA BOARD VUOTA 10x20
// --------------------------------
function createEmptyBoard() {
    return Array.from({ length: 10 }, () => Array(20).fill(null));
}

httpServer.listen(PORT, () => {
    console.log(`🚀 Server Lhikan avviato sulla porta ${PORT}`);
});