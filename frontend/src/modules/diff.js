import hljs from 'highlight.js';
import { state } from './state.js';
import { escapeHtml } from './utils.js';
import { GetGitFileDiff } from '../../wailsjs/go/main/App';

// Callback for switching tabs
let onSwitchTab = null;

export function setDiffCallbacks(callbacks) {
  onSwitchTab = callbacks.switchTab;
}

export async function showGitDiff(filePath) {
  if (!state.activeProject) return;

  state.git.currentDiffFile = filePath;

  const diffTab = document.getElementById('diffTab');
  const diffTabName = diffTab?.querySelector('.diff-tab-name');
  if (diffTab && diffTabName) {
    const fileName = filePath.split('/').pop();
    diffTabName.textContent = `Diff: ${fileName}`;
    diffTab.classList.remove('hidden');
  }

  if (onSwitchTab) onSwitchTab('diff');

  const filenameEl = document.getElementById('diffFilename');
  const viewer = document.getElementById('diffViewer');

  filenameEl.textContent = filePath;
  viewer.innerHTML = `
    <div class="diff-split-view">
      <div class="diff-pane old-content">
        <div class="diff-pane-header">Old</div>
        <pre class="diff-content" id="diffOldContent">Loading...</pre>
      </div>
      <div class="diff-pane new-content">
        <div class="diff-pane-header">New</div>
        <pre class="diff-content" id="diffNewContent">Loading...</pre>
      </div>
    </div>
  `;

  try {
    const diff = await GetGitFileDiff(state.activeProject.path, filePath);
    const oldContent = document.getElementById('diffOldContent');
    const newContent = document.getElementById('diffNewContent');

    if (diff) {
      highlightDiffContent(oldContent, newContent, diff.oldContent || '', diff.newContent || '', filePath);
      setupDiffSyncScroll(oldContent, newContent);
    } else {
      oldContent.textContent = '(could not load)';
      newContent.textContent = '(could not load)';
    }
  } catch (err) {
    console.error('Failed to get diff:', err);
    viewer.innerHTML = `<div class="diff-error">Error loading diff: ${escapeHtml(err.toString())}</div>`;
  }
}

// Get language for highlight.js based on file extension
function getLanguageFromPath(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const langMap = {
    'js': 'javascript',
    'jsx': 'javascript',
    'ts': 'typescript',
    'tsx': 'typescript',
    'py': 'python',
    'rb': 'ruby',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'kt': 'kotlin',
    'swift': 'swift',
    'c': 'c',
    'cpp': 'cpp',
    'cc': 'cpp',
    'h': 'c',
    'hpp': 'cpp',
    'cs': 'csharp',
    'php': 'php',
    'html': 'html',
    'htm': 'html',
    'css': 'css',
    'scss': 'scss',
    'sass': 'scss',
    'less': 'less',
    'json': 'json',
    'xml': 'xml',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'sql': 'sql',
    'sh': 'bash',
    'bash': 'bash',
    'zsh': 'bash',
    'dockerfile': 'dockerfile',
    'vue': 'html',
    'svelte': 'html',
    'graphql': 'graphql',
    'gql': 'graphql',
    'prisma': 'prisma'
  };
  return langMap[ext] || null;
}

// Highlight code with syntax highlighting
function highlightCode(code, language) {
  if (language && hljs.getLanguage(language)) {
    try {
      return hljs.highlight(code, { language }).value;
    } catch (e) {
      console.warn('Highlight error:', e);
    }
  }
  // Fallback: try auto-detection
  try {
    return hljs.highlightAuto(code).value;
  } catch (e) {
    return escapeHtml(code);
  }
}

