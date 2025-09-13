import io from 'socket.io-client';

export const trim = (str: string): string => str.replace(/\/*$/, '');

// Session storage for reconnection
const SESSION_STORAGE_KEY = 'wetty_session_id';

function getStoredSessionId(): string | null {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Ignore storage errors
  }
}

function clearStoredSessionId(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage errors
  }
}

const socketBase = trim(window.location.pathname).replace(/ssh\/[^/]+$/, '');

export const socket = io(window.location.origin, {
  path: `${trim(socketBase)}/socket.io`,
  forceNew: false,
  reconnection: true,
  timeout: 5000,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  randomizationFactor: 0.5,
  transports: ['websocket', 'polling'],
  auth: (cb) => {
    const sessionId = getStoredSessionId();
    const authData = sessionId ? { sessionId } : {};
    cb(authData);
  }
});

// Handle session ID events
socket.on('session-id', (sessionId: string) => {
  storeSessionId(sessionId);
});

socket.on('logout', () => {
  clearStoredSessionId();
});

socket.on('clear-session-id', () => {
  clearStoredSessionId();
});

socket.on('reconnect_attempt', () => {
  // Update auth with current session ID before reconnection
  const sessionId = getStoredSessionId();
  if (sessionId) {
    socket.auth = { sessionId };
  }
});

export { storeSessionId, clearStoredSessionId, getStoredSessionId };
