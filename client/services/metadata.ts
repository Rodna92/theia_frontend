import { MetadataMessage } from '../types/media';

export class MetadataClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private onMessageCallback: ((message: MetadataMessage) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;
  private onStatusCallback: ((status: 'CONNECTING' | 'OPEN' | 'CLOSED') => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  connect(
    onMessage: (message: MetadataMessage) => void,
    onError?: (error: string) => void,
    onStatus?: (status: 'CONNECTING' | 'OPEN' | 'CLOSED') => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.onMessageCallback = onMessage;
        this.onErrorCallback = onError || null;
        this.onStatusCallback = onStatus || null;

        if (this.onStatusCallback) this.onStatusCallback('CONNECTING');
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          if (this.onStatusCallback) this.onStatusCallback('OPEN');
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as MetadataMessage;
            if (this.onMessageCallback) {
              this.onMessageCallback(message);
            }
          } catch (error) {
            if (this.onErrorCallback) {
              this.onErrorCallback(`Failed to parse metadata: ${String(error)}`);
            }
          }
        };

        this.ws.onerror = () => {
          const error = 'WebSocket connection error';
          if (this.onErrorCallback) {
            this.onErrorCallback(error);
          }
          this.attemptReconnect();
          reject(new Error(error));
        };

        this.ws.onclose = () => {
          if (this.onStatusCallback) this.onStatusCallback('CLOSED');
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
      setTimeout(() => {
        this.connect(
          this.onMessageCallback || (() => {}),
          this.onErrorCallback || undefined,
          this.onStatusCallback || undefined
        ).catch(() => {
          // Reconnection failed, will retry
        });
      }, delay);
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.onMessageCallback = null;
    this.onErrorCallback = null;
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

export function createMetadataClient(wsUrl: string): MetadataClient {
  return new MetadataClient(wsUrl);
}
