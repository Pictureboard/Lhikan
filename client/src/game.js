// ================================
// AUTH
// ================================
const token = localStorage.getItem('token');
const user  = JSON.parse(localStorage.getItem('user'));

if (!token || !user) {
    window.location.href = 'login.html';
}

// ================================
// SOCKET
// ================================
const socket = io('http://localhost:3000', { auth: { token } });

// ================================
// COSTANTI NAVI
// ================================
const SHIPS_CONFIG = [
    { id: 'scout1',      type: 'Scout',      size: 2, hp: 2, emoji: '🚤' },
    { id: 'scout2',      type: 'Scout',      size: 2, hp: 2, emoji: '🚤' },
    { id: 'scout3',      type: 'Scout',      size: 2, hp: 2, emoji: '🚤' },
    { id: 'scout4',      type: 'Scout',      size: 2, hp: 2, emoji: '🚤' },
    { id: 'submarine1',  type: 'Submarine',  size: 3, hp: 3, emoji: '🐟' },
    { id: 'submarine2',  type: 'Submarine',  size: 3, hp: 3, emoji: '🐟' },
    { id: 'battleship1', type: 'Battleship', size: 4, hp: 4, emoji: '⚓' },
    { id: 'battleship2', type: 'Battleship', size: 4, hp: 4, emoji: '⚓' },
    { id: 'titan',       type: 'Titan',      size: 5, hp: 5, emoji: '🛳️' },
];

// ================================
// STATO LOCALE
// ================================
let myBoard        = createEmptyBoard(); // griglia 10x20
let placedShips    = {};                 // { shipId: { cells, hp } }
let selectedShip   = null;              // nave selezionata dalla lista
let isHorizontal   = true;              // orientamento corrente
let isMyTurn       = false;
let currentAction  = null;              // azione dopo tiro dadi
let attacksLeft    = 0;                 // attacchi rimanenti nel turno
let isReady        = false;

// ================================
// UTILITY
// ================================

// Crea una board vuota 10x20
function createEmptyBoard() {
    return Array.from({ length: 10 }, () => Array(20).fill(null));
}

// Mostra una schermata e nasconde le altre
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// Restituisce la cella HTML di una griglia dato row e col
function getCell(gridEl, row, col) {
    return gridEl.querySelector(`[data-row="${row}"][data-col="${col}"]`);
}

// Calcola le celle occupate da una nave dato il punto di partenza
function getShipCells(startRow, startCol, size, horizontal) {
    const cells = [];
    for (let i = 0; i < size; i++) {
        if (horizontal) {
            cells.push([startRow, startCol + i]);
        } else {
            cells.push([startRow + i, startCol]);
        }
    }
    return cells;
}

// Controlla se un piazzamento è valido (dentro la griglia, no sovrapposizioni)
function isValidPlacement(cells) {
    for (const [r, c] of cells) {
        if (r < 0 || r >= 10 || c < 0 || c >= 20) return false;
        if (myBoard[r][c] !== null) return false;
    }
    return true;
}

// ================================
// COSTRUZIONE GRIGLIA
// ================================
function buildGrid(gridEl, rows, cols, clickHandler, hoverHandler) {
    gridEl.innerHTML = '';
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            cell.dataset.row = r;
            cell.dataset.col = c;
            cell.textContent = '🌊';

            if (clickHandler) {
                cell.addEventListener('click', () => clickHandler(r, c));
            }
            if (hoverHandler) {
                cell.addEventListener('mouseenter', () => hoverHandler(r, c));
            }

            gridEl.appendChild(cell);
        }
    }

    cell.addEventListener('mouseenter', () => {
        const shipData = placedShips[Object.keys(placedShips)
            .find(id => placedShips[id].cells
            .some(([r, c]) => r === row && c === col))];
        if (shipData) {
            shipData.cells.forEach(([r, c]) => {
                const c2 = getCell(document.getElementById('myGrid'), r, c);
                if (c2) c2.classList.add('ship-hover');
            });
        }
    });
    
    cell.addEventListener('mouseleave', () => {
        document.getElementById('myGrid')
            .querySelectorAll('.ship-hover')
            .forEach(c => c.classList.remove('ship-hover'));
    });
}

