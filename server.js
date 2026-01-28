const WebSocket = require("ws");

const PORT = process.env.PORT || 10000;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

function broadcast(roomId, data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (
      client.readyState === WebSocket.OPEN &&
      client.roomId === roomId
    ) {
      client.send(msg);
    }
  });
}

wss.on("connection", ws => {
  ws.on("message", message => {
    const { type, roomId, payload } = JSON.parse(message);
    ws.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = {
        videoId: null,
        isPlaying: false,
        position: 0,
        lastUpdated: Date.now()
      };
    }

    const state = rooms[roomId];

    if (type === "JOIN") {
      ws.send(JSON.stringify({ type: "STATE", payload: state }));
    }

    if (type === "LOAD_VIDEO") {
      rooms[roomId] = {
        videoId: payload.videoId,
        isPlaying: false,
        position: 0,
        lastUpdated: Date.now()
      };
      broadcast(roomId, { type: "STATE", payload: rooms[roomId] });
    }

    if (type === "PLAY") {
      state.isPlaying = true;
      state.lastUpdated = Date.now();
      broadcast(roomId, { type: "STATE", payload: state });
    }

    if (type === "PAUSE") {
      state.position = payload.position;
      state.isPlaying = false;
      state.lastUpdated = Date.now();
      broadcast(roomId, { type: "STATE", payload: state });
    }

    if (type === "SEEK") {
      state.position = payload.position;
      state.lastUpdated = Date.now();
      broadcast(roomId, { type: "STATE", payload: state });
    }
  });
});

console.log(`WebSocket server running on port ${PORT}`);
