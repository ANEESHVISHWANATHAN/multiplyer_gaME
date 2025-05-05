const WebSocket = require('ws');
const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`🚀 Server running on PORT ${PORT}`));

app.get('/', (req, res) => res.send('==> Your service is live 🎉'));

const lobbies = {}; // { roomID: { players: [..], hostID, ... } }

function generateWscode() {
  return Math.random().toString(36).substring(2, 10);
}

wss.on('connection', (ws) => {
  console.log('✅ New WebSocket connected');

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    const { type } = msg;

    if (type === 'createLobby') {
      const roomID = Math.floor(10000 + Math.random() * 90000).toString();
      const wscode = generateWscode();
      lobbies[roomID] = {
        players: [{
          ws, username: msg.username, icon: msg.icon, playerid: 0, wscode
        }],
        hostID: 0
      };
      ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID: 0, wscode }));
      console.log(`🎉 Lobby Created: ${roomID} by ${msg.username}`);

    } else if (type === 'joinLobby') {
      const { roomID, username, icon } = msg;
      const room = lobbies[roomID];
      if (!room) return ws.send(JSON.stringify({ type: 'notActive' }));
      if (!room.players[room.hostID]?.ws || room.players[room.hostID].ws.readyState !== 1)
        return ws.send(JSON.stringify({ type: 'hostNot' }));
      if (room.players.length >= 8) return ws.send(JSON.stringify({ type: 'fullRoom' }));

      const wscode = generateWscode();
      const playerid = room.players.length;
      room.players.push({ ws, username, icon, playerid, wscode });
      ws.send(JSON.stringify({ type: 'lobbyJoined', playerID: playerid, wscode }));
      console.log(`✅ Player joined: ${username} (${roomID}) as ${playerid}`);
    }

    else if (type === 'lobbyEntered') {
      const { roomID, wscode, playerID, username, icon } = msg;
      const room = lobbies[roomID];
      if (!room) return;
      const player = room.players[playerID];
      if (!player || player.wscode !== wscode) return;

      player.ws = ws; // update with new WS
      console.log(`🔄 Updating WS for ${username} (ID: ${playerID})`);

      // Send full lobby state to the newly entered player
      const fullLobby = room.players.map(p => ({
        username: p.username,
        iconURL: p.icon,
        playerid: p.playerid
      }));
      ws.send(JSON.stringify({ type: 'fullLobbyState', players: fullLobby }));

      // If host, notify
      if (playerID == room.hostID) {
        ws.send(JSON.stringify({ type: 'hostEntered' }));
        console.log('🧑‍✈️ Host entered lobby');
      }

      // Notify others someone joined
      room.players.forEach(p => {
        if (p.playerid !== playerID && p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({
            type: 'Ijoin',
            username,
            iconURL: icon,
            playerid: playerID
          }));
        }
      });
    }

    else if (type === 'startGame') {
      const room = lobbies[msg.roomID];
      if (!room) return;
      room.players.forEach(p => {
        if (p.ws.readyState === 1) {
          p.ws.send(JSON.stringify({ type: 'gameStarted' }));
        }
      });
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
  });
});