// ================================
// LISTA NAVI DA PIAZZARE
// ================================
function buildShipList() {
    const list = document.getElementById('shipList');
    list.innerHTML = '';

    SHIPS_CONFIG.forEach(ship => {
        // Salta le navi già piazzate
        if (placedShips[ship.id]) return;

        const div = document.createElement('div');
        div.classList.add('ship-to-place');
        div.id = `ship-item-${ship.id}`;

        // Anteprima visiva
        const preview = document.createElement('div');
        preview.classList.add('ship-preview');
        for (let i = 0; i < ship.size; i++) {
            const cell = document.createElement('div');
            cell.textContent = ship.emoji;
            preview.appendChild(cell);
        }

        const label = document.createElement('span');
        label.textContent = `${ship.type} (${ship.size})`;

        div.appendChild(preview);
        div.appendChild(label);

        // Click sulla nave → la seleziona o deseleziona
        div.addEventListener('click', () => {
            if (selectedShip && selectedShip.id === ship.id) {
                // Deseleziona
                deselectShip();
            } else {
                selectShip(ship);
            }
        });

        list.appendChild(div);
    });
}

// ================================
// SELEZIONE / DESELEZIONE NAVE
// ================================
function selectShip(ship) {
    // Rimuove selezione precedente
    deselectShip();

    selectedShip = ship;
    isHorizontal = true;

    // Evidenzia la nave selezionata nella lista
    const item = document.getElementById(`ship-item-${ship.id}`);
    if (item) item.classList.add('selected');

    document.getElementById('placementMessage').textContent =
        `🚢 ${ship.type} selezionata — muovi il mouse sulla griglia per piazzarla. R per ruotare.`;
}

function deselectShip() {
    if (!selectedShip) return;

    // Rimuove evidenziazione
    const item = document.getElementById(`ship-item-${selectedShip.id}`);
    if (item) item.classList.remove('selected');

    // Pulisce la preview sulla griglia
    clearPreview(document.getElementById('myPlacementGrid'));

    selectedShip = null;
    document.getElementById('placementMessage').textContent = '';
}

// ================================
// PREVIEW SULLA GRIGLIA
// ================================

// Mostra la preview della nave mentre il mouse si muove sulla griglia
function handlePlacementHover(row, col) {
    if (!selectedShip) return;

    const gridEl = document.getElementById('myPlacementGrid');
    clearPreview(gridEl);

    const cells = getShipCells(row, col, selectedShip.size, isHorizontal);
    const valid  = isValidPlacement(cells);

    cells.forEach(([r, c]) => {
        const cell = getCell(gridEl, r, c);
        if (cell) {
            // Mostra preview solo se la cella è vuota
            if (myBoard[r][c] === null) {
                cell.classList.add(valid ? 'preview-valid' : 'preview-invalid');
                cell.textContent = valid ? selectedShip.emoji : '❌';
            }
        }
    });
}

// Rimuove la preview dalla griglia
function clearPreview(gridEl) {
    gridEl.querySelectorAll('.preview-valid, .preview-invalid').forEach(cell => {
        cell.classList.remove('preview-valid', 'preview-invalid');
        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        // Ripristina emoji nave se c'era una nave piazzata
        if (myBoard[row][col] !== null) {
            const shipId = myBoard[row][col].shipId;
            const config = SHIPS_CONFIG.find(s => s.id === shipId);
            cell.textContent = config ? config.emoji : '🌊';
        } else {
            cell.textContent = '🌊';
        }
    });
}

