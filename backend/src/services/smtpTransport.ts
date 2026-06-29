// SMTP transport layer.
// Extracted from outboundPlatform.ts to keep that file from growing further.
// Pure socket/TLS state machine — no DB, no app-specific knowledge.

import net from 'node:net';
import tls from 'node:tls';

// In production, reject unauthorized connections. In development, set
// SMTP_REJECT_UNAUTHORIZED=false to allow self-signed certificates.
const SMTP_REJECT_UNAUTHORIZED = process.env.SMTP_REJECT_UNAUTHORIZED !== 'false';

export interface SmtpClient {
  expect(codes: number[]): Promise<void>;
  command(command: string, codes: number[]): Promise<void>;
  data(message: string): Promise<void>;
  upgradeToTls(): Promise<void>;
  close(): void;
  capabilities: Set<string>;
}

export async function connectSmtp(host: string, port: number, secure: boolean, timeoutMs: number): Promise<SmtpClient> {
  const socket = secure
    ? tls.connect({ host, port, servername: host, rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED })
    : net.connect({ host, port });
  await onceEvent(socket, secure ? 'secureConnect' : 'connect', timeoutMs);
  return new SmtpSession(socket, timeoutMs);
}

class SmtpSession implements SmtpClient {
  public readonly capabilities = new Set<string>();
  private buffer = '';
  private pending: {
    resolve: (value: { code: number; lines: string[] }) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    lines: string[];
  } | null = null;

  constructor(private socket: net.Socket | tls.TLSSocket, private timeoutMs: number) {
    this.socket.setTimeout(timeoutMs);
    this.socket.on('data', (chunk) => this.onData(chunk.toString('utf8')));
    this.socket.on('error', (error) => this.onError(error));
    this.socket.on('close', () => this.onClose());
  }

  async expect(codes: number[]) {
    await this.waitForResponse(codes);
  }

  async command(command: string, codes: number[]) {
    this.socket.write(`${command}\r\n`);
    await this.waitForResponse(codes);
  }

  async data(message: string) {
    this.socket.write(
      `${message
        .replace(/\r?\n/g, '\r\n')
        .split('\r\n')
        .map((line) => (line.startsWith('.') ? `.${line}` : line))
        .join('\r\n')}\r\n`
    );
  }

  async upgradeToTls() {
    const secureSocket = tls.connect({
      socket: this.socket,
      servername: this.socket.remoteAddress || undefined,
      rejectUnauthorized: SMTP_REJECT_UNAUTHORIZED,
    });
    await onceEvent(secureSocket, 'secureConnect', this.timeoutMs);
    this.socket.removeAllListeners();
    this.socket = secureSocket;
    this.socket.on('data', (chunk) => this.onData(chunk.toString('utf8')));
    this.socket.on('error', (error) => this.onError(error));
    this.socket.on('close', () => this.onClose());
    this.socket.setTimeout(this.timeoutMs);
  }

  close() {
    this.socket.destroy();
  }

  private waitForResponse(codes: number[]) {
    return new Promise<void>((resolve, reject) => {
      if (this.pending) {
        reject(new Error('SMTP command already in progress.'));
        return;
      }

      const timeout = setTimeout(() => {
        this.pending = null;
        reject(new Error('SMTP command timed out.'));
      }, this.timeoutMs);

      this.pending = {
        resolve: (response) => {
          clearTimeout(timeout);
          const code = response.code;
          if (!codes.includes(code)) {
            reject(new Error(`SMTP ${code}: ${response.lines.join(' | ')}`));
            return;
          }
          this.extractCapabilities(response.lines);
          resolve();
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
        lines: [],
      };
    });
  }

  private onData(chunk: string) {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const rawLine = this.buffer.slice(0, index).replace(/\r$/, '');
      this.buffer = this.buffer.slice(index + 1);
      this.consumeLine(rawLine);
      index = this.buffer.indexOf('\n');
    }
  }

  private consumeLine(line: string) {
    if (!this.pending) return;
    this.pending.lines.push(line);
    if (/^\d{3} /.test(line)) {
      const code = Number(line.slice(0, 3));
      const response = { code, lines: [...this.pending.lines] };
      const pending = this.pending;
      this.pending = null;
      pending.resolve(response);
    }
  }

  private extractCapabilities(lines: string[]) {
    for (const line of lines) {
      const match = /^\d{3}[- ]([A-Z0-9-]+)/i.exec(line);
      if (match) this.capabilities.add(match[1].toUpperCase());
    }
  }

  private onError(error: Error) {
    if (!this.pending) return;
    this.pending.reject(error);
    this.pending = null;
  }

  private onClose() {
    if (!this.pending) return;
    this.pending.reject(new Error('SMTP socket closed.'));
    this.pending = null;
  }
}

// Wait for a single named socket event, or reject on error/timeout.
// Critical: this MUST subscribe to 'error' too, otherwise an unhandled 'error'
// event from a connection failure crashes the whole Node process.
function onceEvent(socket: net.Socket | tls.TLSSocket, event: string, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeListener(event, onEvent);
      socket.removeListener('error', onError);
    };
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    const onEvent = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const onError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };
    socket.once(event, onEvent);
    socket.once('error', onError);
  });
}
