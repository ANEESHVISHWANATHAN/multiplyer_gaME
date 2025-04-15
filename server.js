const express = require('express');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;
const lobbies = {}; // Format: { roomID: { host: ws, players: [ {username, icon, ws, playerID} ] } }

// Utility to generate unique 5-digit room ID
function generateRoomID() {
  let id;
  do {
    id = Math.floor(10000 + Math.random() * 90000).toString();
  } while (lobbies[id]);
  return id;
}

// Serve all HTML files
const serveFile = (filename) => (req, res) => {
  res.sendFile(path.join(__dirname, filename));
};

app.get('/', serveFile('entry.html'));
app.get('/entry.html', serveFile('entry.html'));
app.get('/hstdet.html', serveFile('hstdet.html'));
app.get('/plyrdet.html', serveFile('plyrdet.html'));
app.get('/lobby.html', serveFile('lobby.html'));

// Debug route (optional)
app.get('/debug/lobbies', (req, res) => {
  res.json(Object.keys(lobbies));
});

wss.on('connection', (ws) => {
  console.log("🔌 New WebSocket connection");

  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'createLobby') {
      const roomID = generateRoomID();
      const playerID = 0;
      lobbies[roomID] = {
        host: ws,
        players: [{ username: data.username, icon: data.icon, ws, playerID }]
      };
      console.log(`✅ Lobby created: ${roomID}`);
      ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID }));
    }

    else if (data.type === 'joinLobby') {
      const roomID = data.roomID;
      const lobby = lobbies[roomID];

      console.log(`🔍 Join request for Room ID: ${roomID}`);
      console.log(`📦 Current lobbies: ${Object.keys(lobbies).join(', ')}`);

      if (!lobby) {
        console.log("❌ Room not active.");
        ws.send(JSON.stringify({ type: 'notActive' }));
        return;
      }

      if (!lobby.host || lobby.host.readyState !== WebSocket.OPEN) {
        console.log("❌ Host not connected.");
        ws.send(JSON.stringify({ type: 'hostNot' }));
        return;
      }

      const playerID = lobby.players.length;
      lobby.players.push({ username: data.username, icon: data.icon, ws, playerID });

      ws.send(JSON.stringify({ type: 'lobbyJoined', roomID, playerID }));

      // Sync all players
      lobby.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify({
            type: 'syncUpdate',
            players: lobby.players.map(({ username, icon }) => ({ username, icon }))
          }));
        }
      });

      console.log(`✅ Player joined Room ${roomID} — total players: ${lobby.players.length}`);
    }

    else if (data.type === 'syncRequest') {
      const lobby = lobbies[data.roomID];
      if (!lobby) return;

      // Update player's WebSocket (for refresh recovery)
      const player = lobby.players.find(p => p.playerID == data.playerID);
      if (player) player.ws = ws;

      // Sync update
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
        console.log(`❌ Lobby ${data.roomID} deleted`);
      }
    }
  });

  ws.on('close', () => {
    // Cleanup on disconnect
    for (const roomID in lobbies) {
      const lobby = lobbies[roomID];
      const index = lobby.players.findIndex(p => p.ws === ws);

      if (index !== -1) {
        console.log(`⚠️ Player disconnected from Room ${roomID}, index ${index}`);
        lobby.players.splice(index, 1);

        // Notify remaining players
        lobby.players.forEach(p => {
          if (p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
              type: 'syncUpdate',
              players: lobby.players.map(({ username, icon }) => ({ username, icon }))
            }));
          }
        });

        // Delete if host left
        if (lobby.host === ws) {
          console.log(`❌ Host left. Closing Room ${roomID}`);
          lobby.players.forEach(p => {
            if (p.ws.readyState === WebSocket.OPEN) {
              p.ws.send(JSON.stringify({ type: 'kicked' }));
            }
          });
          delete lobbies[roomID];
        }

        break;
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
s
