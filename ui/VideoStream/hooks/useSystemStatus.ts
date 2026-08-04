import { useEffect, useState, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import { BACKEND_URL, STOMP_CREDS, AUTH_HEADER } from '@/client/config';
import { RunView } from '@/client/types/run';

export type SystemState = 
    'INITIALIZING' 
  | 'CHECKING_COMMUNICATIONS' 
  | 'IDLE' 
  | 'RUNNING' 
  | 'THEIA_CORE_NOT_REACHABLE'
  | 'BUS_NOT_AVAILABLE'
  | 'CHECKING_CAMERA'
  | 'STREAM_REQUESTED'
  | 'VIDEO_STREAMING_ON'
  | 'ERROR' 
  | 'UNKNOWN';

export type ProcessState = 
    'IDLE' 
  | 'CHECKING_CAMERA' 
  | 'STREAM_REQUESTED'
  | 'VIDEO_STREAMING_ON'
  | 'CHECKING_SUBSYSTEMS'
  | 'READY'
  | 'START_REQUESTED'
  | 'STREAMING'
  | 'RUNNING'
  | 'PROCESS_FINISHED'
  | 'STOP_REQUESTED'
  | 'STOPPED'
  | 'ERROR'
  | 'NONE';

export const useSystemStatus = () => {
  const [systemState, setSystemState] = useState<SystemState>('UNKNOWN');
  const [processState, setProcessState] = useState<ProcessState>('NONE');
  const [runView, setRunView] = useState<RunView | null>(null);
  const [lastRawMessage, setLastRawMessage] = useState<string | null>(null);
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
        let isMounted = true;

        // Helper to update states from the unified payload
        const handleStateUpdate = (data: any) => {
            if (!isMounted || !data) return;

            // 1. Update System State (e.g., READY, BUS_NOT_AVAILABLE)
            if (data.state) {
                setSystemState(sanitizeSystem(data.state));
            }

            // 2. Update Process State and full RunView (from the unified object)
            if (data.process && data.process !== 'none') {
                // The FSM Engine sends RunView, which uses the key 'state'
                setProcessState(sanitizeProcess(data.process.state));
                setRunView(data.process as RunView);
            } else {
                setProcessState('NONE');
                setRunView(null);
            }
        };

        const fetchLatestState = () => {
            fetch(`${BACKEND_URL}/api/system/state`, { headers: AUTH_HEADER })
                .then(res => res.json())
                .then(data => {
                    handleStateUpdate(data);
                    // Keep initial fetch as raw message
                    setLastRawMessage(JSON.stringify(data, null, 2));
                })
                .catch((err) => {
                    console.warn("HTTP Fetch Error:", err);
                    if (isMounted) {
                        setSystemState('THEIA_CORE_NOT_REACHABLE');
                        setProcessState('NONE');
                    }
                });
        };

        fetchLatestState();

        const setupStompClient = () => {
            if (clientRef.current && clientRef.current.active) return;

            const wsUrl = BACKEND_URL.replace(/^http/, 'ws'); 

            const client = new Client({
                brokerURL: `${wsUrl}/ws/websocket`, 
                connectHeaders: { login: STOMP_CREDS.login, passcode: STOMP_CREDS.passcode },
                reconnectDelay: 5000, 
                onConnect: () => {
                    if (!isMounted) {
                        client.deactivate();
                        return;
                    }
                    console.log('✅ STOMP Connected');
                    
                    client.subscribe('/topic/system/state', (message) => {
                        setLastRawMessage(message.body);
                        try {
                            const body = JSON.parse(message.body);
                            handleStateUpdate(body);
                        } catch (e) {
                            console.error("STOMP Parse Error", e);
                        }
                    });

                    fetchLatestState();
                },
                onWebSocketClose: () => {
                    if (isMounted) setSystemState('THEIA_CORE_NOT_REACHABLE');
                },
                onStompError: () => {
                    if (isMounted) setSystemState('ERROR');
                },
            });

            client.activate();
            clientRef.current = client;
        };

        setupStompClient();

        return () => { 
            isMounted = false;
            if(clientRef.current) {
                clientRef.current.deactivate();
                clientRef.current = null;
            }
        };
    }, []);

    return { systemState, processState, runView, lastRawMessage };
};

// --- Sanitizers ---

function sanitizeSystem(val: any): SystemState {
    if (!val) return 'UNKNOWN';
    const s = String(val).replace(/['"]+/g, '').trim().toUpperCase();
    return s as SystemState;
}

function sanitizeProcess(val: any): ProcessState {
    if (!val || val === 'none') return 'NONE';
    const s = String(val).replace(/['"]+/g, '').trim().toUpperCase();
    return s as ProcessState;
}