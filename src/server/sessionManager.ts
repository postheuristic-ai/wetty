import { EventEmitter } from 'events';
import { logger as getLogger } from '../shared/logger.js';
import type pty from 'node-pty';
import type SocketIO from 'socket.io';

interface TerminalSession {
  id: string;
  term: pty.IPty;
  lastActivity: number;
  isActive: boolean;
  args: string[];
  address: string;
}

class SessionManager extends EventEmitter {
  private sessions: Map<string, TerminalSession> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly DISCONNECT_GRACE_PERIOD = 5 * 60 * 1000; // 5 minutes (increased for testing)

  constructor() {
    super();

    // Clean up inactive sessions every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupSessions();
    }, 5 * 60 * 1000);

    // Note: Don't auto-remove sessions when they end - let cleanup handle it
    // this.on('session-ended', (sessionId: string) => {
    //   this.removeSession(sessionId);
    // });
  }

  createSession(sessionId: string, term: pty.IPty, args: string[]): TerminalSession {
    const logger = getLogger();
    const address = args[0] === 'ssh' ? args[1] : 'localhost';

    const session: TerminalSession = {
      id: sessionId,
      term,
      lastActivity: Date.now(),
      isActive: true,
      args,
      address,
    };

    this.sessions.set(sessionId, session);
    logger.info('Session created', { sessionId, address, pid: term.pid });

    // Set up terminal event handlers
    term.onExit(({ exitCode }) => {
      logger.info('Terminal process exited', { sessionId, exitCode, pid: term.pid });
      // Don't immediately remove - let the cleanup process handle it
      // or remove it explicitly only if it was a clean exit
      this.emit('session-ended', sessionId, exitCode);
    });

    return session;
  }

  getSession(sessionId: string): TerminalSession | undefined {
    const session = this.sessions.get(sessionId);
    const logger = getLogger();

    if (session) {
      session.lastActivity = Date.now();
      logger.info('Session found and activity updated', { sessionId });
    } else {
      logger.info('Session not found', { sessionId, availableSessions: Array.from(this.sessions.keys()) });
    }

    return session;
  }

  attachSocket(sessionId: string, socket: SocketIO.Socket): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const logger = getLogger();
    session.isActive = true;
    session.lastActivity = Date.now();

    logger.info('Socket attached to session', { sessionId, socketId: socket.id });
    return true;
  }

  detachSocket(sessionId: string, socket: SocketIO.Socket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    const logger = getLogger();
    session.isActive = false;
    session.lastActivity = Date.now();

    logger.info('Socket detached from session', {
      sessionId,
      socketId: socket.id,
      willKeepAlive: true
    });

    // Don't kill the terminal immediately - give it a grace period
    // The cleanup process will handle it if not reconnected
  }

  removeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const logger = getLogger();
    logger.info('Session removed', { sessionId, pid: session.term.pid });

    try {
      logger.info('Killing terminal process', { sessionId, pid: session.term.pid });
      session.term.kill();
    } catch (error) {
      logger.warn('Error killing terminal process', { sessionId, error });
    }

    this.sessions.delete(sessionId);
    this.emit('session-removed', sessionId);
    return true;
  }

  private cleanupSessions(): void {
    const logger = getLogger();
    const now = Date.now();
    const sessionsToRemove: string[] = [];

    this.sessions.forEach((session, sessionId) => {
      const timeSinceActivity = now - session.lastActivity;

      // Remove sessions that have been inactive for too long
      if (timeSinceActivity > this.SESSION_TIMEOUT) {
        logger.info('Session timeout - cleaning up', { sessionId, timeSinceActivity });
        sessionsToRemove.push(sessionId);
      }
      // Remove sessions that have been disconnected beyond grace period
      else if (!session.isActive && timeSinceActivity > this.DISCONNECT_GRACE_PERIOD) {
        logger.info('Session grace period expired - cleaning up', { sessionId, timeSinceActivity });
        sessionsToRemove.push(sessionId);
      }
    });

    sessionsToRemove.forEach(sessionId => {
      this.removeSession(sessionId);
    });

    if (sessionsToRemove.length > 0) {
      logger.info('Session cleanup completed', { removedCount: sessionsToRemove.length });
    }
  }

  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(s => s.isActive);
  }

  getSessionCount(): number {
    return this.sessions.size;
  }

  shutdown(): void {
    const logger = getLogger();
    logger.info('SessionManager shutting down');

    clearInterval(this.cleanupInterval);

    // Clean up all sessions
    Array.from(this.sessions.keys()).forEach(sessionId => {
      this.removeSession(sessionId);
    });
  }
}

// Global singleton instance
const sessionManager = new SessionManager();

export { SessionManager, sessionManager, type TerminalSession };