// Replace with your actual backend URL
export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

export const METADATA_WS_URL = process.env.NEXT_PUBLIC_METADATA_WS_URL || 'ws://localhost:8000/ws';

// Your credentials from application.yml
const USER = 'SuperAdminFt';
const PASS = 'ChangeIsGood1!';

// Create the Basic Auth Header
// We use btoa() to encode credentials to Base64
export const AUTH_HEADER = {
  'Authorization': `Basic ${btoa(`${USER}:${PASS}`)}`,
  'Content-Type': 'application/json',
};

// Credentials for STOMP (WebSocket)
export const STOMP_CREDS = {
  login: USER,
  passcode: PASS,
};
