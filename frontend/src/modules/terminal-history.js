/**
 * TerminalHistoryBuffer - przechowuje pełną historię terminala dla lazy loading
 *
 * xterm.js dostaje tylko widoczny fragment, a pełna historia jest tutaj
 * i ładowana dynamicznie przy scrollowaniu w górę.
 */

import { createModuleLogger } from './logger.js';

const logger = createModuleLogger('TerminalHistory');

export class TerminalHistoryBuffer {
  constructor(maxLines = 300) {
    this.lines = [];           // Tablica linii (strings z escape sequences)
    this.maxLines = maxLines;  // Max 300 linii (prosty bufor, bez lazy loading)
    this.partialLine = '';     // Niepełna linia (bez \n na końcu)
  }

  /**
   * Parsuje bytes na linie i dodaje do bufora
   * @param {Uint8Array} bytes - dane z terminala
   */
  appendBytes(bytes) {
    const text = new TextDecoder().decode(bytes);
    this.appendText(text);
  }

  /**
   * Parsuje tekst na linie i dodaje do bufora
   * @param {string} text - tekst z terminala
   */
  appendText(text) {
    // Połącz z poprzednią niepełną linią
    const fullText = this.partialLine + text;

    // Podziel na linie
    const parts = fullText.split('\n');

    // Ostatni element może być niepełną linią
    this.partialLine = parts.pop() || '';

    // Dodaj pełne linie do bufora
    if (parts.length > 0) {
      this.lines.push(...parts);

      // Prune jeśli przekroczono limit
      if (this.lines.length > this.maxLines) {
        const toRemove = this.lines.length - this.maxLines;
        this.lines.splice(0, toRemove);
        logger.debug('Pruned history buffer', { removed: toRemove, remaining: this.lines.length });
      }
    }
  }

  /**
   * Pobiera ostatnie N linii
   * @param {number} n - liczba linii
   * @returns {string[]} tablica linii
   */
  getLastLines(n) {
    const start = Math.max(0, this.lines.length - n);
    return this.lines.slice(start);
  }

  /**
   * Pobiera linie od indeksu
   * @param {number} startIndex - indeks początkowy
   * @param {number} count - liczba linii
   * @returns {string[]} tablica linii
   */
  getLines(startIndex, count) {
    const start = Math.max(0, startIndex);
    const end = Math.min(this.lines.length, start + count);
    return this.lines.slice(start, end);
  }

  /**
   * Pobiera linie przed podanym indeksem (dla lazy loading w górę)
   * @param {number} beforeIndex - indeks przed którym pobieramy
   * @param {number} count - liczba linii do pobrania
   * @returns {{ lines: string[], newStartIndex: number }}
   */
  getLinesBefore(beforeIndex, count) {
    const start = Math.max(0, beforeIndex - count);
    const lines = this.lines.slice(start, beforeIndex);
    return {
      lines,
      newStartIndex: start
    };
  }

  /**
   * Liczba linii w buforze
   * @returns {number}
   */
  get lineCount() {
    return this.lines.length;
  }

  /**
   * Czy bufor jest pusty
   * @returns {boolean}
   */
  get isEmpty() {
    return this.lines.length === 0 && this.partialLine === '';
  }

  /**
   * Czyści bufor
   */
  clear() {
    this.lines = [];
    this.partialLine = '';
  }

  /**
   * Zwraca statystyki bufora (dla debugowania)
   * @returns {{ lineCount: number, estimatedBytes: number }}
   */
  getStats() {
    let estimatedBytes = 0;
    for (const line of this.lines) {
      estimatedBytes += line.length * 2; // UTF-16
    }
    estimatedBytes += this.partialLine.length * 2;

    return {
      lineCount: this.lines.length,
      estimatedBytes,
      estimatedMB: (estimatedBytes / 1024 / 1024).toFixed(2)
    };
  }
}

// Singleton mapa buforów per terminal
const historyBuffers = new Map();

/**
 * Pobiera lub tworzy bufor historii dla terminala
 * @param {string} terminalId
 * @returns {TerminalHistoryBuffer}
 */
export function getHistoryBuffer(terminalId) {
  if (!historyBuffers.has(terminalId)) {
    historyBuffers.set(terminalId, new TerminalHistoryBuffer());
    logger.debug('Created history buffer', { terminalId });
  }
  return historyBuffers.get(terminalId);
}

/**
 * Usuwa bufor historii dla terminala
 * @param {string} terminalId
 */
export function removeHistoryBuffer(terminalId) {
  if (historyBuffers.has(terminalId)) {
    historyBuffers.delete(terminalId);
    logger.debug('Removed history buffer', { terminalId });
  }
}

/**
 * Zwraca wszystkie bufory (dla debugowania)
 * @returns {Map<string, TerminalHistoryBuffer>}
 */
export function getAllHistoryBuffers() {
  return historyBuffers;
}
