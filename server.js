import http from "http";
import { WebSocketServer } from "ws";

const server = http.createServer();
const wss = new WebSocketServer({ server });

/*
roomName -> {
  password,
  videoId,
  time,
  isPlaying,
  lastUpdate,
  host,
  subhosts: Set,
  users: Map(ws -> username)
}
*/
const rooms = {};

wss.on("connection", (ws) => {

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw);

    // ===== JOIN ROOM =====
    if (msg.type === "join") {
      const { room, password, user } = msg;

      ws.room = room;
      ws.user = user;

      // Create room
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

      // Password check
      if (rooms[room].password !== password) {
        ws.send(JSON.stringify({
          type: "error",
          message: "Invalid room password"
        }));
        ws.close();
        return;
      }

      rooms[room].users.set(ws, user);
      sendSync(ws);
      broadcastUsers(room);
    }

    // ===== ADD SUBHOST (HOST ONLY) =====
    if (msg.type === "addSubhost" && isHost(ws)) {
      rooms[ws.room].subhosts.add(msg.user);
      broadcastUsers(ws.room);
    }

    // ===== CHANGE VIDEO (HOST / SUBHOST) =====
    if (msg.type === "changeVideo" && canControl(ws)) {
      const room = rooms[ws.room];
      room.videoId = msg.videoId;
      room.time = 0;
      room.isPlaying = false;
      room.lastUpdate = Date.now();

      broadcast(ws.room, {
        type: "changeVideo",
        videoId: msg.videoId
      });
    }

    // ===== PLAY =====
    if (msg.type === "play" && canControl(ws)) {
      const room = rooms[ws.room];
      room.time = msg.time;
      room.isPlaying = true;
      room.lastUpdate = Date.now();

      broadcast(ws.room, {
        type: "play",
        time: correctedTime(room)
      });
    }

    // ===== PAUSE =====
    if (msg.type === "pause" && canControl(ws)) {
      const room = rooms[ws.room];
      room.time = correctedTime(room);
      room.isPlaying = false;
      room.lastUpdate = Date.now();

      broadcast(ws.room, { type: "pause" });
    }
  });

  ws.on("close", () => {
    const room = rooms[ws.room];
    if (!room) return;

    room.users.delete(ws);

    // Host leaves → promote next user
    if (room.host === ws.user) {
      room.host = [...room.users.values()][0] || null;
    }

    // Destroy room if empty
    if (room.users.size === 0) {
      delete rooms[ws.room];
      return;
    }

    broadcastUsers(ws.room);
  });
});

// ---------- HELPERS ----------

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
    type: "sync",
    videoId: room.videoId,
    time: correctedTime(room),
    isPlaying: room.isPlaying,
    host: room.host,
    subhosts: [...room.subhosts]
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
  broadcast(roomName, {
    type: "users",
    users: [...room.users.values()],
    host: room.host,
    subhosts: [...room.subhosts]
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log("Watch Party server running")
);
