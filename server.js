                const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const lobbies = {}; // Store active lobbies

function generateRoomID() {
    let roomID;
    do {
        roomID = Math.random().toString(36).substr(2, 6).toUpperCase();
    } while (lobbies[roomID]);
    return roomID;
}

wss.on("connection", (ws) => {
    console.log("A player connected");

    ws.on("message", (data) => {
        const message = JSON.parse(data);

        if (message.type === "createLobby") {
            const roomID = generateRoomID();
            lobbies[roomID] = {
                host: ws,
                players: [{ id: ws, username: message.username, icon: message.icon, isHost: true }],
            };

            ws.send(JSON.stringify({ type: "lobbyCreated", roomID }));
            broadcastLobbyState(roomID);
        }

        if (message.type === "joinLobby") {
            const { roomID, username, icon } = message;
            if (lobbies[roomID]) {
                lobbies[roomID].players.push({ id: ws, username, icon, isHost: false });
                ws.send(JSON.stringify({ type: "joinedLobby", roomID }));
                broadcastLobbyState(roomID);
            } else {
                ws.send(JSON.stringify({ type: "error", message: "Lobby not found" }));
            }
        }

        if (message.type === "kickPlayer") {
            const { roomID, playerID } = message;
            if (lobbies[roomID] && lobbies[roomID].host === ws) {
                lobbies[roomID].players = lobbies[roomID].players.filter(p => p.id !== playerID);
                broadcastLobbyState(roomID);
            } else {
                ws.send(JSON.stringify({ type: "error", message: "You are not the host" }));
            }
        }

        if (message.type === "makeHost") {
            const { roomID, playerID } = message;
            if (lobbies[roomID] && lobbies[roomID].host === ws) {
                const newHost = lobbies[roomID].players.find(p => p.id === playerID);
                if (newHost) {
                    lobbies[roomID].host = newHost.id;
                    broadcastLobbyState(roomID);
                }
            } else {
                ws.send(JSON.stringify({ type: "error", message: "You are not the host" }));
            }
        }

        if (message.type === "startGame") {
            const { roomID } = message;
            if (lobbies[roomID] && lobbies[roomID].host === ws) {
                broadcast(roomID, { type: "gameStarted" });
            }
        }

        if (message.type === "deleteLobby") {
            const { roomID } = message;
            if (lobbies[roomID] && lobbies[roomID].host === ws) {
                delete lobbies[roomID];
                broadcast(roomID, { type: "lobbyDeleted" });
            }
        }
    });

    ws.on("close", () => {
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
    const lobby = lobbies[roomID];
    if (!lobby) return;

    const state = {
        type: "updateLobby",
        players: lobby.players.map(p => ({
            username: p.username,
            icon: p.icon,
            isHost: lobby.host === p.id,
        })),
    };

    lobby.players.forEach(player => {
        player.id.send(JSON.stringify(state));
    });
}

function broadcast(roomID, message) {
    if (!lobbies[roomID]) return;
    lobbies[roomID].players.forEach(player => {
        player.id.send(JSON.stringify(message));
    });
}

app.use(express.static(path.join(__dirname, "public"))); // Serve static files

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "entry.html"));
});

app.get("/details.html", (req, res) => {
    res.sendFile(path.join(__dirname, "details.html"));
});

app.get("/lobby.html", (req, res) => {
    res.sendFile(path.join(__dirname, "lobby.html"));
});

server.listen(3000, () => console.log("Server is running on http://localhost:3000"));
