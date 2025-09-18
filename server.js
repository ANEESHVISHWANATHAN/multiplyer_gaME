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
let disconnectTimers = {}; // key: `${roomId}_${playerId}` -> timeout id

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
function buildPlayersSummary(room) {
  return Object.values(room.players).map(p => ({
    playerId: p.playerId,
    username: p.username,
    icon: p.icon
  }));
}
function rebuildPlayersMap(room) {
  const remaining = Object.values(room.players).sort((a, b) => a.playerId - b.playerId);
  const newPlayers = {};
  remaining.forEach((p, idx) => {
    p.playerId = idx;
    newPlayers[idx] = p;
  });
  room.players = newPlayers;
  return buildPlayersSummary(room);
}

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log(`✅ WS connected ${req.socket.remoteAddress}`);
  ws.isIndex = false;

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 Received:", data);

      // ===== CREATE LOBBY =====
      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const type = lobbyType;
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

      // ===== PAGE ENTERED =====
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

        const key = `${roomId}_${playerId}`;
        if (disconnectTimers[key]) {
          clearTimeout(disconnectTimers[key]);
          delete disconnectTimers[key];
          console.log(`⏱️ Cancelled timer for ${me.username}`);
        }

        me.ws = ws;
        me.wsIndex = 1;
        ws.isIndex = false;

        console.log(`🔄 ${me.username} reattached in ${roomId} (wsIndex=1)`);

        const playersList = buildPlayersSummary(room);

        // Send full list to self
        ws.send(JSON.stringify({ type: "ijoin", players: playersList }));

        // Send reshuffled full list to all others
        Object.values(room.players).forEach(p => {
          if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId !== me.playerId) {
            p.ws.send(JSON.stringify({ type: "playersReshuffled", players: playersList }));
          }
        });

        // Index update
        if (room.type === "public") {
          if (me.isHost) {
            broadcastToIndexes({
              type: "newLobby",
              lobby: { roomId, name: me.username, players: Object.keys(room.players).length }
            });
            console.log(`📤 newLobby → ${roomId}`);
          } else {
            broadcastToIndexes({
              type: "playerChange",
              roomId,
              players: Object.keys(room.players).length
            });
            console.log(`📤 playerChange → ${roomId}`);
          }
        }
        logRooms();
      }

      // ===== INDEX ACTIVE =====
      else if (data.typeReq === "iactive" || data.typeReq === "iActive") {
        ws.isIndex = true;
        const lobbies = Object.entries(publicRooms).map(([id, room]) => {
          const host = room.players[0];
          return { roomId: id, name: host ? host.username : "Unknown", players: Object.keys(room.players).length };
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

    let roomFound = null;
    let leavingPlayer = null;
    let foundRoomId = null;

    for (const [rId, r] of Object.entries(publicRooms)) {
      for (const pid in r.players) {
        if (r.players[pid].ws === ws) {
          roomFound = r;
          leavingPlayer = r.players[pid];
          foundRoomId = rId;
          break;
        }
      }
      if (leavingPlayer) break;
    }
    if (!leavingPlayer) {
      for (const [rId, r] of Object.entries(privateRooms)) {
        for (const pid in r.players) {
          if (r.players[pid].ws === ws) {
            roomFound = r;
            leavingPlayer = r.players[pid];
            foundRoomId = rId;
            break;
          }
        }
        if (leavingPlayer) break;
      }
    }
    if (!leavingPlayer) return;

    const roomId = foundRoomId;
    const playerId = leavingPlayer.playerId;

    if (leavingPlayer.wsIndex === 1) {
      console.log(`🔔 ${leavingPlayer.username} (P${playerId}) left ${roomId}`);

      Object.values(roomFound.players).forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId !== playerId) {
          p.ws.send(JSON.stringify({ type: "heleft", playerId }));
        }
      });

      delete roomFound.players[playerId];
      const summary = rebuildPlayersMap(roomFound);

      Object.values(roomFound.players).forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({ type: "playersReshuffled", players: summary }));
        }
      });

      if (roomFound.type === "public") {
        const count = Object.keys(roomFound.players).length;
        if (count === 0) {
          delete publicRooms[roomId];
          broadcastToIndexes({ type: "deleteLobby", roomId });
        } else {
          broadcastToIndexes({ type: "playerChange", roomId, players: count });
        }
      } else if (roomFound.type === "private" && Object.keys(roomFound.players).length === 0) {
        delete privateRooms[roomId];
      }

      logRooms();
      return;
    }

    const key = `${roomId}_${playerId}`;
    if (disconnectTimers[key]) clearTimeout(disconnectTimers[key]);

    console.log(`⏱️ Timer started for ${leavingPlayer.username} (P${playerId}) in ${roomId}`);

    disconnectTimers[key] = setTimeout(() => {
      console.log(`⏱️ Timer expired → removing ${leavingPlayer.username} from ${roomId}`);
      delete roomFound.players[playerId];
      const summary = rebuildPlayersMap(roomFound);

      Object.values(roomFound.players).forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({ type: "playersReshuffled", players: summary }));
        }
      });

      if (roomFound.type === "public") {
        const count = Object.keys(roomFound.players).length;
        if (count === 0) {
          delete publicRooms[roomId];
          broadcastToIndexes({ type: "deleteLobby", roomId });
        } else {
          broadcastToIndexes({ type: "playerChange", roomId, players: count });
        }
      } else if (roomFound.type === "private" && Object.keys(roomFound.players).length === 0) {
        delete privateRooms[roomId];
      }

      delete disconnectTimers[key];
      logRooms();
    }, 10000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});          
