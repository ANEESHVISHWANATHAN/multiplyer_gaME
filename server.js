const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 10000;
const lobbies = {}; // { roomID: { Host, Players: [ {username, icon, id, plyrid} ] } }

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

wss.on("connection", (ws) => {
  console.log("✅ New WebSocket connection");

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log(`📩 Received: ${data.type}`);

      if (data.type === 'createLobby') {
        const roomID = generateRoomID();
        const plyrid = 0;

        lobbies[roomID] = {
          Host: ws,
          Players: [{
            username: data.username,
            icon: data.icon,
            id: ws,
            plyrid: plyrid
          }]
        };

        console.log(`🎉 Room created: ${roomID} by ${data.username}`);

        ws.send(JSON.stringify({
          type: 'LobbyCreated',
          roomID: roomID,
          playerID: plyrid
        }));
        const u = data.username;
        const i = data.icon;
        sync_join(u,i,plyrid,roomID);
      }

    } catch (err) {
      console.error("❌ Invalid message received:", message);
    }
  });

  ws.on("close", () => {
    console.log("🔌 WebSocket disconnected");
  });
});
function sync_join(username,icon,playerid,code){
  const usernam = username;
  const ico = icon;
  const player_id = playerid;
  const lobby = code;
  if(player_id == 0){
    const web = lobbies[code].Players[player_id].id;
    web.send(JSON.stringify({
       type:'Ijoin',
       username : usernam,
       icon:ico,
       playerid:player_id
    }));
  }
}
     

server.listen(PORT, () => {
  console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`);
});
