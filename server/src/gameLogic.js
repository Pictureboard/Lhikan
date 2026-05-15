// ================================
// UTILITY
// ================================

// Controlla se una cella è dentro la griglia 10x20
function isInBounds(row, col) {
    return row >= 0 && row < 10 && col >= 0 && col < 20;
}

// Calcola tutte le celle di un'area NxN a partire da un centro
function getArea(centerRow, centerCol, size) {
    const cells  = [];
    const offset = Math.floor(size / 2);
    for (let r = centerRow - offset; r <= centerRow + offset; r++) {
        for (let c = centerCol - offset; c <= centerCol + offset; c++) {
            if (isInBounds(r, c)) cells.push([r, c]);
        }
    }
    return cells;
}

// Controlla se una cella è già stata colpita
function isAlreadyHit(room, targetUserId, row, col) {
    return room.hitCells[targetUserId].has(`${row}-${col}`);
}

// Segna una cella come colpita
function markHit(room, targetUserId, row, col) {
    room.hitCells[targetUserId].add(`${row}-${col}`);
}

// Controlla se una cella contiene una nave e la danneggia
// Restituisce { hit: bool, shipId, sunk: bool }
function damageCell(room, targetUserId, row, col) {
    const board = room.playersData[targetUserId].board;
    const cell  = board[row][col];

    if (!cell) return { hit: false };

    const ships  = room.playersData[targetUserId].ships;
    const ship   = ships[cell.shipId];
    if (!ship) return { hit: false };

    // Danno alla nave
    ship.hp -= 1;

    // Segna la cella come colpita sulla board
    board[row][col] = { ...cell, damaged: true };

    const sunk = ship.hp <= 0;
    if (sunk) {
        console.log(`💀 Nave ${cell.shipId} affondata!`);
    }

    return { hit: true, shipId: cell.shipId, sunk };
}

// Controlla se un giocatore ha perso tutte le navi
function hasLost(room, userId) {
    const ships = room.playersData[userId].ships;
    return Object.values(ships).every(ship => ship.hp <= 0);
}

// Calcola l'avversario
function getOpponent(room, userId) {
    return room.players.find(p => p !== userId);
}

// Passa il turno all'avversario
function nextTurn(room, io, roomId) {
    const opponent        = getOpponent(room, room.currentTurn);
    room.currentTurn      = opponent;
    room.diceRolled       = false;
    room.currentAction    = null;
    room.attacksLeft      = 0;

    io.to(roomId).emit('nextTurn', {
        currentTurn:     opponent,
        currentTurnName: room.playersData[opponent].userName
    });
}

// ================================
// VALIDAZIONI COMUNI
// Restituisce { valid: bool, error: string }
// ================================
function validateTurn(room, userId) {
    if (room.state !== 'playing')
        return { valid: false, error: 'La partita non è in corso.' };
    if (room.currentTurn !== userId)
        return { valid: false, error: 'Non è il tuo turno.' };
    if (!room.diceRolled)
        return { valid: false, error: 'Devi prima tirare i dadi.' };
    if (room.attacksLeft <= 0)
        return { valid: false, error: 'Non hai più attacchi disponibili.' };
    return { valid: true };
}

