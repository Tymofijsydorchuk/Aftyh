const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Camera demo signaling server is running.');
});
const wss = new WebSocket.Server({ server });
const rooms = new Map();

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}
function leave(ws) {
  if (!ws.room) return;
  const room = rooms.get(ws.room);
  if (room) {
    room.delete(ws);
    for (const peer of room) send(peer, { type: 'peer-left' });
    if (room.size === 0) rooms.delete(ws.room);
  }
  ws.room = null;
  ws.role = null;
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'join') {
      const roomCode = String(msg.room || '').trim();
      const role = msg.role;
      if (!/^[A-Za-z0-9-]{4,32}$/.test(roomCode) || !['sender', 'viewer'].includes(role)) {
        send(ws, { type: 'error', message: 'Use a room code of 4–32 letters, numbers, or hyphens.' });
        return;
      }
      leave(ws);
      let room = rooms.get(roomCode);
      if (!room) { room = new Set(); rooms.set(roomCode, room); }
      if (room.size >= 2 || [...room].some(p => p.role === role)) {
        send(ws, { type: 'error', message: 'This room is full or already has that role. Choose a new room code.' });
        return;
      }
      ws.room = roomCode;
      ws.role = role;
      room.add(ws);
      send(ws, { type: 'joined', role });
      for (const peer of room) if (peer !== ws) send(peer, { type: 'peer-joined', role });
      return;
    }
    if (!ws.room) return;
    if (['offer', 'answer', 'candidate', 'stop'].includes(msg.type)) {
      const room = rooms.get(ws.room);
      if (!room) return;
      for (const peer of room) if (peer !== ws) send(peer, { type: msg.type, data: msg.data });
      if (msg.type === 'stop') {
        for (const peer of room) if (peer !== ws) send(peer, { type: 'peer-left' });
      }
    }
  });
  ws.on('close', () => leave(ws));
  ws.on('error', () => leave(ws));
});

server.listen(PORT, '0.0.0.0', () => console.log(`Signaling server listening on ${PORT}`));
