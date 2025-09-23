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
app.use(express.static(__dirname));

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
function randomTicket() {
  // Create empty 3x9
  let ticket = Array.from({ length: 3 }, () => Array(9).fill(null));

  // Generate 15 random numbers (1–90)
  let nums = Array.from({ length: 90 }, (_, i) => i + 1);
  nums.sort(() => Math.random() - 0.5);
  nums = nums.slice(0, 15);

  // Distribute into 3 rows, 5 numbers per row
  for (let r = 0; r < 3; r++) {
    let rowNums = nums.slice(r * 5, (r + 1) * 5).sort((a, b) => a - b);
    let cols = [...Array(9).keys()].sort(() => Math.random() - 0.5).slice(0, 5);
    cols.sort((a, b) => a - b);
    cols.forEach((c, i) => { ticket[r][c] = rowNums[i]; });
  }

  return ticket;
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

  const player = {
    username,
    icon,
    playerId,
    wscode,
    wsIndexConn: ws,
    wsGameConn: null,
    wsIndexFlag: 0,
    isHost: true
  };

  const roomObj = {
    type: type === "pub" ? "public" : "private",
    players: { [playerId]: player },
    gameStarted: false,
    numbersLeft: [],
    interval: null
  };

  if (type === "pub") {
    publicRooms[roomId] = roomObj;
  } else {
    privateRooms[roomId] = roomObj;
  }

  ws.isIndex = true;
  ws.send(JSON.stringify({
    type: "lobbyCreated",
    roomId, playerId, wscode,
    isHost: true,
    lobbyType: roomObj.type
  }));

  // 🔔 Broadcast new lobby to all index clients
  if (roomObj.type === "public") {
    broadcastToIndexes({
      type: "newLobby",
      roomId,
      name: username,
      players: 1
    });
    console.log(`📣 New lobby broadcast for ${roomId}`);
  }

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
        if (rooms[roomId].type === "public") {
          broadcastToIndexes({ type: "playerChange", roomId, players: Object.keys(rooms[roomId].players).length });
          console.log(`📤 playerChange broadcast for ${roomId}`);
        }
        logRooms();
      }

      // ===== PAGE ENTERED =====
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

    if (me.wscode !== wscode) {
        console.log(`❌ Wscode mismatch for ${me.username}`);
        ws.send(JSON.stringify({ type: "wscodeMismatch" }));
        return;
    }

    // ---- FIX: restore host flag ----
    if (playerId === 0) me.isHost = true;

    const key = `${roomId}_${playerId}`;
    if (disconnectTimers[key]) {
        clearTimeout(disconnectTimers[key]);
        delete disconnectTimers[key];
        console.log(`⏱️ Cancelled disconnect timer for ${me.username} (${key})`);
    }

    me.wsGameConn = ws;
    me.wsIndexFlag = 1;
    ws.isIndex = false;

    console.log(`🔄 ${me.username} connected game socket in ${roomId} (P${playerId})`);

    const playersList = buildPlayersSummary(room);
    Object.values(room.players).forEach(p => {
        if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
            p.wsGameConn.send(JSON.stringify({ type: "ijoin", players: playersList }));
        }
    });

    logRooms();
}

      // ===== START GAME =====
      else if (data.typeReq === "startGame") {
  const { roomId, playerId } = data;
  const room = publicRooms[roomId] || privateRooms[roomId];
  if (!room) {
    console.log(`❌ startGame for invalid room ${roomId}`);
    return;
  }

  const me = room.players[playerId];
  if (!me) {
    console.log(`❌ startGame from unknown player ${playerId} in ${roomId}`);
    return;
  }

  // ✅ Triple-check: must be host + must match this WS
  if (!me.isHost || me.wsGameConn !== ws) {
    console.log(`❌ Non-host or invalid socket tried to start game in ${roomId}`);
    return;
  }

  if (room.gameStarted) {
    console.log(`⚠️ Game already started in ${roomId}`);
    return;
  }

  room.gameStarted = true;
  room.numbersLeft = Array.from({ length: 100 }, (_, i) => i + 1);
  room.numbersLeft.sort(() => Math.random() - 0.5);

  console.log(`🎮 Game started in room ${roomId} by ${me.username}`);

  // notify all players...
  Object.values(room.players).forEach(p => {
    if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
      p.wsGameConn.send(JSON.stringify({ type: "gameStarts" }));
      const ticket = randomTicket();
      p.wsGameConn.send(JSON.stringify({ type: "sendTicket", ticket }));
      console.log(`🎟 Ticket sent to ${p.username}`);
    }
  });

  // send numbers every 7s...
  room.interval = setInterval(() => {
    if (room.numbersLeft.length === 0) {
      clearInterval(room.interval);
      console.log(`✅ All numbers sent for ${roomId}`);
      return;
    }
    const num = room.numbersLeft.pop();
    console.log(`🔢 Sending number ${num} in ${roomId}`);
    Object.values(room.players).forEach(p => {
      if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
        p.wsGameConn.send(JSON.stringify({ type: "sendNumber", number: num }));
      }
    });
  }, 7000);
      }

      // ===== INDEX ACTIVE =====
      else if (data.typeReq === "iactive" || data.typeReq === "iActive") {
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
      else if (data.typeReq === "Iachieve") {
  const { roomId, playerId, achievement } = data;
  const room = publicRooms[roomId] || privateRooms[roomId];
  if (!room) {
    console.log(`❌ iachieve: Room ${roomId} not found`);
    return;
  }

  const player = room.players[playerId];
  if (!player) {
    console.log(`❌ iachieve: Player ${playerId} not in ${roomId}`);
    return;
  }

  console.log(`🏆 ${player.username} achieved ${achievement} in room ${roomId}`);

  // broadcast to everyone
  Object.values(room.players).forEach(p => {
    if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {
      p.wsGameConn.send(JSON.stringify({
        type: "heachieves",
        playerId,
        playerName: player.username,
        achievement
      }));
    }
  });
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

const found = findBySocket(ws);  
if (!found) {  
  console.log("⚠️ disconnected socket not tracked");  
  return;  
}  

const { room, roomId, player } = found;  
const playerId = player.playerId;  
const closedIsGame = (player.wsGameConn === ws);  
const closedIsIndex = (player.wsIndexConn === ws);  

console.log(`ℹ️ Closed socket for ${player.username} (P${playerId}) in ${roomId}. game=${closedIsGame} index=${closedIsIndex}`);  

if (closedIsGame) {  
  console.log(`🔔 Player ${player.username} (P${playerId}) game socket left ${roomId}`);  
  Object.values(room.players).forEach(p => {  
    if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN && p.playerId !== playerId) {  
      p.wsGameConn.send(JSON.stringify({ type: "heleft", playerId }));  
    }  
  });  
  delete room.players[playerId];  
  const summary = rebuildPlayersMap(room);  
  Object.values(room.players).forEach(p => {  
    if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {  
      p.wsGameConn.send(JSON.stringify({ type: "playersReshuffled", players: summary }));  
    }  
  });  
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

if (closedIsIndex) {  
  const key = `${roomId}_${playerId}`;  
  if (disconnectTimers[key]) {  
    clearTimeout(disconnectTimers[key]);  
  }  

  console.log(`⏱️ Index socket disconnected for ${player.username} (P${playerId}). waiting 10s for reconnect...`);  

  disconnectTimers[key] = setTimeout(() => {  
    console.log(`⏱️ Timer expired — removing ${player.username} (P${playerId}) from ${roomId}`);  
    Object.values(room.players).forEach(p => {  
      if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN && p.playerId !== playerId) {  
        p.wsGameConn.send(JSON.stringify({ type: "heleft", playerId }));  
      }  
    });  
    delete room.players[playerId];  
    const summary = rebuildPlayersMap(room);  
    Object.values(room.players).forEach(p => {  
      if (p.wsGameConn && p.wsGameConn.readyState === WebSocket.OPEN) {  
        p.wsGameConn.send(JSON.stringify({ type: "playersReshuffled", players: summary }));  
      }  
    });  
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

  player.wsIndexConn = null;  
  return;  
}  

console.log("⚠️ close: unexpected socket state");

});
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on ${PORT}`);
});
