const path = require('path');
const http = require('http');
const express = require('express');
const { engine } = require('express-handlebars');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3000;
const MAX_HISTORY = 50;
const MAX_TEXT = 500;
const MAX_USER = 20;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

/* ------------------------------ Handlebars ------------------------------ */

app.engine(
  'handlebars',
  engine({
    defaultLayout: 'main',
    helpers: {
      year() {
        return new Date().getFullYear();
      }
    }
  })
);
app.set('view engine', 'handlebars');
app.set('views', path.join(__dirname, 'views'));

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.render('chat', {
    title: 'Chat WebSocket'
  });
});

/* ------------------------------ Chat state ------------------------------ */

const history = [];
let nextId = 1;

function timestamp() {
  return new Date().toISOString();
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
}

function onlineUsers() {
  const names = new Set();
  for (const client of wss.clients) {
    if (client.user) names.add(client.user);
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

function broadcastPresence() {
  const users = onlineUsers();
  broadcast({ type: 'presence', users, count: users.length });
}

function pushMessage(message) {
  history.push(message);
  if (history.length > MAX_HISTORY) history.shift();
  return message;
}

function systemMessage(text) {
  return pushMessage({
    id: nextId++,
    type: 'system',
    text,
    time: timestamp()
  });
}

function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function cleanUser(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_USER);
}

/* ------------------------------- WebSocket ------------------------------ */

wss.on('connection', (socket) => {
  socket.isAlive = true;
  socket.user = null;

  socket.on('pong', () => {
    socket.isAlive = true;
  });

  send(socket, {
    type: 'history',
    messages: history
  });

  socket.on('message', (raw) => {
    let data;

    try {
      data = JSON.parse(raw.toString());
    } catch {
      return; // mensaje no válido: se ignora
    }

    if (!data || typeof data !== 'object') return;

    /* El usuario se identifica una sola vez */
    if (data.type === 'join' && !socket.user) {
      const user = cleanUser(data.user);
      if (!user) {
        send(socket, { type: 'error', text: 'El nombre no es válido.' });
        return;
      }

      socket.user = user;
      send(socket, { type: 'joined', user });
      broadcast(systemMessage(`${user} se ha unido al chat.`));
      broadcastPresence();
      return;
    }

    /* Mensaje de chat */
    if (data.type === 'message' && socket.user) {
      const text = cleanText(data.text);
      if (!text) return;

      const message = pushMessage({
        id: nextId++,
        type: 'message',
        user: socket.user,
        text,
        time: timestamp()
      });

      broadcast(message);
    }
  });

  socket.on('close', () => {
    if (!socket.user) return;
    const user = socket.user;
    socket.user = null;
    broadcast(systemMessage(`${user} ha salido del chat.`));
    broadcastPresence();
  });

  socket.on('error', () => {
    // El evento 'close' se encarga de la limpieza
  });
});

/* Ping periódico para detectar conexiones muertas */
const heartbeat = setInterval(() => {
  for (const client of wss.clients) {
    if (client.isAlive === false) {
      client.terminate();
      continue;
    }
    client.isAlive = false;
    client.ping();
  }
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

/* --------------------------------- Server -------------------------------- */

server.listen(PORT, () => {
  console.log(`Servidor de chat en http://localhost:${PORT}`);
});
