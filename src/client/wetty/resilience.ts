import _ from 'lodash';
import { getStoredSessionId } from './socket';
import type { Socket } from 'socket.io-client';

interface ResilienceState {
  isBackground: boolean;
  reconnectAttempts: number;
  wasConnected: boolean;
  backgroundTime: number;
  lastForegroundCall: number;
}

class ConnectionResilience {
  private state: ResilienceState = {
    isBackground: false,
    reconnectAttempts: 0,
    wasConnected: false,
    backgroundTime: 0,
    lastForegroundCall: 0,
  };

  private socket: Socket;
  private onReconnectCallback?: () => void;

  constructor(socket: Socket) {
    this.socket = socket;
    this.setupEventListeners();
  }

  setReconnectCallback(callback: () => void): void {
    this.onReconnectCallback = callback;
  }

  private setupEventListeners(): void {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange.bind(this));
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', this.handlePageHide.bind(this));
      window.addEventListener('pageshow', this.handlePageShow.bind(this));
      window.addEventListener('focus', this.handleFocus.bind(this));
      window.addEventListener('blur', this.handleBlur.bind(this));
    }

    this.socket.on('connect', this.handleConnect.bind(this));
    this.socket.on('disconnect', this.handleDisconnect.bind(this));
    this.socket.on('reconnect', this.handleReconnect.bind(this));
    this.socket.on('reconnect_attempt', this.handleReconnectAttempt.bind(this));
    this.socket.on('reconnect_error', this.handleReconnectError.bind(this));
    this.socket.on('connect_error', this.handleConnectError.bind(this));
  }

  private handleVisibilityChange(): void {
    if (document.hidden) {
      this.state.isBackground = true;
      this.state.backgroundTime = Date.now();
    } else {
      this.handleForeground('visibilitychange');
    }
  }

  private handlePageHide(): void {
    this.state.isBackground = true;
    this.state.backgroundTime = Date.now();
  }

  private handlePageShow(): void {
    this.handleForeground('pageshow');
  }

  private handleFocus(): void {
    if (this.state.isBackground) {
      this.handleForeground('focus');
    }
  }

  private handleBlur(): void {
    this.state.isBackground = true;
    this.state.backgroundTime = Date.now();
  }

  private handleForeground(_source: string): void {
    const now = Date.now();

    // Debounce: ignore calls within 100ms of previous call
    if (now - this.state.lastForegroundCall < 100) {
      return;
    }

    this.state.lastForegroundCall = now;
    const wasBackground = this.state.isBackground;
    this.state.isBackground = false;

    if (wasBackground && this.state.backgroundTime > 0) {
      const backgroundDuration = Date.now() - this.state.backgroundTime;

      // If we were in background for more than 10 seconds and not connected, try to reconnect
      if (backgroundDuration > 10000 && !this.socket.connected) {
        this.attemptReconnection();
      }
    }

    this.state.backgroundTime = 0;
  }

  private handleConnect(): void {
    this.state.wasConnected = true;
    this.state.reconnectAttempts = 0;
  }

  private handleDisconnect(reason: string): void {
    // Don't show disconnect UI for transport errors when we're in background
    // or when it's likely due to iOS backgrounding
    if (this.state.isBackground && (
      reason === 'transport error' ||
      reason === 'transport close' ||
      reason === 'ping timeout'
    )) {
      // Silently handle background disconnections
      return;
    }

    // For other disconnect reasons or when in foreground, handle normally
    if (!this.state.isBackground) {
      this.state.wasConnected = false;
    }
  }

  private handleReconnect(): void {
    this.state.reconnectAttempts = 0;
    if (this.onReconnectCallback && this.state.wasConnected) {
      this.onReconnectCallback();
    }
  }

  private handleReconnectAttempt(attempt: number): void {
    this.state.reconnectAttempts = attempt;
  }

  private handleReconnectError(): void {
    // If we're in background and having reconnect issues, be more patient
    if (this.state.isBackground) {
      // Extend timeout for background reconnections
    }
  }

  private handleConnectError(_error: Error): void {
    // Handle connection errors more gracefully when in background
    if (this.state.isBackground) {
      // Don't show error UI for background connection errors
    }
  }

  private attemptReconnection(): void {
    if (!this.socket.connected && this.state.wasConnected) {
      // Update auth with stored session ID for reconnection
      const sessionId = getStoredSessionId();

      if (sessionId) {
        this.socket.auth = { sessionId };
      }

      // Force a reconnection attempt
      this.socket.connect();
    }
  }

  // Check if we should suppress disconnect UI
  shouldSuppressDisconnectUI(reason: string): boolean {
    return this.state.isBackground && (
      reason === 'transport error' ||
      reason === 'transport close' ||
      reason === 'ping timeout' ||
      reason === 'io server disconnect'
    );
  }

  // Get connection state for debugging
  getState(): ResilienceState {
    return { ...this.state };
  }
}

export { ConnectionResilience };