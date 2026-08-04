'use client';

import { useEffect, useRef, useState } from 'react';
import { MetadataMessage } from '@/client/types/media';
import type { MetadataClient as MetadataClientType } from '@/client/services/metadata';
import { createMetadataClient } from '@/client/services/metadata';
import { METADATA_WS_URL } from '@/client/config';

interface UseMetadataClientOptions {
  streamName: string;
  onMetadata?: (message: MetadataMessage) => void;
}

export function useMetadataClient({
  streamName,
  onMetadata,
}: UseMetadataClientOptions) {
  const clientRef = useRef<MetadataClientType | null>(null);
  const [metadataAvailable, setMetadataAvailable] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'CONNECTING' | 'OPEN' | 'CLOSED'>('CONNECTING');
  const lastMessageTimeRef = useRef<number>(0);

  useEffect(() => {
    // Construct the websocket URL using the base from config and appending the streamName
    // e.g., ws://127.0.0.1:8000/ws/leak-detection
    const baseUrl = METADATA_WS_URL.endsWith('/') ? METADATA_WS_URL.slice(0, -1) : METADATA_WS_URL;
    const segments = baseUrl.split('/');
    segments[segments.length - 1] = streamName;
    const wsUrl = segments.join('/');

    const client = createMetadataClient(wsUrl);
    clientRef.current = client;

    // Heartbeat check interval
    const heartbeatInterval = setInterval(() => {
      const now = Date.now();
      if (lastMessageTimeRef.current > 0 && now - lastMessageTimeRef.current > 2000) {
        setMetadataAvailable(false);
      }
    }, 1000);

    client
      .connect(
        (msg: MetadataMessage) => {
          lastMessageTimeRef.current = Date.now();
          setMetadataAvailable(true);

          setConnectionError(null);
          onMetadata?.(msg);
        },
        (error: string) => {
          setMetadataAvailable(false);
          setConnectionError(error);
        },
        (status) => {
          setConnectionStatus(status);
          if (status === 'CLOSED') {
            setMetadataAvailable(false);
          }
        }
      )
      .catch((error) => {
        setMetadataAvailable(false);
        setConnectionError(error.message || 'Failed to connect metadata client');
      });

    return () => {
      clearInterval(heartbeatInterval);
      client.disconnect();
    };
  }, [streamName, onMetadata]);

  return {
    metadataAvailable,
    connectionError,
    connectionStatus,
  };
}