// ================================
// GESTIONE ATTACCO
// Chiamata da index.js su socket.on('attack')
// ================================
function handleAttack(io, socket, room, roomId, userId, data) {
    const { row, col, action } = data;

    // 1 — Validazioni turno
    const check = validateTurn(room, userId);
    if (!check.valid) {
        socket.emit('roomError', check.error);
        return;
    }

    // 2 — L'azione corrisponde a quella estratta?
    if (action !== room.currentAction) {
        socket.emit('roomError', 'Azione non corrispondente ai dadi.');
        return;
    }

    // 3 — Abilità speciali non vanno qui
    if (['RADAR', 'SHIELD', 'MOVE', 'MIRV'].includes(action)) {
        socket.emit('roomError', 'Usa useAbility per questa azione.');
        return;
    }

    const opponent = getOpponent(room, userId);

    // In base all'azione calcoliamo le celle colpite
    let targetCells = [];

    switch (action) {
        case 'SINGLE_SHOT':
        case 'DOUBLE_SHOT':
        case 'TRIPLE_SHOT':
            // Colpo singolo su una cella
            targetCells = [[row, col]];
            break;

        case 'NUKE':
            // Area 2x2
            targetCells = getArea(row, col, 2);
            break;

        case 'HYDROGEN_BOMB':
            // Area 3x3
            targetCells = getArea(row, col, 3);
            break;
    }

    // 4 — Cella dentro la griglia?
    for (const [r, c] of targetCells) {
        if (!isInBounds(r, c)) {
            socket.emit('roomError', 'Cella fuori dalla griglia.');
            return;
        }
    }

    // 5 — Celle già colpite? (solo per colpi singoli)
    if (['SINGLE_SHOT', 'DOUBLE_SHOT', 'TRIPLE_SHOT'].includes(action)) {
        if (isAlreadyHit(room, opponent, row, col)) {
            socket.emit('roomError', 'Cella già colpita.');
            return;
        }
    }

    // Processiamo i colpi
    const results = [];
    let   sunkShips = [];

    for (const [r, c] of targetCells) {
        // Saltiamo celle già colpite nelle aree
        if (isAlreadyHit(room, opponent, r, c)) continue;

        markHit(room, opponent, r, c);
        const result = damageCell(room, opponent, r, c);
        results.push({ row: r, col: c, hit: result.hit });

        if (result.sunk) sunkShips.push(result.shipId);
    }

    room.attacksLeft--;

    // Mandiamo il risultato a entrambi i giocatori
    io.to(roomId).emit('attackResult', {
        attackerUserId: userId,
        targetUserId:   opponent,
        cells:          results,
        sunkShips,
        message: results.some(r => r.hit)
            ? `💥 Colpito! ${sunkShips.length > 0 ? 'Nave affondata!' : ''}`
            : '❌ Mancato!'
    });

    // Controlla se l'avversario ha perso
    if (hasLost(room, opponent)) {
        room.state = 'ended';
        io.to(roomId).emit('gameOver', {
            winner:     userId,
            loser:      opponent,
            winnerName: room.playersData[userId].userName
        });
        console.log(`🏆 ${userName} ha vinto nella stanza ${roomId}`);
        return;
    }

    // Se ha finito gli attacchi passa il turno
    if (room.attacksLeft <= 0) {
        nextTurn(room, io, roomId);
    }
}

// ================================
// GESTIONE ABILITÀ SPECIALI
// Chiamata da index.js su socket.on('useAbility')
// ================================
function handleAbility(io, socket, room, roomId, userId, data) {
    const { action, row, col } = data;

    // 1 — Validazioni turno
    const check = validateTurn(room, userId);
    if (!check.valid) {
        socket.emit('roomError', check.error);
        return;
    }

    // 2 — L'azione corrisponde?
    if (action !== room.currentAction) {
        socket.emit('roomError', 'Azione non corrispondente ai dadi.');
        return;
    }

    const opponent = getOpponent(room, userId);

    switch (action) {

        // RADAR — spia area 3x3 nemica
        case 'RADAR': {
            const area  = getArea(row, col, 3);
            const cells = area.map(([r, c]) => ({
                row: r,
                col: c,
                // Mostriamo se c'è una nave solo al giocatore che usa il radar
                hasShip: room.playersData[opponent].board[r][c] !== null
            }));

            // Solo al giocatore che ha usato il radar
            socket.emit('radarResult', {
                cells,
                message: '📡 RADAR attivato!'
            });

            room.attacksLeft--;
            break;
        }

        // SHIELD — protegge area 3x3 propria
        case 'SHIELD': {
            const area = getArea(row, col, 3);

            // Salviamo l'area shield sul server
            // L'avversario non saprà quale area è protetta
            room.playersData[userId].shieldZone = area.map(([r, c]) => `${r}-${c}`);

            // Confermiamo solo al giocatore che ha usato lo shield
            socket.emit('shieldResult', {
                cells:   area.map(([r, c]) => ({ row: r, col: c })),
                message: '🛡️ SHIELD attivato! Area protetta per questo turno.'
            });

            // All'avversario diciamo solo che lo shield è attivo, non dove
            socket.to(roomId).emit('opponentShield', {
                message: '⚠️ L\'avversario ha attivato lo SHIELD!'
            });

            room.attacksLeft--;
            break;
        }

        // MIRV — 3 zone separate area 2x2
        case 'MIRV': {
            if (!isInBounds(row, col)) {
                socket.emit('roomError', 'Cella fuori dalla griglia.');
                return;
            }

            const area    = getArea(row, col, 2);
            const results = [];
            let   sunkShips = [];

            for (const [r, c] of area) {
                if (isAlreadyHit(room, opponent, r, c)) continue;
                markHit(room, opponent, r, c);
                const result = damageCell(room, opponent, r, c);
                results.push({ row: r, col: c, hit: result.hit });
                if (result.sunk) sunkShips.push(result.shipId);
            }

            io.to(roomId).emit('attackResult', {
                attackerUserId: userId,
                targetUserId:   opponent,
                cells:          results,
                sunkShips,
                message: `💥 MIRV! ${sunkShips.length > 0 ? 'Nave affondata!' : ''}`
            });

            room.attacksLeft--;

            // Controlla vittoria
            if (hasLost(room, opponent)) {
                room.state = 'ended';
                io.to(roomId).emit('gameOver', {
                    winner:     userId,
                    loser:      opponent,
                    winnerName: room.playersData[userId].userName
                });
                return;
            }

            break;
        }

        default:
            socket.emit('roomError', 'Abilità non riconosciuta.');
            return;
    }

    // Se ha finito gli attacchi passa il turno
    if (room.attacksLeft <= 0) {
        nextTurn(room, io, roomId);
    }
}

