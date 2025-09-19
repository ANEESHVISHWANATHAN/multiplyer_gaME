// server.js
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
  // return serializable player list for clients
  return Object.values(room.players).map(p => ({
    playerId: p.playerId,
    username: p.username,
    icon: p.icon
  }));
}
// Rebuild players mapping sequentially and update playerId values
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

// Find room+player by socket (either index or game socket)
function findBySocket(ws) {
  for (const [rId, room] of Object.entries(publicRooms)) {
    for (const pid in room.players) {
      const p = room.players[pid];
      if (p.wsIndexConn === ws || p.wsGameConn === ws) {
        return { room, roomId: rId, player: p };
      }
    }
  }
  for (const [rId, room] of Object.entries(privateRooms)) {
    for (const pid in room.players) {
      const p = room.players[pid];
      if (p.wsIndexConn === ws || p.wsGameConn === ws) {
        return { room, roomId: rId, player: p };
      }
    }
  }
  return null;
}

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log(`✅ WS connected ${req.socket.remoteAddress}`);
  ws.isIndex = false; // set true for index sockets when they send iactive/createLobby/joinLobby

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 Received:", data);

      // ===== CREATE LOBBY =====
      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const type = lobbyType; // "pub" or "pri"
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();

        // player structure stores BOTH sockets (index and game) separately
        const player = {
          username,
          icon,
          playerId,
          wscode,
          wsIndexConn: ws,   // this is the index connection (waiting for tambola page)
          wsGameConn: null,  // will be filled when tambola page calls pageEntered
          wsIndexFlag: 0,    // 0 meaning not in-game yet
          isHost: true
        };

        if (type === "pub") {
          publicRooms[roomId] = { type: "public", players: { [playerId]: player } };
        } else {
          privateRooms[roomId] = { type: "private", players: { [playerId]: player } };
        }

        ws.isIndex = true; // mark socket as an index-type connection
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

        // next player id is current players count
        const playerId = Object.keys(rooms[roomId].players).length;
        const wscode = randomWsCode();
        const player = {
          username,
          icon,
          playerId,
          wscode,
          wsIndexConn: ws,
          wsGameConn: null,
          wsIndexFlag: 0,
          isHost: false
        };

        rooms[roomId].players[playerId] = player;
        ws.isIndex = true;

        ws.send(JSON.stringify({
          type: "lobbyJoined",
          roomId, playerId, wscode,
          isHost: false,
          lobbyType: type === "pub" ? "public" : "private"
        }));

        console.log(`👤 ${username} joined room ${roomId} as P${playerId}`);
        // notify indexes about player count change (they expect only public rooms)
        if (rooms[roomId].type === "public") {
          broadcastToIndexes({ type: "playerChange", roomId, players: Object.keys(rooms[roomId].players).length });
          console.log(`📤 playerChange broadcast for ${roomId}`);
        }
        logRooms();
      }

      // ===== PAGE ENTERED =====
      else if (data.typeReq === "pageEntered") {
        const { roomId, playerId, wscode } = data;
        const room = publicRooms[roomId] || privateRooms[roomId];
        if (!room || room.players[playerId] == null) {
          console.log(`❌ Invalid pageEntered for ${roomId} (player ${playerId})`);
          ws.send(JSON.stringify({ type: "noRoomOrPlayer" }));
          return;
        }
        const me = room.players[playerId];

        // validate wscode
        if (me.wscode !== wscode) {
          console.log(`❌ Wscode mismatch for ${me.username}`);
          ws.send(JSON.stringify({ type: "wscodeMismatch" }));
          return;
        }

        // cancel pending disconnect timer (if any)
        const key = `${roomId}_${playerId}`;
        if (disconnectTimers[key]) {
          clearTimeout(disconnectTimers[key]);
          delete disconnectTimers[key];
          console.log(`⏱️ Cancelled disconnect timer for ${me.username} (${key})`);
        }

        // attach new game socket
        me.wsGameConn = ws;
        me.wsIndexFlag = 1;
        ws.isIndex = false;

        console.log(`🔄 ${me.username} connected game socket in ${roomId} (P${playerId})`);

        // build and send FULL list to everyone in room (keeps everyone consistent)
        const playersList = buildPlayersSummary(room);
        Object.values(room.players).forEach(p => {
          if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
            p.wsGameConn.send(JSON.stringify({ type: "ijoin", players: playersList }));
          }
        });
        // also send to the rejoined player's index socket if present (not required but safe)
        if (me.wsIndexConn && me.wsIndexConn.readyState === WebSocket.OPEN) {
          me.wsIndexConn.send(JSON.stringify({ type: "ijoin", players: playersList }));
        }

        // send hejoins delta to others (optional quick UI)
        const joined = { playerId: me.playerId, username: me.username, icon: me.icon };
        Object.values(room.players).forEach(p => {
          if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN && p.playerId !== me.playerId) {
            p.wsGameConn.send(JSON.stringify({ type: "hejoins", player: joined }));
          }
        });

        // Index update: only for public rooms
        if (room.type === "public") {
          if (me.isHost) {
            // host actually entered the game page — advertise a new lobby on index
            const lobbyObj = { roomId, name: me.username, players: Object.keys(room.players).length };
            broadcastToIndexes({ type: "newLobby", lobby: lobbyObj });
            console.log(`📤 newLobby broadcast for ${roomId}`);
          } else {
            broadcastToIndexes({ type: "playerChange", roomId, players: Object.keys(room.players).length });
            console.log(`📤 playerChange broadcast for ${roomId}`);
          }
        }

        logRooms();
      }

      // ===== INDEX ACTIVE =====
      else if (data.typeReq === "iactive" || data.typeReq === "iActive") {
        ws.isIndex = true;
        // Build public lobbies snapshot
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

    // find which room/player used this socket
    const found = findBySocket(ws);
    if (!found) {
      console.log("⚠️ disconnected socket did not belong to a tracked player (maybe index page opened separately)");
      return;
    }

    const { room, roomId, player } = { room: found.room, roomId: found.roomId, player: found.player };
    const playerId = player.playerId;

    // Determine whether closed socket was index or game connection
    const closedIsGame = (player.wsGameConn === ws);
    const closedIsIndex = (player.wsIndexConn === ws);

    console.log(`ℹ️ Closed socket for ${player.username} (P${playerId}) in ${roomId}. closedIsGame=${closedIsGame} closedIsIndex=${closedIsIndex}`);

    // If game socket closed -> immediate "heleft" behaviour
    if (closedIsGame) {
      console.log(`🔔 Player ${player.username} (P${playerId}) game socket left ${roomId} (immediate)`);

      // notify remaining game clients
      Object.values(room.players).forEach(p => {
        if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN && p.playerId !== playerId) {
          p.wsGameConn.send(JSON.stringify({ type: "heleft", playerId }));
        }
      });

      // remove player immediately and rebuild mapping
      delete room.players[playerId];
      const summary = rebuildPlayersMap(room);

      // notify remaining game clients about reshuffle
      Object.values(room.players).forEach(p => {
        if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
          p.wsGameConn.send(JSON.stringify({ type: "playersReshuffled", players: summary }));
        }
      });

      // notify indexes / delete room if needed
      if (room.type === "public") {
        const count = Object.keys(room.players).length;
        if (count === 0) {
          delete publicRooms[roomId];
          broadcastToIndexes({ type: "deleteLobby", roomId });
          console.log(`🗑 Room ${roomId} deleted (empty)`);
        } else {
          broadcastToIndexes({ type: "playerChange", roomId, players: count });
        }
      } else {
        if (Object.keys(room.players).length === 0) {
          delete privateRooms[roomId];
          console.log(`🗑 Private room ${roomId} deleted (empty)`);
        }
      }

      logRooms();
      return;
    }

    // If index socket closed (player hasn't yet entered game page or left index), start 10s timer to wait for reconnect
    if (closedIsIndex) {
      const key = `${roomId}_${playerId}`;
      if (disconnectTimers[key]) {
        clearTimeout(disconnectTimers[key]);
      }

      console.log(`⏱️ Index socket disconnected for ${player.username} (P${playerId}). waiting 10s for reconnect...`);

      disconnectTimers[key] = setTimeout(() => {
        console.log(`⏱️ Timer expired — removing ${player.username} (P${playerId}) from ${roomId}`);

        // notify remaining game clients
        Object.values(room.players).forEach(p => {
          if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN && p.playerId !== playerId) {
            p.wsGameConn.send(JSON.stringify({ type: "heleft", playerId }));
          }
        });

        // delete player and rebuild mapping
        delete room.players[playerId];
        const summary = rebuildPlayersMap(room);

        // notify remaining game clients about reshuffle
        Object.values(room.players).forEach(p => {
          if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
            p.wsGameConn.send(JSON.stringify({ type: "playersReshuffled", players: summary }));
          }
        });

        // notify index or delete room if empty
        if (room.type === "public") {
          const count = Object.keys(room.players).length;
          if (count === 0) {
            delete publicRooms[roomId];
            broadcastToIndexes({ type: "deleteLobby", roomId });
            console.log(`🗑 Room ${roomId} deleted (empty)`);
          } else {
            broadcastToIndexes({ type: "playerChange", roomId, players: count });
          }
        } else {
          if (Object.keys(room.players).length === 0) {
            delete privateRooms[roomId];
            console.log(`🗑 Private room ${roomId} deleted (empty)`);
          }
        }

        delete disconnectTimers[key];
        logRooms();
      }, 10000);

      // clear the player's stored index connection reference (it closed)
      player.wsIndexConn = null;
      return;
    }

    // Last fallback: socket matched neither (shouldn't happen)
    console.log("⚠️ close: unexpected socket state");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
