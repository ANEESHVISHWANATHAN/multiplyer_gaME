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

// Serve all HTML files directly
const serveFile = (filename) => (req, res) => {
  res.sendFile(path.join(__dirname, filename));
};

app.get('/', serveFile('entry.html'));
app.get('/entry.html', serveFile('entry.html'));
app.get('/hstdet.html', serveFile('hstdet.html'));
app.get('/plyrdet.html', serveFile('plyrdet.html'));
app.get('/lobby.html', serveFile('lobby.html'));

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);

    if (data.type === 'createLobby') {
      const roomID = generateRoomID();
      const playerID = 0;
      lobbies[roomID] = {
        host: ws,
        players: [{ username: data.username, icon: data.icon, ws, playerID }]
      };
      ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID }));
    }

    else if (data.type === 'joinLobby') {
      const lobby = lobbies[data.roomID];
      if (!lobby) {
        ws.send(JSON.stringify({ type: 'notActive' }));
        return;
      }
      if (!lobby.host || lobby.host.readyState !== WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'hostNot' }));
        return;
      }

      const playerID = lobby.players.length;
      lobby.players.push({ username: data.username, icon: data.icon, ws, playerID });
      ws.send(JSON.stringify({ type: 'lobbyJoined', roomID: data.roomID, playerID }));

      // Sync all players
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
        if (p.playerID == data.playerID) {
          p.ws = ws; // Update WebSocket if refreshed
        }
      });

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
      }
    }
  });

  ws.on('close', () => {
    // Handle disconnections
    for (const roomID in lobbies) {
      const lobby = lobbies[roomID];
      const index = lobby.players.findIndex(p => p.ws === ws);
      if (index !== -1) {
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

        // If host left, delete lobby
        if (lobby.host === ws) {
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
  console.log(`Server running on port ${PORT}`);
});