const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 10000;

const lobbies = {}; // roomID: { HostWS, Players[], timeout }

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

      if (data.type === 'createLobby') {
        console.log(data.type, data.username);
        const roomID = generateRoomID();
        const playerID = 0;
        const wscode = generateWSCODE();

        const timeout = setTimeout(() => {
          const room = lobbies[roomID];
          if (!room) return;

          const hostWS = room.Players[0]?.ws;
          if (!hostWS || hostWS.readyState !== WebSocket.OPEN) {
            console.log('🧹 Deleting stale lobby:', roomID);
            delete lobbies[roomID];
          } else {
            console.log('⏳ Lobby still active (host connected):', roomID);
          }
        }, 10000); // 10 sec

        lobbies[roomID] = {
          HostWS: ws,
          Players: [{
            username: data.username,
            iconURL: data.iconURL,
            ws,
            playerID,
            wscode
          }],
          timeout
        };

        console.log(`🎉 Lobby Created: ${roomID} by ${data.username}`);
        ws.send(JSON.stringify({ type: 'lobbyCreated', roomID, playerID, wscode }));
      }

      else if (data.type === 'joinLobby') {
        const { roomID, username, iconURL } = data;
        console.log(data.type, roomID, username);
        const lobby = lobbies[roomID];

        if (!lobby) {
          ws.send(JSON.stringify({ type: 'notActive' }));
          console.log('❌ No such lobby');
          return;
        }

        const hostWS = lobby.Players[0]?.ws;
        if (!hostWS || hostWS.readyState !== WebSocket.OPEN) {
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
          iconURL,
          ws,
          playerID,
          wscode
        });

        console.log(`✅ Player joined: ${username} (${roomID}) as ${playerID}`);
        ws.send(JSON.stringify({ type: 'lobbyJoined', playerID, wscode }));
      }

      else if (data.type === 'lobbyEntered') {
        const { wscode, playerID, roomID, username, iconURL } = data;
        console.log(data.type, wscode, playerID, roomID, username);
        const lobby = lobbies[roomID];

        if (!lobby) {
          console.log('❌ No such lobby during lobbyEntered');
          return;
        }
        console.log('✅ Lobby found:', roomID);

        const player = lobby.Players.find(p => p.playerID == playerID);
        if (!player) {
          console.log('❌ PlayerID not found in lobby:', playerID);
          return;
        }
        console.log('✅ PlayerID found:', playerID);

        if (player.wscode !== wscode) {
          console.log('❌ WSCODE mismatch. Expected:', player.wscode, 'Got:', wscode);
          return;
        }
        console.log('✅ WSCODE matched:', wscode);

        player.ws = ws;
        console.log(`🔄 Updating WS for ${username} (ID: ${playerID})`);

        if (playerID === 0) {
          lobby.HostWS = ws;
          clearTimeout(lobby.timeout);
          ws.send(JSON.stringify({ type: 'hostEntered' }));
          console.log('🧑‍✈️ Host entered lobby');
        }

        // Broadcast player info to others
        lobby.Players.forEach(p1 => {
          lobby.Players.forEach(p2 => {
            if (p1.playerID !== p2.playerID && p1.ws.readyState === WebSocket.OPEN) {
              try {
                p1.ws.send(JSON.stringify({
                  type: 'Ijoin',
                  username: p2.username,
                  iconURL: p2.iconURL,
                  playerid: p2.playerID
                }));
              } catch (err) {
                console.log('⚠️ Broadcast failed to player', p1.playerID);
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
