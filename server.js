const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;
const lobbies = {}; // Format: { roomID: { host, players: [ {username, icon, ws, playerID} ] } }

function generateRoomID() {
  let id;
  do {
    id = Math.floor(10000 + Math.random() * 90000).toString();
  } while (lobbies[id]);
  return id;
}

const serveFile = (filename) => (req, res) => {
  res.sendFile(path.join(__dirname, filename));
};

app.get('/', serveFile('entry.html'));
app.get('/entry.html', serveFile('entry.html'));
app.get('/hstdet.html', serveFile('hstdet.html'));
app.get('/plyrdet.html', serveFile('plyrdet.html'));
app.get('/lobby.html', serveFile('lobby.html'));

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection');

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'createLobby') {
      const roomID = generateRoomID();
      const playerID = 0;
      lobbies[roomID] = {
        host: ws,
        players: [{ username: data.username, icon: data.icon, ws, playerID }],
      };
      console.log(`✅ Lobby created: ${roomID}`);
      ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID }));
    }

    else if (data.type === 'joinLobby') {
      console.log(`🔍 Join request for Room ID: ${data.roomID}`);
      console.log(`📦 Current lobbies: ${JSON.stringify(Object.keys(lobbies))}`);

      const lobby = lobbies[data.roomID];

      if (!lobby) {
        console.log('❌ Room not active.');
        ws.send(JSON.stringify({ type: 'notActive' }));
        return;
      }

      if (!lobby.host || lobby.host.readyState !== WebSocket.OPEN) {
        console.log('⚠️ Host not available in room:', data.roomID);
        ws.send(JSON.stringify({ type: 'hostNot' }));
        return;
      }

      const playerID = lobby.players.length;
      lobby.players.push({ username: data.username, icon: data.icon, ws, playerID });
      console.log(`✅ ${data.username} joined Room ${data.roomID} with ID ${playerID}`);

      ws.send(JSON.stringify({ type: 'lobbyJoined', roomID: data.roomID, playerID }));

      lobby.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({
            type: 'syncUpdate',
            players: lobby.players.map(({ username, icon }) => ({ username, icon }))
          }));
        }
      });
    }

    else if (data.type === 'syncRequest') {
      const lobby = lobbies[data.roomID];
      if (!lobby) return;

      lobby.players.forEach(p => {
        if (p.playerID === data.playerID) {
          p.ws = ws;
        }
      });

      lobby.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({
            type: 'syncUpdate',
            players: lobby.players.map(({ username, icon }) => ({ username, icon }))
          }));
        }
      });
    }

    else if (data.type === 'deleteLobby') {
      const lobby = lobbies[data.roomID];
      if (lobby) {
        lobby.players.forEach(p => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({ type: 'kicked' }));
          }
        });
        delete lobbies[data.roomID];
      }
    }
  });

  ws.on('close', () => {
    for (const roomID in lobbies) {
      const lobby = lobbies[roomID];
      const index = lobby.players.findIndex(p => p.ws === ws);
      if (index !== -1) {
        console.log(`⚠️ Player disconnected from Room ${roomID}, index ${index}`);
        lobby.players.splice(index, 1);

        if (lobby.players.length === 0) {
          console.log(`❌ No players left. Deleting Room ${roomID}`);
          delete lobbies[roomID];
          break;
        }

        if (lobby.host === ws) {
          console.log(`⚠️ Host disconnected from Room ${roomID}`);
          lobby.host = null;
        }

        lobby.players.forEach(p => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
              type: 'syncUpdate',
              players: lobby.players.map(({ username, icon }) => ({ username, icon }))
            }));
          }
        });

        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
