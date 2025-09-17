 // server.jsd
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public"))); // your HTML files

// Room stores
let publicRooms = {};
let privateRooms = {};

// Helpers
function randomRoomId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
function randomWsCode() {
  return Math.random().toString(36).substring(2, 10);
}

// Handle WS connections
wss.on("connection", (ws) => {
  console.log("✅ New client connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📩 Received:", data);

      // CREATE LOBBY
      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();

        const player = { username, icon, playerId, wscode };

        if (lobbyType === "pub") {
          publicRooms[roomId] = { players: [player] };
        } else {
          privateRooms[roomId] = { players: [player] };
        }

        ws.send(JSON.stringify({
          type: "lobbyCreated",
          roomId, playerId, wscode
        }));
        console.log(`🎉 Lobby created ${roomId} (${lobbyType}) by ${username}`);

      }

      // JOIN LOBBY
      else if (data.typeReq === "joinLobby") {
        const { username, icon, lobbyType, roomId } = data;
        const rooms = (lobbyType === "pub") ? publicRooms : privateRooms;

        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ type: "noRoom" }));
          console.log("❌ No such room", roomId);
          return;
        }

        const playerId = rooms[roomId].players.length;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode };

        rooms[roomId].players.push(player);

        ws.send(JSON.stringify({
          type: "lobbyJoined",
          roomId, playerId, wscode
        }));
        console.log(`👤 ${username} joined room ${roomId} (${lobbyType})`);
      }

    } catch (e) {
      console.error("⚠️ Error parsing msg", e);
    }
  });

  ws.on("close", () => {
    console.log("❎ Client disconnected");
  });
});

// Serve files
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "entry.html"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});                 