// ================================
// PIAZZAMENTO NAVE SU CLICK
// ================================
function handlePlacementClick(row, col) {
    // Se non c'è una nave selezionata, controlla se c'è una nave sulla cella
    if (!selectedShip) {
        const existing = myBoard[row][col];
        if (existing) {
            removeShip(existing.shipId, document.getElementById('myPlacementGrid'));
        }
        return;
    }

    const cells = getShipCells(row, col, selectedShip.size, isHorizontal);
    if (!isValidPlacement(cells)) {
        document.getElementById('placementMessage').textContent = '❌ Posizione non valida!';
        return;
    }

    // Piazza la nave
    placedShips[selectedShip.id] = { cells, hp: selectedShip.hp };

    cells.forEach(([r, c]) => {
        myBoard[r][c] = { shipId: selectedShip.id };
        const cell = getCell(document.getElementById('myPlacementGrid'), r, c);
        if (cell) {
            cell.classList.remove('preview-valid', 'preview-invalid');
            cell.textContent = selectedShip.emoji;
        }
    });

    document.getElementById('placementMessage').textContent =
        `✅ ${selectedShip.type} piazzata!`;

    // Deseleziona e aggiorna la lista
    const shipId = selectedShip.id;
    deselectShip();
    buildShipList();

    // Controlla se tutte le navi sono state piazzate
    if (Object.keys(placedShips).length === SHIPS_CONFIG.length) {
        document.getElementById('confirmPlacementBtn').disabled = false;
        document.getElementById('placementMessage').textContent =
            '✅ Tutte le navi piazzate! Premi conferma quando sei pronto.';
    }
}

// ================================
// RIMOZIONE NAVE DALLA GRIGLIA
// ================================
function removeShip(shipId, gridEl) {
    if (!placedShips[shipId]) return;

    // Rimuove dalla board e dalla griglia
    placedShips[shipId].cells.forEach(([r, c]) => {
        myBoard[r][c] = null;
        const cell = getCell(gridEl, r, c);
        if (cell) cell.textContent = '🌊';
    });

    delete placedShips[shipId];

    // Disabilita conferma se non tutte le navi sono piazzate
    document.getElementById('confirmPlacementBtn').disabled = true;

    // Aggiorna la lista navi — la nave torna disponibile
    buildShipList();

    document.getElementById('placementMessage').textContent =
        '🔄 Nave rimossa, selezionala di nuovo per riposizionarla.';
}

// ================================
// ROTAZIONE CON R
// ================================
document.addEventListener('keydown', (e) => {
    if ((e.key === 'r' || e.key === 'R') && selectedShip) {
        isHorizontal = !isHorizontal;
        document.getElementById('placementMessage').textContent =
            `🔄 ${selectedShip.type} — orientamento: ${isHorizontal ? 'Orizzontale ➡️' : 'Verticale ⬇️'}`;
    }
});

// ================================
// CONNESSIONE SOCKET
// ================================
socket.on('connect', () => {
    document.getElementById('status').textContent = `Connesso come: ${user.userName}`;
});

socket.on('connect_error', (err) => {
    document.getElementById('status').textContent = `Errore: ${err.message}`;
    document.getElementById('status').classList.add('error');
});

socket.on('userAlreadyConnected', () => {
    alert('Sei già connesso da un\'altra scheda!');
    window.location.href = 'home.html';
});

// ================================
// LOBBY
// ================================
document.getElementById('createBtn').onclick = () => {
    const roomId  = document.getElementById('roomIdInput').value.trim();
    const validId = /^[a-zA-Z0-9_\-]+$/.test(roomId);
    if (roomId && validId) socket.emit('createRoom', roomId);
    else document.getElementById('lobbyMessage').textContent = '❌ Nome stanza non valido.';
};

document.getElementById('joinBtn').onclick = () => {
    const roomId  = document.getElementById('roomIdInput').value.trim();
    const validId = /^[a-zA-Z0-9_\-]+$/.test(roomId);
    if (roomId && validId) socket.emit('joinRoom', roomId);
    else document.getElementById('lobbyMessage').textContent = '❌ Nome stanza non valido.';
};

socket.on('roomList', (rooms) => {
    const list = document.getElementById('roomList');
    list.innerHTML = '';
    rooms.forEach(r => {
        const li  = document.createElement('li');
        const btn = document.createElement('button');
        btn.textContent = `${r.name} (${r.size}/2)`;
        btn.onclick = () => socket.emit('joinRoom', r.name);
        li.appendChild(btn);
        list.appendChild(li);
    });
});

