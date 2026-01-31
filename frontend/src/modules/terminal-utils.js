/**
 * Terminal utility functions for xterm.js
 */

/**
 * Fit terminal to container while preserving scroll position.
 *
 * Problem: xterm.js fitAddon.fit() doesn't preserve viewportY during resize,
 * causing the terminal to jump/scroll unexpectedly. Additionally, line numbers
 * change during resize due to line rewrapping.
 *
 * Solution: Use percentage-based scroll position instead of absolute line numbers.
 * This preserves the relative position in the scrollback buffer.
 *
 * @param {Terminal} terminal - xterm.js Terminal instance
 * @param {FitAddon} fitAddon - xterm.js FitAddon instance
 */
export function fitWithScrollPreservation(terminal, fitAddon) {
  const buffer = terminal.buffer.active;
  const scrollY = buffer.viewportY;
  const baseY = buffer.baseY;

  // Calculate scroll percentage (0 = top, 1 = bottom)
  const scrollPercent = baseY > 0 ? scrollY / baseY : 1;
  const wasAtBottom = scrollY >= baseY - 1; // Allow 1 line tolerance

  // Get old dimensions
  const oldCols = terminal.cols;

  fitAddon.fit();

  // Only restore scroll if dimensions actually changed
  if (oldCols === terminal.cols) {
    return;
  }

  requestAnimationFrame(() => {
    if (wasAtBottom) {
      terminal.scrollToBottom();
    } else {
      // Restore based on percentage
      const newScrollY = Math.round(scrollPercent * buffer.baseY);
      terminal.scrollToLine(newScrollY);
    }
  });
}
