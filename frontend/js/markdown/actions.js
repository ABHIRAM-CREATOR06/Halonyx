/**
 * Halonyx Professional Mode - Markdown Actions
 * Pure functions for markdown text manipulation
 * No DOM access - only text and selection manipulation
 */

(function() {
  'use strict';

  /**
   * Wrap selection with markdown syntax
   * @param {Object} params - {text, selStart, selEnd}
   * @param {string} params.text - The full text
   * @param {number} params.selStart - Selection start index
   * @param {number} params.selEnd - Selection end index
   * @param {string} prefix - Text to insert before selection
   * @param {string} suffix - Text to insert after selection
   * @returns {Object} - {text, selStart, selEnd}
   */
  function wrapSelection(params, prefix, suffix) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var hasSelection = selStart !== selEnd;
    var selection = text.substring(selStart, selEnd);
    
    if (hasSelection) {
      // Check if already wrapped
      var before = text.substring(0, selStart);
      var after = text.substring(selEnd);
      
      // Check if already wrapped with the same markers
      if (before.endsWith(prefix) && after.startsWith(suffix)) {
        // Unwrap: remove the prefix and suffix
        var newText = before.slice(0, -prefix.length) + selection + after.slice(suffix.length);
        return {
          text: newText,
          selStart: selStart - prefix.length,
          selEnd: selEnd - prefix.length
        };
      }
      
      // Wrap the selection
      var newText = before + prefix + selection + suffix + after;
      return {
        text: newText,
        selStart: selStart + prefix.length,
        selEnd: selEnd + prefix.length
      };
    } else {
      // No selection - insert prefix and suffix at cursor, with cursor between them
      var before = text.substring(0, selStart);
      var after = text.substring(selStart);
      var newText = before + prefix + suffix + after;
      return {
        text: newText,
        selStart: selStart + prefix.length,
        selEnd: selStart + prefix.length
      };
    }
  }

  /**
   * Toggle bold formatting (**text**)
   */
  function toggleBold(params) {
    return wrapSelection(params, '**', '**');
  }

  /**
   * Toggle italic formatting (*text* or _text_)
   */
  function toggleItalic(params) {
    return wrapSelection(params, '*', '*');
  }

  /**
   * Toggle strikethrough formatting (~~text~~)
   */
  function toggleStrikethrough(params) {
    return wrapSelection(params, '~~', '~~');
  }

  /**
   * Toggle inline code formatting (`text`)
   */
  function toggleInlineCode(params) {
    return wrapSelection(params, '`', '`');
  }

  /**
   * Toggle heading - wraps line with # symbols
   * @param {number} level - 1, 2, or 3
   */
  function toggleHeading(params, level) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var prefix = '';
    for (var i = 0; i < level; i++) {
      prefix += '#';
    }
    prefix += ' ';
    
    // Find line start and end
    var lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    var lineEnd = text.indexOf('\n', selStart);
    var actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
    
    var lineText = text.substring(lineStart, actualLineEnd);
    
    // Check if line already starts with heading markers
    var headingPrefix = lineText.match(/^#+\s*/);
    
    if (headingPrefix) {
      // Remove existing heading
      var newText = text.substring(0, lineStart) + lineText.slice(headingPrefix[0].length) + text.substring(actualLineEnd);
      var newSelStart = Math.max(selStart - headingPrefix[0].length, lineStart);
      var newSelEnd = Math.max(selEnd - headingPrefix[0].length, lineStart);
      return { text: newText, selStart: newSelStart, selEnd: newSelEnd };
    } else {
      // Add heading
      var newText = text.substring(0, lineStart) + prefix + lineText + text.substring(actualLineEnd);
      return {
        text: newText,
        selStart: selStart + prefix.length,
        selEnd: selEnd + prefix.length
      };
    }
  }

  /**
   * Toggle bullet list (- item)
   */
  function toggleBulletList(params) {
    return toggleList(params, '- ');
  }

  /**
   * Toggle numbered list (1. item)
   */
  function toggleNumberedList(params) {
    var text = params.text;
    var selStart = params.selStart;
    
    // For numbered lists, we need to find the position in the list
    var lines = text.substring(0, selStart).split('\n');
    var currentLineIndex = lines.length - 1;
    var number = currentLineIndex + 1;
    return toggleList(params, number + '. ');
  }

  /**
   * Generic list toggle helper
   */
  function toggleList(params, prefix) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    // Find line start
    var lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    var lineEnd = text.indexOf('\n', selStart);
    var actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
    
    var lineText = text.substring(lineStart, actualLineEnd);
    
    // Check if line already starts with list marker
    var listPrefix = lineText.match(/^([\-+*]|\d+\.)\s*/);
    
    if (listPrefix) {
      // Remove list marker
      var newText = text.substring(0, lineStart) + lineText.slice(listPrefix[0].length) + text.substring(actualLineEnd);
      var newSelStart = Math.max(selStart - listPrefix[0].length, lineStart);
      var newSelEnd = Math.max(selEnd - listPrefix[0].length, lineStart);
      return { text: newText, selStart: newSelStart, selEnd: newSelEnd };
    } else {
      // Add list marker
      var newText = text.substring(0, lineStart) + prefix + lineText + text.substring(actualLineEnd);
      return {
        text: newText,
        selStart: selStart + prefix.length,
        selEnd: selEnd + prefix.length
      };
    }
  }

  /**
   * Toggle task list (- [ ] item or - [x] item)
   */
  function toggleTaskList(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    var lineEnd = text.indexOf('\n', selStart);
    var actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
    
    var lineText = text.substring(lineStart, actualLineEnd);
    
    // Check for existing task list item
    var taskMatch = lineText.match(/^(\s*[-+*]\s+)\[([ xX]?)\]\s*(.*)/);
    
    if (taskMatch) {
      // Toggle the checkbox
      var listPrefix = taskMatch[1];
      var checked = taskMatch[2];
      var content = taskMatch[3];
      var newChecked = (checked === ' ' || checked === '') ? 'x' : ' ';
      var newLine = listPrefix + '[ ' + newChecked + ' ] ' + content;
      var newText = text.substring(0, lineStart) + newLine + text.substring(actualLineEnd);
      
      // Adjust selection - [x] and [ ] are same length
      return {
        text: newText,
        selStart: selStart,
        selEnd: selEnd
      };
    } else {
      // Check if it's a regular list item
      var listMatch = lineText.match(/^(\s*[-+*]\s+)(.*)/);
      if (listMatch) {
        var listPrefix = listMatch[1];
        var content = listMatch[2];
        var newLine = listPrefix + '[ ] ' + content;
        var newText = text.substring(0, lineStart) + newLine + text.substring(actualLineEnd);
        return {
          text: newText,
          selStart: selStart + 4, // [ ] + space
          selEnd: selEnd + 4
        };
      } else {
        // Create new task list item
        var newLine = '- [ ] ' + lineText;
        var newText = text.substring(0, lineStart) + newLine + text.substring(actualLineEnd);
        return {
          text: newText,
          selStart: selStart + 6, // - [ ] + space
          selEnd: selEnd + 6
        };
      }
    }
  }

  /**
   * Toggle blockquote (> text)
   */
  function toggleBlockquote(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var hasSelection = selStart !== selEnd;
    
    if (hasSelection) {
      // Multi-line selection - prefix each line
      var selection = text.substring(selStart, selEnd);
      var lines = selection.split('\n');
      var before = text.substring(0, selStart);
      var after = text.substring(selEnd);
      
      // Check if all lines already have blockquote prefix
      var allPrefixed = true;
      for (var i = 0; i < lines.length; i++) {
        if (!lines[i].startsWith('> ')) {
          allPrefixed = false;
          break;
        }
      }
      
      if (allPrefixed) {
        // Remove prefix from all lines
        var newLines = [];
        for (var j = 0; j < lines.length; j++) {
          if (lines[j].startsWith('> ')) {
            newLines.push(lines[j].slice(2));
          } else {
            newLines.push(lines[j]);
          }
        }
        var newText = before + newLines.join('\n') + after;
        return { text: newText, selStart: selStart, selEnd: selEnd - (lines.length * 2) };
      } else {
        // Add prefix to all lines
        var newLines = [];
        for (var k = 0; k < lines.length; k++) {
          if (lines[k].length > 0) {
            newLines.push('> ' + lines[k]);
          } else {
            newLines.push('> ');
          }
        }
        var newText = before + newLines.join('\n') + after;
        return { text: newText, selStart: selStart, selEnd: selEnd + (lines.length * 2) };
      }
    } else {
      // Single line
      var lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
      var lineEnd = text.indexOf('\n', selStart);
      var actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
      
      var lineText = text.substring(lineStart, actualLineEnd);
      
      if (lineText.startsWith('> ')) {
        var newText = text.substring(0, lineStart) + lineText.slice(2) + text.substring(actualLineEnd);
        return {
          text: newText,
          selStart: Math.max(selStart - 2, lineStart),
          selEnd: Math.max(selEnd - 2, lineStart)
        };
      } else {
        var newText = text.substring(0, lineStart) + '> ' + lineText + text.substring(actualLineEnd);
        return {
          text: newText,
          selStart: selStart + 2,
          selEnd: selEnd + 2
        };
      }
    }
  }

  /**
   * Toggle code block (```language\ncode\n```)
   */
  function toggleCodeBlock(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var hasSelection = selStart !== selEnd;
    
    if (hasSelection) {
      var selection = text.substring(selStart, selEnd);
      var before = text.substring(0, selStart);
      var after = text.substring(selEnd);
      
      // Check if already in code block
      var lines = selection.split('\n');
      var firstLine = lines[0];
      var lastLine = lines[lines.length - 1];
      
      if (firstLine.startsWith('```') && lastLine.endsWith('```')) {
        // Remove code block markers
        var newFirstLine = firstLine.replace(/^```[\s\S]*?$/, '');
        var newLastLine = lastLine.replace(/^```[\s\S]*?$/, '');
        var newLines = [newFirstLine];
        for (var i = 1; i < lines.length - 1; i++) {
          newLines.push(lines[i]);
        }
        newLines.push(newLastLine);
        var newSelection = newLines.join('\n');
        var newText = before + newSelection + after;
        return {
          text: newText,
          selStart: selStart,
          selEnd: selEnd - 6 // Remove 3 backticks from start and end
        };
      } else {
        // Wrap in code block
        var newText = before + '```\n' + selection + '\n```' + after;
        return {
          text: newText,
          selStart: selStart + 4, // After ```\n
          selEnd: selEnd + 4
        };
      }
    } else {
      // Insert empty code block
      var before = text.substring(0, selStart);
      var after = text.substring(selStart);
      var newText = before + '```\n\n```' + after;
      return {
        text: newText,
        selStart: selStart + 4, // After ```\n
        selEnd: selStart + 4
      };
    }
  }

  /**
   * Insert link [text](url)
   */
  function insertLink(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var hasSelection = selStart !== selEnd;
    var selection = text.substring(selStart, selEnd);
    
    if (hasSelection) {
      // Wrap selection in link syntax
      var before = text.substring(0, selStart);
      var after = text.substring(selEnd);
      var newText = before + '[ ' + selection + ' ](https://)' + after;
      return {
        text: newText,
        selStart: selStart + 2, // After [
        selEnd: selEnd + 13 // After ](https://)
      };
    } else {
      // Insert placeholder
      var before = text.substring(0, selStart);
      var after = text.substring(selStart);
      var newText = before + '[ link text ](https://)' + after;
      return {
        text: newText,
        selStart: selStart + 1, // After [
        selEnd: selStart + 12 // After link text
      };
    }
  }

  /**
   * Insert horizontal rule (---)
   */
  function insertHorizontalRule(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var before = text.substring(0, selStart);
    var after = text.substring(selStart);
    
    // Find line start
    var lineStart = text.lastIndexOf('\n', selStart - 1) + 1;
    var lineEnd = text.indexOf('\n', selStart);
    var actualLineEnd = lineEnd === -1 ? text.length : lineEnd;
    
    var lineText = text.substring(lineStart, actualLineEnd);
    
    // Check if line is already a horizontal rule
    if (/^[-*_]{3,}$/.test(lineText.trim())) {
      // Remove it
      var newText = text.substring(0, lineStart) + text.substring(actualLineEnd);
      return {
        text: newText,
        selStart: lineStart,
        selEnd: lineStart
      };
    } else {
      // Insert horizontal rule on its own line
      var newText = before + '\n\n---\n\n' + after;
      return {
        text: newText,
        selStart: selStart + 5, // After ---\n
        selEnd: selStart + 5
      };
    }
  }

  /**
   * Insert table
   */
  function insertTable(params) {
    var text = params.text;
    var selStart = params.selStart;
    var selEnd = params.selEnd;
    
    var before = text.substring(0, selStart);
    var after = text.substring(selStart);
    
    var table = '| Header 1 | Header 2 |\n|---------|---------|\n| Cell 1  | Cell 2  |';
    var newText = before + '\n\n' + table + '\n\n' + after;
    
    return {
      text: newText,
      selStart: selStart + 2, // After \n\n
      selEnd: selStart + 2
    };
  }

  // Expose all functions to global scope
  window.HalonyxMarkdownActions = {
    toggleBold: toggleBold,
    toggleItalic: toggleItalic,
    toggleStrikethrough: toggleStrikethrough,
    toggleInlineCode: toggleInlineCode,
    toggleHeading: toggleHeading,
    toggleBulletList: toggleBulletList,
    toggleNumberedList: toggleNumberedList,
    toggleTaskList: toggleTaskList,
    toggleBlockquote: toggleBlockquote,
    toggleCodeBlock: toggleCodeBlock,
    insertLink: insertLink,
    insertHorizontalRule: insertHorizontalRule,
    insertTable: insertTable
  };

})();
