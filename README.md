# Chat en tiempo real con WebSockets

Chat sencillo construido con **Node.js**, **Express**, **WebSockets (`ws`)** y el motor de plantillas **Handlebars**.

## Características

- Mensajes en tiempo real para todas las personas conectadas.
- Elección de nombre al entrar y lista de usuarios en línea.
- Historial de los últimos 50 mensajes para quien se conecta.
- Mensajes de sistema cuando alguien entra o sale.
- Reconexión automática si se cae la conexión.
- Renderizado seguro en el cliente con `textContent` (sin inyección de HTML).

## Estructura

```
.
├── package.json
├── server.js                # Express + servidor WebSocket
├── views/
│   ├── layouts/
│   │   └── main.handlebars  # Layout base (HTML, head, estilos)
│   └── chat.handlebars      # Vista del chat
└── public/
    ├── css/styles.css       # Estilos
    └── js/chat.js           # Cliente WebSocket
```

## Instalación y uso

```bash
npm install
npm start
```

Abre <http://localhost:3000> en dos pestañas o navegadores distintos para probarlo.

Para desarrollo con recarga automática del servidor:

```bash
npm run dev
```

Puedes cambiar el puerto con la variable de entorno `PORT`:

```bash
# PowerShell
$env:PORT=4000; npm start
```

## Cómo funciona

1. `server.js` crea un servidor HTTP con Express y le adjunta un `WebSocketServer` en la ruta `/ws`.
2. La ruta `/` renderiza `views/chat.handlebars` con Handlebars.
3. El navegador abre la conexión WebSocket y el servidor le envía el historial.
4. Al enviar el formulario de nombre, el cliente manda `{ type: "join", user }`.
5. Cada mensaje se difunde a todos los clientes conectados con `broadcast()`.

### Protocolo de mensajes

Del cliente al servidor:

```json
{ "type": "join", "user": "Ana" }
{ "type": "message", "text": "Hola a todos" }
```

Del servidor al cliente:

```json
{ "type": "history", "messages": [] }
{ "type": "presence", "users": ["Ana"], "count": 1 }
{ "type": "message", "id": 1, "user": "Ana", "text": "Hola", "time": "2026-10-29T10:00:00.000Z" }
{ "type": "system", "id": 2, "text": "Ana se ha unido al chat.", "time": "..." }
```

## Notas

- El historial vive en memoria: se pierde al reiniciar el servidor.
- No hay autenticación ni persistencia; es un ejemplo didáctico.