socket.on('roomError', (msg) => {
    document.getElementById('lobbyMessage').textContent = '❌ ' + msg;
});

// ================================
// STANZA
// ================================
socket.on('roomCreated', (roomId) => {
    document.getElementById('currentRoomName').textContent = roomId;
    document.getElementById('roomMessage').textContent = 'Hai creato la stanza. Aspetta un avversario!';
    showScreen('roomScreen');
});

socket.on('roomJoined', (roomId) => {
    document.getElementById('currentRoomName').textContent = roomId;
    document.getElementById('roomMessage').textContent = 'Sei entrato nella stanza!';
    showScreen('roomScreen');
});

socket.on('roomUpdate', (data) => {
    document.getElementById('roomStatus').textContent =
        `Giocatori: ${data.players.join(' vs ')} | Pronti: ${data.nReady}/2`;
});

socket.on('roomLeft', () => {
    isReady = false;
    document.getElementById('readyBtn').textContent = 'Ready';
    showScreen('lobbyScreen');
});

document.getElementById('readyBtn').onclick = () => {
    isReady = !isReady;
    document.getElementById('readyBtn').textContent = isReady ? 'Not Ready' : 'Ready';
    socket.emit(isReady ? 'playerReady' : 'playerNotReady');
};

document.getElementById('leaveRoomBtn').onclick = () => {
    isReady = false;
    document.getElementById('readyBtn').textContent = 'Ready';
    socket.emit('leaveRoom');
};

// ================================
// PIAZZAMENTO NAVI
// ================================
socket.on('startPlacement', () => {
    // Reset stato
    myBoard     = createEmptyBoard();
    placedShips = {};
    selectedShip = null;
    isHorizontal = true;

    // Costruiamo griglia e lista navi
    buildGrid(
        document.getElementById('myPlacementGrid'),
        10, 20,
        handlePlacementClick,
        handlePlacementHover
    );
    buildShipList();

    document.getElementById('confirmPlacementBtn').disabled = true;
    showScreen('placementScreen');
});

// Quando il mouse esce dalla griglia, pulisce la preview
document.getElementById('myPlacementGrid').addEventListener('mouseleave', () => {
    if (selectedShip) clearPreview(document.getElementById('myPlacementGrid'));
});

document.getElementById('confirmPlacementBtn').onclick = () => {
    socket.emit('placeShips', placedShips);
    document.getElementById('confirmPlacementBtn').disabled = true;
    document.getElementById('placementMessage').textContent =
        '⏳ Aspetta che l\'avversario piazzi le navi...';
};

socket.on('shipsPlaced', () => {
    document.getElementById('placementMessage').textContent =
        '⏳ Aspetta che l\'avversario piazzi le navi...';
});

// ================================
// PARTITA
// ================================
socket.on('gameStart', (data) => {
    // Costruiamo griglia propria (solo visualizzazione)
    buildGrid(document.getElementById('myGrid'), 10, 20, null, null);

    // Costruiamo griglia nemica (click per attaccare)
    buildGrid(
        document.getElementById('enemyGrid'),
        10, 20,
        handleAttackClick,
        null
    );

    // Mostriamo le navi sulla griglia propria
    Object.entries(placedShips).forEach(([shipId, ship]) => {
        const config = SHIPS_CONFIG.find(s => s.id === shipId);
        ship.cells.forEach(([r, c]) => {
            const cell = getCell(document.getElementById('myGrid'), r, c);
            if (cell) cell.textContent = config.emoji;
        });
    });

    showScreen('gameScreen');
    updateTurn(data.currentTurn, data.currentTurnName);
    document.getElementById('gameStatus').textContent = data.message;
});

