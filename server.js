const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const lobbies = {}; // Stores active lobbies

// Serve HTML files directly
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/hstdet.html", (req, res) => res.sendFile(path.join(__dirname, "hstdet.html")));
app.get("/plyrdet.html", (req, res) => res.sendFile(path.join(__dirname, "plyrdet.html")));
app.get("/lobby.html", (req, res) => res.sendFile(path.join(__dirname, "lobby.html")));
app.get("/style.css", (req, res) => res.sendFile(path.join(__dirname, "style.css")));
app.get("/script.js", (req, res) => res.sendFile(path.join(__dirname, "script.js")));

// Serve images if needed
app.use("/images", express.static(path.join(__dirname, "bingo/images")));

function generateRoomCode() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

function broadcastLobbyState(roomID) {
    const lobby = lobbies[roomID];
    if (!lobby) return;

    const players = lobby.players.map(p => ({
        username: p.username,
        icon: p.icon
    }));

    lobby.players.forEach(p => {
        p.ws.send(JSON.stringify({
            type: "updateLobby",
            players: players
        }));
    });
}

wss.on("connection", (ws) => {
    ws.on("message", (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (err) {
            console.error("Invalid JSON:", message);
            return;
        }

        if (data.type === "createLobby") {
            const roomID = generateRoomCode();
            const playerID = Date.now().toString();
            lobbies[roomID] = {
                host: ws,
                players: [{ ws, username: data.username, icon: data.icon, playerID }],
            };
            console.log(lobbies[roomID].players[0].username);

            ws.send(JSON.stringify({
                type: "lobbyCreated",
                roomID,
                playerID
            }));

        } else if (data.type === "joinLobby") {
            const roomID = data.roomID;
            
            console.log(roomID+"  "+data.username);
            if(roomID in lobbies){
            console.log("ok");
            const playerID = Date.now().toString();
            lobby.players.push({ ws, username: data.username, icon: data.icon, playerID });

            ws.send(JSON.stringify({
                type: "lobbyJoined",
                playerID
            
            }));
            
            broadcastLobbyState(roomID);
            }
            else{
                console.log("error");}
        }
    });

    ws.on("close", () => {
        // Clean up closed connections from lobbies
        for (const roomID in lobbies) {
            const lobby = lobbies[roomID];
            lobby.players = lobby.players.filter(p => p.ws !== ws);

            if (lobby.host === ws) {
                // Host left, close the lobby
                lobby.players.forEach(p => {
                    if (p.ws.readyState === WebSocket.OPEN) {
                        p.ws.send(JSON.stringify({ type: "hostLeft" }));
                    }
                });
                delete lobbies[roomID];
            } else {
                broadcastLobbyState(roomID);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
