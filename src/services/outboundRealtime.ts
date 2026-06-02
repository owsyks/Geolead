import { createHash } from 'node:crypto';
import type { Server, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
type UpgradeSocket = Duplex & { destroyed: boolean };

const clients = new Set<UpgradeSocket>();

export interface OutboundRealtimeEvent {
  type: string;
  payload: Record<string, unknown>;
  createdAt?: string;
}

export function attachOutboundWebSocket(server: Server) {
  server.on('upgrade', (request, socket) => {
    if (!request.url?.startsWith('/ws/outbound')) {
      return;
    }

    const key = request.headers['sec-websocket-key'];
    if (!key || Array.isArray(key)) {
      socket.destroy();
      return;
    }

    completeHandshake(request, socket, key);
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));

    sendSocketEvent(socket, {
      type: 'CONNECTED',
      payload: { message: 'Outbound realtime channel connected' },
    });
  });
}

export function broadcastOutboundEvent(event: OutboundRealtimeEvent) {
  const payload = {
    ...event,
    createdAt: event.createdAt || new Date().toISOString(),
  };

  for (const client of clients) {
    sendSocketEvent(client, payload);
  }
}

function completeHandshake(request: IncomingMessage, socket: UpgradeSocket, key: string) {
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
    clients.delete(socket);
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