// ================================
// GESTIONE MOVE
// Chiamata da index.js su socket.on('moveShip')
// ================================
function handleMove(io, socket, room, roomId, userId, data) {
    const { shipId, newCells } = data;

    // 1 — Validazioni turno (attacksLeft non conta per MOVE)
    if (room.state !== 'playing') {
        socket.emit('roomError', 'La partita non è in corso.');
        return;
    }
    if (room.currentTurn !== userId) {
        socket.emit('roomError', 'Non è il tuo turno.');
        return;
    }
    if (room.currentAction !== 'MOVE') {
        socket.emit('roomError', 'Non puoi muovere le navi ora.');
        return;
    }

    const ships = room.playersData[userId].ships;
    const ship  = ships[shipId];

    // 2 — La nave esiste ed è tua?
    if (!ship) {
        socket.emit('roomError', 'Nave non trovata.');
        return;
    }

    // 3 — Il numero di celle è uguale alla dimensione della nave?
    if (newCells.length !== ship.cells.length) {
        socket.emit('roomError', 'Numero di celle non corrispondente.');
        return;
    }

    // 4 — Le celle sono contigue (orizzontale o verticale)?
    const rows = newCells.map(([r]) => r);
    const cols = newCells.map(([, c]) => c);
    const isHorizontal = rows.every(r => r === rows[0]);
    const isVertical   = cols.every(c => c === cols[0]);

    if (!isHorizontal && !isVertical) {
        socket.emit('roomError', 'Le navi devono essere posizionate in linea retta.');
        return;
    }

    // 5 — Movimento massimo 3 celle?
    const oldCenter = ship.cells[Math.floor(ship.cells.length / 2)];
    const newCenter = newCells[Math.floor(newCells.length / 2)];
    const distance  = Math.abs(oldCenter[0] - newCenter[0]) +
                      Math.abs(oldCenter[1] - newCenter[1]);

    if (distance > 3) {
        socket.emit('roomError', 'Puoi spostare la nave di massimo 3 celle.');
        return;
    }

    // 6 — Le nuove celle sono valide (dentro griglia, no sovrapposizioni)?
    const board = room.playersData[userId].board;

    for (const [r, c] of newCells) {
        if (!isInBounds(r, c)) {
            socket.emit('roomError', 'Cella fuori dalla griglia.');
            return;
        }
        // Ignora le celle della nave stessa
        const existing = board[r][c];
        if (existing && existing.shipId !== shipId) {
            socket.emit('roomError', 'Sovrapposizione con un\'altra nave.');
            return;
        }
    }

    // Tutto ok — aggiorniamo la board
    // Rimuoviamo la nave dalla posizione vecchia
    ship.cells.forEach(([r, c]) => {
        board[r][c] = null;
    });

    // Piazziamo la nave nella nuova posizione
    newCells.forEach(([r, c]) => {
        board[r][c] = { shipId };
    });

    ship.cells = newCells;

    // Confermiamo il movimento al giocatore
    socket.emit('moveResult', {
        shipId,
        newCells,
        message: '🔄 Nave spostata!'
    });

    // All'avversario diciamo solo che il movimento è avvenuto
    socket.to(roomId).emit('opponentMove', {
        message: '⚠️ L\'avversario ha spostato una nave!'
    });

    // MOVE finisce il turno
    nextTurn(room, io, roomId);
}

// ================================
// EXPORTS
// ================================
module.exports = { handleAttack, handleAbility, handleMove };