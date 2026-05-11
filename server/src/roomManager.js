//UNUSED FOR NOW

/*const { v4: uuidv4 } = require('uuid');

class RoomManager {
    constructor() {
        // Mappa di tutte le stanze attive: roomId → room
        this.rooms = new Map();
    }

    createRoom(socket) {
        const roomId = uuidv4().substring(0, 8); // ID corto tipo "a1b2c3d4"

        const room = {
            roomId,
            players: {
                player1: {
                    userId:    socket.user.userId,
                    userName:  socket.user.userName,
                    socketId:  socket.id,
                    socket:    socket,
                    board:     this.createEmptyBoard(),
                    ships:     {},
                    shieldZone: null,
                    isReady:   false
                },
                player2: null
            },
            turn:   'player1',
            phase:  'waiting',   // waiting | placement | playing | ended
            dice:   [0, 0],
            winner: null
        };

        this.rooms.set(roomId, room);
        // Salviamo il roomId nel socket per trovarlo facilmente dopo
        socket.roomId = roomId;
        socket.playerSlot = 'player1';

        return room;
    }

    joinRoom(roomId, socket) {
        const room = this.rooms.get(roomId);

        if (!room) {
            return { success: false, message: 'Stanza non trovata' };
        }

        if (room.players.player2 !== null) {
            return { success: false, message: 'Stanza piena' };
        }

        if (room.players.player1.userId === socket.user.userId) {
            return { success: false, message: 'Non puoi entrare nella tua stessa stanza' };
        }

        room.players.player2 = {
            userId:    socket.user.userId,
            userName:  socket.user.userName,
            socketId:  socket.id,
            socket:    socket,
            board:     this.createEmptyBoard(),
            ships:     {},
            shieldZone: null,
            isReady:   false
        };

        room.phase = 'placement';
        socket.roomId = roomId;
        socket.playerSlot = 'player2';

        return {
            success: true,
            players: {
                player1: room.players.player1.userName,
                player2: room.players.player2.userName
            }
        };
    }

    removePlayer(socket) {
        const roomId = socket.roomId;
        if (!roomId) return null;

        const room = this.rooms.get(roomId);
        if (!room) return null;

        // Se la partita è finita, eliminiamo la stanza
        if (room.phase === 'ended') {
            this.rooms.delete(roomId);
            return null;
        }

        // Altrimenti segnaliamo la disconnessione
        return roomId;
    }

    // Crea una griglia vuota 20x10
    createEmptyBoard() {
        return Array.from({ length: 10 }, () => Array(20).fill(null));
    }

    getRoom(roomId) {
        return this.rooms.get(roomId);
    }
}

module.exports = { RoomManager };*/