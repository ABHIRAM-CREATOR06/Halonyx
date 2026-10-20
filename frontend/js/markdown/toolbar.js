/**
 * Halonyx Professional Mode - Markdown Toolbar
 * DOM wiring for the markdown toolbar
 * Uses global window.HalonyxMarkdown object
 */

(function() {
  'use strict';

  // Reference to actions module
  const actions = window.HalonyxMarkdownActions;

  // Toolbar state
  let toolbarInitialized = false;
  let toolbarVisible = false;

  /**
   * Get the current professional mode state from localStorage
   */
  function getProfessionalMode() {
    try {
      var stored = localStorage.getItem('halonyx.professionalMode');
      return stored === 'true';
    } catch (e) {
      return false;
    }
  }

  /**
   * Set the professional mode state in localStorage
   */
  function setProfessionalMode(enabled) {
    try {
      localStorage.setItem('halonyx.professionalMode', String(enabled));
    } catch (e) {
      // localStorage might be disabled
    }
  }

  /**
   * Toggle professional mode
   */
  function toggleProfessionalMode() {
    var current = getProfessionalMode();
    setProfessionalMode(!current);
    return !current;
  }

  /**
   * Button definitions for the markdown toolbar
   */
  const toolbarButtons = [
    { 
      type: 'bold', 
      icon: 'format_bold', 
      label: 'Bold', 
      action: function(textarea) { applyAction(textarea, actions.toggleBold); },
      shortcut: 'Ctrl+B,Meta+B'
    },
    { 
      type: 'italic', 
      icon: 'format_italic', 
      label: 'Italic', 
      action: function(textarea) { applyAction(textarea, actions.toggleItalic); },
      shortcut: 'Ctrl+I,Meta+I'
    },
    { 
      type: 'strikethrough', 
      icon: 'format_strikethrough', 
      label: 'Strikethrough', 
      action: function(textarea) { applyAction(textarea, actions.toggleStrikethrough); },
      shortcut: 'Ctrl+Shift+X,Meta+Shift+X'
    },
    { 
      type: 'inline_code', 
      icon: 'code', 
      label: 'Inline Code', 
      action: function(textarea) { applyAction(textarea, actions.toggleInlineCode); },
      shortcut: 'Ctrl+E,Meta+E'
    },
    { 
      type: 'divider-1',
      icon: null,
      label: null,
      action: null,
      shortcut: null
    },
    { 
      type: 'h1', 
      icon: 'looks_one', 
      label: 'Heading 1', 
      action: function(textarea) { applyAction(textarea, function(params) { return actions.toggleHeading(params, 1); }); },
      shortcut: null
    },
    { 
      type: 'h2', 
      icon: 'looks_two', 
      label: 'Heading 2', 
      action: function(textarea) { applyAction(textarea, function(params) { return actions.toggleHeading(params, 2); }); },
      shortcut: null
    },
    { 
      type: 'h3', 
      icon: 'looks_3', 
      label: 'Heading 3', 
      action: function(textarea) { applyAction(textarea, function(params) { return actions.toggleHeading(params, 3); }); },
      shortcut: null
    },
    { 
      type: 'divider-2',
      icon: null,
      label: null,
      action: null,
      shortcut: null
    },
    { 
      type: 'bullet_list', 
      icon: 'format_list_bulleted', 
      label: 'Bullet List', 
      action: function(textarea) { applyAction(textarea, actions.toggleBulletList); },
      shortcut: null
    },
    { 
      type: 'numbered_list', 
      icon: 'format_list_numbered', 
      label: 'Numbered List', 
      action: function(textarea) { applyAction(textarea, actions.toggleNumberedList); },
      shortcut: null
    },
    { 
      type: 'task_list', 
      icon: 'checklist', 
      label: 'Task List', 
      action: function(textarea) { applyAction(textarea, actions.toggleTaskList); },
      shortcut: null
    },
    { 
      type: 'divider-3',
      icon: null,
      label: null,
      action: null,
      shortcut: null
    },
    { 
      type: 'quote', 
      icon: 'format_quote', 
      label: 'Quote', 
      action: function(textarea) { applyAction(textarea, actions.toggleBlockquote); },
      shortcut: null
    },
    { 
      type: 'code_block', 
      icon: 'code_blocks', 
      label: 'Code Block', 
      action: function(textarea) { applyAction(textarea, actions.toggleCodeBlock); },
      shortcut: null
    },
    { 
      type: 'link', 
      icon: 'link', 
      label: 'Link', 
      action: function(textarea) { applyAction(textarea, actions.insertLink); },
      shortcut: 'Ctrl+K,Meta+K'
    },
    { 
      type: 'hr', 
      icon: 'horizontal_rule', 
      label: 'Horizontal Rule', 
      action: function(textarea) { applyAction(textarea, actions.insertHorizontalRule); },
      shortcut: null
    },
    { 
      type: 'table', 
      icon: 'table_chart', 
      label: 'Table', 
      action: function(textarea) { applyAction(textarea, actions.insertTable); },
      shortcut: null
    }
  ];

  /**
   * Apply a markdown action to the textarea
   */
  function applyAction(textarea, action) {
    var selStart = textarea.selectionStart;
    var selEnd = textarea.selectionEnd;
    var text = textarea.value;
    
    var result = action({ text: text, selStart: selStart, selEnd: selEnd });
    
    textarea.value = result.text;
    textarea.selectionStart = result.selStart;
    textarea.selectionEnd = result.selEnd;
    
    // Trigger input event for DLP and other listeners
    var inputEvent = new Event('input', { bubbles: true });
    textarea.dispatchEvent(inputEvent);
    
    // Focus back on textarea
    textarea.focus();
  }

  /**
   * Create the toolbar HTML
   */
  function createToolbarHTML() {
    var html = '<div class="md-toolbar" role="toolbar" aria-label="Markdown formatting toolbar">';
    
    toolbarButtons.forEach(function(btn) {
      if (btn.type.startsWith('divider')) {
        html += '<div class="md-toolbar-divider" role="separator"></div>';
      } else {
        var ariaKeyshortcuts = btn.shortcut ? btn.shortcut.replace(/Meta/g, 'Meta').replace(/Ctrl/g, 'Control').replace(/\+/g, ' ') : null;
        html += `
          <button type="button" class="md-toolbar-btn" data-type="${btn.type}"
            title="${btn.label}${btn.shortcut ? ` (${btn.shortcut.replace(/Meta/g, 'Cmd')})` : ''}"
            aria-label="${btn.label}" ${ariaKeyshortcuts ? `aria-keyshortcuts="${ariaKeyshortcuts}"` : ''}>
            <span class="material-icons-outlined" aria-hidden="true">${btn.icon}</span>
          </button>`;
      }
    });
    
    html += '</div>';
    return html;
  }

  /**
   * Create the Professional Mode toggle button HTML
   */
  function createToggleButtonHTML() {
    var isEnabled = getProfessionalMode();
    return `
      <button
        type="button"
        id="professional-mode-toggle"
        class="md-professional-toggle ${isEnabled ? 'enabled' : ''}"
        aria-label="Professional Mode"
        aria-pressed="${isEnabled}"
        aria-keyshortcuts="Alt+Shift+P"
        title="Professional Mode (Alt+Shift+P)"
      >
        <span class="material-icons-outlined" aria-hidden="true">${isEnabled ? 'code' : 'text_fields'}</span>
        <span class="md-toggle-label">Professional Mode</span>
      </button>
    `;
  }

  /**
   * Initialize the markdown toolbar
   */
  function initMarkdownToolbar() {
    if (toolbarInitialized) return;
    
    // Find the chat pane or composer container
    var chatPane = document.getElementById('chat-pane');
    var composer = document.querySelector('.composer');
    
    // We need at least the chat pane to exist
    if (!chatPane) {
      console.warn('[Markdown] Chat pane not found, retrying...');
      setTimeout(initMarkdownToolbar, 100);
      return;
    }
    
    // Check if toolbar already exists
    if (document.querySelector('.md-toolbar-container')) {
      return;
    }
    
    // Create toolbar container
    var toolbarContainer = document.createElement('div');
    toolbarContainer.className = 'md-toolbar-container';
    
    // Create and insert toolbar
    toolbarContainer.innerHTML = createToolbarHTML();
    
    // Create and insert toggle button
    var toggleBtn = document.createElement('div');
    toggleBtn.className = 'md-toggle-wrapper';
    toggleBtn.innerHTML = createToggleButtonHTML();
    
    // Build one Slack-like composer shell for formatting, preview and writing.
    var composerInner = composer && composer.querySelector('.composer-inner');
    if (composer && composerInner) {
      var shell = document.createElement('div');
      shell.className = 'md-composer-shell';
      var topbar = document.createElement('div');
      topbar.className = 'md-composer-topbar';
      var previewTabs = document.createElement('div');
      previewTabs.className = 'md-preview-tabs hidden';
      previewTabs.innerHTML = '<button type="button" class="md-preview-tab active" data-view="write">Write</button><button type="button" class="md-preview-tab" data-view="preview">Preview</button>';
      var previewPanel = document.createElement('div');
      previewPanel.id = 'md-preview-panel';
      previewPanel.className = 'md-preview-panel hidden markdown-content';
      composer.insertBefore(shell, composerInner);
      shell.appendChild(topbar);
      topbar.appendChild(toolbarContainer);
      topbar.appendChild(toggleBtn);
      topbar.appendChild(previewTabs);
      shell.appendChild(previewPanel);
      shell.appendChild(composerInner);
      composer.classList.add('md-composer-mode');
      previewTabs.addEventListener('click', function (event) {
        var tab = event.target.closest('.md-preview-tab');
        if (!tab) return;
        var previewing = tab.dataset.view === 'preview';
        previewTabs.querySelectorAll('.md-preview-tab').forEach(function (item) { item.classList.toggle('active', item === tab); });
        composerInner.classList.toggle('hidden', previewing);
        toolbarContainer.classList.toggle('hidden', previewing);
        previewPanel.classList.toggle('hidden', !previewing);
        if (previewing) {
          try { previewPanel.innerHTML = window.HalonyxMarkdownRender.renderMarkdown(document.getElementById('message-input').value); }
          catch (_) { previewPanel.textContent = 'Message exceeds the 10000 character limit.'; }
        }
      });
    } else {
      chatPane.appendChild(toggleBtn);
      chatPane.appendChild(toolbarContainer);
    }
    
    // Initialize state
    updateToolbarVisibility();
    
    // Add event listeners
    setupToolbarListeners();
    setupKeyboardShortcuts();
    
    toolbarInitialized = true;
    
    console.log('[Markdown] Toolbar initialized');
  }

  /**
   * Update toolbar visibility based on professional mode state
   */
  function updateToolbarVisibility() {
    var isEnabled = getProfessionalMode();
    var toolbar = document.querySelector('.md-toolbar-container');
    var toggleBtn = document.getElementById('professional-mode-toggle');
    
    if (toolbar) {
      toolbar.classList.toggle('block', isEnabled);
    }
    
    if (toggleBtn) {
      toggleBtn.classList.toggle('enabled', isEnabled);
      toggleBtn.setAttribute('aria-pressed', String(isEnabled));
      var icon = toggleBtn.querySelector('.material-icons-outlined');
      if (icon) {
        icon.textContent = isEnabled ? 'code' : 'text_fields';
      }
    }

    var previewTabs = document.querySelector('.md-preview-tabs');
    if (previewTabs) previewTabs.classList.toggle('hidden', !isEnabled);
    var previewPanel = document.getElementById('md-preview-panel');
    if (!isEnabled && previewPanel) {
      previewPanel.classList.add('hidden');
      var composerInner = document.querySelector('.composer-inner');
      if (composerInner) composerInner.classList.remove('hidden');
      previewTabs.querySelectorAll('.md-preview-tab').forEach(function (tab) { tab.classList.toggle('active', tab.dataset.view === 'write'); });
    }
    
    toolbarVisible = isEnabled;
  }

  /**
   * Setup toolbar button click listeners
   */
  function setupToolbarListeners() {
    // Toggle button
    var toggleBtn = document.getElementById('professional-mode-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        var newState = toggleProfessionalMode();
        updateToolbarVisibility();
        updateComposerBehavior();
      });
    }
    
    // Toolbar buttons
    var toolbar = document.querySelector('.md-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function(e) {
        var btn = e.target.closest('.md-toolbar-btn');
        if (!btn) return;
        
        var type = btn.dataset.type;
        var buttonDef = null;
        for (var i = 0; i < toolbarButtons.length; i++) {
          if (toolbarButtons[i].type === type) {
            buttonDef = toolbarButtons[i];
            break;
          }
        }
        if (buttonDef && buttonDef.action) {
          var textarea = document.getElementById('message-input');
          if (textarea) {
            buttonDef.action(textarea);
          }
        }
      });
    }
  }

  /**
   * Setup keyboard shortcuts
   */
  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(e) {
      // Check if we're in a textarea
      var textarea = document.activeElement;
      if (!textarea || textarea.tagName !== 'TEXTAREA') {
        return;
      }
      
      // Only handle if it's message-input or thread-message-input
      if (textarea.id !== 'message-input' && textarea.id !== 'thread-message-input') {
        return;
      }
      
      var isProfessional = getProfessionalMode();
      if (!isProfessional) {
        // Only handle Alt+Shift+P for toggle
        if (e.altKey && e.shiftKey && e.code === 'KeyP') {
          e.preventDefault();
          var newState = toggleProfessionalMode();
          updateToolbarVisibility();
          updateComposerBehavior();
        }
        return;
      }
      
      // Handle shortcuts
      var isCtrlOrMeta = e.ctrlKey || e.metaKey;
      
      // Bold: Ctrl/Cmd+B
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        applyAction(textarea, actions.toggleBold);
      }
      // Italic: Ctrl/Cmd+I
      else if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        applyAction(textarea, actions.toggleItalic);
      }
      // Strikethrough: Ctrl/Cmd+Shift+X
      else if (isCtrlOrMeta && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        applyAction(textarea, actions.toggleStrikethrough);
      }
      // Insert Link: Ctrl/Cmd+K
      else if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        applyAction(textarea, actions.insertLink);
      }
      // Inline Code: Ctrl/Cmd+E
      else if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        applyAction(textarea, actions.toggleInlineCode);
      }
      // Professional Mode toggle: Alt+Shift+P
      else if (e.altKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault();
        var newState = toggleProfessionalMode();
        updateToolbarVisibility();
        updateComposerBehavior();
      }
      // Ctrl/Cmd+Enter to send (in addition to regular Enter)
      else if (isCtrlOrMeta && e.key === 'Enter' && !e.isComposing) {
        var sendBtn = textarea.id === 'message-input' ? document.getElementById('send-btn') : document.getElementById('thread-send-btn');
        if (sendBtn) {
          e.preventDefault();
          sendBtn.click();
        }
      }
    });
  }

  /**
   * Update composer behavior based on professional mode
   * In professional mode: Ctrl+Enter sends, Shift+Enter adds newline
   * In normal mode: Enter sends, Shift+Enter adds newline
   */
  function updateComposerBehavior() {
    var isProfessional = getProfessionalMode();
    var textarea = document.getElementById('message-input');
    var threadTextarea = document.getElementById('thread-message-input');
    
    // Helper to apply handler to a textarea
    function applyHandler(element, handler) {
      if (element && element._markdownKeyHandler) {
        element.removeEventListener('keypress', element._markdownKeyHandler);
      }
      if (element) {
        element.addEventListener('keypress', handler);
        element._markdownKeyHandler = handler;
      }
    }
    
    // In professional mode, we need to handle Enter differently
    if (isProfessional) {
      var handler = function(e) {
        // Return early if IME is composing
        if (e.isComposing) return;
        // Shift+Enter: insert newline
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          var cursorPos = this.selectionStart;
          var before = this.value.substring(0, cursorPos);
          var after = this.value.substring(cursorPos);
          this.value = before + '\n' + after;
          this.selectionStart = cursorPos + 1;
          this.selectionEnd = cursorPos + 1;
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      applyHandler(textarea, handler);
      applyHandler(threadTextarea, handler);
    } else {
      // In normal mode, the existing behavior is fine
      // But we need to make sure Shift+Enter still works for newline
      var handler = function(e) {
        // Return early if IME is composing
        if (e.isComposing) return;
        if (e.key === 'Enter' && e.shiftKey) {
          e.preventDefault();
          var cursorPos = this.selectionStart;
          var before = this.value.substring(0, cursorPos);
          var after = this.value.substring(cursorPos);
          this.value = before + '\n' + after;
          this.selectionStart = cursorPos + 1;
          this.selectionEnd = cursorPos + 1;
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }
      };
      applyHandler(textarea, handler);
      applyHandler(threadTextarea, handler);
    }
  }

  /**
   * Initialize markdown functionality
   * Call this after DOM is ready
   */
  function initMarkdown() {
    initMarkdownToolbar();
    updateComposerBehavior();
  }

  // Auto-initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarkdown);
  } else {
    initMarkdown();
  }

  // Expose functions to global scope
  window.HalonyxMarkdownToolbar = {
    init: initMarkdown,
    updateVisibility: updateToolbarVisibility,
    updateComposerBehavior: updateComposerBehavior,
    getProfessionalMode: getProfessionalMode
  };

})();