// ================================
// GESTIONE TURNO
// ================================
function updateTurn(currentTurnId, currentTurnName) {
    isMyTurn      = currentTurnId === user.userId;
    currentAction = null;
    attacksLeft   = 0;

    document.getElementById('currentTurn').textContent =
        isMyTurn ? '⚔️ È il tuo turno!' : `⏳ Turno di ${currentTurnName}`;

    document.getElementById('rollDiceBtn').disabled = !isMyTurn;

    // Resize griglie
    const enemyWrapper = document.getElementById('enemyGridWrapper');
    const myWrapper    = document.getElementById('myGridWrapper');

    if (isMyTurn) {
        // Mio turno → griglia nemica grande (attacco)
        enemyWrapper.classList.replace('small', 'large');
        enemyWrapper.classList.add('enemy');
        myWrapper.classList.replace('large', 'small');
    } else {
        // Turno avversario → mia griglia grande (difendo)
        myWrapper.classList.replace('small', 'large');
        enemyWrapper.classList.replace('large', 'small');
        enemyWrapper.classList.remove('enemy');
    }
}

// ================================
// TIRO DADI
// ================================
document.getElementById('rollDiceBtn').onclick = () => {
    socket.emit('rollDice');
    document.getElementById('rollDiceBtn').disabled = true;
};

socket.on('diceResult', (data) => {
    document.getElementById('diceDisplay').textContent =
        `🎲 ${data.dice[0]}  🎲 ${data.dice[1]}`;
    document.getElementById('diceResult').textContent =
        `Somma: ${data.sum} → ${data.action}`;

    if (!isMyTurn) return;

    currentAction = data.action;

    switch (data.action) {
        case 'SINGLE_SHOT':   attacksLeft = 1; break;
        case 'DOUBLE_SHOT':   attacksLeft = 2; break;
        case 'TRIPLE_SHOT':   attacksLeft = 3; break;
        case 'NUKE':          attacksLeft = 1; break;
        case 'HYDROGEN_BOMB': attacksLeft = 1; break;
        case 'MIRV':          attacksLeft = 3; break;
        case 'RADAR':         attacksLeft = 1; break;
        case 'SHIELD':        attacksLeft = 1; break;
        case 'MOVE':          attacksLeft = 0; break;
    }

    if (data.action === 'SHIELD' || data.action === 'MOVE') {
        document.getElementById('gameStatus').textContent =
            data.action === 'SHIELD'
                ? '🛡️ Seleziona una cella sulla TUA griglia per lo shield'
                : '🔄 MOVE: funzione in arrivo...';
    } else {
        document.getElementById('gameStatus').textContent =
            `Seleziona ${attacksLeft} cella/e sulla griglia nemica`;
    }
});

// ================================
// ATTACCO
// ================================
function handleAttackClick(row, col) {
    if (!isMyTurn || !currentAction || attacksLeft <= 0) return;
    if (currentAction === 'SHIELD' || currentAction === 'MOVE') return;

    socket.emit('attack', { row, col, action: currentAction });
    attacksLeft--;

    if (attacksLeft <= 0) {
        currentAction = null;
        document.getElementById('gameStatus').textContent = '⏳ Attendi risultato...';
    }
}

// Risultato attacco ricevuto dal server
socket.on('attackResult', (data) => {
    // data.targetUserId → chi è stato colpito
    // data.cells → array di { row, col, hit }
    const gridEl = data.targetUserId === user.userId
        ? document.getElementById('myGrid')
        : document.getElementById('enemyGrid');

    data.cells.forEach(({ row, col, hit }) => {
        const cell = getCell(gridEl, row, col);
        if (cell) cell.textContent = hit ? '💥' : '❌';
    });

    document.getElementById('gameStatus').textContent = data.message;
});

// ================================
// CAMBIO TURNO
// ================================
socket.on('nextTurn', (data) => {
    updateTurn(data.currentTurn, data.currentTurnName);
});

// ================================
// FINE PARTITA
// ================================
socket.on('gameOver', (data) => {
    const won = data.winner === user.userId;
    document.getElementById('gameStatus').textContent =
        won ? '🎉 Hai vinto!' : '💀 Hai perso!';
    document.getElementById('rollDiceBtn').disabled = true;
    document.getElementById('enemyGrid')
        .querySelectorAll('.cell')
        .forEach(c => c.onclick = null);
});

socket.on('opponentDisconnected', (data) => {
    document.getElementById('gameStatus').textContent = data.message;
});

// Abbandona partita
document.getElementById('leaveGameBtn').onclick = () => {
    socket.emit('leaveGame');
};