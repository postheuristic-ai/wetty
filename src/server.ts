/**
 * Create WeTTY server
 * @module WeTTy
 */
import express from 'express';
import gc from 'gc-stats';
import { Gauge, collectDefaultMetrics } from 'prom-client';
import { getCommand } from './server/command.js';
import { gcMetrics } from './server/metrics.js';
import { server } from './server/socketServer.js';
import { spawn } from './server/spawn.js';
import {
  sshDefault,
  serverDefault,
  forceSSHDefault,
  defaultCommand,
} from './shared/defaults.js';
import { logger as getLogger } from './shared/logger.js';
import type { SSH, SSL, Server } from './shared/interfaces.js';
import type { Express } from 'express';
import type SocketIO from 'socket.io';

export * from './shared/interfaces.js';
export { logger as getLogger } from './shared/logger.js';

const wettyConnections = new Gauge({
  name: 'wetty_connections',
  help: 'number of active socket connections to wetty',
});

/**
 * Starts WeTTy Server
 * @name startServer
 * @returns Promise that resolves SocketIO server
 */
export const start = (
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  command: string = defaultCommand,
  forcessh: boolean = forceSSHDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> =>
  decorateServerWithSsh(express(), ssh, serverConf, command, forcessh, ssl);

export async function decorateServerWithSsh(
  app: Express,
  ssh: SSH = sshDefault,
  serverConf: Server = serverDefault,
  command: string = defaultCommand,
  forcessh: boolean = forceSSHDefault,
  ssl: SSL | undefined = undefined,
): Promise<SocketIO.Server> {
  const logger = getLogger();
  if (ssh.key) {
    logger.warn(`!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
! Password-less auth enabled using private key from ${ssh.key}.
! This is dangerous, anything that reaches the wetty server
! will be able to run remote operations without authentication.
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!`);
  }

  collectDefaultMetrics();
  gc().on('stats', gcMetrics);

  const io = await server(app, serverConf, ssl);
  /**
   * Wetty server connected too
   * @fires WeTTy#connnection
   */
  io.on('connection', async (socket: SocketIO.Socket) => {
    /**
     * @event wetty#connection
     * @name connection
     */
    logger.info('Connection accepted.', {
      socketId: socket.id,
      sessionId: socket.handshake.auth?.sessionId || 'none'
    });
    wettyConnections.inc();

    try {
      // Check for existing session first (before authentication)
      const sessionId = socket.handshake.auth?.sessionId as string;
      logger.info('Checking for existing session', { sessionId: sessionId || 'none', socketId: socket.id });

      if (sessionId) {
        // Try to reconnect to existing session
        const { sessionManager } = await import('./server/sessionManager.js');
        const existingSession = sessionManager.getSession(sessionId);

        if (existingSession) {
          logger.info('Reconnecting to existing session', { sessionId, socketId: socket.id, pid: existingSession.term.pid });
          await spawn(socket, existingSession.args, existingSession);
          logger.info('Session reconnection completed', { sessionId, socketId: socket.id });
          return; // Skip authentication flow
        } 
          logger.info('Session not found, proceeding with authentication', { sessionId, socketId: socket.id });
          socket.emit('clear-session-id');
        
      }

      // No existing session - proceed with normal authentication flow
      logger.info('Getting command for socket', { socketId: socket.id });
      const args = await getCommand(socket, ssh, command, forcessh);
      logger.info('Command Generated', { cmd: args.join(' '), socketId: socket.id });
      logger.info('Calling spawn for socket', { socketId: socket.id });
      await spawn(socket, args);
      logger.info('Spawn completed for socket', { socketId: socket.id });
    } catch (error) {
      logger.info('Error in connection handler', { err: error, socketId: socket.id });
      wettyConnections.dec();
    }
  });
  return io;
}