function highlightDiffContent(oldEl, newEl, oldText, newText, filePath) {
  const oldLines = (oldText || '').split('\n');
  const newLines = (newText || '').split('\n');
  const language = getLanguageFromPath(filePath);

  // Store raw lines for copy functionality
  state.diffSelection.filePath = filePath;

  // Highlight entire content first, then split by lines
  const oldHighlighted = highlightCode(oldText || '', language);
  const newHighlighted = highlightCode(newText || '', language);

  // Split highlighted content back into lines (preserve HTML tags)
  const oldHighlightedLines = splitHighlightedLines(oldHighlighted, oldLines.length);
  const newHighlightedLines = splitHighlightedLines(newHighlighted, newLines.length);

  const oldHtml = oldLines.map((line, i) => {
    const lineNum = String(i + 1).padStart(4, ' ');
    const inNew = newLines.includes(line);
    const cls = !inNew && line.trim() ? 'diff-removed' : '';
    const highlightedLine = oldHighlightedLines[i] || escapeHtml(line);
    return `<div class="diff-line ${cls}" data-pane="old" data-line="${i + 1}"><span class="line-num">${lineNum}</span><span class="line-code">${highlightedLine}</span></div>`;
  }).join('');

  const newHtml = newLines.map((line, i) => {
    const lineNum = String(i + 1).padStart(4, ' ');
    const inOld = oldLines.includes(line);
    const cls = !inOld && line.trim() ? 'diff-added' : '';
    const highlightedLine = newHighlightedLines[i] || escapeHtml(line);
    return `<div class="diff-line ${cls}" data-pane="new" data-line="${i + 1}"><span class="line-num">${lineNum}</span><span class="line-code">${highlightedLine}</span></div>`;
  }).join('');

  oldEl.innerHTML = oldHtml;
  newEl.innerHTML = newHtml;

  // Setup selection handlers
  setupDiffSelection(oldEl, oldLines, 'old');
  setupDiffSelection(newEl, newLines, 'new');
}

// Split highlighted HTML back into lines while preserving tags
function splitHighlightedLines(highlightedHtml, expectedLines) {
  const lines = [];
  let currentLine = '';
  let openTags = [];

  const chars = highlightedHtml.split('');
  let inTag = false;
  let currentTag = '';

  for (let i = 0; i < chars.length; i++) {
    const char = chars[i];

    if (char === '<') {
      inTag = true;
      currentTag = '<';
    } else if (char === '>') {
      inTag = false;
      currentTag += '>';
      currentLine += currentTag;

      // Track open/close tags
      if (currentTag.startsWith('</')) {
        openTags.pop();
      } else if (!currentTag.endsWith('/>') && !currentTag.startsWith('<!')) {
        const tagName = currentTag.match(/<(\w+)/)?.[1];
        if (tagName) openTags.push(tagName);
      }
      currentTag = '';
    } else if (inTag) {
      currentTag += char;
    } else if (char === '\n') {
      // Close all open tags at end of line
      let closeTags = '';
      for (let j = openTags.length - 1; j >= 0; j--) {
        closeTags += `</${openTags[j]}>`;
      }
      lines.push(currentLine + closeTags);

      // Reopen tags at start of next line
      currentLine = '';
      for (const tag of openTags) {
        currentLine += `<span class="hljs-${tag}">`;
      }
    } else {
      currentLine += char;
    }
  }

  // Push last line
  if (currentLine || lines.length < expectedLines) {
    let closeTags = '';
    for (let j = openTags.length - 1; j >= 0; j--) {
      closeTags += `</${openTags[j]}>`;
    }
    lines.push(currentLine + closeTags);
  }

  return lines;
}

// Setup synchronized scrolling between diff panes
function setupDiffSyncScroll(oldEl, newEl) {
  let activeScroller = null;
  let scrollTimeout = null;

  const handleScroll = (source, target, sourceName) => {
    // If another element is actively scrolling, ignore
    if (activeScroller && activeScroller !== sourceName) return;

    activeScroller = sourceName;

    // Sync by scroll percentage
    const maxScroll = source.scrollHeight - source.clientHeight;
    if (maxScroll > 0) {
      const scrollPercentage = source.scrollTop / maxScroll;
      const targetMaxScroll = target.scrollHeight - target.clientHeight;
      target.scrollTop = scrollPercentage * targetMaxScroll;
    }

    // Reset active scroller after scrolling stops
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      activeScroller = null;
    }, 150);
  };

  oldEl.addEventListener('scroll', () => handleScroll(oldEl, newEl, 'old'), { passive: true });
  newEl.addEventListener('scroll', () => handleScroll(newEl, oldEl, 'new'), { passive: true });
}

