 const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, "public"))); // HTML, CSS, images

// Serve entry.html as root
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "entry.html"));
});

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
      if (data.action === "createLobby") {
        const { username, icon, type } = data;
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();

        const player = { username, icon, playerId, wscode };
        if (type === "pub") {
          publicRooms[roomId] = { players: [player] };
        } else {
          privateRooms[roomId] = { players: [player] };
        }

        ws.send(JSON.stringify({
          action: "lobbyCreated",
          roomId, playerId, wscode
        }));
        console.log(`🎉 Lobby created ${roomId} (${type}) by ${username}`);
      }

      // JOIN LOBBY
      else if (data.action === "joinLobby") {
        const { username, icon, type, roomId } = data;
        const rooms = (type === "pub") ? publicRooms : privateRooms;

        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ action: "noRoom" }));
          console.log("❌ No such room", roomId);
          return;
        }

        const playerId = rooms[roomId].players.length;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode };

        rooms[roomId].players.push(player);

        ws.send(JSON.stringify({
          action: "lobbyJoined",
          roomId, playerId, wscode
        }));
        console.log(`👤 ${username} joined room ${roomId} (${type})`);
      }
    } catch (e) {
      console.error("⚠️ Error parsing msg", e);
    }
  });

  ws.on("close", () => {
    console.log("❎ Client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
