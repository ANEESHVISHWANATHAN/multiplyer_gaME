const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const lobbies = {};

function generateRoomID() {
    let roomID;
    do {
        roomID = Math.random().toString(36).substr(2, 6).toUpperCase();
    } while (lobbies[roomID]);
    return roomID;
}

wss.on('connection', (ws) => {
    console.log('New player connected');

    ws.on('message', (data) => {
        const message = JSON.parse(data);

        if (message.type === 'createLobby') {
            const roomID = generateRoomID();
            lobbies[roomID] = {
                host: ws,
                players: [{ id: ws, username: message.username, icon: message.icon }]
            };
            ws.send(JSON.stringify({ type: 'lobbyCreated', roomID }));
        }

        if (message.type === 'joinLobby') {
            const { roomID, username, icon } = message;
            
            if (!lobbies[roomID]) {
                ws.send(JSON.stringify({ type: 'error', message: 'Lobby not found' }));
                return;
            }

            lobbies[roomID].players.push({ id: ws, username, icon });
            broadcastLobbyState(roomID);
        }
    });

    ws.on('close', () => {
        for (const roomID in lobbies) {
            lobbies[roomID].players = lobbies[roomID].players.filter(p => p.id !== ws);
            
            if (lobbies[roomID].players.length === 0) {
                delete lobbies[roomID];
            } else {
                broadcastLobbyState(roomID);
            }
        }
    });
});

function broadcastLobbyState(roomID) {
    if (!lobbies[roomID]) return;

    const state = {
        type: 'updateLobby',
        players: lobbies[roomID].players.map(p => ({
            username: p.username,
            icon: p.icon,
            isHost: lobbies[roomID].host === p.id
        }))
    };

    lobbies[roomID].players.forEach(player => {
        player.id.send(JSON.stringify(state));
    });
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'entry.html'));
});

server.listen(3000, () => console.log('Server running on http://localhost:3000'));
