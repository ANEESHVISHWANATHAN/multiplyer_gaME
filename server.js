const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(cors());

app.get("/", (req, res) => {
    res.send("Server is running!");
});

let rooms = {}; // Store active lobbies

wss.on("connection", (ws) => {
    console.log("New WebSocket connection established");

    ws.on("message", (data) => {
        let msg = JSON.parse(data);
        console.log("Received:", msg);

        if (msg.type === "create_room") {
            let roomId = Math.random().toString(36).substring(2, 8);
            rooms[roomId] = { players: [], host: msg.username };
            ws.send(JSON.stringify({ type: "room_created", roomId }));
            console.log('Room Created: ${roomId} by ${msg.username}');
        }
    });

    ws.on("close", () => {
        console.log("WebSocket connection closed");
    });
});

const PORT = process.env.PORT || 7000;
server.listen(PORT, () => console.log('Server running on http://localhost:${PORT}' ));