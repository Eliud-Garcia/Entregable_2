(() => {
  'use strict';

  /* ---------------------------- Elementos ---------------------------- */

  const els = {
    status: document.getElementById('status'),
    statusText: document.querySelector('#status .status__text'),
    messages: document.getElementById('messages'),
    empty: document.getElementById('empty'),
    composer: document.getElementById('composer'),
    input: document.getElementById('input'),
    joinModal: document.getElementById('joinModal'),
    joinForm: document.getElementById('joinForm'),
    username: document.getElementById('username'),
    joinError: document.getElementById('joinError'),
    userList: document.getElementById('userList'),
    userCount: document.getElementById('userCount')
  };

  /* ------------------------------ Estado ----------------------------- */

  const state = {
    socket: null,
    messages: [],
    users: [],
    username: null,
    joined: false,
    reconnectTimer: null
  };

  const timeFormat = new Intl.DateTimeFormat('es', {
    hour: '2-digit',
    minute: '2-digit'
  });

  /* ------------------------------ Utilidades -------------------------- */

  function setStatus(status, text) {
    els.status.dataset.state = status;
    els.statusText.textContent = text;
  }

  function send(payload) {
    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      state.socket.send(JSON.stringify(payload));
    }
  }

  function formatTime(isoString) {
    const date = new Date(isoString);
    return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date);
  }

  function isNearBottom() {
    const el = els.messages;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  function scrollToBottom() {
    els.messages.scrollTop = els.messages.scrollHeight;
  }

  function updateComposer() {
    const ready = state.joined && state.socket && state.socket.readyState === WebSocket.OPEN;
    els.input.disabled = !ready;
    els.composer.querySelector('button').disabled = !ready;
  }

  /* --------------------------- Render mensajes ------------------------ */

  function createMessageElement(message) {
    const li = document.createElement('li');

    if (message.type === 'system') {
      li.className = 'msg msg--system';
      const span = document.createElement('span');
      span.textContent = message.text;
      li.append(span);
      return li;
    }

    const own = Boolean(state.username) && message.user === state.username;
    li.className = `msg ${own ? 'msg--own' : 'msg--other'}`;

    const meta = document.createElement('div');
    meta.className = 'msg__meta';

    const user = document.createElement('span');
    user.className = 'msg__user';
    user.textContent = own ? 'Tú' : message.user;

    const time = document.createElement('time');
    time.className = 'msg__time';
    time.dateTime = message.time;
    time.textContent = formatTime(message.time);

    meta.append(user, time);

    const text = document.createElement('p');
    text.className = 'msg__text';
    text.textContent = message.text;

    li.append(meta, text);
    return li;
  }

  function toggleEmpty() {
    els.empty.hidden = state.messages.length > 0;
  }

  function appendMessage(message) {
    const nearBottom = isNearBottom();
    els.messages.append(createMessageElement(message));
    toggleEmpty();
    if (nearBottom) scrollToBottom();
  }

  function renderMessages() {
    els.messages.replaceChildren(
      ...state.messages.map(createMessageElement)
    );
    toggleEmpty();
    scrollToBottom();
  }

  /* ----------------------------- Usuarios ----------------------------- */

  function avatarHue(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) {
      hash = (hash * 31 + name.charCodeAt(i)) % 360;
    }
    return hash;
  }

  function renderUsers() {
    els.userList.replaceChildren();
    els.userCount.textContent = String(state.users.length);

    for (const name of state.users) {
      const li = document.createElement('li');
      li.className = 'user';

      const avatar = document.createElement('span');
      avatar.className = 'user__avatar';
      avatar.style.setProperty('--avatar-hue', String(avatarHue(name)));
      avatar.textContent = name.slice(0, 1).toUpperCase();

      const label = document.createElement('span');
      label.className = 'user__name';
      label.textContent = name;

      li.append(avatar, label);

      if (name === state.username) {
        const you = document.createElement('span');
        you.className = 'user__you';
        you.textContent = 'tú';
        li.append(you);
      }

      els.userList.append(li);
    }
  }

  /* ------------------------------ Handlers ---------------------------- */

  function handle(data) {
    switch (data.type) {
      case 'history':
        state.messages = Array.isArray(data.messages) ? data.messages : [];
        renderMessages();
        break;

      case 'joined':
        state.username = data.user;
        state.joined = true;
        els.joinError.hidden = true;
        els.joinModal.hidden = true;
        renderMessages();
        updateComposer();
        els.input.focus();
        break;

      case 'message':
      case 'system':
        state.messages.push(data);
        if (state.joined) {
          appendMessage(data);
        } else {
          renderMessages();
        }
        break;

      case 'presence':
        state.users = Array.isArray(data.users) ? data.users : [];
        els.userCount.textContent = String(data.count ?? state.users.length);
        renderUsers();
        break;

      case 'error':
        els.joinError.textContent = data.text || 'No se pudo unir al chat.';
        els.joinError.hidden = false;
        els.joinModal.hidden = false;
        break;

      default:
        break;
    }
  }

  /* ------------------------------- Socket ----------------------------- */

  function scheduleReconnect() {
    if (state.reconnectTimer) return;
    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = null;
      connect();
    }, 2000);
  }

  function connect() {
    setStatus('connecting', 'Conectando…');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    state.socket = socket;

    socket.addEventListener('open', () => {
      setStatus('online', 'En línea');
      updateComposer();

      if (state.username && !state.joined) {
        send({ type: 'join', user: state.username });
      }
    });

    socket.addEventListener('message', (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handle(data);
    });

    socket.addEventListener('close', () => {
      state.joined = false;
      updateComposer();
      setStatus('offline', 'Reconectando…');
      scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      socket.close();
    });
  }

  /* ------------------------------- Formularios ------------------------ */

  els.joinForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const name = els.username.value.replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!name) {
      els.joinError.textContent = 'Escribe un nombre para continuar.';
      els.joinError.hidden = false;
      return;
    }

    state.username = name;
    els.joinError.hidden = true;

    if (state.socket && state.socket.readyState === WebSocket.OPEN) {
      send({ type: 'join', user: name });
    } else {
      els.joinError.textContent = 'Conectando con el servidor, espera un momento…';
      els.joinError.hidden = false;
      setStatus('connecting', 'Conectando…');
    }
  });

  els.composer.addEventListener('submit', (event) => {
    event.preventDefault();

    const text = els.input.value.trim();
    if (!text || !state.joined) return;

    send({ type: 'message', text });
    els.input.value = '';
    els.input.focus();
  });

  /* -------------------------------- Inicio ---------------------------- */

  connect();
})();
