          const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Routes =====

// Serve entry.html as root
app.get("/", (req, res) => {
  console.log("🌐 GET / → index.html served");
  res.sendFile(path.join(__dirname, "index.html"));
});

// Serve tambola.html with roomId param
app.get("/tambola.html/:roomId", (req, res) => {
  console.log(`🌐 GET /tambola.html/${req.params.roomId} → tambola.html served`);
  res.sendFile(path.join(__dirname, "tambola.html"));
});

// Serve static files (CSS, JS, images)
app.use(express.static(path.join(__dirname, "public")));

// ===== Room Stores =====
let publicRooms = {};
let privateRooms = {};

// ===== Helpers =====
function randomRoomId() {
  return Math.floor(10000 + Math.random() * 90000).toString();
}
function randomWsCode() {
  return Math.random().toString(36).substring(2, 10);
}

// Debug: print all rooms
function logRooms() {
  console.log("===== 📊 Current Rooms =====");
  console.log("Public Rooms:", JSON.stringify(publicRooms, null, 2));
  console.log("Private Rooms:", JSON.stringify(privateRooms, null, 2));
  console.log("============================");
}

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log(`✅ WS connected from ${req.socket.remoteAddress}`);

  ws.on("message", (msg) => {
    console.log("⬇️ Raw WS msg:", msg.toString());
    try {
      const data = JSON.parse(msg);
      console.log("📩 Parsed WS msg:", data);

      // CREATE LOBBY
      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const type = lobbyType; // "pub" or "pri"
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();

        const player = { username, icon, playerId, wscode, ws, ts: Date.now() };
        if (type === "pub") {
          publicRooms[roomId] = { players: { [playerId]: player } };
        } else {
          privateRooms[roomId] = { players: { [playerId]: player } };
        }

        ws.send(JSON.stringify({
          type: "lobbyCreated",
          roomId, playerId, wscode
        }));
        console.log(`🎉 Lobby created [${roomId}] (${type}) by ${username}`);
        logRooms();
      }

      // JOIN LOBBY
      else if (data.typeReq === "joinLobby") {
        const { username, icon, lobbyType, roomId } = data;
        const type = lobbyType;
        const rooms = (type === "pub") ? publicRooms : privateRooms;

        console.log(`🔍 ${username} attempting to join room ${roomId} (${type})`);

        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ type: "noRoom" }));
          console.log(`❌ Join failed → No such room ${roomId}`);
          logRooms();
          return;
        }

        const playerId = Object.keys(rooms[roomId].players).length;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode, ws, ts: Date.now() };

        rooms[roomId].players[playerId] = player;

        ws.send(JSON.stringify({
          type: "lobbyJoined",
          roomId, playerId, wscode
        }));
        console.log(`👤 ${username} joined room ${roomId} as player ${playerId}`);
        logRooms();
      }

      // PAGE ENTERED (Tambola)
      else if (data.typeReq === "pageEntered") {
        const { roomId, playerId, wscode, username, icon } = data;

        console.log(`📥 pageEntered: room=${roomId}, playerId=${playerId}, user=${username}`);

        const room = publicRooms[roomId] || privateRooms[roomId];
        if (!room || !room.players[playerId]) {
          console.log("❌ Invalid room/player on pageEntered");
          return;
        }

        // Replace WS + update player info
        room.players[playerId].ws = ws;
        room.players[playerId].wscode = wscode;
        room.players[playerId].username = username;
        room.players[playerId].icon = icon;

        console.log(`🔄 Updated WS + info for ${username} in room ${roomId}`);

        // Send all players list back to this client
        const playersList = Object.values(room.players).map(p => ({
          playerId: p.playerId,
          username: p.username,
          icon: p.icon
        }));
        ws.send(JSON.stringify({ type: "ijoin", players: playersList }));
        console.log(`📤 Sent ijoin (player list) to ${username}`);

        // Notify others this player entered
        const newPlayer = { playerId, username, icon };
        Object.values(room.players).forEach(p => {
          if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId != playerId) {
            p.ws.send(JSON.stringify({ type: "hejoins", player: newPlayer }));
            console.log(`📢 Notified ${p.username} that ${username} joined`);
          }
        });

        console.log(`✅ Finished pageEntered for ${username} in room ${roomId}`);
        logRooms();
      }

      // Unknown request
      else {
        console.log("⚠️ Unknown request type:", data.typeReq);
      }
    } catch (e) {
      console.error("⚠️ JSON parse error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("❎ WS client disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
