
    const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;

const lobbies = {}; // roomID: { HostWS, Players: [{ username, icon, ws, playerID, wscode }] }

function generateRoomID() {
  let id;
  do {
    id = Math.floor(10000 + Math.random() * 90000).toString();
  } while (lobbies[id]);
  return id;
}

function generateWSCODE() {
  return Math.random().toString(36).substring(2, 10);
}

const serveFile = (file) => (req, res) => res.sendFile(path.join(__dirname, file));

app.get('/', serveFile('entry.html'));
app.get('/entry.html', serveFile('entry.html'));
app.get('/hstdet.html', serveFile('hstdet.html'));
app.get('/plyrdet.html', serveFile('plyrdet.html'));
app.get('/lobby.html', serveFile('lobby.html'));

wss.on('connection', (ws) => {
  console.log('✅ New WebSocket connected');

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log(`📩 Type: ${data.type}`, data);

      if (data.type === 'createLobby') {
        const roomID = generateRoomID();
        const playerID = 0;
        const wscode = generateWSCODE();

        lobbies[roomID] = {
          HostWS: ws,
          Players: [{
            username: data.username,
            icon: data.icon,
            ws: ws,
            playerID,
            wscode
          }]
        };

        console.log(`🎉 Lobby Created: ${roomID} by ${data.username}`);
        ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID, wscode }));

        // Cleanup if host doesn't enter the lobby
        setTimeout(() => {
          if (lobbies[roomID] && lobbies[roomID].Players[0].ws.readyState !== WebSocket.OPEN) {
            console.log(`🗑️ Stale Lobby Removed: ${roomID}`);
            delete lobbies[roomID];
          }
        }, 10000);
      }

      else if (data.type === 'joinLobby') {
        const { roomID, username, icon } = data;
        const lobby = lobbies[roomID];

        if (!lobby) {
          ws.send(JSON.stringify({ type: 'notActive' }));
          console.log('❌ No such lobby');
          return;
        }

        if (!lobby.HostWS || lobby.HostWS.readyState !== WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'hostNot' }));
          console.log('❌ Host WebSocket closed');
          delete lobbies[roomID];
          return;
        }

        if (lobby.Players.length >= 8) {
          ws.send(JSON.stringify({ type: 'fullRoom' }));
          console.log('🚫 Room full');
          return;
        }

        const playerID = lobby.Players.length;
        const wscode = generateWSCODE();

        lobby.Players.push({
          username,
          icon,
          ws,
          playerID,
          wscode
        });

        console.log(`✅ Player joined: ${username} (${roomID}) as ${playerID}`);
        ws.send(JSON.stringify({ type: 'lobbyJoined', playerID, wscode }));
      }

      else if (data.type === 'lobbyEntered') {
        const { wscode, playerID, roomID, username, icon } = data;
        const lobby = lobbies[roomID];

        if (!lobby) return console.log('❌ No such lobby during lobbyEntered');

        const player = lobby.Players.find(p => p.wscode === wscode && p.playerID === playerID);
        if (!player) return console.log('❌ Invalid wscode or playerID in lobbyEntered');

        console.log(`🔄 Updating WS for ${username} (ID: ${playerID})`);
        player.ws = ws;

        if (playerID === 0) {
          ws.send(JSON.stringify({ type: 'hostEntered' }));
          console.log('🧑‍✈️ Host entered lobby');
        }

        // Notify all players about each other
        lobby.Players.forEach((p1) => {
          lobby.Players.forEach((p2) => {
            if (p1.playerID !== p2.playerID) {
              try {
                p1.ws.send(JSON.stringify({
                  type: 'Ijoin',
                  username: p2.username,
                  icon: p2.icon,
                  playerid: p2.playerID
                }));
              } catch (err) {
                console.log('⚠️ Broadcast failed');
              }
            }
          });
        });
      }

    } catch (e) {
      console.error('❌ Error parsing message:', e.message);
    }
  });

  ws.on('close', () => {
    console.log('🔌 WebSocket disconnected');
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on PORT ${PORT}`);
});

