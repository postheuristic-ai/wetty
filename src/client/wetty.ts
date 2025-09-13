import { dom, library } from '@fortawesome/fontawesome-svg-core';
import { faCogs, faKeyboard } from '@fortawesome/free-solid-svg-icons';
import _ from 'lodash';

import '../assets/scss/styles.scss';
import '../assets/fonts/monaco-nerd-font.css';

import { disconnect } from './wetty/disconnect';
import { overlay } from './wetty/disconnect/elements';
import { verifyPrompt } from './wetty/disconnect/verify';
import { FileDownloader } from './wetty/download';
import { FlowControlClient } from './wetty/flowcontrol';
import { mobileKeyboard } from './wetty/mobile';
import { ConnectionResilience } from './wetty/resilience';
import { socket } from './wetty/socket';
import { terminal, Term } from './wetty/term';

// Setup for fontawesome
library.add(faCogs);
library.add(faKeyboard);
dom.watch();

function onResize(term: Term): () => void {
  return function resize() {
    term.resizeTerm();
  };
}

// Initialize connection resilience
const resilience = new ConnectionResilience(socket);
let currentTerm: Term | undefined;

// Set up reconnection callback to handle seamless reconnections
resilience.setReconnectCallback(() => {
  if (currentTerm && !_.isNull(overlay)) {
    overlay.style.display = 'none';
    currentTerm.resizeTerm();
    currentTerm.focus();
  }
});

socket.on('connect', () => {
  const term = terminal(socket);
  if (_.isUndefined(term)) return;

  currentTerm = term;

  if (!_.isNull(overlay)) overlay.style.display = 'none';
  window.addEventListener('beforeunload', verifyPrompt, false);
  window.addEventListener('resize', onResize(term), false);

  term.resizeTerm();
  term.focus();
  mobileKeyboard();
  const fileDownloader = new FileDownloader();
  const fcClient = new FlowControlClient();

  term.onData((data: string) => {
    socket.emit('input', data);
  });
  term.onResize((size: { cols: number; rows: number }) => {
    socket.emit('resize', size);
  });
  socket
    .on('data', (data: string) => {
      const remainingData = fileDownloader.buffer(data);
      const downloadLength = data.length - remainingData.length;
      if (downloadLength && fcClient.needsCommit(downloadLength)) {
        socket.emit('commit', fcClient.ackBytes);
      }
      if (remainingData) {
        if (fcClient.needsCommit(remainingData.length)) {
          term.write(remainingData, () =>
            socket.emit('commit', fcClient.ackBytes),
          );
        } else {
          term.write(remainingData);
        }
      }
    })
    .on('login', () => {
      term.writeln('');
      term.resizeTerm();
    })
    .on('logout', disconnect)
    .on('disconnect', (reason: string) => {
      // Use resilience system to determine if we should show disconnect UI
      if (!resilience.shouldSuppressDisconnectUI(reason)) {
        disconnect(reason);
      }
    })
    .on('error', (err: string | null) => {
      if (err && !resilience.shouldSuppressDisconnectUI(err)) {
        disconnect(err);
      }
    });
});

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registration) => {
        // eslint-disable-next-line no-console
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        // eslint-disable-next-line no-console
        console.log('SW registration failed: ', registrationError);
      });
  });
}
