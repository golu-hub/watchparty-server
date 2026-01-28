import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer();
const wss = new WebSocketServer({ server });

const rooms = {};

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);

    if (msg.type === "join") {
      const { room, password, user } = msg;
      ws.room = room;
      ws.user = user;

      if (!rooms[room]) {
        rooms[room] = {
          password,
          videoId: null,
          time: 0,
          isPlaying: false,
          lastUpdate: Date.now(),
          host: user,
          subhosts: new Set(),
          users: new Map()
        };
      }

      if (rooms[room].password !== password) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid room password" }));
        ws.close();
        return;
      }

      rooms[room].users.set(ws, user);
      sendSync(ws);
      broadcastUsers(room);
    }

    if (msg.type === "addSubhost" && isHost(ws)) {
      rooms[ws.room].subhosts.add(msg.user);
      broadcastUsers(ws.room);
    }

    if (msg.type === "changeVideo" && canControl(ws)) {
      const room = rooms[ws.room];
      room.videoId = msg.videoId;
      room.time = 0;
      room.isPlaying = false;
      room.lastUpdate = Date.now();
      broadcast(ws.room, { type: "video", videoId: msg.videoId });
    }

    if (msg.type === "play" && canControl(ws)) {
      const room = rooms[ws.room];
      room.time = correctedTime(room);
      room.isPlaying = true;
      room.lastUpdate = Date.now();
      broadcast(ws.room, { type: "play", time: room.time });
    }

    if (msg.type === "pause" && canControl(ws)) {
      const room = rooms[ws.room];
      room.time = correctedTime(room);
      room.isPlaying = false;
      room.lastUpdate = Date.now();
      broadcast(ws.room, { type: "pause", time: room.time });
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.room];
    if (!room) return;

    room.users.delete(ws);

    if (room.host === ws.user) {
      room.host = [...room.users.values()][0] || null;
    }

    if (room.users.size === 0) {
      delete rooms[ws.room];
      return;
    }

    broadcastUsers(ws.room);
  });
});

function isHost(ws) {
  return rooms[ws.room]?.host === ws.user;
}

function canControl(ws) {
  const room = rooms[ws.room];
  return room.host === ws.user || room.subhosts.has(ws.user);
}

function correctedTime(room) {
  if (!room.isPlaying) return room.time;
  return room.time + (Date.now() - room.lastUpdate) / 1000;
}

function sendSync(ws) {
  const room = rooms[ws.room];
  ws.send(JSON.stringify({
    type: "state",
    videoId: room.videoId,
    time: correctedTime(room),
    playing: room.isPlaying,
    host: room.host,
    subhosts: [...room.subhosts],
    users: [...room.users.values()]
  }));
}

function broadcast(roomName, msg) {
  wss.clients.forEach(c => {
    if (c.readyState === 1 && c.room === roomName) {
      c.send(JSON.stringify(msg));
    }
  });
}

function broadcastUsers(roomName) {
  const room = rooms[roomName];
  const users = [...room.users.values()];
  broadcast(roomName, { type: "users", users, host: room.host, subhosts: [...room.subhosts] });
}

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => console.log(`Watch Party server running on port ${PORT}`));
