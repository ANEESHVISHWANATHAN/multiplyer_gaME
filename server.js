                  
      const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ===== Routes =====
app.get("/", (req, res) => {
  console.log("GET / → index.html");
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/tambola.html", (req, res) => {
  console.log("GET /tambola.html");
  res.sendFile(path.join(__dirname, "tambola.html"));
});

app.use(express.static(__dirname)); // serve all static files

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

// ===== WebSocket Handling =====
wss.on("connection", (ws, req) => {
  console.log("WS connected");

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);

      if (data.typeReq === "createLobby") {
        const { username, icon, lobbyType } = data;
        const type = lobbyType;
        const roomId = randomRoomId();
        const playerId = 0;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode, ws };

        if (type === "pub") publicRooms[roomId] = { players: { [playerId]: player } };
        else privateRooms[roomId] = { players: { [playerId]: player } };

        ws.send(JSON.stringify({ type: "lobbyCreated", roomId, playerId, wscode }));
        console.log(`Lobby ${roomId} created by ${username}`);
      }

      else if (data.typeReq === "joinLobby") {
        const { username, icon, lobbyType, roomId } = data;
        const rooms = (lobbyType === "pub") ? publicRooms : privateRooms;

        if (!rooms[roomId]) {
          ws.send(JSON.stringify({ type: "noRoom" }));
          console.log(`Join failed, no room ${roomId}`);
          return;
        }

        const playerId = Object.keys(rooms[roomId].players).length;
        const wscode = randomWsCode();
        const player = { username, icon, playerId, wscode, ws };
        rooms[roomId].players[playerId] = player;

        ws.send(JSON.stringify({ type: "lobbyJoined", roomId, playerId, wscode }));
        console.log(`${username} joined room ${roomId}`);
      }

      else if (data.typeReq === "pageEntered") {
        const { roomId, playerId, wscode, username, icon } = data;
        const room = publicRooms[roomId] || privateRooms[roomId];
        if (!room || !room.players[playerId]) return;

        room.players[playerId].ws = ws;
        room.players[playerId].wscode = wscode;
        room.players[playerId].username = username;
        room.players[playerId].icon = icon;

        const playersList = Object.values(room.players).map(p => ({
          playerId: p.playerId, username: p.username, icon: p.icon
        }));
        ws.send(JSON.stringify({ type: "ijoin", players: playersList }));

        const newPlayer = { playerId, username, icon };
        Object.values(room.players).forEach(p => {
          if (p.ws && p.ws.readyState === WebSocket.OPEN && p.playerId != playerId) {
            p.ws.send(JSON.stringify({ type: "hejoins", player: newPlayer }));
          }
        });

        console.log(`${username} entered room ${roomId}`);
      }

      else {
        console.log("Unknown WS type");
      }
    } catch (e) {
      console.log("WS error parsing");
    }
  });

  ws.on("close", () => console.log("WS closed"));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on ${PORT}`));
