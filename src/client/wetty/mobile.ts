import _ from 'lodash';

let keyboardVisible = false;
let initialViewportHeight = 0;

/**
 * Handles keyboard state changes (logging only - resize is handled by term.ts)
 */
function handleKeyboardStateChange(isVisible: boolean): void {
  if (keyboardVisible === isVisible) return;

  keyboardVisible = isVisible;
  console.log(`[WeTTY Mobile Keyboard] Keyboard state changed to: ${isVisible ? 'VISIBLE' : 'HIDDEN'}`);
}

/**
 * Sets up mobile keyboard detection using Visual Viewport API
 */
function setupKeyboardDetection(): void {
  // Store initial viewport height
  initialViewportHeight = window.innerHeight;

  console.log('[WeTTY Mobile Keyboard] Setting up keyboard detection');

  // Visual Viewport API detection
  if (window.visualViewport) {
    console.log('[WeTTY Mobile Keyboard] Visual Viewport API available');

    const handleViewportChange = () => {
      const currentHeight = window.visualViewport!.height;
      const heightDifference = initialViewportHeight - currentHeight;
      const threshold = 150; // Minimum height change to consider keyboard visible

      const isVisible = heightDifference > threshold;
      console.log('[WeTTY Mobile Keyboard] Visual viewport change:', {
        initialHeight: initialViewportHeight,
        currentHeight,
        heightDifference,
        threshold,
        keyboardVisible: isVisible
      });
      handleKeyboardStateChange(isVisible);
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
  }

  // Focus events on xterm helper textarea
  /* document.addEventListener('focusin', (event) => {
    const target = event.target as Element;
    if (target?.classList.contains('xterm-helper-textarea')) {
      console.log('[WeTTY Mobile Keyboard] XTerm helper textarea focused - keyboard should be visible');
      setTimeout(() => {
        if (window.visualViewport) {
          const heightDifference = initialViewportHeight - window.visualViewport.height;
          const isVisible = heightDifference > 100;
          console.log('[WeTTY Mobile Keyboard] Focus-based detection:', {
            heightDifference,
            isVisible
          });
          handleKeyboardStateChange(isVisible);
        }
      }, 200);
    }
  });

  document.addEventListener('focusout', (event) => {
    const target = event.target as Element;
    if (target?.classList.contains('xterm-helper-textarea')) {
      console.log('[WeTTY Mobile Keyboard] XTerm helper textarea blurred - keyboard should be hidden');
      setTimeout(() => {
        const activeElement = document.activeElement;
        const keepKeyboardOpen = activeElement && (
          activeElement.classList.contains('xterm-helper-textarea') ||
          activeElement.hasAttribute('contenteditable') ||
          (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
        );

        if (!keepKeyboardOpen) {
          console.log('[WeTTY Mobile Keyboard] Setting keyboard hidden');
          handleKeyboardStateChange(false);
        }
      }, 100);
    }
  }); */
}

/**
 * Sets up mobile keyboard detection and terminal management
 */
export function mobileKeyboard(): void {
  const [screen] = Array.from(document.getElementsByClassName('xterm-screen'));
  if (_.isNull(screen)) return;

  // Make terminal focusable on mobile
  screen.setAttribute('contenteditable', 'true');
  screen.setAttribute('spellcheck', 'false');
  screen.setAttribute('autocorrect', 'false');
  screen.setAttribute('autocomplete', 'false');
  screen.setAttribute('autocapitalize', 'false');

  // Set up keyboard detection
  setupKeyboardDetection();

  /*
    term.scrollPort_.screen_.setAttribute('contenteditable', 'false');
  */
}
