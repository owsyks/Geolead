import { createHash } from 'node:crypto';
import type { Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { consumeWebSocketTicket } from './auth.js';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
type UpgradeSocket = Duplex & { destroyed: boolean };

// Each realtime client is bound to the authenticated user that opened it, so
// events are delivered only to their owner — never broadcast across tenants.
interface Client {
  socket: UpgradeSocket;
  userId: string;
}
const clients = new Set<Client>();

export interface OutboundRealtimeEvent {
  type: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

// Browsers first obtain a 30-second, single-use WebSocket ticket through an
// authenticated HTTPS request. The long-lived access token is never placed in
// a URL or WebSocket subprotocol.
export function attachOutboundWebSocket(server: Server) {
  server.on('upgrade', (request, socket: UpgradeSocket) => {
    if (!request.url?.startsWith('/ws/outbound')) {
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key || Array.isArray(key)) {
      socket.destroy();
      return;
    }

    const requestUrl = new URL(request.url, 'http://localhost');
    const userId = consumeWebSocketTicket(requestUrl.searchParams.get('ticket') || '');
    if (!userId) {
      // Fail closed: reject unauthenticated upgrades before completing handshake.
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }

    completeHandshake(socket, key);
    const client: Client = { socket, userId };
    clients.add(client);
    socket.on('close', () => clients.delete(client));
    socket.on('error', () => clients.delete(client));

    sendSocketEvent(socket, {
      type: 'CONNECTED',
      payload: { message: 'Outbound realtime channel connected' },
    });
  });
}

// Deliver an event only to the sockets owned by `userId`. A null/undefined
// owner (legacy unclaimed data) delivers to nobody rather than leaking to all.
export function broadcastOutboundEvent(userId: string | null | undefined, event: OutboundRealtimeEvent) {
  if (!userId) return;
  const payload = {
    ...event,
    createdAt: event.createdAt || new Date().toISOString(),
  };

  for (const client of clients) {
    if (client.userId === userId) {
      sendSocketEvent(client.socket, payload);
    }
  }
}

function completeHandshake(socket: UpgradeSocket, key: string) {
  const accept = createHash('sha1')
    .update(`${key}${WS_GUID}`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${accept}`,
      '',
      '',
    ].join('\r\n')
  );
}

function sendSocketEvent(socket: UpgradeSocket, event: OutboundRealtimeEvent) {
  if (socket.destroyed) {
    return;
  }

  const payload = Buffer.from(JSON.stringify(event));
  const frameHeader = buildFrameHeader(payload.length);
  socket.write(Buffer.concat([frameHeader, payload]));
}

function buildFrameHeader(length: number) {
  if (length < 126) {
    return Buffer.from([0x81, length]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return header;
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return header;
}
