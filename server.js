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

wss.on('connection',(ws)=>{
ws.on('message',(message)=>{
  const data = JSON.parse(message);
  
  if(data.type === 'createLobby'){
    const plyrrid = 0;
    const roomID = generateRoomID();
    lobbies[roomID]={
        Host : ws,
        Players : [{
                 username : data.username,
                 icon: data.icon,
                 id : ws,
                 plyrid : 0 }]
    }
    const lobby = lobbies[roomID].Players[plyrrid].username;
    console.log("ROOM CREATED WITH ID ${roomID} AND USERNAME ${lobby}"); 
    ws.send(JSON.stringify({
      type :'LobbyCreated',
      roomID : roomID,
      PlayerID : plyrrid }));
  } }) 
});
server.listen(PORT=>{
console.log('SERVER RUNNING ON PORT')};
  
  
    
