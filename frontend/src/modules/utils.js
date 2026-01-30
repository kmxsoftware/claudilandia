// Escape HTML to prevent XSS
export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Convert text to base64, handling Unicode properly.
 * Uses TextEncoder for UTF-8 encoding, then converts to base64.
 * Safe for large strings (avoids stack overflow with spread operator).
 * @param {string} text - Text to encode
 * @returns {string} Base64 encoded string
 */
export function textToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Normalize URL input (handle shortcuts like :3000, localhost:3000, etc.)
export function normalizeUrl(input) {
  if (!input || !input.trim()) return null;

  let url = input.trim();

  // Handle port-only shortcuts like ":3000" or "3000"
  if (/^:?\d{2,5}$/.test(url)) {
    const port = url.replace(':', '');
    return `http://localhost:${port}`;
  }

  // Handle localhost with port like "localhost:3000"
  if (/^localhost(:\d+)?/.test(url)) {
    return `http://${url}`;
  }

  // Handle 127.0.0.1 with port
  if (/^127\.0\.0\.1(:\d+)?/.test(url)) {
    return `http://${url}`;
  }

  // Already has protocol
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  // Default to https for external sites
  return `https://${url}`;
}

// Check if URL is localhost (same-origin capable)
export function isLocalhostUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