// Setup diff line selection
function setupDiffSelection(paneEl, rawLines, paneType) {
  state.diffSelection.rawLines = state.diffSelection.rawLines || {};
  state.diffSelection.rawLines[paneType] = rawLines;

  paneEl.addEventListener('click', (e) => {
    const lineEl = e.target.closest('.diff-line');
    if (!lineEl) return;

    const lineNum = parseInt(lineEl.dataset.line, 10);
    const clickedPane = lineEl.dataset.pane;

    // If shift key is held and we have a start selection in the same pane
    if (e.shiftKey && state.diffSelection.active && state.diffSelection.pane === clickedPane) {
      state.diffSelection.endLine = lineNum;
      updateDiffSelectionHighlight();
      showDiffCopyButton();
    } else {
      // Start new selection
      clearDiffSelection();
      state.diffSelection.active = true;
      state.diffSelection.pane = clickedPane;
      state.diffSelection.startLine = lineNum;
      state.diffSelection.endLine = lineNum;
      updateDiffSelectionHighlight();
      showDiffCopyButton();
    }
  });
}

// Update visual highlighting of selected lines
function updateDiffSelectionHighlight() {
  // Clear previous selection
  document.querySelectorAll('.diff-line.diff-selected').forEach(el => {
    el.classList.remove('diff-selected');
  });

  if (!state.diffSelection.active) return;

  const { pane, startLine, endLine } = state.diffSelection;
  const minLine = Math.min(startLine, endLine);
  const maxLine = Math.max(startLine, endLine);

  // Highlight lines in the selected range
  const paneEl = pane === 'old'
    ? document.getElementById('diffOldContent')
    : document.getElementById('diffNewContent');

  if (!paneEl) return;

  paneEl.querySelectorAll('.diff-line').forEach(el => {
    const lineNum = parseInt(el.dataset.line, 10);
    if (lineNum >= minLine && lineNum <= maxLine) {
      el.classList.add('diff-selected');
    }
  });
}

// Show copy button for selection
function showDiffCopyButton() {
  // Remove existing copy button
  const existingBtn = document.querySelector('.diff-copy-btn');
  if (existingBtn) existingBtn.remove();

  if (!state.diffSelection.active) return;

  const { pane, startLine, endLine } = state.diffSelection;
  const minLine = Math.min(startLine, endLine);
  const maxLine = Math.max(startLine, endLine);

  // Create copy button
  const btn = document.createElement('button');
  btn.className = 'diff-copy-btn';
  btn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    Copy (${minLine}-${maxLine})
  `;
  btn.onclick = () => copyDiffSelection();

  // Find the diff pane header and append button
  const paneEl = pane === 'old'
    ? document.querySelector('.diff-pane.old-content')
    : document.querySelector('.diff-pane.new-content');

  if (paneEl) {
    const header = paneEl.querySelector('.diff-pane-header');
    if (header) {
      header.appendChild(btn);
    }
  }
}

// Copy selected lines to clipboard
async function copyDiffSelection() {
  if (!state.diffSelection.active) return;

  const { pane, startLine, endLine, filePath, rawLines } = state.diffSelection;
  const minLine = Math.min(startLine, endLine);
  const maxLine = Math.max(startLine, endLine);

  const lines = rawLines[pane] || [];
  const selectedLines = lines.slice(minLine - 1, maxLine);

  // Format: filepath:startLine-endLine\n<content>
  const header = `// ${filePath}:${minLine}-${maxLine}`;
  const content = selectedLines.join('\n');
  const textToCopy = `${header}\n${content}`;

  try {
    await navigator.clipboard.writeText(textToCopy);

    // Show feedback
    const btn = document.querySelector('.diff-copy-btn');
    if (btn) {
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        Copied!
      `;
      btn.classList.add('copied');
      setTimeout(() => {
        clearDiffSelection();
      }, 1500);
    }
  } catch (err) {
    console.error('Failed to copy:', err);
  }
}

// Clear diff selection
export function clearDiffSelection() {
  state.diffSelection.active = false;
  state.diffSelection.pane = null;
  state.diffSelection.startLine = null;
  state.diffSelection.endLine = null;

  // Remove visual selection
  document.querySelectorAll('.diff-line.diff-selected').forEach(el => {
    el.classList.remove('diff-selected');
  });

  // Remove copy button
  const btn = document.querySelector('.diff-copy-btn');
  if (btn) btn.remove();
}
