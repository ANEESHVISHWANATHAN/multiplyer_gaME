const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

let lobbies = {}; // Store active lobbies

// Serve static files
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/hstdet.html", (req, res) => res.sendFile(path.join(__dirname, "hstdet.html")));
app.get("/plyrdet.html", (req, res) => res.sendFile(path.join(__dirname, "plyrdet.html")));
app.get("/lobby.html", (req, res) => res.sendFile(path.join(__dirname, "lobby.html")));

wss.on("connection", (ws) => {
    ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "createLobby") {
            const roomID = Math.floor(10000 + Math.random() * 90000).toString();
            lobbies[roomID] = { host: message.username, hostIcon: message.icon, players: [] };

            ws.send(JSON.stringify({ type: "lobbyCreated", roomID }));
        } 
        
        else if (message.type === "joinLobby") {
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
    const playerData = { username, icon, ws };

    lobbies[roomID].players[playerID] = playerData;

    // Send lobbyJoined message to the player who just joined
    ws.send(JSON.stringify({
        type: "lobbyJoined",
        playerID
    }));

    // Broadcast updated lobby state to **everyone** in the room (including host and all players)
    broadcastLobbyState(roomID);
}

        }
    });
});

function broadcastLobbyState(roomID) {
    const lobby = lobbies[roomID];
    if (!lobby) return;

    const playersList = [];

    // Add host first
    if (lobby.host) {
        playersList.push({
            username: lobby.host.username,
            icon: lobby.host.icon
        });
    }

    // Add all players
    for (const playerID in lobby.players) {
        const p = lobby.players[playerID];
        playersList.push({
            username: p.username,
            icon: p.icon
        });
    }

    const message = JSON.stringify({
        type: "updateLobby",
        players: playersList
    });

    // Send to host
    if (lobby.host.ws && lobby.host.ws.readyState === WebSocket.OPEN) {
        lobby.host.ws.send(message);
    }

    // Send to all players
    for (const playerID in lobby.players) {
        const p = lobby.players[playerID];
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(message);
        }
    }
}


server.listen(3000, () => console.log("Server running on http://localhost:3000"));
