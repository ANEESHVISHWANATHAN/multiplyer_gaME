  const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Routes =====
app.get("/", (req, res) => {
  console.log("🌐 GET / → index.html");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/tambola.html/:roomId", (req, res) => {
  console.log(`🌐 GET /tambola.html/${req.params.roomId}`);
  res.sendFile(path.join(__dirname, "tambola.html"));
});

app.use(express.static(path.join(__dirname, "public")));

// ===== Room Stores =====
let publicRooms = {};
let privateRooms = {};
let disconnectTimers = {}; // Track disconnect timers for players

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
  console.log("===== 📊 Rooms =====");
  console.log("Public:", Object.keys(publicRooms).length);
  console.log("Private:", Object.keys(privateRooms).length);
  console.log("====================");
}

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log(`✅ WS connected ${req.socket.remoteAddress}`);
  ws.isIndex = false;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

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

        ws.isIndex = true;
        ws.send(JSON.stringify({
          type: "lobbyCreated",
          roomId, playerId, wscode,
          isHost: true,
          lobbyType: type === "pub" ? "public" : "private"
        }));

        console.log(`🎉 Lobby ${roomId} (${type}) created by ${username}`);
        logRooms();
      }

      // ===== JOIN LOBBY =====
      else if (data.typeReq === "joinLobby") {
        const { username, icon, lobbyType, roomId } = data;
        const type = lobbyType;
        const rooms = (type === "pub") ? publicRooms : privateRooms;

        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ type: "noRoom" }));
          console.log(`❌ No room ${roomId} for ${username}`);
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

        console.log(`👤 ${username} joined room ${roomId} as P${playerId}`);
        logRooms();
      }

      // ===== PAGE ENTERED (Tambola) =====
      else if (data.typeReq === "pageEntered") {
        const { roomId, playerId, wscode } = data;
        const room = publicRooms[roomId] || privateRooms[roomId];
        if (!room || !room.players[playerId]) {
          console.log(`❌ Invalid pageEntered for ${roomId}`);
          return;
        }

        const me = room.players[playerId];
        if (me.wscode !== wscode) {
          console.log(`❌ Wscode mismatch for ${me.username}`);
          return;
        }

        // Cancel any disconnect timer if reconnecting
        const key = `${roomId}_${playerId}`;
        if (disconnectTimers[key]) {
          clearTimeout(disconnectTimers[key]);
          delete disconnectTimers[key];
          console.log(`⏱️ Canceled disconnect timer for ${me.username}`);
        }

        me.ws = ws;
        me.wsIndex = 1;
        ws.isIndex = false;

        console.log(`🔄 Reattached ${me.username} in ${roomId} (wsIndex=1)`);

        // Send full player list to me
        const playersList = Object.values(room.players).map(p => ({
          playerId: p.playerId,
          username: p.username,
          icon: p.icon
        }));
        ws.send(JSON.stringify({ type: "ijoin", players: playersList }));

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
            broadcastToIndexes({
              type: "newLobby",
              roomId,
              name: me.username,
              players: Object.keys(room.players).length
            });
          } else {
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
      else if (data.typeReq === "iactive") {
        ws.isIndex = true;
        const lobbies = Object.entries(publicRooms).map(([id, room]) => {
          const host = room.players[0];
          return {
            roomId: id,
            name: host ? host.username : "Unknown",
            players: Object.keys(room.players).length
          };
        });
        ws.send(JSON.stringify({ type: "existingLobbies", lobbies }));
        console.log("📤 Sent existingLobbies to index");
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

    // Find room and player
    let roomFound = null;
    let leavingPlayer = null;
    let roomId = null;

    for (const [rId, rooms] of Object.entries({ ...publicRooms, ...privateRooms })) {
      for (const pid in rooms.players) {
        const p = rooms.players[pid];
        if (p.ws === ws) {
          roomFound = rooms;
          leavingPlayer = p;
          roomId = rId;
          break;
        }
      }
      if (leavingPlayer) break;
    }

    if (!leavingPlayer) {
      console.log("⚠️ WS not found in any room");
      return;
    }

    const key = `${roomId}_${leavingPlayer.playerId}`;

    // Start a 10-second timer before removing player
    disconnectTimers[key] = setTimeout(() => {
      console.log(`⏱️ 10s passed, removing ${leavingPlayer.username}`);

      // Notify other players
      Object.values(roomFound.players).forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId != leavingPlayer.playerId) {
          p.ws.send(JSON.stringify({ type: "heleft", playerId: leavingPlayer.playerId }));
        }
      });

      delete roomFound.players[leavingPlayer.playerId];

      // Delete room if empty
      if (Object.keys(roomFound.players).length === 0) {
        if (roomFound.type === "public") {
          delete publicRooms[roomId];
          broadcastToIndexes({ type: "deleteLobby", roomId });
        } else {
          delete privateRooms[roomId];
        }
        console.log(`🗑 Room ${roomId} deleted (empty)`);
      }

      logRooms();
      delete disconnectTimers[key];
    }, 10000); // 10 seconds
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});        
