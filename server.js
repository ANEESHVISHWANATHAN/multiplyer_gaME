        const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Routes =====
app.get("/", (req, res) => {
  console.log("🌐 Route hit: GET / → index.html served");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/tambola.html/:roomId", (req, res) => {
  console.log(`🌐 Route hit: GET /tambola.html/${req.params.roomId} → tambola.html served`);
  res.sendFile(path.join(__dirname, "tambola.html"));
});

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
function broadcastToIndexes(msg) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN && client.isIndex) {
      client.send(JSON.stringify(msg));
    }
  });
}
function logRooms() {
  console.log("===== 📊 Current Rooms =====");
  console.log("Public:", JSON.stringify(publicRooms, null, 2));
  console.log("Private:", JSON.stringify(privateRooms, null, 2));
  console.log("============================");
}

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log(`✅ WS connected from ${req.socket.remoteAddress}`);
  ws.isIndex = false;

  ws.on("message", (msg) => {
    console.log("⬇️ Raw WS msg:", msg.toString());
    try {
      const data = JSON.parse(msg);
      console.log("📩 Parsed:", data);

      // ===== CREATE LOBBY =====
      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const type = lobbyType; // "pub" or "pri"
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();

        const player = { username, icon, playerId, wscode, ws, wsIndex: 0, isHost: true };
        if (type === "pub") {
          publicRooms[roomId] = { type: "public", players: { [playerId]: player } };
        } else {
          privateRooms[roomId] = { type: "private", players: { [playerId]: player } };
        }

        ws.isIndex = true; // mark as index socket
        ws.send(JSON.stringify({
          type: "lobbyCreated",
          roomId, playerId, wscode,
          isHost: true,
          lobbyType: type === "pub" ? "public" : "private"
        }));

        console.log(`🎉 Lobby created [${roomId}] (${type}) by ${username}`);
        logRooms();
      }

      // ===== JOIN LOBBY =====
      else if (data.typeReq === "joinLobby") {
        const { username, icon, lobbyType, roomId } = data;
        const type = lobbyType;
        const rooms = (type === "pub") ? publicRooms : privateRooms;

        console.log(`🔍 ${username} attempting to join room ${roomId} (${type})`);
        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ type: "noRoom" }));
          console.log(`❌ No room ${roomId}`);
          return;
        }

        const playerId = Object.keys(rooms[roomId].players).length;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode, ws, wsIndex: 0, isHost: false };

        rooms[roomId].players[playerId] = player;
        ws.isIndex = true;

        ws.send(JSON.stringify({
          type: "lobbyJoined",
          roomId, playerId, wscode,
          isHost: false,
          lobbyType: type === "pub" ? "public" : "private"
        }));

        console.log(`👤 ${username} joined ${roomId} as P${playerId}`);
        logRooms();
      }

      // ===== PAGE ENTERED (Tambola) =====
      else if (data.typeReq === "pageEntered") {
        const { roomId, playerId, wscode } = data;
        const room = publicRooms[roomId] || privateRooms[roomId];
        if (!room || !room.players[playerId]) {
          console.log("❌ Invalid pageEntered");
          return;
        }

        const me = room.players[playerId];
        if (me.wscode !== wscode) {
          console.log("❌ Wscode mismatch");
          return;
        }

        me.ws = ws;
        me.wsIndex = 1;
        ws.isIndex = false;

        console.log(`🔄 Reattached ${me.username} [${roomId}] wsIndex=1`);

        // Send full player list to me
        const playersList = Object.values(room.players).map(p => ({
          playerId: p.playerId,
          username: p.username,
          icon: p.icon
        }));
        ws.send(JSON.stringify({ type: "ijoin", players: playersList }));
        console.log(`📤 Sent ijoin list to ${me.username}`);

        // Notify others
        const newPlayer = { playerId: me.playerId, username: me.username, icon: me.icon };
        Object.values(room.players).forEach(p => {
          if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId != playerId) {
            p.ws.send(JSON.stringify({ type: "hejoins", player: newPlayer }));
          }
        });

        // Index broadcasts
        if (room.type === "public") {
          if (me.isHost) {
            console.log("📢 Broadcasting newLobby to indexes");
            broadcastToIndexes({
              type: "newLobby",
              roomId,
              name: me.username,
              players: Object.keys(room.players).length
            });
          } else {
            console.log("📢 Broadcasting playerChange to indexes");
            broadcastToIndexes({
              type: "playerChange",
              roomId,
              players: Object.keys(room.players).length
            });
          }
        }

        logRooms();
      }

      // ===== INDEX ACTIVE =====
      else if (data.typeReq === "iActive") {
        ws.isIndex = true;
        console.log("⚙️ Handling iActive from index");
        const lobbies = Object.entries(publicRooms).map(([id, room]) => {
          const host = room.players[0];
          return {
            roomId: id,
            name: host ? host.username : "Unknown",
            players: Object.keys(room.players).length
          };
        });
        ws.send(JSON.stringify({ type: "existingLobbies", lobbies }));
        console.log("📤 Sent existingLobbies");
      }

      else {
        console.log("⚠️ Unknown typeReq:", data.typeReq);
      }
    } catch (e) {
      console.error("⚠️ JSON parse error:", e.message);
    }
  });

  ws.on("close", () => {
    console.log("❎ WS disconnected");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
