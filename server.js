const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const lobbies = {};

function generateRoomID() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

function generatePlayerID() {
    return Math.random().toString(36).substr(2, 9);
}

function broadcastLobbyState(roomID) {
    const lobby = lobbies[roomID];
    if (!lobby) return;

    const playersList = [];

    if (lobby.host) {
        playersList.push({
            username: lobby.host.username,
            icon: lobby.host.icon
        });
    }

    for (const playerID in lobby.players) {
        const player = lobby.players[playerID];
        playersList.push({
            username: player.username,
            icon: player.icon
        });
    }

    const message = JSON.stringify({
        type: "updateLobby",
        players: playersList
    });

    // Send to host
    if (lobby.host && lobby.host.ws.readyState === WebSocket.OPEN) {
        lobby.host.ws.send(message);
    }

    // Send to all players
    for (const playerID in lobby.players) {
        const player = lobby.players[playerID];
        if (player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(message);
        }
    }
}

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);

            if (message.type === "createLobby") {
                const roomID = generateRoomID();
                const playerID = generatePlayerID();

                lobbies[roomID] = {
                    host: {
                        username: message.username,
                        icon: message.icon,
                        ws: ws
                    },
                    players: {}
                };

                ws.send(JSON.stringify({
                    type: "lobbyCreated",
                    roomID,
                    playerID
                }));

            } else if (message.type === "joinLobby") {
                const { roomID, username, icon } = message;

                if (!lobbies[roomID]) {
                    ws.send(JSON.stringify({ type: "notActive" }));
                    return;
                }

                if (!lobbies[roomID].host) {
                    ws.send(JSON.stringify({ type: "hostNot" }));
                    return;
                }

                const playerID = generatePlayerID();
                lobbies[roomID].players[playerID] = {
                    username,
                    icon,
                    ws
                };

                ws.send(JSON.stringify({
                    type: "lobbyJoined",
                    playerID
                }));

                // Broadcast updated state to all clients
                broadcastLobbyState(roomID);
            }

        } catch (err) {
            console.error("Error handling message:", err);
        }
    });
});

// Serve static files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/hstdet.html', (req, res) => res.sendFile(path.join(__dirname, 'hstdet.html')));
app.get('/plyrdet.html', (req, res) => res.sendFile(path.join(__dirname, 'plyrdet.html')));
app.get('/lobby.html', (req, res) => res.sendFile(path.join(__dirname, 'lobby.html')));
app.get('/style.css', (req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/script.js', (req, res) => res.sendFile(path.join(__dirname, 'script.js')));

// Static image handling (if needed)
app.use('/images', express.static(path.join(__dirname, 'images')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
