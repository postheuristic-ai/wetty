import crypto from 'crypto';
import pty from 'node-pty';
import { logger as getLogger } from '../shared/logger.js';
import { tinybuffer, FlowControlServer } from './flowcontrol.js';
import { sessionManager } from './sessionManager.js';
import { xterm } from './shared/xterm.js';
import { envVersionOr } from './spawn/env.js';
import type SocketIO from 'socket.io';

function generateSessionId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export async function spawn(
  socket: SocketIO.Socket,
  args: string[],
  existingSession?: { id: string; term: pty.IPty; address: string }
): Promise<void> {
  const logger = getLogger();

  if (existingSession) {
    // Reconnecting to existing session (called from server.ts)
    logger.info('Spawn called for existing session reconnection', { sessionId: existingSession.id });
    await attachSocketToSession(socket, existingSession);
    socket.emit('session-id', existingSession.id);
    return;
  }

  // Normal spawn flow for new sessions
  const sessionId = generateSessionId();
  const version = await envVersionOr(0);
  const cmd = version >= 9 ? ['-S', ...args] : args;

  logger.debug('Spawning new PTY', { cmd, sessionId });
  const term = pty.spawn('/usr/bin/env', cmd, xterm);
  const { pid } = term;
  const address = args[0] === 'ssh' ? args[1] : 'localhost';

  logger.info('Process Started on behalf of user', { pid, address, sessionId });

  const session = sessionManager.createSession(sessionId, term, args);
  await attachSocketToSession(socket, session);

  // Send session ID to client for reconnection
  socket.emit('session-id', sessionId);
}

async function attachSocketToSession(
  socket: SocketIO.Socket,
  session: { id: string; term: pty.IPty; address: string }
): Promise<void> {
  const logger = getLogger();

  // Attach socket to session
  sessionManager.attachSocket(session.id, socket);

  socket.emit('login');

  const send = tinybuffer(socket, 2, 524288);
  const fcServer = new FlowControlServer();

  // Set up data flow from terminal to client
  const onData = (data: string) => {
    send(data);
    if (fcServer.account(data.length)) {
      session.term.pause();
    }
  };

  session.term.onData(onData);

  // Set up socket event handlers
  const onResize = ({ cols, rows }: { cols: number; rows: number }) => {
    session.term.resize(cols, rows);
  };

  const onInput = (input: string) => {
    session.term.write(input);
  };

  const onCommit = (size: number) => {
    if (fcServer.commit(size)) {
      session.term.resume();
    }
  };

  const onDisconnect = () => {
    logger.info('Socket disconnected from session', {
      sessionId: session.id,
      socketId: socket.id
    });

    // Clean up event listeners
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (session.term as any).removeListener('data', onData);
    socket.off('resize', onResize);
    socket.off('input', onInput);
    socket.off('commit', onCommit);

    // Detach socket but keep session alive for potential reconnection
    sessionManager.detachSocket(session.id, socket);
  };

  socket
    .on('resize', onResize)
    .on('input', onInput)
    .on('disconnect', onDisconnect)
    .on('commit', onCommit);
}
